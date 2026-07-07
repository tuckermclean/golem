/* ── Torch-seal resolution (docs/superpowers/specs/2026-07-07-torch-seal-
   resolution-design.md): a swing (`attack`, even bare/no enemy) lights any
   un-lit brazier within Manhattan distance <= 1 of the player, faithful to
   legacy attack.js's igniteBraziers firing on every tomb attack regardless
   of whether an enemy was struck. A lit brazier burns its `tm` down by 1
   per `tick` (shared/tick.js's resolveTick, appended at the tail); once
   `tm <= 0` it goes dark again. `run.puzzle.solved` flips true only when
   EVERY brazier is lit AT ONCE — this is the seal's own time pressure
   (light them all within `time` ticks of the first, or the early ones burn
   out before the last is struck). The generalized descend condition
   (shared/module.js's "move" case, `stairsOpen`'s `!!puzzle.solved` default
   branch) opens the stairs once solved — no change to that if-chain was
   needed (torch is neither "warden" nor "final").

   Honest scope (mirrors tests/plates-seal.test.js's own header): seed "13"
   floor 1 draws a "torch" seal (n:3, time:13.4) with three braziers, each
   walkable-adjacent to a distinct approach tile and mutually non-adjacent
   (so a single swing from any one approach lights exactly one brazier) —
   found by the same kind of offline scan over generateFloor("<seed>", 1)
   this repo's other seal-resolution test files describe:
     - torches (29,14) / (14,21) / (21,24)
     - approaches (30,14) / (15,21) / (22,24)
     - stairsAt (12,28), stairs-approach (13,28)
   This exercises a REAL generated floor's geometry/puzzle, not a
   hand-waved stub.

   Positioning discipline: like trapsFloorState/platesFloorState,
   `torchFloorState` below places `character.pos` wherever a test needs it
   directly (one step from a brazier, or one step from stairsAt) rather
   than BFS-walking the full floor — the light/burn-down/descend MECHANICS
   under test are each a single-step or single-tick check,
   position-independent of how the character got there. Every command that
   matters (the actual swing, the tick, or the step onto stairsAt) is still
   driven through the real "attack"/"tick"/"move dx dy" verbs -> validate()
   -> reduce(), never poked directly.

   `run.enemies` is deliberately forced to `[]` in `torchFloorState` — the
   seal mechanic is isolated from combat (which has its own tests in
   tests/combat.test.js) so a bare "tick" command yields only
   `TICK_ADVANCED` (+ `TORCHES_BURNED` when something is lit), never enemy
   moves/contact damage. */
import test from "node:test";
import assert from "node:assert/strict";
import { h32 } from "@golem-engine/random";
import { validate, deriveWorld } from "../shared/module.js";
import { createState, reduce, serializeState } from "../shared/reducer.js";
import { pack } from "../rules/pack.js";

// generateFloor("13", 1).puzzle.type === "torch" (found via the same kind
// of offline scan tests/plates-seal.test.js's header describes). n:3,
// time:13.4, torches (29,14)/(14,21)/(21,24), stairsAt (12,28).
const TORCH_SEED = "13";
// generateFloor("1", 1).puzzle.type === "key" — same non-torch regression
// seed the other seal-resolution test files already use.
const NON_TORCH_SEED = "1";

function deriveTombWorld(seed, floorNum) {
  const mapId = `tomb:${seed}:0:${floorNum}`;
  return deriveWorld(pack, { zone: "tomb", floorNum, mapId }, seed);
}

/** validate() -> assert legal -> fold every returned event through
 *  reduce() — same commit() idiom as tests/plates-seal.test.js /
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

/** A state freshly standing on a real generated tomb floor's torch seal,
 *  puzzle carried over from the derived World exactly like ENTERED_TOMB's
 *  own seeded branch populates `run.puzzle` — deep-copies the `torches`
 *  array (fresh objects; guarded, since the key-seal regression test's
 *  puzzle has no `torches` field) so each test starts from an independent
 *  puzzle, never sharing references with `world.puzzle` or another test.
 *  `run.enemies` is forced to `[]` — see this file's header. */
function torchFloorState(world, pos) {
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
        ...(world.puzzle.torches ? { torches: world.puzzle.torches.map((to) => ({ ...to })) } : {}),
      },
      enemies: [],
    },
    character: { ...state.character, pos: { ...pos } },
  };
  return state;
}

