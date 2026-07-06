/* ── packages/language/src/classify.ts — the L2 tier-2 intent
 * classifier (design doc §"Model choice & feature representation" +
 * §"Calibrated confidence"). A single linear layer (multinomial
 * logistic regression) over features.ts's hashed n-gram vector,
 * softmax + post-hoc temperature scaling, backstopped by a hard
 * confidence floor. Loads the COMMITTED weights via weights/manifest.ts
 * — this module never trains, never touches the network, and is
 * synchronous throughout (design doc DoD: "<10ms in browser"). ───────
 */
import { D, hashFeatures } from "./features.js";
import { WEIGHTS } from "./weights/manifest.js";

/** Layer 3 of the design's three deliberately redundant confidence
 * layers (§"Calibrated confidence"): independent of both temperature
 * scaling and the trained `unknown` class, if the (temperature-scaled)
 * max probability never clears this floor, the result is treated as
 * `unknown` regardless of argmax label. */
const CONFIDENCE_FLOOR = 0.5;

export interface ClassifyResult {
  readonly label: string;
  readonly confidence: number;
  readonly probs: Readonly<Record<string, number>>;
}

/** Raw D x C dot product + bias (no softmax yet). Skips zero buckets —
 * hashFeatures' output is sparse in substance even though it's a dense
 * Float64Array, so this is the inner loop classify-perf.test.js's
 * <10ms/utterance budget actually has to clear. */
function logits(x: Float64Array): number[] {
  const { W, b, labels } = WEIGHTS;
  const C = labels.length;
  const z = new Array(C).fill(0);
  for (let c = 0; c < C; c++) z[c] = b[c];
  for (let d = 0; d < D; d++) {
    const xd = x[d];
    if (xd === 0) continue;
    const row = W[d];
    for (let c = 0; c < C; c++) z[c] += row[c] * xd;
  }
  return z;
}

/** classifyIntent(utterance) -> {label, confidence, probs}. `label` is
 * one of WEIGHTS.labels (one of L1's 8 CanonicalVerbs, or "unknown") —
 * NEVER anything else; `confidence` is the temperature-scaled,
 * floor-applied max probability router.ts's routing bands consume
 * directly. */
export function classifyIntent(utterance: string): ClassifyResult {
  const x = hashFeatures(utterance);
  const z = logits(x);
  const T = WEIGHTS.temperature;
  const scaled = z.map((v) => v / T);
  const max = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probsArr = exps.map((e) => e / sum);

  const labels = WEIGHTS.labels;
  let bestIdx = 0;
  for (let i = 1; i < labels.length; i++) {
    if (probsArr[i] > probsArr[bestIdx]) bestIdx = i;
  }

  const probs: Record<string, number> = {};
  labels.forEach((l, i) => {
    probs[l] = probsArr[i];
  });

  const confidence = probsArr[bestIdx];
  const label = confidence < CONFIDENCE_FLOOR ? "unknown" : labels[bestIdx];

  return { label, confidence, probs };
}
