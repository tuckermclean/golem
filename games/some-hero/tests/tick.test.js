/* Unit tests for shared/tick.js's resolveTick() — DELTA S2b PR2. The
 * synthetic tomb-floor-1 fixture has no autonomous movers (S3/S2c
 * territory), so PR2's tick bridge is deliberately minimal: it must
 * still be "a valid deterministic no-op-or-advance event" (design spec)
 * proving the bridge exists and is wired, ready for PR3/S2c to extend
 * once there is something on a floor to move. */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveTick } from "../shared/tick.js";
import { reduce } from "../shared/reducer.js";
import { makeWorld, floorEnteredState } from "./helpers/build-state.mjs";

test("a tick always advances the counter and emits nothing else", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 } });
  const state = floorEnteredState(world);
  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [{ t: "TICK_ADVANCED", tick: 1 }]);
});

test("successive ticks keep advancing the counter", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 } });
  let state = floorEnteredState(world);

  for (let i = 1; i <= 3; i++) {
    const events = resolveTick(state, world, "seed");
    assert.deepEqual(events, [{ t: "TICK_ADVANCED", tick: i }]);
    state = reduce(state, world, { ...events[0], seq: state.seq + 1 });
  }
  assert.equal(state.tick, 3);
});

test("resolveTick(state, world, seed) is deterministic regardless of seed", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 } });
  const state = floorEnteredState(world);

  const a = resolveTick(state, world, "seed-x");
  const b = resolveTick(state, world, "seed-x");
  const c = resolveTick(state, world, "an entirely different seed value");

  assert.deepEqual(a, b);
  assert.deepEqual(a, c, "no shipped mover draws from `seed` yet, so even a different seed must not change the result");
});

test("a tick is never a Denial", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 } });
  const state = floorEnteredState(world);
  const events = resolveTick(state, world, "seed");
  assert.ok(Array.isArray(events), "resolveTick must always return an Event[]");
});
