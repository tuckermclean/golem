/* Unit tests for shared/reducer.js — DELTA S2b PR2's five-tier State +
 * pure reduce() (design spec: "The five-tier State (locked mapping)").
 * Covers createState()'s shape, FLOOR_ENTERED's world/spawn bootstrap,
 * MOVED's character.pos update, TICK_ADVANCED's tick counter, an unknown
 * event's seq-only bump, the copy-on-write/identity-blind discipline
 * (untouched tiers are structurally shared, not cloned; the input state
 * is never mutated), and serializeState()'s stability. */
import test from "node:test";
import assert from "node:assert/strict";
import { createState, reduce, serializeState } from "../shared/reducer.js";
import { createMeta } from "../rules/meta.js";
import { newRunStats } from "../rules/ledger.js";
import { makeWorld, floorEnteredState } from "./helpers/build-state.mjs";

test("createState() returns the five-tier State with rules/-sourced defaults", () => {
  const state = createState();
  assert.deepEqual(state.world, { zone: null, floorNum: 0, mapId: null });
  // run.puzzle (PR3: docs/superpowers/specs/2026-07-07-s2b-pr3-ceremony-
  // machine-design.md's minimal {type,solved,attempts} slot) starts null
  // — no puzzle exists outside the tomb. run.enemies (PR4: docs/
  // superpowers/specs/2026-07-07-s2c-pr4-combat-design.md's run-scoped
  // entity tier) starts empty — seeded only by ENTERED_TOMB. run.boss
  // (the warden-seal boss resolution's own run.boss slot) starts null —
  // seeded only by ENTERED_TOMB/DESCENDED on a warden floor.
  assert.deepEqual(state.run, { runStats: newRunStats(), puzzle: null, enemies: [], boss: null });
  assert.deepEqual(state.character, {
    hp: 10,
    maxhp: 10,
    potions: 0,
    inv: 0,
    atkT: 0,
    gold: 0,
    swordLv: 0,
    pos: { x: 0, y: 0 },
  });
  // knowledge is rules/meta.js's own createMeta() 1:1 — same source of
  // truth, not a re-literalized copy (design spec's locked mapping).
  assert.deepEqual(state.knowledge, createMeta());
  assert.deepEqual(state.profile, {});
  // pending (PR3: the unified two-step slot) starts null.
  assert.equal(state.pending, null);
  assert.equal(state.tick, 0);
  assert.equal(state.seq, 0);
});

test("FLOOR_ENTERED sets state.world + character.pos from the derived World's spawn, nothing else", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 2 }, zone: "tomb", floorNum: 1, mapId: "map:x" });
  const state = createState();
  const next = reduce(state, world, { t: "FLOOR_ENTERED", zone: "tomb", floorNum: 1, mapId: "map:x", seq: 1 });

  assert.deepEqual(next.world, { zone: "tomb", floorNum: 1, mapId: "map:x" });
  assert.deepEqual(next.character.pos, { x: 1, y: 2 });
  assert.equal(next.seq, 1);
  // run/knowledge/profile are untouched by this event — structurally
  // shared (same reference), not merely deep-equal, per the
  // "identity-blind" copy-on-write discipline.
  assert.equal(next.run, state.run);
  assert.equal(next.knowledge, state.knowledge);
  assert.equal(next.profile, state.profile);
});

test("MOVED updates only character.pos; every other tier is the same reference", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 1, y: 1 } });
  const state = floorEnteredState(world);

  const next = reduce(state, world, { t: "MOVED", x: 2, y: 1, seq: 2 });

  assert.deepEqual(next.character.pos, { x: 2, y: 1 });
  assert.equal(next.seq, 2);
  assert.equal(next.world, state.world);
  assert.equal(next.run, state.run);
  assert.equal(next.knowledge, state.knowledge);
  assert.equal(next.profile, state.profile);
  // The character tier itself is a NEW object (pos changed) but every
  // OTHER field on it is preserved, and the original state's character
  // is untouched (no mutation of the input).
  assert.equal(next.character.hp, state.character.hp);
  assert.deepEqual(state.character.pos, { x: 1, y: 1 }, "input state must not be mutated");
});

test("TICK_ADVANCED advances the tick counter and nothing else", () => {
  const world = makeWorld({ rows: 3, cols: 3 });
  const state = floorEnteredState(world);

  const next = reduce(state, world, { t: "TICK_ADVANCED", tick: 1, seq: 2 });
  assert.equal(next.tick, 1);
  assert.equal(next.seq, 2);
  assert.equal(next.character, state.character);
  assert.equal(next.world, state.world);
});

test("an unknown event kind bumps seq only, mutating nothing", () => {
  const world = makeWorld({ rows: 3, cols: 3 });
  const state = floorEnteredState(world);

  const next = reduce(state, world, { t: "SOME_FUTURE_EVENT", seq: 9 });
  assert.equal(next.seq, 9);
  assert.equal(next.character, state.character);
  assert.equal(next.world, state.world);
  assert.equal(next.run, state.run);
  assert.equal(next.knowledge, state.knowledge);
  assert.equal(next.profile, state.profile);
});

test("reduce() never mutates the state or world objects it is handed", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 } });
  Object.freeze(world);
  Object.freeze(world.walls);
  const state = floorEnteredState(world);
  Object.freeze(state);
  Object.freeze(state.character);
  Object.freeze(state.character.pos);

  assert.doesNotThrow(() => reduce(state, world, { t: "MOVED", x: 1, y: 0, seq: 3 }));
});

test("serializeState() is a pure function of state's contents (not object identity)", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 } });
  const a = floorEnteredState(world);
  const b = reduce(createState(), world, { t: "FLOOR_ENTERED", zone: world.zone, floorNum: world.floorNum, mapId: world.mapId, seq: 1 });

  assert.notEqual(a, b, "sanity: two independently-built states are different object references");
  assert.equal(serializeState(a), serializeState(b));
});
