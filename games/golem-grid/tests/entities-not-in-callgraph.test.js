/* DELTA C3's REQUIRED repo-hygiene test (design doc orchestrator
 * decision #1): asserts the source text of shared/reducer.js and
 * shared/module.js contains no reference to entities.js/entitiesOf.
 * This is what makes "entities.js is a read-only overlay, never in
 * the call graph of reduce/applyEvent/validate/serializeState" (and
 * therefore "no behavior change") regression-proof rather than merely
 * true-today — mirrors packages/content/tests/no-dynamic-code.test.js's
 * source-grep style (reads source text, never executes it).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILES = [
  new URL("../shared/reducer.js", import.meta.url),
  new URL("../shared/module.js", import.meta.url),
];

const BANNED = [/entities\.js/, /\bentitiesOf\b/];

test("entities overlay is not in reducer.js/module.js's call graph", () => {
  const violations = [];
  for (const file of FILES) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (const pattern of BANNED) {
      lines.forEach((line, i) => {
        if (pattern.test(line)) {
          violations.push(`${file.pathname}:${i + 1} [${pattern}] ${line.trim()}`);
        }
      });
    }
  }
  assert.deepEqual(
    violations,
    [],
    `entities.js/entitiesOf must never be referenced by reducer.js/module.js (would break the read-only-overlay guarantee):\n${violations.join("\n")}`,
  );
});
