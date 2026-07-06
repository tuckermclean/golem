/* calibration.test.js — design doc §"DoD as machine-checkable CI" #1.
 * Loads the calibration-report.json emitted by
 * `tools/lang/train_classifier.js --eval-only` (loading the COMMITTED
 * weights, never retraining — orchestrator decision #1) and asserts the
 * starting bars from orchestrator decision #2: held-out accuracy >=
 * 0.90, ECE <= 0.08. These are explicitly a templated-corpus regression
 * guard, not a real-world quality claim (design doc Open Question 1 /
 * orchestrator decision #2) — held-out accuracy measured against a
 * held-out split of the SAME generative process mostly proves the model
 * learned the templates, not that it generalizes to arbitrary player
 * phrasing; the adversarial suite + confidence floor are the real
 * safety net for that. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const reportPath = fileURLToPath(new URL("../reports/calibration-report.json", import.meta.url));
const report = JSON.parse(readFileSync(reportPath, "utf8"));

const ACCURACY_BAR = 0.9;
const ECE_BAR = 0.08;

test("calibration-report.json exists and describes the committed weights module", () => {
  assert.ok(report.weightsModule, "report should name the weights module it scored");
  assert.ok(Array.isArray(report.labels) && report.labels.length === 9);
});

test(`held-out accuracy >= ${ACCURACY_BAR} (orchestrator decision #2 starting bar)`, () => {
  assert.ok(
    report.heldout.accuracy >= ACCURACY_BAR,
    `held-out accuracy ${report.heldout.accuracy} is below the ${ACCURACY_BAR} bar`,
  );
});

test(`held-out ECE <= ${ECE_BAR} (orchestrator decision #2 starting bar)`, () => {
  assert.ok(report.heldout.ece <= ECE_BAR, `held-out ECE ${report.heldout.ece} exceeds the ${ECE_BAR} bar`);
});

test("the 9x9 confusion matrix accounts for every heldout row", () => {
  const total = report.heldout.confusion.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0);
  assert.equal(total, report.heldout.n);
  assert.equal(report.heldout.confusion.length, 9);
  for (const row of report.heldout.confusion) assert.equal(row.length, 9);
});
