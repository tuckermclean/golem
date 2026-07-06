/* DELTA C4 PR1's DoD mechanism, made runnable: for every level in the
 * topdown-puzzle solution-log fixture set (packages/testkit/fixtures/
 * topdown-puzzle-solutions/), replay the committed event log through
 * @golem-engine/kernel's pure replay() fold — driving games/
 * topdown-puzzle/shared/module.js's `reduce` — against a FRESHLY
 * re-derived world (never the world the generator happened to build),
 * and assert the resulting outcome is "WIN" and
 * h32(serializeState(...) + "\n") matches index.json's finalHash. This
 * is the literal "recorded solution log replays bit-identically" proof
 * the design doc's DoD mechanism section calls for (docs/superpowers/
 * specs/2026-07-06-c4-topdown-port-design.md).
 *
 * This is deliberately independent of packages/testkit/tools/
 * verify-tdp-solution-fixtures.mjs (which drives its own reduce loop
 * directly, not kernel's replay()) — this file proves the SAME fixture
 * hashes hold through kernel's own fold helper too, mirroring
 * kernel-replay.test.js's relationship to the golem fixtures exactly.
 *
 * PR1 registers exactly one level — a synthetic, hand-crafted,
 * mover-free mechanism-proof (see games/topdown-puzzle/tests/fixtures/
 * synthetic-level.mjs's header comment for why no real level qualifies
 * yet: every one of the six shipped levels carries at least one H/V
 * baddie token, and PR1 does not simulate baddies). PR4 extends this to
 * ≥5 real levels once PR2's tick bridge lands — freeze:verify wiring is
 * also PR4's call, not PR1's.
 *
 * Untouchable: this test must never edit fixtures/index.json to make
 * itself pass. A hash mismatch here means a bug in the port.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { replay } from "@golem-engine/kernel";
import { h32 } from "@golem-engine/random";
import { createState, reduce, serializeState } from "../../../games/topdown-puzzle/shared/reducer.js";
import { LEVELS, deriveLevelWorld } from "../tools/tdp-solution-levels.mjs";

const FIXTURES_DIR = new URL("../fixtures/topdown-puzzle-solutions/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("index.json", FIXTURES_DIR), "utf8"));

assert.equal(
  index.length,
  LEVELS.length,
  "fixtures/topdown-puzzle-solutions/index.json must have exactly one entry per registered level",
);

const core = { reduce };

for (const entry of index) {
  test(`tdp solution replay: level "${entry.level}" replays bit-identically to finalHash ${entry.finalHash}`, () => {
    const world = deriveLevelWorld(entry.level);
    const log = JSON.parse(readFileSync(new URL(entry.log, FIXTURES_DIR), "utf8"));

    const finalState = replay(core, world, log, createState());

    assert.equal(finalState.outcome, "WIN", `level ${entry.level}: replay did not reach WIN (outcome=${finalState.outcome})`);
    const gotHash = h32(serializeState(finalState) + "\n");
    assert.equal(gotHash, entry.finalHash, `level ${entry.level}: finalHash mismatch (got ${gotHash}, want ${entry.finalHash})`);
  });
}