const APPROACH = [
  { pos: { x: 30, y: 14 }, torch: { x: 29, y: 14 } },
  { pos: { x: 15, y: 21 }, torch: { x: 14, y: 21 } },
  { pos: { x: 22, y: 24 }, torch: { x: 21, y: 24 } },
];
const STAIRS_APPROACH = { x: 13, y: 28 };
// Far from every brazier and not adjacent to any of them (dist >= 13) — a
// walkable non-torch tile (the derived World's own spawn) for the
// no-brazier/no-enemy deny test.
const NOWHERE_NEAR_A_TORCH = { x: 18, y: 12 };

function torchesByPos(state) {
  return Object.fromEntries(state.run.puzzle.torches.map((to) => [`${to.x},${to.y}`, to]));
}

// ── lighting each brazier: bare "attack" -> [TORCH_LIT], solved on the third ──

test("lighting each brazier fires TORCH_LIT: lit+tm set on the struck brazier only, solved flips true on the third", () => {
  const world = deriveTombWorld(TORCH_SEED, 1);
  assert.equal(world.puzzle.type, "torch", "sanity: seed 13 floor 1 must be a torch seal");
  assert.equal(world.puzzle.n, 3, "sanity: this floor's brazier count");
  assert.equal(world.puzzle.time, 13.4, "sanity: this floor's burn-down fuel");

  let state = torchFloorState(world, APPROACH[0].pos);
  let result;

  ({ state, result } = commit(state, world, "attack"));
  assert.deepEqual(result.map((e) => e.t), ["TORCH_LIT"]);
  let byPos = torchesByPos(state);
  assert.equal(byPos["29,14"].lit, true);
  assert.equal(byPos["29,14"].tm, 13.4);
  assert.equal(byPos["14,21"].lit, false, "un-struck braziers stay un-lit");
  assert.equal(byPos["21,24"].lit, false, "un-struck braziers stay un-lit");
  assert.equal(state.run.puzzle.solved, false);

  // Reposition to brazier 1's approach (bypassing the BFS walk — see header).
  state = { ...state, character: { ...state.character, pos: { ...APPROACH[1].pos } } };
  ({ state, result } = commit(state, world, "attack"));
  assert.deepEqual(result.map((e) => e.t), ["TORCH_LIT"]);
  byPos = torchesByPos(state);
  assert.equal(byPos["29,14"].lit, true, "brazier 0 stays lit");
  assert.equal(byPos["14,21"].lit, true);
  assert.equal(byPos["14,21"].tm, 13.4);
  assert.equal(byPos["21,24"].lit, false, "brazier 2 still un-lit");
  assert.equal(state.run.puzzle.solved, false);

  // Reposition to brazier 2's approach — the LAST brazier.
  state = { ...state, character: { ...state.character, pos: { ...APPROACH[2].pos } } };
  ({ state, result } = commit(state, world, "attack"));
  assert.deepEqual(result.map((e) => e.t), ["TORCH_LIT"]);
  byPos = torchesByPos(state);
  assert.equal(byPos["21,24"].lit, true);
  assert.equal(byPos["21,24"].tm, 13.4);
  assert.equal(state.run.puzzle.solved, true, "all three lit at once sets solved");
});

// ── solve + descend: all three lit -> stairs open ──────────────────────

test("all three braziers lit (solved) + moving onto stairsAt emits DESCENDED (not silent): floorNum+1, new mapId, runStats preserved, knowledge unchanged", () => {
  const world = deriveTombWorld(TORCH_SEED, 1);
  let state = torchFloorState(world, APPROACH[0].pos);

  for (const step of APPROACH) {
    state = { ...state, character: { ...state.character, pos: { ...step.pos } } };
    ({ state } = commit(state, world, "attack"));
  }
  assert.equal(state.run.puzzle.solved, true, "sanity: all three braziers must be lit before the descend step");

  // Arrange runStats so the "preserved across floors" proof is not vacuous.
  state = { ...state, run: { ...state.run, runStats: { ...state.run.runStats, kills: 7, goldGained: 20 } } };
  const knowledgeBefore = state.knowledge;

  state = { ...state, character: { ...state.character, pos: { ...STAIRS_APPROACH } } };
  const { state: next, result: descendResult } = commit(state, world, "move -1 0");
  assert.deepEqual(descendResult.map((e) => e.t), ["MOVED", "DESCENDED"], "a fully-lit torch door opens onto DESCENDED");

  const descended = descendResult[1];
  assert.equal(descended.floorNum, 2);
  assert.equal(descended.mapId, `tomb:${TORCH_SEED}:0:2`);
  assert.equal(next.world.floorNum, 2);
  assert.equal(next.world.mapId, `tomb:${TORCH_SEED}:0:2`);
  assert.deepEqual(next.character.pos, descended.spawn);

  assert.equal(next.run.runStats.kills, 7, "kills must be preserved across the floor transition");
  assert.equal(next.run.runStats.goldGained, 20, "goldGained must be preserved across the floor transition");
  assert.equal(next.run.runStats.depth, 2, "depth bumps to the new floor number");

  assert.deepEqual(next.knowledge, knowledgeBefore, "knowledge (runs/day/interest/...) must be entirely untouched by a floor-to-floor descend");
});

