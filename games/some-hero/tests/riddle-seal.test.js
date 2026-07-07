/* ── Riddle-seal resolution (docs/superpowers/specs/2026-07-07-riddle-
   seal-resolution-design.md): the new "answer <index>" verb, the new
   RIDDLE_ANSWERED/DESCENDED events, and the depth backfill.

   Honest scope (this file's own proof, not just a claim): seal type is a
   uniform 1-in-5 draw per non-warden floor (shared/floorgen.js's
   SEAL_TYPES) — only RIDDLE-sealed floors are made progressable here.
   seed "8"'s floor 1 draws a riddle seal; seed "1"'s floor 1 draws a
   "key" seal (both found by an offline scan of generateFloor("<seed>",
   1).puzzle.type — see the two constants below), so this file exercises
   a REAL generated floor's geometry/puzzle for both the positive (riddle,
   answerable, descends once solved) and negative (non-riddle, stays
   silently sealed — no per-type logic invented) cases, not a hand-waved
   stub puzzle.

   `deriveTombWorld` below calls the SAME `deriveWorld` dispatcher (S3
   PR4) src/host.js's hostCommit and shared/module.js's validate() both
   use for a "tomb:"-prefixed mapId — so world.mapId here is real,
   "tomb:"-prefixed, and satisfies validate()'s own DESCENDED guard
   exactly like a live ENTERED_TOMB-derived world would. */
import test from "node:test";
import assert from "node:assert/strict";
import { channel, h32 } from "@golem-engine/random";
import { validate, deriveWorld } from "../shared/module.js";
import { createState, reduce, serializeState } from "../shared/reducer.js";
import { nextRiddle } from "../rules/riddle.js";
import { pack } from "../rules/pack.js";

// generateFloor("8", 1).puzzle.type === "riddle" (found via an offline
// scan over seeds "1".."500" — see this file's own header).
const RIDDLE_SEED = "8";
// generateFloor("1", 1).puzzle.type === "key" — any non-riddle seal
// proves the scope boundary; "key" is simply the first one found.
const NON_RIDDLE_SEED = "1";

function deriveTombWorld(seed, floorNum) {
  const mapId = `tomb:${seed}:0:${floorNum}`;
  return deriveWorld(pack, { zone: "tomb", floorNum, mapId }, seed);
}

/** validate() -> assert legal -> fold every returned event through
 *  reduce() — the same validate->seq-stamp->commit discipline used
 *  throughout this package's own tests (rules/tests/ceremony-kernel/
 *  kernel-helpers.mjs's own commit()). */
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

/** Recomputes the SAME options validate()'s "answer" case / affordances()
 *  compute internally (design spec's "Recompute nextRiddle... same
 *  channel key") — used here only to pick a correct/wrong index for the
 *  test to drive, never to assert on the riddle ALGORITHM itself (that's
 *  rules/tests/ceremony-kernel/seal-stairs.kernel.test.js's job). */
function riddleOptions(world, puzzle, runStats) {
  const rng = channel(world.mapId, "riddle", String(puzzle.attempts));
  return nextRiddle({ puzzle, floorNum: world.floorNum, runStats }, rng).options;
}

/** A state freshly standing on a real generated tomb floor's riddle
 *  seal, with the puzzle carried over from the derived World (the same
 *  `world.puzzle` field deriveWorldFromGeneratedFloor/ENTERED_TOMB's own
 *  seeded branch both populate `run.puzzle` from) — NOT a hand-waved
 *  puzzle object. `pos` places the character wherever the caller needs
 *  it (e.g. one step from stairsAt), bypassing a full BFS walk across
 *  the 34x34 floor — the riddle/descend MECHANICS under test are
 *  position-independent (answer) or a single-step tile check (move),
 *  neither of which needs the full walk simulated. */
