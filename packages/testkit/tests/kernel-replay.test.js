/* DELTA K2's DoD, made runnable: for all 25 frozen golem-grid seeds
 * (packages/testkit/fixtures/golem/), replay the committed event log
 * through @golem-engine/kernel's pure `replay()` fold — driving
 * games/golem-grid/shared/reducer.js's PURE `reduce` export, never the
 * in-place `applyEvent` adapter — and assert the resulting
 * h32(serializeState(...) + "\n") matches index.json's finalHash for
 * that seed, byte-identically.
 *
 * This is deliberately independent of packages/testkit/tools/
 * verify-golem-fixtures.mjs, which drives the OLD mutating applyEvent
 * path and remains the frozen P0.3 gate; this file exists to prove the
 * new pure `reduce` reproduces the exact same fixture hashes through a
 * completely different (non-mutating) code path, per K2's DoD:
 * "replay fixtures from P0.3 produce byte-identical final-state hashes
 * through the new reducer."
 *
 * Untouchable: this test must never edit fixtures/goldens to make
 * itself pass. A hash mismatch here means a bug in the pure port.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { replay } from "@golem-engine/kernel";
import { genDungeon } from "../../../games/golem-grid/shared/worldgen.js";
import { createState, reduce, serializeState } from "../../../games/golem-grid/shared/reducer.js";
import { h32 } from "../../../games/golem-grid/shared/rng.js";

const FIXTURES_DIR = new URL("../fixtures/golem/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("index.json", FIXTURES_DIR), "utf8"));

assert.equal(index.length, 25, "expected exactly 25 frozen golem-grid seeds (DELTA P0.3) — the fixture set itself changed, which this test must not cause or paper over");

// `reduce`'s own signature is already (state, world, event) — exactly
// what kernel's KernelCore.reduce expects — so no adapter/wrapper is
// needed here; this IS reusing the same function games/golem-grid's
// module.js exports as its reduce.
const core = { reduce };

for (const entry of index) {
  test(`kernel replay: seed "${entry.seed}" — pure reduce (not applyEvent) reproduces finalHash ${entry.finalHash}`, () => {
    const dun = genDungeon(entry.seed);
    const log = JSON.parse(readFileSync(new URL(entry.log, FIXTURES_DIR), "utf8"));

    const finalState = replay(core, dun, log, createState());

    assert.equal(finalState.D.get("gameover"), "WIN", `seed ${entry.seed}: pure replay did not reach WIN`);
    const gotHash = h32(serializeState(finalState) + "\n");
    assert.equal(gotHash, entry.finalHash, `seed ${entry.seed}: finalHash mismatch (got ${gotHash}, want ${entry.finalHash})`);
  });
}
