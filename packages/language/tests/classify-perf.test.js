/* classify-perf.test.js — design doc §"DoD as machine-checkable CI" #3:
 * <10ms/utterance in-browser inference, measured under plain node --test
 * (V8, the same engine browsers ship), structurally identical to L1's
 * own corpus-batch timing assertion (corpus.test.js's perf guard). Runs
 * route() (not classifyIntent directly) over a MIX of L1-hits and
 * L1-misses — L1-hits never reach the classifier and must not be
 * allowed to hide a slow classifier path, per the design doc's own
 * framing of this exact risk. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { route } from "../dist/index.js";
import { affordances } from "./fixtures/affordances.js";

const corpusPath = fileURLToPath(new URL("./corpus.json", import.meta.url));
const l1Corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const classifierCorpusPath = fileURLToPath(new URL("./fixtures/classifier-corpus.json", import.meta.url));
const l2Corpus = JSON.parse(readFileSync(classifierCorpusPath, "utf8"));

// A mix of L1-hits (from L1's own corpus, so parse() resolves ok:true
// and route() returns immediately) and L1-misses (from L2's corpus, so
// route() actually runs the classifier + fillSlot) — ~500 utterances
// total, per the design doc's own sizing.
const l1Sample = [];
for (const { cases } of l1Corpus) {
  for (const { utterance, useAffordances } of cases) {
    l1Sample.push({ utterance, affordances: useAffordances ? affordances : [] });
  }
}
const l2Sample = l2Corpus.slice(0, 500 - l1Sample.length).map((r) => ({ utterance: r.utterance, affordances }));
const BATCH = [...l1Sample, ...l2Sample];

test("classify-perf: batch has both L1-hit and L1-miss utterances (the DoD's own risk framing)", () => {
  const anyOk = BATCH.some(({ utterance, affordances: aff }) => route(utterance, { affordances: aff }).ok);
  const anyMiss = BATCH.some(({ utterance, affordances: aff }) => !route(utterance, { affordances: aff }).ok);
  assert.ok(anyOk, "batch should include at least one L1-hit");
  assert.ok(anyMiss, "batch should include at least one L1-miss/unknown");
});

test("route() batch: well under 10ms/utterance, including L1-hits that must not hide a slow classifier path", () => {
  const BUDGET_MS_PER_UTTERANCE = 10;
  const start = performance.now();
  for (const { utterance, affordances: aff } of BATCH) {
    route(utterance, { affordances: aff });
  }
  const elapsed = performance.now() - start;
  const perUtterance = elapsed / BATCH.length;
  assert.ok(
    perUtterance < BUDGET_MS_PER_UTTERANCE,
    `route() took ${perUtterance.toFixed(4)}ms/utterance over ${BATCH.length} utterances, budget is ${BUDGET_MS_PER_UTTERANCE}ms`,
  );
});