function riddleFloorState(world, pos) {
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

// ── "answer <index>": position-independent, gated on an unsolved riddle ──

test('"answer <correct index>" solves the riddle: RIDDLE_ANSWERED{result:"solved"}, run.puzzle.solved becomes true', () => {
  const world = deriveTombWorld(RIDDLE_SEED, 1);
  assert.equal(world.puzzle.type, "riddle", "sanity: seed 8 floor 1 must be a riddle seal");
  let state = riddleFloorState(world, world.spawn);

  const options = riddleOptions(world, state.run.puzzle, state.run.runStats);
  const correctIdx = options.findIndex((o) => o.correct);
  assert.ok(correctIdx >= 0, "sanity: exactly one option must be correct");

  const { state: next, result } = commit(state, world, `answer ${correctIdx}`);
  assert.deepEqual(result.map((e) => e.t), ["RIDDLE_ANSWERED"]);
  assert.equal(result[0].result, "solved");
  assert.equal(next.run.puzzle.solved, true);
});

test('"answer <wrong index>" does not solve: attempts increments, solved stays false', () => {
  const world = deriveTombWorld(RIDDLE_SEED, 1);
  let state = riddleFloorState(world, world.spawn);

  const options = riddleOptions(world, state.run.puzzle, state.run.runStats);
  const wrongIdx = options.findIndex((o) => !o.correct);
  assert.ok(wrongIdx >= 0, "sanity: at least one option must be wrong at attempts 0");

  const { state: next, result } = commit(state, world, `answer ${wrongIdx}`);
  assert.deepEqual(result.map((e) => e.t), ["RIDDLE_ANSWERED"]);
  assert.equal(result[0].result, "wrong");
  assert.equal(next.run.puzzle.solved, false);
  assert.equal(next.run.puzzle.attempts, 1, "attempts increments on a wrong answer");
});

test('"answer <out-of-range index>" is a Denial, never an event', () => {
  const world = deriveTombWorld(RIDDLE_SEED, 1);
  const state = riddleFloorState(world, world.spawn);

  const denial = validate({ state, world }, "answer 999");
  assert.ok(!Array.isArray(denial), "expected a Denial, not a legal event array");
  assert.ok(typeof denial.deny === "string" && denial.deny.length > 0);

  const negDenial = validate({ state, world }, "answer -1");
  assert.ok(!Array.isArray(negDenial), "a negative index must also be denied");
});

test('"answer" is denied outside the tomb and once the riddle is already solved', () => {
  const world = deriveTombWorld(RIDDLE_SEED, 1);
  const state = riddleFloorState(world, world.spawn);

  // Not in the tomb at all — the gate reads `world.zone` (the derived
  // World handed to validate(), the same field its own "move" case's
  // gate/seal branches read), not `state.world`.
  const owWorld = { ...world, zone: "ow" };
  const owDenial = validate({ state, world: owWorld }, "answer 0");
  assert.ok(!Array.isArray(owDenial));

  // Already solved.
  const solvedState = { ...state, run: { ...state.run, puzzle: { ...state.run.puzzle, solved: true } } };
  const solvedDenial = validate({ state: solvedState, world }, "answer 0");
  assert.ok(!Array.isArray(solvedDenial));
});

// ── solved riddle + walking onto stairsAt -> DESCENDED ──────────────────

test("solved riddle + moving onto stairsAt emits DESCENDED (not RIDDLE_ASKED): floorNum+1, new mapId, runStats.kills/goldGained preserved, knowledge unchanged", () => {
  const world = deriveTombWorld(RIDDLE_SEED, 1);
  const { x, y } = world.stairsAt;
  // Approach from one step west of stairsAt (verified walkable for seed
  // "8"'s floor 1 by the offline scan this file's header describes).
  const approach = { x: x - 1, y };

  let state = riddleFloorState(world, approach);
  // Answer correctly first — proves the FULL realistic chain (answer ->
  // solved -> descend), not a puzzle forced straight to solved:true.
  const options = riddleOptions(world, state.run.puzzle, state.run.runStats);
  const correctIdx = options.findIndex((o) => o.correct);
  ({ state } = commit(state, world, `answer ${correctIdx}`));
  assert.equal(state.run.puzzle.solved, true, "sanity: the riddle must be solved before the descend step");

  // Arrange runStats so the "preserved across floors" proof is not
  // vacuous (both fields default to 0/0 from newRunStats()).
  state = { ...state, run: { ...state.run, runStats: { ...state.run.runStats, kills: 5, goldGained: 12 } } };
  const knowledgeBefore = state.knowledge;

  const { state: next, result } = commit(state, world, "move 1 0");
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "DESCENDED"], "a solved riddle door opens onto DESCENDED, never RIDDLE_ASKED");

  const descended = result[1];
  assert.equal(descended.floorNum, 2);
  assert.equal(descended.mapId, `tomb:${RIDDLE_SEED}:0:2`);
  assert.equal(next.world.floorNum, 2);
  assert.equal(next.world.mapId, `tomb:${RIDDLE_SEED}:0:2`);
  assert.deepEqual(next.character.pos, descended.spawn);

  assert.equal(next.run.runStats.kills, 5, "kills must be preserved across the floor transition");
  assert.equal(next.run.runStats.goldGained, 12, "goldGained must be preserved across the floor transition");
  assert.equal(next.run.runStats.depth, 2, "depth bumps to the new floor number");

  assert.deepEqual(next.knowledge, knowledgeBefore, "knowledge (runs/day/interest/...) must be entirely untouched by a floor-to-floor descend");
});

// ── scope boundary: non-riddle seals stay sealed, silently ─────────────

test("a non-riddle-seal floor: walking onto its sealed stairs is a silent no-op (no RIDDLE_ASKED, no DESCENDED, no Denial)", () => {
  const world = deriveTombWorld(NON_RIDDLE_SEED, 1);
  assert.notEqual(world.puzzle.type, "riddle", "sanity: seed 1 floor 1 must NOT be a riddle seal");

  const { x, y } = world.stairsAt;
  const approach = { x: x - 1, y };
  const state = riddleFloorState(world, approach);

  const { state: next, result } = commit(state, world, "move 1 0");
  assert.deepEqual(result.map((e) => e.t), ["MOVED"], "no seal-specific event of any kind for a non-riddle seal");
  assert.equal(next.world.zone, "tomb", "not a zone transition");
  assert.equal(next.world.floorNum, 1, "still floor 1 — no descend");
});

// ── determinism: replay the answer -> descend log twice ────────────────

test("determinism: replaying the answer-then-descend command log twice reproduces an identical h32(serializeState(...))", () => {
  function run() {
    const world = deriveTombWorld(RIDDLE_SEED, 1);
    const { x, y } = world.stairsAt;
    let state = riddleFloorState(world, { x: x - 1, y });

    const options = riddleOptions(world, state.run.puzzle, state.run.runStats);
    const correctIdx = options.findIndex((o) => o.correct);
    ({ state } = commit(state, world, `answer ${correctIdx}`));
    ({ state } = commit(state, world, "move 1 0"));
    return state;
  }

  const a = run();
  const b = run();
  assert.deepEqual(a, b, "two independent runs of the same command log must produce structurally identical state");
  assert.equal(h32(serializeState(a)), h32(serializeState(b)), "and byte-identical hashes");
});
