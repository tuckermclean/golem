/* Unit tests for shared/module.js's validate() — PR1 scope: the "move"
 * verb's wall/bounds denial, plain movement, direct diamond collection,
 * the static memory-hole LOSE check, and the diamond-count WIN check.
 * Push-chain mechanics themselves are covered by push.test.js's own
 * hand-built scenarios; these tests use tiny hand-built worlds (tests/
 * helpers/build-world.mjs) rather than the compiled content pack, so
 * each scenario is precise and doesn't depend on any particular level's
 * layout. */
import test from "node:test";
import assert from "node:assert/strict";
import { validate } from "../shared/module.js";
import { reduce } from "../shared/reducer.js";
import { makeWorld, makePlayer, makeEntity, loadedState } from "./helpers/build-world.mjs";

function commit(state, world, events) {
  let seq = state.seq;
  for (const ev of events) state = reduce(state, world, { ...ev, seq: ++seq });
  return state;
}

test("move onto empty floor: plain MOVED, no denial", () => {
  // A decoy, unrelated diamond keeps diamondsRemaining > 0 throughout,
  // so this plain move doesn't also (correctly) trigger a derived WIN —
  // that combination is covered by its own tests below.
  const decoy = makeEntity("entity:diamond@3,1", "diamond", 3, 1, { collectible: true });
  const world = makeWorld(3, 5, {
    walls: [[0,0],[1,0],[2,0],[3,0],[4,0], [0,1],[4,1], [0,2],[1,2],[2,2],[3,2],[4,2]],
    entities: [makePlayer(1, 1), decoy],
  });
  const state = loadedState(world);
  const result = validate({ state, world }, "move 1 0");
  assert.deepEqual(result, [{ t: "MOVED", id: "entity:player", x: 2, y: 1 }]);
});

test("move into a wall is denied", () => {
  const world = makeWorld(3, 5, {
    walls: [[0,0],[1,0],[2,0],[3,0],[4,0], [0,1],[4,1], [0,2],[1,2],[2,2],[3,2],[4,2]],
    entities: [makePlayer(1, 1)],
  });
  const state = loadedState(world);
  const result = validate({ state, world }, "move 0 -1");
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.equal(result.deny, "Stone does not negotiate.");
});

test("move out of bounds is denied", () => {
  const world = makeWorld(3, 3, { entities: [makePlayer(0, 0)] });
  const state = loadedState(world);
  const result = validate({ state, world }, "move -1 0");
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.equal(result.deny, "Stone does not negotiate.");
});

test("walking directly onto a diamond always collects it (never pushes)", () => {
  const diamond = makeEntity("entity:diamond@2,1", "diamond", 2, 1, { collectible: true });
  // A second, uncollected decoy diamond keeps diamondsRemaining > 0 after
  // this pickup, isolating "does it collect" from "does it also WIN"
  // (covered separately below).
  const decoy = makeEntity("entity:diamond@3,2", "diamond", 3, 2, { collectible: true });
  const world = makeWorld(4, 4, { entities: [makePlayer(1, 1), diamond, decoy] });
  const state = loadedState(world);
  assert.equal(state.diamondsRemaining, 2);

  const result = validate({ state, world }, "move 1 0");
  assert.deepEqual(result, [
    { t: "MOVED", id: "entity:player", x: 2, y: 1 },
    { t: "COLLECTED", id: "entity:diamond@2,1" },
  ]);
});

test("collecting the last diamond appends a derived WIN event", () => {
  const diamond = makeEntity("entity:diamond@2,1", "diamond", 2, 1, { collectible: true });
  const world = makeWorld(3, 4, { entities: [makePlayer(1, 1), diamond] });
  const state = loadedState(world);

  const result = validate({ state, world }, "move 1 0");
  assert.deepEqual(result, [
    { t: "MOVED", id: "entity:player", x: 2, y: 1 },
    { t: "COLLECTED", id: "entity:diamond@2,1" },
    { t: "WIN" },
  ]);

  const finalState = commit(state, world, result);
  assert.equal(finalState.over, true);
  assert.equal(finalState.outcome, "WIN");
  assert.equal(finalState.diamondsRemaining, 0);
});

test("collecting a diamond when others remain does NOT append WIN", () => {
  const d1 = makeEntity("entity:diamond@2,1", "diamond", 2, 1, { collectible: true });
  const d2 = makeEntity("entity:diamond@3,1", "diamond", 3, 1, { collectible: true });
  const world = makeWorld(3, 5, { entities: [makePlayer(1, 1), d1, d2] });
  const state = loadedState(world);

  const result = validate({ state, world }, "move 1 0");
  assert.equal(result.some((e) => e.t === "WIN"), false);
  assert.equal(result.some((e) => e.t === "COLLECTED"), true);
});

test("the player's own move onto a memory hole: MOVED then a static LOSE (no simulation needed)", () => {
  const world = makeWorld(3, 4, {
    memoryHoles: [[2, 1]],
    entities: [makePlayer(1, 1)],
  });
  const state = loadedState(world);

  const result = validate({ state, world }, "move 1 0");
  assert.deepEqual(result, [
    { t: "MOVED", id: "entity:player", x: 2, y: 1 },
    { t: "LOSE" },
  ]);

  const finalState = commit(state, world, result);
  assert.equal(finalState.over, true);
  assert.equal(finalState.outcome, "LOSE");
});

test("diagonal (non-cardinal) deltas are silently ignored, not denied", () => {
  const world = makeWorld(3, 4, { entities: [makePlayer(1, 1)] });
  const state = loadedState(world);
  assert.deepEqual(validate({ state, world }, "move 1 1"), []);
  assert.deepEqual(validate({ state, world }, "move 0 0"), []);
});

test("an unknown verb is denied", () => {
  const world = makeWorld(3, 4, { entities: [makePlayer(1, 1)] });
  const state = loadedState(world);
  const result = validate({ state, world }, "dance");
  assert.ok(!Array.isArray(result));
  assert.match(result.deny, /does not know the verb "dance"/);
});

test("once the puzzle is over, every command is denied", () => {
  const world = makeWorld(3, 4, { entities: [makePlayer(1, 1)] });
  let state = loadedState(world);
  state = { ...state, over: true, outcome: "WIN" };
  const result = validate({ state, world }, "move 1 0");
  assert.ok(!Array.isArray(result));
  assert.match(result.deny, /over/i);
});
