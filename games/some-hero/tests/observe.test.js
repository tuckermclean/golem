/* ── Unit tests for shared/module.js's `observe()` — DELTA S4 PR1 (see
 * docs/superpowers/specs/2026-07-07-s4-pr1-observe-adapter-design.md's
 * "observe() — the first real GameModule.observe"). some-hero has no
 * fog of war, so `observe` is an honest full-visibility projection: this
 * pins the exact shape it returns, that it never mutates its inputs,
 * and that `viewer` is genuinely unused (same result for any viewer). */
import test from "node:test";
import assert from "node:assert/strict";
import { observe, validate } from "../shared/module.js";
import { reduce } from "../shared/reducer.js";
import { makeWorld, floorEnteredState } from "./helpers/build-state.mjs";

function commit(state, world, events) {
  let seq = state.seq;
  for (const ev of events) state = reduce(state, world, { ...ev, seq: ++seq });
  return state;
}

test("observe: returns the full-visibility projection shape", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  const state = floorEnteredState(world);

  const obs = observe(state, world, "anyone");

  assert.deepEqual(Object.keys(obs).sort(), ["character", "floorNum", "knowledge", "run", "world", "zone"].sort());
  assert.equal(obs.zone, state.world.zone);
  assert.equal(obs.floorNum, state.world.floorNum);
  assert.equal(obs.character, state.character); // same reference — no defensive copy needed (pure, no mutation)
  assert.equal(obs.run, state.run);
  assert.equal(obs.knowledge, state.knowledge);
  assert.equal(obs.world, world);
});

test("observe: is pure — does not mutate state or world", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  const state = floorEnteredState(world);
  const stateBefore = JSON.parse(JSON.stringify(state));
  const worldBefore = { ...world, walls: new Set(world.walls) };

  observe(state, world, "someone");

  assert.deepEqual(JSON.parse(JSON.stringify(state)), stateBefore);
  assert.deepEqual(world.walls, worldBefore.walls);
  assert.equal(world.rows, worldBefore.rows);
  assert.equal(world.cols, worldBefore.cols);
});

test("observe: viewer is unused — identical result for any viewer", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  let state = floorEnteredState(world);
  state = commit(state, world, validate({ state, world }, "move 1 0"));

  const a = observe(state, world, "player-a");
  const b = observe(state, world, "player-b");
  const c = observe(state, world, undefined);

  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
});

test("observe: reflects post-commit state (character position, run tier)", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  let state = floorEnteredState(world);
  state = commit(state, world, validate({ state, world }, "move 0 1"));

  const obs = observe(state, world, "viewer");
  assert.deepEqual(obs.character.pos, { x: 1, y: 2 });
  assert.equal(obs.run, state.run);
});
