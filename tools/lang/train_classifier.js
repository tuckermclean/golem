#!/usr/bin/env node
/* ── tools/lang/train_classifier.js — L2's trainer (design doc
 * §"Training"). Plain Node (JS, per DELTA §0.3's "Python only under
 * tools/model/ and train/" carve-out — no Python anywhere in this
 * path). Loads the committed corpus, extracts features via the SAME
 * features.ts module the runtime classifier imports (no train/serve
 * skew), trains a D x C multinomial logistic regression by mini-batch
 * SGD, fits a post-hoc softmax temperature on the calibration split,
 * evaluates on heldout, and emits:
 *
 *   packages/language/src/weights/classifier.v1.<sha8>.ts (content-
 *     addressed, generated, never hand-edited)
 *   packages/language/src/weights/manifest.ts (repointed at the new
 *     file — "rollback = repoint manifest")
 *   packages/language/reports/calibration-report.json (the CI artifact)
 *
 * `--eval-only`: load the COMMITTED weights (via dist/weights/
 * manifest.js) and score the heldout split WITHOUT retraining — this is
 * CI's path (orchestrator decision #1: "CI validates BEHAVIOR, not
 * bit-identical retraining" — float SGD's Math.exp/Math.log are not
 * portably bit-reproducible across platform libm/V8 builds, so CI never
 * re-derives the weights, only evaluates the committed artifact).
 *
 * All randomness (mini-batch shuffling) goes through @golem-engine/
 * random's channel(...), seeded by fixed strings — never Math.random.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { channel, rint } from "@golem-engine/random";
import { D, hashFeatures } from "../../packages/language/dist/features.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LANG_DIR = join(__dirname, "../../packages/language");
const CORPUS_PATH = join(LANG_DIR, "tests/fixtures/classifier-corpus.json");
const WEIGHTS_SRC_DIR = join(LANG_DIR, "src/weights");
const MANIFEST_TS_PATH = join(WEIGHTS_SRC_DIR, "manifest.ts");
const REPORTS_DIR = join(LANG_DIR, "reports");
const REPORT_PATH = join(REPORTS_DIR, "calibration-report.json");

const LABELS = ["move", "take", "look", "read", "say", "party", "whisper", "emote", "unknown"];
const C = LABELS.length;
const LABEL_INDEX = new Map(LABELS.map((l, i) => [l, i]));

const EPOCHS = 120;
const BATCH_SIZE = 16;
const LR0 = 0.6;
const LR_DECAY = 0.02; // lr = LR0 / (1 + LR_DECAY * epoch)
const L2_LAMBDA = 1e-4;

function loadCorpus() {
  return JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
}

/** Dense hashFeatures() output -> a sparse {idx, val} pair. Precomputed
 * once per row so the SGD loop never re-hashes an utterance. */
function toSparse(denseVec) {
  const idx = [];
  const val = [];
  for (let d = 0; d < denseVec.length; d++) {
    if (denseVec[d] !== 0) {
      idx.push(d);
      val.push(denseVec[d]);
    }
  }
  return { idx, val };
}

function zeroWeights() {
  const W = Array.from({ length: D }, () => new Float64Array(C));
  const b = new Float64Array(C);
  return { W, b };
}

function softmax(z) {
  let max = -Infinity;
  for (let c = 0; c < z.length; c++) if (z[c] > max) max = z[c];
  const p = new Float64Array(z.length);
  let sum = 0;
  for (let c = 0; c < z.length; c++) {
    p[c] = Math.exp(z[c] - max);
    sum += p[c];
  }
  for (let c = 0; c < z.length; c++) p[c] /= sum;
  return p;
}

function forward(W, b, sparse, temperature = 1) {
  const z = new Float64Array(C);
  for (let c = 0; c < C; c++) z[c] = b[c];
  for (let k = 0; k < sparse.idx.length; k++) {
    const d = sparse.idx[k];
    const v = sparse.val[k];
    const row = W[d];
    for (let c = 0; c < C; c++) z[c] += row[c] * v;
  }
  if (temperature !== 1) for (let c = 0; c < C; c++) z[c] /= temperature;
  return softmax(z);
}

/** One mini-batch SGD step (multinomial cross-entropy gradient:
 * dL/dz_c = p_c - y_c). Weight decay is applied lazily, only to the
 * hash buckets touched by this batch (a standard sparse-SGD shortcut —
 * regularization strength is small and this is a training heuristic,
 * not part of any golden/reproducibility contract; CI evaluates the
 * committed artifact's BEHAVIOR, per the orchestrator's lock, never
 * re-derives it bit-for-bit). */
