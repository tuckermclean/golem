/* L7's REQUIRED repo-hygiene test (design doc "Test plan", final
 * paragraph): mirrors entities-not-in-callgraph.test.js's precedent —
 * asserts the source text of shared/reducer.js and shared/module.js
 * contains no reference to src/npc.js's exports or to
 * @golem-engine/language's compileEnvelope. This is what makes "the
 * demo NPC is client-local, exactly like lookAt/`/who` already are"
 * (CLAUDE.md doctrine #4: the golem is a mouth, never state) regression-
 * proof rather than merely true-today.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILES = [
  new URL("../shared/reducer.js", import.meta.url),
  new URL("../shared/module.js", import.meta.url),
];

const BANNED = [/npc\.js/, /\baskNpc\b/, /\bcompileEnvelope\b/, /\bnpcKnowledge\b/, /\bnpcFactUniverse\b/];

test("L7 demo NPC (npc.js/compileEnvelope) is not in reducer.js/module.js's call graph", () => {
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
    `npc.js/compileEnvelope must never be referenced by reducer.js/module.js (would break the client-local-only guarantee):\n${violations.join("\n")}`,
  );
});