// ── burn-down: lit brazier loses 1 tm per tick, goes dark at tm<=0 ──────

test("burn-down: a lit brazier's tm decrements by 1 per tick, stays lit through 13 ticks, goes dark on the 14th", () => {
  const world = deriveTombWorld(TORCH_SEED, 1);
  let state = torchFloorState(world, APPROACH[0].pos);
  let result;

  ({ state, result } = commit(state, world, "attack"));
  assert.equal(torchesByPos(state)["29,14"].lit, true, "sanity: brazier 0 lit before ticking");

  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "TORCHES_BURNED"], "a tick with something lit emits TORCHES_BURNED");
  let byPos = torchesByPos(state);
  assert.equal(byPos["29,14"].tm, 12.4, "first tick: 13.4 - 1");
  assert.equal(byPos["29,14"].lit, true);

  for (let i = 2; i <= 13; i++) {
    ({ state, result } = commit(state, world, "tick"));
    assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "TORCHES_BURNED"]);
  }
  byPos = torchesByPos(state);
  assert.ok(byPos["29,14"].lit, "still lit after 13 ticks (tm ~= 0.4 > 0)");
  assert.ok(Math.abs(byPos["29,14"].tm - 0.4) < 1e-6);

  // 14th tick: tm would go to -0.6 -> clamp to {lit:false, tm:0}.
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "TORCHES_BURNED"]);
  byPos = torchesByPos(state);
  assert.equal(byPos["29,14"].lit, false, "the 14th tick burns the brazier out");
  assert.equal(byPos["29,14"].tm, 0);
  assert.equal(state.run.puzzle.solved, false);
});

test("a bare torch floor with nothing lit: tick emits only TICK_ADVANCED (no TORCHES_BURNED)", () => {
  const world = deriveTombWorld(TORCH_SEED, 1);
  const state = torchFloorState(world, NOWHERE_NEAR_A_TORCH);
  const { result } = commit(state, world, "tick");
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED"]);
});

// ── time-pressure failure: braziers lit at different times never overlap ──

test("time-pressure failure: lighting braziers 0 and 1 then letting them both burn out before lighting 2 never solves the seal", () => {
  const world = deriveTombWorld(TORCH_SEED, 1);
  let state = torchFloorState(world, APPROACH[0].pos);

  ({ state } = commit(state, world, "attack"));
  state = { ...state, character: { ...state.character, pos: { ...APPROACH[1].pos } } };
  ({ state } = commit(state, world, "attack"));
  let byPos = torchesByPos(state);
  assert.ok(byPos["29,14"].lit && byPos["14,21"].lit, "sanity: braziers 0 and 1 both lit");
  assert.equal(byPos["21,24"].lit, false, "sanity: brazier 2 never lit yet");

  for (let i = 1; i <= 14; i++) {
    ({ state } = commit(state, world, "tick"));
  }
  byPos = torchesByPos(state);
  assert.equal(byPos["29,14"].lit, false, "brazier 0 burned out");
  assert.equal(byPos["14,21"].lit, false, "brazier 1 burned out");

  state = { ...state, character: { ...state.character, pos: { ...APPROACH[2].pos } } };
  ({ state } = commit(state, world, "attack"));
  byPos = torchesByPos(state);
  assert.equal(byPos["29,14"].lit, false, "brazier 0 still dark");
  assert.equal(byPos["21,24"].lit, true, "brazier 2 now lit");
  assert.equal(state.run.puzzle.solved, false, "they were never all lit AT ONCE, so the seal never solves");
});

// ── re-light: a burned-out brazier can be struck again ──────────────────

test("re-light: swinging at a burned-out brazier again relights it (tm back to full, lit true)", () => {
  const world = deriveTombWorld(TORCH_SEED, 1);
  let state = torchFloorState(world, APPROACH[0].pos);

  ({ state } = commit(state, world, "attack"));
  for (let i = 1; i <= 14; i++) {
    ({ state } = commit(state, world, "tick"));
  }
  assert.equal(torchesByPos(state)["29,14"].lit, false, "sanity: brazier 0 burned out");

  const { state: relit, result } = commit(state, world, "attack");
  assert.deepEqual(result.map((e) => e.t), ["TORCH_LIT"]);
  const byPos = torchesByPos(relit);
  assert.equal(byPos["29,14"].lit, true);
  assert.equal(byPos["29,14"].tm, 13.4);
});

