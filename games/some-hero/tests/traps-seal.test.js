/* ── Traps-seal resolution (docs/superpowers/specs/2026-07-07-traps-
   seal-resolution-design.md): stepping on every un-hit trap tile fills
   the incident counter, `run.puzzle.solved` flips true, and the
   generalized descend condition (shared/module.js's "move" case, now
   `sim.run.puzzle && sim.run.puzzle.solved` instead of
   `sim.run.puzzle.type==="riddle" && sim.run.puzzle.solved`) opens the
   stairs. No damage (legacy: "the traps ran out of darts years ago").

   Honest scope (mirrors tests/riddle-seal.test.js's own header): seed
   "15" floor 1 draws a "traps" seal (found by the same kind of offline
   scan over generateFloor("<seed>", 1).puzzle.type, filtered further to
   a floor whose trap tiles don't themselves double as a gold/potion
   pickup tile — some seeds' traps do coincide with a pickup, which is a
   real, unrelated feature of generated floors, not a traps-seal concern,
   so it is deliberately avoided here for a clean event-list assertion —
   need:3, three trap tiles at (24,6)/(12,15)/(23,5), stairsAt (23,20)).
   This exercises a REAL generated floor's geometry/puzzle, not a
   hand-waved stub.

   Positioning discipline: like riddleFloorState in tests/riddle-seal.
   test.js, `trapsFloorState` below places `character.pos` wherever a
   test needs it directly (one step from a trap tile, or one step from
   stairsAt) rather than BFS-walking the full 30ish-tile floor — the
   trap-trigger/descend MECHANICS under test are each a single-step tile
   check, position-independent of how the character got there. Every
   move that matters (the actual step onto a trap tile or onto stairsAt)
   is still driven through the real "move dx dy" verb → validate() →
   reduce(), never poked directly. */
import test from "node:test";
import assert from "node:assert/strict";
import { h32 } from "@golem-engine/random";
import { validate, deriveWorld } from "../shared/module.js";
import { createState, reduce, serializeState } from "../shared/reducer.js";
import { pack } from "../rules/pack.js";

// generateFloor("15", 1).puzzle.type === "traps" (found via an offline
// scan over seeds "1".."500" — see this file's own header). need:3,
// traps at (24,6)/(12,15)/(23,5), stairsAt (23,20).
const TRAPS_SEED = "15";
// generateFloor("1", 1).puzzle.type === "key" — same non-traps/non-
// riddle regression seed tests/riddle-seal.test.js already uses.
const NON_TRAPS_SEED = "1";

function deriveTombWorld(seed, floorNum) {
  const mapId = `tomb:${seed}:0:${floorNum}`;
  return deriveWorld(pack, { zone: "tomb", floorNum, mapId }, seed);
}

/** validate() -> assert legal -> fold every returned event through
 *  reduce() — same commit() idiom as tests/riddle-seal.test.js. */
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

/** A state freshly standing on a real generated tomb floor's seal, puzzle
 *  carried over from the derived World exactly like ENTERED_TOMB's own
 *  seeded branch populates `run.puzzle` — deep-copies `traps` (when
 *  present; the key-seal regression test's puzzle has no `traps` field)
 *  so each test starts from a fresh, independent array (never sharing
 *  references with `world.puzzle.traps` or another test). */
function trapsFloorState(world, pos) {
  let state = reduce(createState(), world, {
    t: "FLOOR_ENTERED",
    zone: world.zone,
    floorNum: world.floorNum,
    mapId: world.mapId,
    seq: 1,
  });
  state = {
    ...state,
    run: {
      ...state.run,
      puzzle: {
        ...world.puzzle,
        ...(world.puzzle.traps ? { traps: world.puzzle.traps.map((tr) => ({ ...tr })) } : {}),
      },
    },
    character: { ...state.character, pos: { ...pos } },
  };
  return state;
}

// Approach tiles one step away from each trap / from stairsAt, verified
// walkable (and not themselves a pickup tile — see this file's own
// header) for seed "15"'s floor 1 by the offline scan this file's header
// describes — each pairs with the "move dx dy" that lands exactly on the
// target tile.
const TRAP_APPROACH = [
  { approach: { x: 23, y: 6 }, move: "move 1 0", trap: { x: 24, y: 6 } },
  { approach: { x: 11, y: 15 }, move: "move 1 0", trap: { x: 12, y: 15 } },
  { approach: { x: 22, y: 5 }, move: "move 1 0", trap: { x: 23, y: 5 } },
];
const STAIRS_APPROACH = { x: 22, y: 20 };

