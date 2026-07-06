/* Local, redundant-by-design hygiene check for games/topdown-puzzle/
 * shared/*.js (DELTA C4 PR1's design doc, Test plan table:
 * "Determinism / no banned nondeterminism"). tools/check-bans.mjs only
 * scans packages/**\/src and packages/**\/tools — NOT games/** — so
 * this belt-and-suspenders grep is what actually covers the new C4
 * shared modules for Math.random()/Date.now(), mirroring
 * @golem-engine/content's own tests/no-dynamic-code.test.js pattern.
 * shared/module.js/push.js/reducer.js must derive everything from the
 * committed content pack + the event log, never wall-clock time or
 * unseeded randomness (PR2's resolveTick, when it needs randomness for
 * a future mover, is required to go through packages/random's
 * channel() instead — see the design doc's orchestrator decision #4). */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHARED_DIR = join(HERE, "..", "shared");

const BANS = [
  { name: "Math.random(", pattern: /Math\.random\s*\(/ },
  { name: "Date.now(", pattern: /Date\.now\s*\(/ },
];

test("games/topdown-puzzle/shared/*.js contains no Math.random()/Date.now()", () => {
  const files = readdirSync(SHARED_DIR).filter((f) => f.endsWith(".js"));
  assert.ok(files.length > 0, "expected at least one shared/*.js file to scan");

  const offenders = [];
  for (const file of files) {
    const text = readFileSync(join(SHARED_DIR, file), "utf8");
    for (const ban of BANS) {
      if (ban.pattern.test(text)) offenders.push(`${file}: ${ban.name}`);
    }
  }
  assert.deepEqual(offenders, [], `banned nondeterminism found: ${offenders.join(", ")}`);
});
