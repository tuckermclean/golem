/* ── Plates-seal resolution (docs/superpowers/specs/2026-07-07-plates-
   seal-resolution-design.md): walking into a block on a "plates" floor
   pushes it one tile in the travel direction iff the tile beyond it is
   walkable and unoccupied by another block (the player then advances onto
   the block's OLD tile, a normal MOVED); otherwise the block is solid and
   the whole move is DENIED ("The block won't budge."). After any push,
   every plate's `on` is recomputed (a block sitting on a plate covers it;
   pushing a block off a plate uncovers it), `done` is the covered-plate
   count, and `solved = done >= need`. Once solved, the generalized descend
   condition (shared/module.js's "move" case, `stairsOpen` from rules/
   puzzles.js) opens the stairs — no change to that if-chain was needed
   (plates is neither "warden" nor "final", and `stairsOpen`'s `else`
   branch already returns `!!puzzle.solved`).

   Honest scope (mirrors tests/traps-seal.test.js's own header): seed "57"
   floor 1 draws a "plates" seal (need:2) with two blocks, each axis-
   aligned and distance-2 from its plate with a fully-walkable push lane,
   and whose lanes / landing tiles / stairs-approach are clear of
   floor.pickups (found by the same kind of offline scan over
   generateFloor("<seed>", 1) this repo's other seal-resolution test files
   describe) — so every push yields a clean [MOVED, BLOCK_PUSHED] event
   list. This exercises a REAL generated floor's geometry/puzzle, not a
   hand-waved stub:
     - Pair A: block (24,7) -> plate (26,7), push direction +1,0.
     - Pair B: block (26,4) -> plate (24,4), push direction -1,0.
     - stairsAt (29,18).

   Positioning discipline: like trapsFloorState in tests/traps-seal.
   test.js, `platesFloorState` below places `character.pos` wherever a
   test needs it directly (one step from a block, or one step from
   stairsAt) rather than BFS-walking the full floor — the block-push/
   descend MECHANICS under test are each a single-step tile check,
   position-independent of how the character got there. Every move that
   matters (the actual push, or the step onto stairsAt) is still driven
   through the real "move dx dy" verb -> validate() -> reduce(), never
   poked directly. */
import test from "node:test";
import assert from "node:assert/strict";
import { h32 } from "@golem-engine/random";
import { validate, deriveWorld } from "../shared/module.js";
import { createState, reduce, serializeState } from "../shared/reducer.js";
import { pack } from "../rules/pack.js";

// generateFloor("57", 1).puzzle.type === "plates" (found via the same
// kind of offline scan tests/traps-seal.test.js's header describes).
// need:2, plates at (24,4)/(26,7), blocks at (26,4)/(24,7), stairsAt
// (29,18).
const PLATES_SEED = "57";
// generateFloor("1", 1).puzzle.type === "key" — same non-plates
// regression seed tests/traps-seal.test.js and tests/riddle-seal.test.js
// already use.
const NON_PLATES_SEED = "1";

function deriveTombWorld(seed, floorNum) {
  const mapId = `tomb:${seed}:0:${floorNum}`;
  return deriveWorld(pack, { zone: "tomb", floorNum, mapId }, seed);
}

/** validate() -> assert legal -> fold every returned event through
 *  reduce() — same commit() idiom as tests/traps-seal.test.js. */
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
 *  seeded branch populates `run.puzzle` — deep-copies BOTH `plates` and
 *  `blocks` (fresh arrays of fresh objects; guarded, since the key-seal
 *  regression test's puzzle has neither field) so each test starts from
 *  an independent puzzle, never sharing references with `world.puzzle`
 *  or another test. */
function platesFloorState(world, pos) {
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
        ...(world.puzzle.plates ? { plates: world.puzzle.plates.map((p) => ({ ...p })) } : {}),
        ...(world.puzzle.blocks ? { blocks: world.puzzle.blocks.map((b) => ({ ...b })) } : {}),
      },
    },
    character: { ...state.character, pos: { ...pos } },
  };
  return state;
}