// ── stepping on each trap tile: [MOVED, TRAP_TRIGGERED], done increments ──

test("stepping onto each un-hit trap tile fires TRAP_TRIGGERED: done increments 1 per new trap, other traps stay un-hit, no damage", () => {
  const world = deriveTombWorld(TRAPS_SEED, 1);
  assert.equal(world.puzzle.type, "traps", "sanity: seed 15 floor 1 must be a traps seal");
  assert.equal(world.puzzle.need, 3, "sanity: this floor's incident quota");

  let state = trapsFloorState(world, TRAP_APPROACH[0].approach);
  const hpBefore = state.character.hp;

  // Trap 0
  let result;
  ({ state, result } = commit(state, world, TRAP_APPROACH[0].move));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "TRAP_TRIGGERED"]);
  assert.equal(state.run.puzzle.done, 1);
  assert.equal(state.run.puzzle.solved, false);
  assert.equal(state.character.hp, hpBefore, "no damage on a trap step");
  let trapsByPos = Object.fromEntries(state.run.puzzle.traps.map((tr) => [`${tr.x},${tr.y}`, tr.hit]));
  assert.equal(trapsByPos["24,6"], true);
  assert.equal(trapsByPos["12,15"], false, "un-hit traps stay un-hit");
  assert.equal(trapsByPos["23,5"], false, "un-hit traps stay un-hit");

  // Reposition to trap 1's approach (bypassing the BFS walk — see header).
  state = { ...state, character: { ...state.character, pos: { ...TRAP_APPROACH[1].approach } } };
  ({ state, result } = commit(state, world, TRAP_APPROACH[1].move));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "TRAP_TRIGGERED"]);
  assert.equal(state.run.puzzle.done, 2);
  assert.equal(state.run.puzzle.solved, false);
  trapsByPos = Object.fromEntries(state.run.puzzle.traps.map((tr) => [`${tr.x},${tr.y}`, tr.hit]));
  assert.equal(trapsByPos["24,6"], true, "trap 0 stays hit");
  assert.equal(trapsByPos["12,15"], true);
  assert.equal(trapsByPos["23,5"], false, "trap 2 still un-hit");

  // Reposition to trap 2's approach — the LAST trap.
  state = { ...state, character: { ...state.character, pos: { ...TRAP_APPROACH[2].approach } } };
  ({ state, result } = commit(state, world, TRAP_APPROACH[2].move));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "TRAP_TRIGGERED"]);
  assert.equal(state.run.puzzle.done, 3);
  assert.equal(state.run.puzzle.solved, true, "the last trap sets solved");
});

// ── stepping on the SAME (already-hit) trap twice: no double-count ─────

test("stepping onto an already-hit trap a second time does not double-count: only [MOVED]", () => {
  const world = deriveTombWorld(TRAPS_SEED, 1);
  let state = trapsFloorState(world, TRAP_APPROACH[0].approach);

  let result;
  ({ state, result } = commit(state, world, TRAP_APPROACH[0].move));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "TRAP_TRIGGERED"]);
  assert.equal(state.run.puzzle.done, 1);
  assert.equal(state.character.pos.x, TRAP_APPROACH[0].trap.x);
  assert.equal(state.character.pos.y, TRAP_APPROACH[0].trap.y);

  // Step back off the trap tile onto the (free, already-visited) approach
  // tile, then back onto the trap a second time.
  ({ state, result } = commit(state, world, "move -1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED"], "stepping off is a plain move");

  ({ state, result } = commit(state, world, "move 1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED"], "re-stepping an already-hit trap fires nothing extra");
  assert.equal(state.run.puzzle.done, 1, "done must not double-count");
  const trapsByPos = Object.fromEntries(state.run.puzzle.traps.map((tr) => [`${tr.x},${tr.y}`, tr.hit]));
  assert.equal(trapsByPos["24,6"], true);
});

// ── all traps hit + moving onto stairsAt -> DESCENDED ───────────────────

