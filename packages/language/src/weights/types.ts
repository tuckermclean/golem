/* ── packages/language/src/weights/types.ts — the shape of a committed
 * L2 weights artifact (design doc §"Training", step 6). Hand-written,
 * imported (never generated) by both classify.ts and every generated
 * classifier.v1.<sha8>.ts, so the generated files stay pure data.
 *
 * Layout deviation from the design doc's illustrative file tree, noted
 * per the task's "report any deviation" instruction: the design draws
 * `weights/` as a sibling of `src/` (`packages/language/weights/...`).
 * This package's tsconfig.json compiles with `"rootDir": "src"` (so
 * `dist/index.js` stays the flat path L1's existing tests/package.json
 * `exports` already depend on — verified empirically: a sibling
 * `weights/*.ts` imported from `src/classify.ts` via `../weights/...`
 * makes `tsc` fail with TS6059 "File is not under 'rootDir'", both for
 * a real build AND for `--noEmit` typechecking, since NodeNext relative
 * specifiers must resolve identically at type-check time and at
 * runtime). Nesting the weights under `src/weights/` keeps every
 * substantive requirement (content-addressed filename, a single
 * `manifest.ts` indirection point, TS-strict, generated-not-hand-
 * edited, "rollback = repoint manifest") while leaving L1's existing
 * `dist/index.js` entry path and this package's `tsconfig.json`
 * completely untouched. */
export interface WeightsV1 {
  /** Hash bucket count features.ts's hashFeatures() produces — must
   * match features.ts's own D constant exactly (the trainer asserts
   * this at emit time). */
  readonly D: number;
  /** Ordered label list; W's columns / b's entries correspond 1:1by
   * index to this array. The 9th entry is always "unknown". */
  readonly labels: readonly string[];
  /** D rows x C columns: W[d][c] is the weight from hash bucket d to
   * class c's logit. */
  readonly W: readonly (readonly number[])[];
  /** Per-class bias, length C. */
  readonly b: readonly number[];
  /** Post-hoc softmax temperature, fit on the calibration split only
   * (design doc §"Calibrated confidence", layer 1). */
  readonly temperature: number;
  /** The exact char-n-gram sizes features.ts used — carried alongside
   * the weights so a future feature-representation change is visibly
   * incompatible with an older weights artifact, not a silent skew. */
  readonly ngramSizes: readonly number[];
}
