/* ── Unit tests for src/render-adapter.js's `adapt()` — DELTA S4 PR1 (see
 * docs/superpowers/specs/2026-07-07-s4-pr1-observe-adapter-design.md's
 * "Tests (locally verifiable — no browser)"). Asserts the adapter's
 * field mappings DIRECTLY against a hand-built State/World fixture:
 * grid→pixel player position (pinning the S2-flagged canonicalization
 * inversion), walls→Uint8Array TL ids, enemies→pixel objects with the
 * correct per-kind col, and the documented empties for npcs/boss/parts. */
import test from "node:test";
import assert from "node:assert/strict";
import { observe } from "../shared/module.js";
import { reduce } from "../shared/reducer.js";
import { adapt } from "../src/render-adapter.js";
import { makeWorld, floorEnteredState } from "./helpers/build-state.mjs";

const T = 36; // legacy/src/constants.js:3 — mirrored here only to state pixel-math expectations, not imported

// legacy/src/constants.js:10-18
const TL = { TF: 10, TW: 11, SD: 12, SU: 13 };

function worldWithEnemy() {
  // 3x3, wall at (1,0), spawn (0,0), stairs-down at (2,2). Layout:
  //   . # .
  //   . . .
  //   . . >
  const world = makeWorld({ rows: 3, cols: 3, walls: [[1, 0]], spawn: { x: 0, y: 0 }, stairsAt: { x: 2, y: 2 } });
  let state = floorEnteredState(world);
  state = {
    ...state,
    run: { ...state.run, enemies: [{ id: "e0", kind: "skeleton", pos: { x: 1, y: 1 }, hp: 3 }] },
  };
  return { world, state };
}

test("adapt: grid position -> world-pixel player position (tile center)", () => {
  const { world, state } = worldWithEnemy();
  const game = adapt(observe(state, world, "v"));

  assert.deepEqual(game.player, {
    x: 0 * T + T / 2,
    y: 0 * T + T / 2,
    hp: state.character.hp,
    maxhp: state.character.maxhp,
    potions: state.character.potions,
    gold: state.character.gold,
    swordLv: state.character.swordLv,
    fx: 0,
    fy: 1,
    inv: 0,
    atkT: 0,
  });
});

test("adapt: walls/floor/stairs -> a Uint8Array of TL tile ids", () => {
  const { world, state } = worldWithEnemy();
  const game = adapt(observe(state, world, "v"));

  assert.ok(game.world.map instanceof Uint8Array);
  assert.equal(game.world.w, 3);
  assert.equal(game.world.h, 3);
  // (1,0) is a wall
  assert.equal(game.world.map[0 * 3 + 1], TL.TW);
  // (0,0) is plain floor (spawn is not itself a special tile)
  assert.equal(game.world.map[0 * 3 + 0], TL.TF);
  // (1,1) is plain floor (the enemy's cell is walkable geometry)
  assert.equal(game.world.map[1 * 3 + 1], TL.TF);
  // (2,2) is stairs down
  assert.equal(game.world.map[2 * 3 + 2], TL.SD);
});

test("adapt: run.enemies -> pixel-space objects with correct per-kind col", () => {
  const { world, state } = worldWithEnemy();
  const game = adapt(observe(state, world, "v"));

  assert.equal(game.enemies.length, 1);
  const e = game.enemies[0];
  assert.equal(e.id, "e0");
  assert.equal(e.kind, "skeleton");
  assert.equal(e.x, 1 * T + T / 2);
  assert.equal(e.y, 1 * T + T / 2);
  assert.equal(e.hp, 3);
  assert.equal(e.col, "#e8e2d0"); // legacy/src/entities/enemy.js:14 — skeleton's live col
  assert.equal(e.r, 11);
});

test("adapt: unported fields emit stable, documented empties", () => {
  const { world, state } = worldWithEnemy();
  const game = adapt(observe(state, world, "v"));

  assert.deepEqual(game.npcs, []);
  assert.equal(game.boss, null);
  assert.deepEqual(game.parts, []);
  assert.deepEqual(game.blocks, []);
  assert.deepEqual(game.torches, []);
  assert.deepEqual(game.traps, []);
  assert.deepEqual(game.plates, []);
});

test("adapt: sane cam/skin/zone/puzzle defaults", () => {
  const { world, state } = worldWithEnemy();
  const game = adapt(observe(state, world, "v"));

  assert.deepEqual(game.cam, { x: 0, y: 0 });
  assert.equal(typeof game.skin, "string");
  assert.equal(game.zone, world.zone);
  assert.equal(game.puzzle, state.run.puzzle);
});

test("adapt: no upstairs/downstairs tile placed when world carries none", () => {
  const world = makeWorld({ rows: 2, cols: 2, spawn: { x: 0, y: 0 } });
  const state = floorEnteredState(world);
  const game = adapt(observe(state, world, "v"));

  assert.ok([...game.world.map].every((v) => v === TL.TF));
});
