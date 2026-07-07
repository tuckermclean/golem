/* ── Key-seal resolution (docs/superpowers/specs/2026-07-07-key-seal-
   resolution-design.md): pick up the floor's bronze key ->
   COLLECTED{kind:"key"} -> `run.puzzle.have` flips true -> the
   generalized descend condition (shared/module.js's "move" case, now
   gated on rules/puzzles.js's ported `stairsOpen` instead of a bare
   `.solved` check) opens the stairs.

   Honest scope (mirrors tests/riddle-seal.test.js's own header): seed
   "1"'s floor 1 draws a "key" seal (the same NON_RIDDLE_SEED/NON_TRAPS_SEED
   both tests/riddle-seal.test.js and tests/traps-seal.test.js already use
   as their own non-matching-seal regression fixture — found by the same
   kind of offline scan over generateFloor("<seed>", 1).puzzle.type). Its
   key pickup tile, (7,25), doesn't coincide with any gold/potion tile
   (those sit at (4,25)/(7,11)/(29,21)/(27,13)) — a clean event list for
   the collect step, same discipline the traps-seal test documents.
   stairsAt is (22,7).

   Positioning discipline: like riddleFloorState/trapsFloorState in the
   sibling seal test files, `keyFloorState` below places `character.pos`
   wherever a test needs it directly (one step from the key pickup tile,
   or one step from stairsAt) rather than BFS-walking the full 34x34
   floor — the collect/descend MECHANICS under test are each a
   single-step tile check, position-independent of how the character got
   there. Every move that matters (the actual step onto the key tile or
   onto stairsAt) is still driven through the real "move dx dy" verb ->
   validate() -> reduce(), never poked directly. */
import test from "node:test";
import assert from "node:assert/strict";
import { h32 } from "@golem-engine/random";
import { validate, deriveWorld } from "../shared/module.js";
import { createState, reduce, serializeState } from "../shared/reducer.js";
import { pack } from "../rules/pack.js";

// generateFloor("1", 1).puzzle.type === "key" (the same seed used as the
// non-matching-seal regression fixture in tests/riddle-seal.test.js and
// tests/traps-seal.test.js — found via an offline scan over seeds
// "1".."500"). Key pickup at (7,25); stairsAt (22,7).
const KEY_SEED = "1";

function deriveTombWorld(seed, floorNum) {
  const mapId = `tomb:${seed}:0:${floorNum}`;
  return deriveWorld(pack, { zone: "tomb", floorNum, mapId }, seed);
}

/** validate() -> assert legal -> fold every returned event through
 *  reduce() — same commit() idiom as tests/riddle-seal.test.js /
 *  tests/traps-seal.test.js. */
function commit(state, world, cmd) {
  const result = validate({ state, world }, cmd);
  assert.ok(
    Array.isArray(result),
    `expected "${cmd}" to be legal (got Denial: ${Array.isArray(result) ? "" : result.deny})`,
  );
  let seq = state.seq;
  for (const ev of result) state = reduce(state, world, { ...ev, seq: ++seq });
  return { state, result };
}

/** A state freshly standing on a real generated tomb floor's key seal,
 *  puzzle carried over from the derived World exactly like ENTERED_TOMB's
 *  own seeded branch populates `run.puzzle` (the sibling seal tests'
 *  riddleFloorState/trapsFloorState idiom). */
function keyFloorState(world, pos) {
  let state = reduce(createState(), world, {
    t: "FLOOR_ENTERED",
    zone: world.zone,
    floorNum: world.floorNum,
    mapId: world.mapId,
    seq: 1,
  });
  state = {
    ...state,
    run: { ...state.run, puzzle: { ...world.puzzle } },
    character: { ...state.character, pos: { ...pos } },
  };
  return state;
}

// One step west of the key pickup tile / one step west of stairsAt —
// both verified walkable for seed "1"'s floor 1 by the offline scan this
// file's header describes.
const KEY_TILE = { x: 7, y: 25 };
const KEY_APPROACH = { x: KEY_TILE.x - 1, y: KEY_TILE.y };
const STAIRS_APPROACH_FROM_WEST = () => {
  const world = deriveTombWorld(KEY_SEED, 1);
  return { x: world.stairsAt.x - 1, y: world.stairsAt.y };
};

// ── before collecting the key: the stairs stay sealed, silently ───────