const STAIRS_APPROACH = { x: 30, y: 18 };

// ── pushing each block onto its plate: [MOVED, BLOCK_PUSHED], done tracks covered plates ──

test("pushing each block onto its plate fires BLOCK_PUSHED: done increments per newly-covered plate, solved flips true on the last push", () => {
  const world = deriveTombWorld(PLATES_SEED, 1);
  assert.equal(world.puzzle.type, "plates", "sanity: seed 57 floor 1 must be a plates seal");
  assert.equal(world.puzzle.need, 2, "sanity: this floor's plate quota");

  // Pair A: block (24,7) -> plate (26,7), pushed +1,0 twice.
  let state = platesFloorState(world, { x: 23, y: 7 });
  let result;

  ({ state, result } = commit(state, world, "move 1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "BLOCK_PUSHED"]);
  assert.deepEqual(state.character.pos, { x: 24, y: 7 });
  let blocksByPos = Object.fromEntries(state.run.puzzle.blocks.map((b) => [`${b.x},${b.y}`, true]));
  assert.ok(blocksByPos["25,7"], "pair-A block pushed to (25,7)");
  assert.ok(blocksByPos["26,4"], "pair-B block unmoved");
  assert.equal(state.run.puzzle.done, 0, "no plate covered yet after push1");
  assert.equal(state.run.puzzle.solved, false);

  ({ state, result } = commit(state, world, "move 1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "BLOCK_PUSHED"]);
  assert.deepEqual(state.character.pos, { x: 25, y: 7 });
  blocksByPos = Object.fromEntries(state.run.puzzle.blocks.map((b) => [`${b.x},${b.y}`, true]));
  assert.ok(blocksByPos["26,7"], "pair-A block pushed onto its plate (26,7)");
  assert.equal(state.run.puzzle.done, 1, "pair-A plate now covered");
  assert.equal(state.run.puzzle.solved, false, "pair-B plate still uncovered");

  // Reposition to pair B's approach (bypassing the BFS walk — see header).
  state = { ...state, character: { ...state.character, pos: { x: 27, y: 4 } } };

  ({ state, result } = commit(state, world, "move -1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "BLOCK_PUSHED"]);
  assert.deepEqual(state.character.pos, { x: 26, y: 4 });
  blocksByPos = Object.fromEntries(state.run.puzzle.blocks.map((b) => [`${b.x},${b.y}`, true]));
  assert.ok(blocksByPos["25,4"], "pair-B block pushed to (25,4)");
  assert.equal(state.run.puzzle.done, 1, "still only pair-A covered");
  assert.equal(state.run.puzzle.solved, false);

  ({ state, result } = commit(state, world, "move -1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "BLOCK_PUSHED"]);
  assert.deepEqual(state.character.pos, { x: 25, y: 4 });
  blocksByPos = Object.fromEntries(state.run.puzzle.blocks.map((b) => [`${b.x},${b.y}`, true]));
  assert.ok(blocksByPos["24,4"], "pair-B block pushed onto its plate (24,4)");
  assert.equal(state.run.puzzle.done, 2, "both plates now covered");
  assert.equal(state.run.puzzle.solved, true, "the last push sets solved");
});

// ── solve + descend: both plates covered -> stairs open ────────────────

test("both plates solved + moving onto stairsAt emits DESCENDED (not silent): floorNum+1, new mapId, runStats preserved, knowledge unchanged", () => {
  const world = deriveTombWorld(PLATES_SEED, 1);
  let state = platesFloorState(world, { x: 23, y: 7 });
  let result;

  ({ state, result } = commit(state, world, "move 1 0"));
  ({ state, result } = commit(state, world, "move 1 0"));
  state = { ...state, character: { ...state.character, pos: { x: 27, y: 4 } } };
  ({ state, result } = commit(state, world, "move -1 0"));
  ({ state, result } = commit(state, world, "move -1 0"));
  assert.equal(state.run.puzzle.solved, true, "sanity: both plates must be covered before the descend step");

  // Arrange runStats so the "preserved across floors" proof is not vacuous.
  state = { ...state, run: { ...state.run, runStats: { ...state.run.runStats, kills: 7, goldGained: 20 } } };
  const knowledgeBefore = state.knowledge;

  state = { ...state, character: { ...state.character, pos: { ...STAIRS_APPROACH } } };
  const { state: next, result: descendResult } = commit(state, world, "move -1 0");
  assert.deepEqual(descendResult.map((e) => e.t), ["MOVED", "DESCENDED"], "a fully-solved plates door opens onto DESCENDED");

  const descended = descendResult[1];
  assert.equal(descended.floorNum, 2);
  assert.equal(descended.mapId, `tomb:${PLATES_SEED}:0:2`);
  assert.equal(next.world.floorNum, 2);
  assert.equal(next.world.mapId, `tomb:${PLATES_SEED}:0:2`);
  assert.deepEqual(next.character.pos, descended.spawn);

  assert.equal(next.run.runStats.kills, 7, "kills must be preserved across the floor transition");
  assert.equal(next.run.runStats.goldGained, 20, "goldGained must be preserved across the floor transition");
  assert.equal(next.run.runStats.depth, 2, "depth bumps to the new floor number");

  assert.deepEqual(next.knowledge, knowledgeBefore, "knowledge (runs/day/interest/...) must be entirely untouched by a floor-to-floor descend");
});

// ── adversarial-review find: a SOLVED plates puzzle's blocks stay solid ─

test("even after the seal is solved, a resting block is still a physical obstacle: walking into it denies (never a walk-through)", () => {
  const world = deriveTombWorld(PLATES_SEED, 1);
  let state = platesFloorState(world, { x: 23, y: 7 });

  // Solve both plates (same sequence as the descend test) — ends with the
  // player at (25,4) and a resting block at (24,4).
  ({ state } = commit(state, world, "move 1 0"));
  ({ state } = commit(state, world, "move 1 0"));
  state = { ...state, character: { ...state.character, pos: { x: 27, y: 4 } } };
  ({ state } = commit(state, world, "move -1 0"));
  ({ state } = commit(state, world, "move -1 0"));
  assert.equal(state.run.puzzle.solved, true, "sanity: solved before the solidity check");
  assert.ok(
    state.run.puzzle.blocks.some((b) => b.x === 24 && b.y === 4),
    "sanity: a block rests on plate (24,4) after the solve",
  );

  // From (25,4), stepping west onto the resting block (24,4) must DENY —
  // the block is inert (already on its plate) but still solid. Before the
  // fix this returned a bare [MOVED] (the player walked onto the block's
  // tile, two occupants on one cell).
  state = { ...state, character: { ...state.character, pos: { x: 25, y: 4 } } };
  const result = validate({ state, world }, "move -1 0");
  assert.ok(!Array.isArray(result), "walking into a solved-puzzle block must be a Denial, not a legal move");
  assert.equal(result.deny, "The block won't budge.");
});

// ── deny: a block pushed against a wall won't budge ─────────────────────

test("pushing a block against a wall denies the whole move: 'The block won't budge.', block and player stay put, plate flips on/off as it transits", () => {
  const world = deriveTombWorld(PLATES_SEED, 1);
  let state = platesFloorState(world, { x: 27, y: 4 });
  let result;

  // push1: (27,4)->(26,4), block (26,4)->(25,4).
  ({ state, result } = commit(state, world, "move -1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "BLOCK_PUSHED"]);
  assert.equal(state.run.puzzle.done, 0, "block not yet on the plate");

  // push2: (26,4)->(25,4), block (25,4)->(24,4) — covers the plate.
  ({ state, result } = commit(state, world, "move -1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "BLOCK_PUSHED"]);
  assert.equal(state.run.puzzle.done, 1, "plate transiently covered");

  // push3: (25,4)->(24,4), block (24,4)->(23,4) — uncovers the plate.
  ({ state, result } = commit(state, world, "move -1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "BLOCK_PUSHED"]);
  assert.equal(state.run.puzzle.done, 0, "plate uncovered once its block is pushed off");
  assert.deepEqual(state.character.pos, { x: 24, y: 4 });
  let blocksByPos = Object.fromEntries(state.run.puzzle.blocks.map((b) => [`${b.x},${b.y}`, true]));
  assert.ok(blocksByPos["23,4"], "block now at (23,4)");

  // push4 (deny): from (24,4), the block at (23,4) has a wall at (22,4)
  // beyond it — the whole move is denied.
  const denyResult = validate({ state, world }, "move -1 0");
  assert.ok(!Array.isArray(denyResult), "expected a Denial");
  assert.equal(denyResult.deny, "The block won't budge.");
  assert.deepEqual(state.character.pos, { x: 24, y: 4 }, "player did not move");
  blocksByPos = Object.fromEntries(state.run.puzzle.blocks.map((b) => [`${b.x},${b.y}`, true]));
  assert.ok(blocksByPos["23,4"], "the block stayed at (23,4)");
});

// ── partial (not all plates covered) + moving onto stairsAt -> silent no-op ──

test("a partial plates floor (only one plate covered): walking onto its sealed stairs is a silent no-op (no DESCENDED, no Denial)", () => {
  const world = deriveTombWorld(PLATES_SEED, 1);
  let state = platesFloorState(world, { x: 23, y: 7 });
  let result;

  // Cover only pair A's plate — deliberately leave pair B uncovered.
  ({ state, result } = commit(state, world, "move 1 0"));
  ({ state, result } = commit(state, world, "move 1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "BLOCK_PUSHED"]);
  assert.equal(state.run.puzzle.done, 1, "sanity: only one of two plates covered");
  assert.equal(state.run.puzzle.solved, false);

  state = { ...state, character: { ...state.character, pos: { ...STAIRS_APPROACH } } };
  const { state: next, result: stairsResult } = commit(state, world, "move -1 0");
  assert.deepEqual(stairsResult.map((e) => e.t), ["MOVED"], "an unsolved plates seal stays silently closed — no seal-specific event");
  assert.equal(next.world.zone, "tomb", "not a zone transition");
  assert.equal(next.world.floorNum, 1, "still floor 1 — no descend");
});

// ── scope boundary: a non-plates seal (key) stays unaffected ───────────

test("a non-plates seal floor (key): walking onto its sealed stairs is still a silent no-op after the plates-seal change", () => {
  const world = deriveTombWorld(NON_PLATES_SEED, 1);
  assert.equal(world.puzzle.type, "key", "sanity: seed 1 floor 1 must be a key seal");

  const { x, y } = world.stairsAt;
  const approach = { x: x - 1, y };
  const state = platesFloorState(world, approach);

  const { state: next, result } = commit(state, world, "move 1 0");
  assert.deepEqual(result.map((e) => e.t), ["MOVED"], "no seal-specific event of any kind for a key seal, and the blocks logic never engages for a non-plates puzzle");
  assert.equal(next.world.floorNum, 1, "still floor 1 — no descend");
});

// ── determinism: replay the solve-both-plates-then-descend log twice ───

test("determinism: replaying the solve-both-plates-then-descend command log twice reproduces an identical h32(serializeState(...))", () => {
  function run() {
    const world = deriveTombWorld(PLATES_SEED, 1);
    let state = platesFloorState(world, { x: 23, y: 7 });
    ({ state } = commit(state, world, "move 1 0"));
    ({ state } = commit(state, world, "move 1 0"));
    state = { ...state, character: { ...state.character, pos: { x: 27, y: 4 } } };
    ({ state } = commit(state, world, "move -1 0"));
    ({ state } = commit(state, world, "move -1 0"));
    state = { ...state, character: { ...state.character, pos: { ...STAIRS_APPROACH } } };
    ({ state } = commit(state, world, "move -1 0"));
    return state;
  }

  const a = run();
  const b = run();
  assert.deepEqual(a, b, "two independent runs of the same command log must produce structurally identical state");
  assert.equal(h32(serializeState(a)), h32(serializeState(b)), "and byte-identical hashes");
});
