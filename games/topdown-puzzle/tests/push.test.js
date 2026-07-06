/* Unit tests for shared/push.js's getPushChain()/resolveMove() — push-
 * chain math ported from KyeScene.js's getPushChain/pushBlocks (see
 * docs/superpowers/specs/2026-07-06-c4-topdown-port-design.md). Covers:
 * length-1, length-2, illegal length>2 denial, blocked-end denial,
 * push-into-diamond (the diamond is shoved along, not collected — only
 * a DIRECT step onto a diamond collects, per module.test.js), and
 * push-into-memory-hole (destroys the farthest chain member; a
 * destroyed diamond still decrements diamondsRemaining). Hand-built
 * worlds (tests/helpers/build-world.mjs), not the compiled content
 * pack, so each scenario is exact. */
import test from "node:test";
import assert from "node:assert/strict";
import { getPushChain, resolveMove, MAX_PUSH_CHAIN } from "../shared/push.js";
import { reduce } from "../shared/reducer.js";
import { makeWorld, makePlayer, makeEntity, loadedState } from "./helpers/build-world.mjs";

test("MAX_PUSH_CHAIN is the named length-2 cap", () => {
  assert.equal(MAX_PUSH_CHAIN, 2);
});

test("getPushChain: a single block ahead of open ground", () => {
  const block = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const world = makeWorld(3, 5, { entities: [makePlayer(1, 1), block] });
  const state = loadedState(world);

  const { chain, landing, blocked, tooLong } = getPushChain(state, world, 2, 1, 1, 0);
  assert.equal(chain.length, 1);
  assert.equal(chain[0].id, "entity:block@2,1");
  assert.deepEqual(landing, { x: 3, y: 1 });
  assert.equal(blocked, false);
  assert.equal(tooLong, false);
});

test("getPushChain: two chain members (block, diamond) — length-2, still legal", () => {
  const block = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const diamond = makeEntity("entity:diamond@3,1", "diamond", 3, 1, { collectible: true });
  const world = makeWorld(3, 6, { entities: [makePlayer(1, 1), block, diamond] });
  const state = loadedState(world);

  const { chain, landing, blocked, tooLong } = getPushChain(state, world, 2, 1, 1, 0);
  assert.equal(chain.length, 2);
  assert.deepEqual(chain.map((e) => e.id), ["entity:block@2,1", "entity:diamond@3,1"]);
  assert.deepEqual(landing, { x: 4, y: 1 });
  assert.equal(blocked, false);
  assert.equal(tooLong, false);
});

test("getPushChain: a run of 3 is illegal (tooLong), independent of what lies beyond it", () => {
  const b1 = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const b2 = makeEntity("entity:block@3,1", "block", 3, 1, { solid: true });
  const b3 = makeEntity("entity:block@4,1", "block", 4, 1, { solid: true });
  const world = makeWorld(3, 7, { entities: [makePlayer(1, 1), b1, b2, b3] });
  const state = loadedState(world);

  const { chain, tooLong } = getPushChain(state, world, 2, 1, 1, 0);
  assert.equal(tooLong, true);
  assert.equal(chain.length, 3);
});

test("getPushChain: blocked-end (a wall right past the chain) denies regardless of legal length", () => {
  const block = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const world = makeWorld(3, 4, {
    walls: [[3, 1]],
    entities: [makePlayer(1, 1), block],
  });
  const state = loadedState(world);

  const { blocked, tooLong } = getPushChain(state, world, 2, 1, 1, 0);
  assert.equal(blocked, true);
  assert.equal(tooLong, false);
});

test("resolveMove: pushing a single block onto open ground", () => {
  const block = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const decoy = makeEntity("entity:diamond@0,2", "diamond", 0, 2, { collectible: true });
  const world = makeWorld(4, 5, { entities: [makePlayer(1, 1), block, decoy] });
  const state = loadedState(world);

  const result = resolveMove(state, world, 1, 0);
  assert.deepEqual(result, [
    { t: "MOVED", id: "entity:block@2,1", x: 3, y: 1 },
    { t: "MOVED", id: "entity:player", x: 2, y: 1 },
  ]);
});