test("all traps hit (solved) + moving onto stairsAt emits DESCENDED (not silent): floorNum+1, new mapId, runStats preserved, knowledge unchanged", () => {
  const world = deriveTombWorld(TRAPS_SEED, 1);
  let state = trapsFloorState(world, TRAP_APPROACH[0].approach);

  let result;
  for (const step of TRAP_APPROACH) {
    state = { ...state, character: { ...state.character, pos: { ...step.approach } } };
    ({ state, result } = commit(state, world, step.move));
  }
  assert.equal(state.run.puzzle.solved, true, "sanity: all three traps must be hit before the descend step");

  // Arrange runStats so the "preserved across floors" proof is not vacuous.
  state = { ...state, run: { ...state.run, runStats: { ...state.run.runStats, kills: 7, goldGained: 20 } } };
  const knowledgeBefore = state.knowledge;

  state = { ...state, character: { ...state.character, pos: { ...STAIRS_APPROACH } } };
  const { state: next, result: descendResult } = commit(state, world, "move 1 0");
  assert.deepEqual(descendResult.map((e) => e.t), ["MOVED", "DESCENDED"], "a fully-stepped traps door opens onto DESCENDED");

  const descended = descendResult[1];
  assert.equal(descended.floorNum, 2);
  assert.equal(descended.mapId, `tomb:${TRAPS_SEED}:0:2`);
  assert.equal(next.world.floorNum, 2);
  assert.equal(next.world.mapId, `tomb:${TRAPS_SEED}:0:2`);
  assert.deepEqual(next.character.pos, descended.spawn);

  assert.equal(next.run.runStats.kills, 7, "kills must be preserved across the floor transition");
  assert.equal(next.run.runStats.goldGained, 20, "goldGained must be preserved across the floor transition");
  assert.equal(next.run.runStats.depth, 2, "depth bumps to the new floor number");

  assert.deepEqual(next.knowledge, knowledgeBefore, "knowledge (runs/day/interest/...) must be entirely untouched by a floor-to-floor descend");
});

// ── partial (not all traps hit) + moving onto stairsAt -> silent no-op ──

test("a partial traps floor (not all hit): walking onto its sealed stairs is a silent no-op (no DESCENDED, no Denial)", () => {
  const world = deriveTombWorld(TRAPS_SEED, 1);
  let state = trapsFloorState(world, TRAP_APPROACH[0].approach);

  // Hit only the first trap — deliberately leave 2 of 3 un-hit.
  let result;
  ({ state, result } = commit(state, world, TRAP_APPROACH[0].move));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "TRAP_TRIGGERED"]);
  assert.equal(state.run.puzzle.solved, false, "sanity: only 1 of 3 traps hit — not solved");

  state = { ...state, character: { ...state.character, pos: { ...STAIRS_APPROACH } } };
  const { state: next, result: stairsResult } = commit(state, world, "move 1 0");
  assert.deepEqual(stairsResult.map((e) => e.t), ["MOVED"], "an unsolved traps seal stays silently closed — no seal-specific event");
  assert.equal(next.world.zone, "tomb", "not a zone transition");
  assert.equal(next.world.floorNum, 1, "still floor 1 — no descend");
});

// ── scope boundary: a non-traps/non-riddle seal (key) stays unaffected ──

test("a non-traps seal floor (key): walking onto its sealed stairs is still a silent no-op after the traps-seal change", () => {
  const world = deriveTombWorld(NON_TRAPS_SEED, 1);
  assert.equal(world.puzzle.type, "key", "sanity: seed 1 floor 1 must be a key seal");

  const { x, y } = world.stairsAt;
  const approach = { x: x - 1, y };
  const state = trapsFloorState(world, approach);

  const { state: next, result } = commit(state, world, "move 1 0");
  assert.deepEqual(result.map((e) => e.t), ["MOVED"], "no seal-specific event of any kind for a key seal");
  assert.equal(next.world.floorNum, 1, "still floor 1 — no descend");
});

// ── determinism: replay the step-all-then-descend log twice ────────────

test("determinism: replaying the step-all-traps-then-descend command log twice reproduces an identical h32(serializeState(...))", () => {
  function run() {
    const world = deriveTombWorld(TRAPS_SEED, 1);
    let state = trapsFloorState(world, TRAP_APPROACH[0].approach);
    for (const step of TRAP_APPROACH) {
      state = { ...state, character: { ...state.character, pos: { ...step.approach } } };
      ({ state } = commit(state, world, step.move));
    }
    state = { ...state, character: { ...state.character, pos: { ...STAIRS_APPROACH } } };
    ({ state } = commit(state, world, "move 1 0"));
    return state;
  }

  const a = run();
  const b = run();
  assert.deepEqual(a, b, "two independent runs of the same command log must produce structurally identical state");
  assert.equal(h32(serializeState(a)), h32(serializeState(b)), "and byte-identical hashes");
});