function trainBatch(W, b, sparseX, yIdx, batchIndices, lr) {
  const gradAccum = new Map(); // bucket index -> Float64Array(C) gradient sum
  const gradB = new Float64Array(C);
  for (const i of batchIndices) {
    const sparse = sparseX[i];
    const y = yIdx[i];
    const p = forward(W, b, sparse, 1);
    for (let c = 0; c < C; c++) gradB[c] += p[c] - (c === y ? 1 : 0);
    for (let k = 0; k < sparse.idx.length; k++) {
      const d = sparse.idx[k];
      const v = sparse.val[k];
      let arr = gradAccum.get(d);
      if (!arr) {
        arr = new Float64Array(C);
        gradAccum.set(d, arr);
      }
      for (let c = 0; c < C; c++) arr[c] += v * (p[c] - (c === y ? 1 : 0));
    }
  }
  const n = batchIndices.length;
  for (let c = 0; c < C; c++) b[c] -= lr * (gradB[c] / n);
  for (const [d, arr] of gradAccum) {
    const row = W[d];
    for (let c = 0; c < C; c++) row[c] -= lr * (arr[c] / n + L2_LAMBDA * row[c]);
  }
}

function train(trainRows) {
  const { W, b } = zeroWeights();
  const sparseX = trainRows.map((r) => toSparse(hashFeatures(r.utterance)));
  const yIdx = trainRows.map((r) => LABEL_INDEX.get(r.label));
  const n = trainRows.length;

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const rng = channel("l2-train-shuffle", String(epoch));
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = rint(rng, i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const lr = LR0 / (1 + LR_DECAY * epoch);
    for (let start = 0; start < n; start += BATCH_SIZE) {
      const batchIndices = order.slice(start, start + BATCH_SIZE);
      trainBatch(W, b, sparseX, yIdx, batchIndices, lr);
    }
  }
  return { W, b };
}

/** Post-hoc temperature scaling (design doc §"Training" step 4, Guo et
 * al. 2017): a 1-D search over T minimizing negative log-likelihood of
 * softmax(z/T) against true labels on the CALIBRATION split only. */
function fitTemperature(W, b, calRows) {
  const sparseX = calRows.map((r) => toSparse(hashFeatures(r.utterance)));
  const yIdx = calRows.map((r) => LABEL_INDEX.get(r.label));

  function nll(T) {
    let total = 0;
    for (let i = 0; i < sparseX.length; i++) {
      const p = forward(W, b, sparseX[i], T);
      total += -Math.log(Math.max(p[yIdx[i]], 1e-12));
    }
    return total / sparseX.length;
  }

  // Coarse-to-fine grid search over T in (0.05, 5] — a linear model has
  // exactly one scalar to fit, so a grid search is simple, deterministic
  // (no randomness needed), and more than adequate.
  let bestT = 1;
  let bestNll = nll(1);
  for (let pass = 0; pass < 4; pass++) {
    const span = pass === 0 ? [0.05, 5] : [bestT * 0.7, bestT * 1.3];
    const steps = 60;
    for (let s = 0; s <= steps; s++) {
      const T = span[0] + ((span[1] - span[0]) * s) / steps;
      const v = nll(T);
      if (v < bestNll) {
        bestNll = v;
        bestT = T;
      }
    }
  }
  return bestT;
}

function evaluate(W, b, temperature, rows) {
  const confusion = Array.from({ length: C }, () => new Array(C).fill(0));
  // ECE: 10 equal-width confidence bins.
  const NBINS = 10;
  const binConf = new Array(NBINS).fill(0);
  const binAcc = new Array(NBINS).fill(0);
  const binCount = new Array(NBINS).fill(0);

  let correct = 0;
  for (const row of rows) {
    const sparse = toSparse(hashFeatures(row.utterance));
    const p = forward(W, b, sparse, temperature);
    let bestIdx = 0;
    for (let c = 1; c < C; c++) if (p[c] > p[bestIdx]) bestIdx = c;
    const trueIdx = LABEL_INDEX.get(row.label);
    confusion[trueIdx][bestIdx]++;
    const isCorrect = bestIdx === trueIdx;
    if (isCorrect) correct++;

    const conf = p[bestIdx];
    let bin = Math.min(NBINS - 1, Math.floor(conf * NBINS));
    binConf[bin] += conf;
    binAcc[bin] += isCorrect ? 1 : 0;
    binCount[bin]++;
  }

  const accuracy = correct / rows.length;
  let ece = 0;
  for (let i = 0; i < NBINS; i++) {
    if (binCount[i] === 0) continue;
    const avgConf = binConf[i] / binCount[i];
    const avgAcc = binAcc[i] / binCount[i];
    ece += (binCount[i] / rows.length) * Math.abs(avgAcc - avgConf);
  }

  return { accuracy, ece, confusion, n: rows.length };
}

