/* ── packages/language/src/features.ts — hashed n-gram feature
 * extraction (L2 design doc §"Feature representation"). Shared
 * VERBATIM by the trainer (tools/lang/train_classifier.js) and the
 * runtime classifier (classify.ts) — no feature-extraction logic is
 * ever duplicated between train-time and inference-time, closing off
 * the single most common source of train/serve skew in small ML
 * systems (design doc §"Training", step 2). Reuses tokenize.ts's own
 * normalize()/tokenize() so L1 and L2 agree on what "the same input"
 * means, and @golem-engine/random's h32 as the one canonical string
 * hash in the repo (design doc §"Feature representation", point 3) —
 * used here purely as a hash primitive, not as a PRNG seed. ──────────
 */
import { h32 } from "@golem-engine/random";
import { normalize, tokenize } from "./tokenize.js";

/** Hash bucket count (design doc §"Weights artifact & size budget":
 * D=4096, C=9 -> 4096*9 = 36,864 floats, the whole sizing budget this
 * design commits to). Changing this invalidates every committed
 * weights artifact — bump the weights' content-addressed filename (a
 * retrain), never this constant in isolation. */
export const D = 4096;

/** Character n-gram sizes swept over the whole boundary-marked,
 * normalized string (design doc §"Feature representation", point 1). */
export const CHAR_NGRAM_SIZES: readonly number[] = [3, 4, 5];

/** Every raw (un-hashed) feature string for one utterance: char n-grams
 * (n in CHAR_NGRAM_SIZES) over a single-space-boundary-marked version of
 * the normalized string, plus word unigrams/bigrams over the whitespace
 * tokenization (design doc §"Feature representation", points 1-2). Each
 * feature is namespace-prefixed (c3:/c4:/c5:/w1:/w2:) purely so two
 * different feature *kinds* that happen to produce the same substring
 * (e.g. char-3-gram "the" vs word-unigram "the") don't collide with each
 * other's hash bucket by construction — collisions WITHIN a kind are
 * still expected and accepted (the hashing-trick's whole premise).
 * Exported for train-time inspection; classify.ts only ever calls
 * hashFeatures. */
export function rawFeatures(utterance: string): string[] {
  const normalized = normalize(utterance);
  const tokens = tokenize(normalized);
  const feats: string[] = [];

  // Char n-grams over the whole string, boundary-marked with a single
  // leading/trailing space so grams at word edges carry a distinct
  // "start/end of word" signal (design doc: "_go"/"go "/"o n"-style
  // boundary markers distinguish "the sword" from "swordfish"-as-one-
  // token nonsense, and give partial typo credit: "noth" vs "north"
  // share most 4-grams).
  const bounded = ` ${normalized} `;
  for (const n of CHAR_NGRAM_SIZES) {
    for (let i = 0; i + n <= bounded.length; i++) {
      feats.push(`c${n}:${bounded.slice(i, i + n)}`);
    }
  }

  // Word unigrams + bigrams — cheap exact-vocabulary signal on top of
  // the sub-word char-gram signal (design doc §"Feature representation",
  // point 2).
  for (const t of tokens) feats.push(`w1:${t}`);
  for (let i = 0; i + 1 < tokens.length; i++) {
    feats.push(`w2:${tokens[i]} ${tokens[i + 1]}`);
  }

  return feats;
}

/** hashFeatures(utterance) -> a dense D-length, L2-normalized bucket
 * count vector. Buckets are chosen via h32(feature) % D (design doc
 * point 3); the vector is dense in representation but sparse in
 * substance (at most a few dozen of the D buckets are ever nonzero for
 * one utterance) — dense is simplest to dot-product against the D x C
 * weight matrix, and D=4096 is small enough that this costs nothing
 * measurable (see classify-perf.test.js). L2-normalized so utterance
 * length doesn't dominate the logit scale (design doc point 4). */
export function hashFeatures(utterance: string): Float64Array {
  const vec = new Float64Array(D);
  for (const f of rawFeatures(utterance)) {
    const bucket = h32(f) % D;
    vec[bucket] += 1;
  }
  let normSq = 0;
  for (let i = 0; i < D; i++) normSq += vec[i] * vec[i];
  if (normSq > 0) {
    const norm = Math.sqrt(normSq);
    for (let i = 0; i < D; i++) vec[i] /= norm;
  }
  return vec;
}
