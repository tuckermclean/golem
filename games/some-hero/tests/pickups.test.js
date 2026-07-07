/* ── Unit tests for PR4's pickups (docs/superpowers/specs/
   2026-07-07-s2c-pr4-combat-design.md's "Pickups / inventory"):
   tile-entry collection via shared/module.js's "move" case (sim-and-
   inspect over `world.pickupAt`), and the COLLECTED reducer case's
   character.gold/potions/inv deltas. Hand-built worlds (tests/helpers/
   build-state.mjs's `makeWorld({pickups})`) — no content-pack pickup
   tokens exist yet (design spec/deriveWorldFromPack's own header: test-
   world-only, injected directly, never derived from a map token). */
import test from "node:test";
import assert from "node:assert/strict";
import { validate } from "../shared/module.js";
import { reduce } from "../shared/reducer.js";
import { makeWorld, floorEnteredState } from "./helpers/build-state.mjs";

function commit(state, world, events) {
  let seq = state.seq;
  for (const ev of events) state = reduce(state, world, { ...ev, seq: ++seq });
  return state;
}

test("moving onto a gold tile appends COLLECTED and credits character.gold", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 }, pickups: [[1, 0, "gold", 5]] });
  const state = floorEnteredState(world);

  const result = validate({ state, world }, "move 1 0");
  assert.deepEqual(result, [{ t: "MOVED", x: 1, y: 0 }, { t: "COLLECTED", kind: "gold", amount: 5 }]);

  const next = commit(state, world, result);
  assert.equal(next.character.gold, 5);
  assert.equal(next.character.potions, 0);
  assert.equal(next.character.inv, 0);
});

test("moving onto a potion tile credits character.potions", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 }, pickups: [[1, 0, "potion", 1]] });
  const state = floorEnteredState(world);

  const result = validate({ state, world }, "move 1 0");
  assert.deepEqual(result, [{ t: "MOVED", x: 1, y: 0 }, { t: "COLLECTED", kind: "potion", amount: 1 }]);

  const next = commit(state, world, result);
  assert.equal(next.character.potions, 1);
  assert.equal(next.character.gold, 0);
});

test("a pickup of any other kind lands on the generic inventory count (inv)", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 }, pickups: [[1, 0, "trinket", 1]] });
  const state = floorEnteredState(world);

  const result = validate({ state, world }, "move 1 0");
  const next = commit(state, world, result);
  assert.equal(next.character.inv, 1);
});

test("gold/potions accumulate across multiple pickups", () => {
  const world = makeWorld({
    rows: 3,
    cols: 3,
    spawn: { x: 0, y: 0 },
    pickups: [
      [1, 0, "gold", 5],
      [2, 0, "gold", 3],
    ],
  });
  let state = floorEnteredState(world);
  state = commit(state, world, validate({ state, world }, "move 1 0"));
  assert.equal(state.character.gold, 5);
  state = commit(state, world, validate({ state, world }, "move 1 0"));
  assert.equal(state.character.gold, 8);
});

test("moving onto a plain floor tile with no pickup: only MOVED, no COLLECTED", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 }, pickups: [[2, 0, "gold", 5]] });
  const state = floorEnteredState(world);
  const result = validate({ state, world }, "move 1 0");
  assert.deepEqual(result, [{ t: "MOVED", x: 1, y: 0 }]);
});

test("a hand-built world with no `pickups` at all behaves exactly as before PR4 (no crash, no COLLECTED)", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 } });
  const state = floorEnteredState(world);
  const result = validate({ state, world }, "move 1 0");
  assert.deepEqual(result, [{ t: "MOVED", x: 1, y: 0 }]);
});