function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

function serializeWeights(W, b, temperature) {
  return {
    D,
    labels: LABELS,
    W: W.map((row) => Array.from(row, round6)),
    b: Array.from(b, round6),
    temperature: round6(temperature),
    ngramSizes: [3, 4, 5],
  };
}

function sha8(weightsObj) {
  const canonical = JSON.stringify(weightsObj);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 8);
}

function emitWeightsFiles(weightsObj, hash) {
  mkdirSync(WEIGHTS_SRC_DIR, { recursive: true });
  const moduleName = `classifier.v1.${hash}`;
  const filePath = join(WEIGHTS_SRC_DIR, `${moduleName}.ts`);
  const ts =
    `/* GENERATED by tools/lang/train_classifier.js — do not hand-edit.\n` +
    ` * Content-addressed: filename is sha256(serialized weights).slice(0,8).\n` +
    ` * CLAUDE.md: "Never overwrite a published weight artifact. Rollback =\n` +
    ` * repoint manifest." — a retrain produces a NEW file; manifest.ts is\n` +
    ` * the only file that ever changes which one is CURRENT. */\n` +
    `import type { WeightsV1 } from "./types.js";\n\n` +
    `export const WEIGHTS: WeightsV1 = ${JSON.stringify(weightsObj)};\n`;
  writeFileSync(filePath, ts);

  const manifestTs =
    `/* GENERATED by tools/lang/train_classifier.js — do not hand-edit.\n` +
    ` * Rollback = repoint this file at a previously committed\n` +
    ` * classifier.v1.<sha8>.ts (CLAUDE.md: "Never overwrite a published\n` +
    ` * weight artifact. Rollback = repoint manifest."). classify.ts imports\n` +
    ` * this file, and only this file, by name. */\n` +
    `export { WEIGHTS } from "./${moduleName}.js";\n` +
    `export const CURRENT = "${moduleName}";\n`;
  writeFileSync(MANIFEST_TS_PATH, manifestTs);

  return { moduleName, filePath };
}

async function loadCommittedWeights() {
  const mod = await import(join(LANG_DIR, "dist/weights/manifest.js"));
  return mod.WEIGHTS;
}

async function main() {
  const evalOnly = process.argv.includes("--eval-only");
  const rows = loadCorpus();
  const trainRows = rows.filter((r) => r.split === "train");
  const calRows = rows.filter((r) => r.split === "calibration");
  const heldoutRows = rows.filter((r) => r.split === "heldout");

  let W, b, temperature, moduleName;

  if (evalOnly) {
    const weights = await loadCommittedWeights();
    if (weights.D !== D) {
      throw new Error(
        `train_classifier --eval-only: committed weights D=${weights.D} does not match features.ts's D=${D}`,
      );
    }
    W = weights.W;
    b = weights.b;
    temperature = weights.temperature;
    moduleName = "(committed, not retrained)";
    console.log("train_classifier: --eval-only, scoring committed weights (no retrain)");
  } else {
    console.log(`train_classifier: training on ${trainRows.length} rows (${EPOCHS} epochs)...`);
    const trained = train(trainRows);
    W = trained.W;
    b = trained.b;
    console.log(`train_classifier: fitting temperature on ${calRows.length} calibration rows...`);
    temperature = fitTemperature(W, b, calRows);
    const weightsObj = serializeWeights(W, b, temperature);
    const hash = sha8(weightsObj);
    const emitted = emitWeightsFiles(weightsObj, hash);
    moduleName = emitted.moduleName;
    console.log(`train_classifier: wrote ${emitted.filePath}`);
    console.log(`train_classifier: manifest.ts now points at ${moduleName}`);
  }

  const trainEval = evaluate(W, b, temperature, trainRows);
  const calEval = evaluate(W, b, temperature, calRows);
  const heldoutEval = evaluate(W, b, temperature, heldoutRows);

  const report = {
    generatedAt: "(deterministic build artifact — no wall-clock timestamp per DELTA §0.3)",
    weightsModule: moduleName,
    temperature,
    labels: LABELS,
    train: { n: trainEval.n, accuracy: trainEval.accuracy },
    calibration: { n: calEval.n, accuracy: calEval.accuracy },
    heldout: {
      n: heldoutEval.n,
      accuracy: heldoutEval.accuracy,
      ece: heldoutEval.ece,
      confusion: heldoutEval.confusion,
    },
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

  console.log(`train_classifier: heldout accuracy=${heldoutEval.accuracy.toFixed(4)} ece=${heldoutEval.ece.toFixed(4)}`);
  console.log(`train_classifier: wrote ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
