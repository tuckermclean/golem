/* Unit tests for shared/module.js — DELTA S2b PR2 scope: the "move"
 * verb's grid-cardinal movement + wall/bounds Denial, the "tick" verb
 * delegating to shared/tick.js's resolveTick(), an unknown verb, and
 * deriveWorldFromPack's wall/spawn/stairs derivation (including its
 * dual spawn convention: an explicit "spawn"-named token, or — absent
 * one, as in the real committed map:guild_hall — the first floor cell).
 * Hand-built worlds (tests/helpers/build-state.mjs) for the validate()
 * scenarios; the real @golem-engine/content compile() + the synthetic
 * floor fixture for deriveWorldFromPack itself. */
import test from "node:test";
import assert from "node:assert/strict";
import { validate, deriveWorldFromPack } from "../shared/module.js";
import { reduce } from "../shared/reducer.js";
import { makeWorld, floorEnteredState } from "./helpers/build-state.mjs";
import { compileSyntheticFloorPack, SYNTHETIC_MAP_ID } from "./fixtures/synthetic-floor.mjs";
import { GUILD_HALL_MAP } from "../content/guild-hall-map.mjs";
import { ENTITY_DEFS } from "../content/entities.mjs";
import { compile } from "@golem-engine/content";

function commit(state, world, events) {
  let seq = state.seq;
  for (const ev of events) state = reduce(state, world, { ...ev, seq: ++seq });
  return state;
}

// ── validate("move dx dy") ─────────────────────────────────────────────

test("move onto empty floor: plain MOVED, no denial", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  const state = floorEnteredState(world);
  const result = validate({ state, world }, "move 1 0");
  assert.deepEqual(result, [{ t: "MOVED", x: 2, y: 1 }]);
});

test("move into a wall is denied", () => {
  const world = makeWorld({ rows: 3, cols: 3, walls: [[2, 1]], spawn: { x: 1, y: 1 } });
  const state = floorEnteredState(world);
  const result = validate({ state, world }, "move 1 0");
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.equal(result.deny, "Something solid stops you.");
});

test("move out of bounds is denied", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 } });
  const state = floorEnteredState(world);
  const result = validate({ state, world }, "move -1 0");
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.equal(result.deny, "Something solid stops you.");
});

test("diagonal (non-cardinal) deltas are silently ignored, not denied", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  const state = floorEnteredState(world);
  assert.deepEqual(validate({ state, world }, "move 1 1"), []);
  assert.deepEqual(validate({ state, world }, "move 0 0"), []);
});

test("committing a MOVED result actually moves the character", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  let state = floorEnteredState(world);
  const result = validate({ state, world }, "move 0 1");
  state = commit(state, world, result);
  assert.deepEqual(state.character.pos, { x: 1, y: 2 });
});

test("an unknown verb is denied", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  const state = floorEnteredState(world);
  const result = validate({ state, world }, "dance");
  assert.ok(!Array.isArray(result));
  assert.match(result.deny, /does not know the verb "dance"/);
});

// ── validate("tick") ────────────────────────────────────────────────────

test("tick delegates to resolveTick — advances the counter", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 0, y: 0 } });
  const state = floorEnteredState(world);
  const result = validate({ state, world }, "tick");
  assert.deepEqual(result, [{ t: "TICK_ADVANCED", tick: 1 }]);
});

// ── deriveWorldFromPack ─────────────────────────────────────────────────

test("deriveWorldFromPack: the synthetic tomb floor's walls/spawn/stairs", () => {
  const compiled = compileSyntheticFloorPack();
  assert.ok(compiled.ok, `expected the synthetic floor to compile: ${JSON.stringify(compiled.ok ? null : compiled.errors)}`);

  const world = deriveWorldFromPack(compiled.pack, { zone: "tomb", floorNum: 1, mapId: SYNTHETIC_MAP_ID });
  assert.equal(world.rows, 7);
  assert.equal(world.cols, 7);
  assert.deepEqual(world.spawn, { x: 1, y: 1 });
  assert.deepEqual(world.stairsAt, { x: 5, y: 5 });
  assert.ok(world.walls.has("0,0"), "the border is walled");
  assert.ok(world.walls.has("2,2"), "the interior pillar is walled");
  assert.ok(!world.walls.has("1,1"), "spawn itself is not a wall");
});

test("deriveWorldFromPack: no such map throws", () => {
  const compiled = compileSyntheticFloorPack();
  assert.throws(() => deriveWorldFromPack(compiled.pack, { zone: "tomb", floorNum: 1, mapId: "map:nope" }), /no such map/);
});

test("deriveWorldFromPack: the real committed map:guild_hall (no explicit spawn token) defaults to the first floor cell", () => {
  // Compiled independently through the real @golem-engine/content
  // compile(), fed S1's own unmodified ENTITY_DEFS/GUILD_HALL_MAP — never
  // reads/mutates the committed content/pack.json itself.
  const compiled = compile({
    name: "some-hero-guild-hall-derive-check",
    version: 1,
    entities: ENTITY_DEFS,
    tables: [],
    maps: [GUILD_HALL_MAP],
  });
  assert.ok(compiled.ok, `expected map:guild_hall to compile: ${JSON.stringify(compiled.ok ? null : compiled.errors)}`);

  const world = deriveWorldFromPack(compiled.pack, { zone: "ow", floorNum: 0, mapId: "map:guild_hall" });
  // GUILD_HALL_MAP.cells[1] === "#.....#" — the first floor cell in
  // row-major scan order is (1,1).
  assert.deepEqual(world.spawn, { x: 1, y: 1 });
  assert.deepEqual(world.stairsAt, { x: 3, y: 4 }); // '>' at row 4, col 3
  assert.ok(world.walls.has("0,0"));
  // The Door Golem ('G' at row 2, col 3) is geometry-neutral for PR2 —
  // not a wall (no gate logic here yet; see shared/module.js's header).
  assert.ok(!world.walls.has("3,2"));
});