test("before the key is collected: run.puzzle.have is false, and walking onto stairsAt is a silent no-op (no DESCENDED, no Denial)", () => {
  const world = deriveTombWorld(KEY_SEED, 1);
  assert.equal(world.puzzle.type, "key", "sanity: seed 1 floor 1 must be a key seal");
  assert.equal(world.puzzle.have, false, "sanity: the key starts uncollected");

  const approach = STAIRS_APPROACH_FROM_WEST();
  const state = keyFloorState(world, approach);
  assert.equal(state.run.puzzle.have, false);

  const { state: next, result } = commit(state, world, "move 1 0");
  assert.deepEqual(result.map((e) => e.t), ["MOVED"], "no seal-specific event before the key is collected");
  assert.equal(next.world.zone, "tomb", "not a zone transition");
  assert.equal(next.world.floorNum, 1, "still floor 1 — no descend");
  assert.equal(next.run.puzzle.have, false, "have is still false");
});

// ── stepping onto the key pickup tile: COLLECTED, have flips true ─────

test('stepping onto the key pickup tile fires COLLECTED{kind:"key"}: run.puzzle.have becomes true, character.inv is NOT incremented', () => {
  const world = deriveTombWorld(KEY_SEED, 1);
  let state = keyFloorState(world, KEY_APPROACH);
  const invBefore = state.character.inv;

  const { state: next, result } = commit(state, world, "move 1 0");
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "COLLECTED"]);
  assert.equal(result[1].kind, "key");
  assert.equal(result[1].amount, 1);

  assert.equal(next.run.puzzle.have, true, "collecting the key flips run.puzzle.have");
  assert.equal(next.character.inv, invBefore, "the key is a seal-opener, not inventory — inv must not increment");
  assert.equal(next.character.pos.x, KEY_TILE.x);
  assert.equal(next.character.pos.y, KEY_TILE.y);
});

// ── have:true + moving onto stairsAt -> DESCENDED ──────────────────────

test("key collected (have:true) + moving onto stairsAt emits DESCENDED (not silent): floorNum+1, new mapId, runStats preserved, knowledge unchanged", () => {
  const world = deriveTombWorld(KEY_SEED, 1);
  let state = keyFloorState(world, KEY_APPROACH);

  let result;
  ({ state, result } = commit(state, world, "move 1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "COLLECTED"]);
  assert.equal(state.run.puzzle.have, true, "sanity: the key must be collected before the descend step");

  // Arrange runStats so the "preserved across floors" proof is not vacuous.
  state = { ...state, run: { ...state.run, runStats: { ...state.run.runStats, kills: 4, goldGained: 9 } } };
  const knowledgeBefore = state.knowledge;

  const approach = STAIRS_APPROACH_FROM_WEST();
  state = { ...state, character: { ...state.character, pos: { ...approach } } };
  const { state: next, result: descendResult } = commit(state, world, "move 1 0");
  assert.deepEqual(descendResult.map((e) => e.t), ["MOVED", "DESCENDED"], "a keyed-open door opens onto DESCENDED");

  const descended = descendResult[1];
  assert.equal(descended.floorNum, 2);
  assert.equal(descended.mapId, `tomb:${KEY_SEED}:0:2`);
  assert.equal(next.world.floorNum, 2);
  assert.equal(next.world.mapId, `tomb:${KEY_SEED}:0:2`);
  assert.deepEqual(next.character.pos, descended.spawn);

  assert.equal(next.run.runStats.kills, 4, "kills must be preserved across the floor transition");
  assert.equal(next.run.runStats.goldGained, 9, "goldGained must be preserved across the floor transition");
  assert.equal(next.run.runStats.depth, 2, "depth bumps to the new floor number");

  assert.deepEqual(next.knowledge, knowledgeBefore, "knowledge (runs/day/interest/...) must be entirely untouched by a floor-to-floor descend");
});

// ── determinism: replay the collect-then-descend log twice ────────────

test("determinism: replaying the collect-key-then-descend command log twice reproduces an identical h32(serializeState(...))", () => {
  function run() {
    const world = deriveTombWorld(KEY_SEED, 1);
    let state = keyFloorState(world, KEY_APPROACH);
    ({ state } = commit(state, world, "move 1 0"));
    const approach = { x: world.stairsAt.x - 1, y: world.stairsAt.y };
    state = { ...state, character: { ...state.character, pos: { ...approach } } };
    ({ state } = commit(state, world, "move 1 0"));
    return state;
  }

  const a = run();
  const b = run();
  assert.deepEqual(a, b, "two independent runs of the same command log must produce structurally identical state");
  assert.equal(h32(serializeState(a)), h32(serializeState(b)), "and byte-identical hashes");
});
