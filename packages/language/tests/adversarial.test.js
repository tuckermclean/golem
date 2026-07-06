/* adversarial.test.js — design doc §"DoD as machine-checkable CI" #2 +
 * orchestrator decision #2: a HARD 100% bar, no tolerance. Every entry
 * in the committed adversarial-suite.json (gibberish, keyboard mash,
 * numeric/punctuation noise, repeated-char spam, emoji-only, mixed-
 * script nonsense, plus every "unknown"-labeled corpus utterance as a
 * superset) must make route() answer ok:false. A single failing row
 * here is a real bug — the classifier must never emit a confident
 * command for gibberish (VISION doctrine #6). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { route } from "../dist/index.js";

const suitePath = fileURLToPath(new URL("./fixtures/adversarial-suite.json", import.meta.url));
const suite = JSON.parse(readFileSync(suitePath, "utf8"));

test("adversarial suite is non-trivial (the DoD is meaningless over an empty set)", () => {
  assert.ok(suite.length >= 100, `expected a substantial adversarial suite, got ${suite.length} entries`);
});

for (const utterance of suite) {
  test(`route(${JSON.stringify(utterance)}).ok === false`, () => {
    const r = route(utterance);
    assert.equal(r.ok, false, `expected a rejection, got ${JSON.stringify(r)}`);
  });
}

test("100% reject rate across the whole adversarial suite (hard bar, no tolerance)", () => {
  let rejected = 0;
  const accepted = [];
  for (const utterance of suite) {
    const r = route(utterance);
    if (!r.ok) rejected++;
    else accepted.push({ utterance, result: r });
  }
  assert.equal(
    rejected,
    suite.length,
    `${accepted.length}/${suite.length} adversarial entries were NOT rejected: ${JSON.stringify(accepted)}`,
  );
});