// ── no-brazier/no-enemy deny + non-torch scope boundary ─────────────────

test("a bare attack with no adjacent brazier and no enemy still denies: 'There is nothing here by that name to strike.'", () => {
  const world = deriveTombWorld(TORCH_SEED, 1);
  const state = torchFloorState(world, NOWHERE_NEAR_A_TORCH);
  const result = validate({ state, world }, "attack");
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.equal(result.deny, "There is nothing here by that name to strike.");
});

test("a non-torch seal floor (key): a bad 'attack <id>' still denies exactly as before — the torch path never engages", () => {
  const world = deriveTombWorld(NON_TORCH_SEED, 1);
  assert.equal(world.puzzle.type, "key", "sanity: seed 1 floor 1 must be a key seal");

  const state = torchFloorState(world, world.spawn);
  const result = validate({ state, world }, "attack ghost");
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.equal(result.deny, "There is nothing here by that name to strike.");
});

// ── determinism: replay the light-all-three-then-descend log twice ─────

test("determinism: replaying the light-all-three-then-descend command log twice reproduces an identical h32(serializeState(...))", () => {
  function run() {
    const world = deriveTombWorld(TORCH_SEED, 1);
    let state = torchFloorState(world, APPROACH[0].pos);
    for (const step of APPROACH) {
      state = { ...state, character: { ...state.character, pos: { ...step.pos } } };
      ({ state } = commit(state, world, "attack"));
    }
    state = { ...state, character: { ...state.character, pos: { ...STAIRS_APPROACH } } };
    ({ state } = commit(state, world, "move -1 0"));
    return state;
  }

  const a = run();
  const b = run();
  assert.deepEqual(a, b, "two independent runs of the same command log must produce structurally identical state");
  assert.equal(h32(serializeState(a)), h32(serializeState(b)), "and byte-identical hashes");
});

// ── adversarial-review find: a range-denied swing still lights braziers ──
//
// Legacy lights braziers on EVERY tomb swing, independent of whether the
// named target connects (attack.js:40). Before the fix, an "attack <far
// enemy/boss>" that denied "Too far to strike." discarded the already-
// computed torchLit, so an adjacent un-lit brazier stayed dark — while a
// BARE "attack" in the identical position lit it. These pin the fix at
// BOTH range-deny sites (the enemy path and the boss path).

test("attack a far ENEMY while adjacent to an un-lit brazier lights it (TORCH_LIT), not a Denial", () => {
  const world = deriveTombWorld(TORCH_SEED, 1);
  // Player at APPROACH[0].pos (30,14), brazier (29,14) adjacent + un-lit.
  let state = torchFloorState(world, APPROACH[0].pos);
  // A real but far-away enemy on the same floor (torch floors spawn a
  // normal enemy budget — the common case, not an edge case).
  state = { ...state, run: { ...state.run, enemies: [{ id: "e0", kind: "skeleton", pos: { x: 2, y: 2 }, hp: 4 }] } };

  const result = validate({ state, world }, "attack e0");
  assert.ok(Array.isArray(result), "the swing lights the brazier — not a Denial");
  assert.deepEqual(result.map((e) => e.t), ["TORCH_LIT"]);
  const to = result[0].puzzle.torches.find((t) => t.x === 29 && t.y === 14);
  assert.equal(to.lit, true, "the adjacent brazier is now lit");
});

test("attack a far BOSS while adjacent to an un-lit brazier lights it (TORCH_LIT), not a Denial", () => {
  const world = deriveTombWorld(TORCH_SEED, 1);
  let state = torchFloorState(world, APPROACH[0].pos);
  // A live warden far away (hand-set — a torch floor never naturally has a
  // boss, but the boss range-deny site must light braziers symmetrically).
  state = {
    ...state,
    run: { ...state.run, boss: { id: "boss", kind: "warden", name: "the Warden", pos: { x: 2, y: 2 }, hp: 40, dead: false } },
  };

  const result = validate({ state, world }, "attack boss");
  assert.ok(Array.isArray(result), "the swing lights the brazier — not a Denial");
  assert.deepEqual(result.map((e) => e.t), ["TORCH_LIT"]);
  const to = result[0].puzzle.torches.find((t) => t.x === 29 && t.y === 14);
  assert.equal(to.lit, true, "the adjacent brazier is now lit");
});