test("resolveMove: pushing a length-2 chain applies farthest-to-nearest", () => {
  const block = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const diamond = makeEntity("entity:diamond@3,1", "diamond", 3, 1, { collectible: true });
  const decoy = makeEntity("entity:diamond@0,2", "diamond", 0, 2, { collectible: true });
  const world = makeWorld(4, 6, { entities: [makePlayer(1, 1), block, diamond, decoy] });
  const state = loadedState(world);

  const result = resolveMove(state, world, 1, 0);
  // Farthest (diamond) moves first, to the landing cell; then the
  // nearer block moves into the diamond's vacated (original) cell;
  // then the player moves onto the block's vacated (original) cell.
  assert.deepEqual(result, [
    { t: "MOVED", id: "entity:diamond@3,1", x: 4, y: 1 },
    { t: "MOVED", id: "entity:block@2,1", x: 3, y: 1 },
    { t: "MOVED", id: "entity:player", x: 2, y: 1 },
  ]);
});

test("resolveMove: an illegal (length-3) push is denied", () => {
  const b1 = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const b2 = makeEntity("entity:block@3,1", "block", 3, 1, { solid: true });
  const b3 = makeEntity("entity:block@4,1", "block", 4, 1, { solid: true });
  const world = makeWorld(3, 7, { entities: [makePlayer(1, 1), b1, b2, b3] });
  const state = loadedState(world);

  const result = resolveMove(state, world, 1, 0);
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.match(result.deny, /too many to push/);
});

test("resolveMove: a blocked-end push (wall right past the chain) is denied", () => {
  const block = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const world = makeWorld(3, 4, {
    walls: [[3, 1]],
    entities: [makePlayer(1, 1), block],
  });
  const state = loadedState(world);

  const result = resolveMove(state, world, 1, 0);
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.match(result.deny, /nowhere for it to go/);
});

test("resolveMove: pushing a block into a diamond shoves the diamond along (never collects it)", () => {
  const block = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const diamond = makeEntity("entity:diamond@3,1", "diamond", 3, 1, { collectible: true });
  const world = makeWorld(3, 6, { entities: [makePlayer(1, 1), block, diamond] });
  const state = loadedState(world);
  assert.equal(state.diamondsRemaining, 1);

  const result = resolveMove(state, world, 1, 0);
  assert.equal(result.some((e) => e.t === "COLLECTED"), false, "a pushed diamond must never be COLLECTED");
  assert.deepEqual(
    result.filter((e) => e.t === "MOVED" && e.id === "entity:diamond@3,1"),
    [{ t: "MOVED", id: "entity:diamond@3,1", x: 4, y: 1 }],
  );

  let final = state;
  let seq = state.seq;
  for (const ev of result) final = reduce(final, world, { ...ev, seq: ++seq });
  assert.equal(final.diamondsRemaining, 1, "the diamond still exists, just relocated");
});

test("resolveMove: pushing a block into a memory hole destroys it (not a WIN/LOSE event)", () => {
  const block = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const decoy = makeEntity("entity:diamond@0,2", "diamond", 0, 2, { collectible: true });
  const world = makeWorld(4, 5, {
    memoryHoles: [[3, 1]],
    entities: [makePlayer(1, 1), block, decoy],
  });
  const state = loadedState(world);

  const result = resolveMove(state, world, 1, 0);
  assert.deepEqual(result, [
    { t: "DESTROYED", id: "entity:block@2,1" },
    { t: "MOVED", id: "entity:player", x: 2, y: 1 },
  ]);
});

test("resolveMove: pushing a diamond into a memory hole destroys it AND decrements diamondsRemaining", () => {
  const block = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const diamond = makeEntity("entity:diamond@3,1", "diamond", 3, 1, { collectible: true });
  const world = makeWorld(3, 6, {
    memoryHoles: [[4, 1]],
    entities: [makePlayer(1, 1), block, diamond],
  });
  const state = loadedState(world);
  assert.equal(state.diamondsRemaining, 1);

  const result = resolveMove(state, world, 1, 0);
  assert.deepEqual(result, [
    { t: "DESTROYED", id: "entity:diamond@3,1" },
    { t: "MOVED", id: "entity:block@2,1", x: 3, y: 1 },
    { t: "MOVED", id: "entity:player", x: 2, y: 1 },
    { t: "WIN" },
  ]);

  let final = state;
  let seq = state.seq;
  for (const ev of result) final = reduce(final, world, { ...ev, seq: ++seq });
  assert.equal(final.diamondsRemaining, 0);
  assert.equal(final.outcome, "WIN");
});
