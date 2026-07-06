/* Unit tests for shared/tick.js's resolveTick() — DELTA C4 PR2, the
 * fixed-step tick bridge (see docs/superpowers/specs/
 * 2026-07-06-c4-topdown-port-design.md's "The fixed-step tick bridge
 * (the novel part)" section). Covers moving-block stepping/blocked-
 * retry/hole-destruction/pushed-then-resumes, baddie patrol/reflect-off-
 * wall-and-block-only/diamond-passable/hole-destruction, the
 * perpendicular-shove-via-push and along-axis-shove-denies interactions
 * (mechanically resolved in shared/push.js's resolveMove, exercised here
 * per the task brief since baddies are this file's domain), contact
 * damage (newly-established-only, re-arm-on-separation), HP-derived
 * LOSE, and resolveTick's own determinism. Hand-built worlds (tests/
 * helpers/build-world.mjs), not the compiled content pack, so every
 * scenario is exact. */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveTick } from "../shared/tick.js";
import { resolveMove } from "../shared/push.js";
import { reduce } from "../shared/reducer.js";
import { makeWorld, makePlayer, makeEntity, makeBaddie, makeMovingBlock, loadedState } from "./helpers/build-world.mjs";

function commit(state, world, events) {
  let seq = state.seq;
  for (const ev of events) state = reduce(state, world, { ...ev, seq: ++seq });
  return state;
}

test("an empty tick still advances the counter and emits nothing else", () => {
  const world = makeWorld(3, 3, { entities: [makePlayer(0, 0)] });
  const state = loadedState(world);
  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [{ t: "TICK_ADVANCED", tick: 1 }]);
});

// ── Moving blocks ──────────────────────────────────────────────────────

test("moving block steps one cell per tick in its fixed facing", () => {
  const mover = makeMovingBlock("entity:moving_block@1,1", 1, 1, "E");
  const world = makeWorld(3, 5, { entities: [makePlayer(0, 0), mover] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "MOVED", id: "entity:moving_block@1,1", x: 2, y: 1 },
  ]);
});

test("moving block blocked by a wall retries silently — no event", () => {
  const mover = makeMovingBlock("entity:moving_block@1,1", 1, 1, "E");
  const world = makeWorld(3, 5, { walls: [[2, 1]], entities: [makePlayer(0, 0), mover] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [{ t: "TICK_ADVANCED", tick: 1 }]);
});

test("moving block blocked by the player's own tile retries silently", () => {
  const mover = makeMovingBlock("entity:moving_block@1,1", 1, 1, "E");
  const world = makeWorld(3, 5, { entities: [makePlayer(2, 1), mover] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [{ t: "TICK_ADVANCED", tick: 1 }]);
});

test("moving block blocked by another not-yet-vacated moving block this same tick", () => {
  // Scan order = world.initialEntities order: moverA is evaluated before
  // moverB, so moverA sees moverB still occupying (2,1) (moverB's OWN
  // turn hasn't happened yet) and stays put; moverB then moves normally.
  const moverA = makeMovingBlock("entity:moving_block@1,1", 1, 1, "E");
  const moverB = makeMovingBlock("entity:moving_block@2,1", 2, 1, "E");
  const world = makeWorld(3, 6, { entities: [makePlayer(0, 0), moverA, moverB] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "MOVED", id: "entity:moving_block@2,1", x: 3, y: 1 },
  ]);
});

test("moving block destroyed stepping into a memory hole", () => {
  const mover = makeMovingBlock("entity:moving_block@1,1", 1, 1, "E");
  const world = makeWorld(3, 5, { memoryHoles: [[2, 1]], entities: [makePlayer(0, 0), mover] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "DESTROYED", id: "entity:moving_block@1,1" },
  ]);
});

test("a pushed moving block resumes its own autonomous cycle from the new tile", () => {
  const mover = makeMovingBlock("entity:moving_block@2,1", 2, 1, "E");
  const world = makeWorld(3, 6, { entities: [makePlayer(1, 1), mover] });
  let state = loadedState(world);

  // Player pushes the moving block one tile east, like an ordinary chain
  // member (shared/push.js's resolveMove) — no tick involved yet.
  const moveResult = resolveMove(state, world, 1, 0);
  state = commit(state, world, moveResult);
  assert.deepEqual(state.entities.get("entity:moving_block@2,1").components.GridPosition, { x: 3, y: 1 });

  // It resumes moving east on its own from (3,1), with no separate
  // "paused" state to track.
  const tickEvents = resolveTick(state, world, "seed");
  assert.deepEqual(tickEvents, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "MOVED", id: "entity:moving_block@2,1", x: 4, y: 1 },
  ]);
});

// ── Baddies ─────────────────────────────────────────────────────────────

test("baddie patrols along its axis, unblocked", () => {
  const baddie = makeBaddie("entity:baddie@1,1", 1, 1, "horizontal", 1);
  const world = makeWorld(3, 5, { entities: [makePlayer(0, 2), baddie] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "MOVED", id: "entity:baddie@1,1", x: 2, y: 1, moveDir: 1 },
  ]);
});

test("baddie reflects off a wall — moveDir flips, MOVED still emitted with the unchanged position", () => {
  const baddie = makeBaddie("entity:baddie@1,1", 1, 1, "horizontal", 1);
  const world = makeWorld(3, 5, { walls: [[2, 1]], entities: [makePlayer(0, 2), baddie] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "MOVED", id: "entity:baddie@1,1", x: 1, y: 1, moveDir: -1 },
  ]);
});

test("baddie reflects off a block", () => {
  const baddie = makeBaddie("entity:baddie@1,1", 1, 1, "horizontal", 1);
  const block = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const world = makeWorld(3, 5, { entities: [makePlayer(0, 2), baddie, block] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "MOVED", id: "entity:baddie@1,1", x: 1, y: 1, moveDir: -1 },
  ]);
});

test("baddie is NOT blocked by another baddie or by the player (the corrected-comment behavior)", () => {
  const baddieA = makeBaddie("entity:baddie@1,1", 1, 1, "horizontal", 1);
  const baddieB = makeBaddie("entity:baddie@2,1", 2, 1, "horizontal", 1);
  // Player sits exactly where baddieB is about to step from — proves the
  // player never blocks a baddie's patrol either.
  const world = makeWorld(3, 5, { entities: [makePlayer(3, 1), baddieA, baddieB] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    // baddieA steps onto baddieB's (still-original) tile — not blocked.
    { t: "MOVED", id: "entity:baddie@1,1", x: 2, y: 1, moveDir: 1 },
    // baddieB steps onto the player's tile — also not blocked; contact
    // damage is a separate, later step (covered below).
    { t: "MOVED", id: "entity:baddie@2,1", x: 3, y: 1, moveDir: 1 },
    { t: "HURT", id: "entity:player", hp: 2 },
  ]);
});

test("baddie passes over/through a diamond (diamonds are passable, never chain members to a baddie)", () => {
  const baddie = makeBaddie("entity:baddie@1,1", 1, 1, "horizontal", 1);
  const diamond = makeEntity("entity:diamond@2,1", "diamond", 2, 1, { collectible: true });
  const world = makeWorld(3, 5, { entities: [makePlayer(0, 2), baddie, diamond] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "MOVED", id: "entity:baddie@1,1", x: 2, y: 1, moveDir: 1 },
  ]);

  const final = commit(state, world, events);
  assert.ok(final.entities.has("entity:diamond@2,1"), "the diamond is untouched, not collected or destroyed");
  assert.deepEqual(final.entities.get("entity:diamond@2,1").components.GridPosition, { x: 2, y: 1 });
  assert.equal(final.diamondsRemaining, 1);
});

test("baddie destroyed stepping into a memory hole", () => {
  const baddie = makeBaddie("entity:baddie@1,1", 1, 1, "horizontal", 1);
  const world = makeWorld(3, 5, { memoryHoles: [[2, 1]], entities: [makePlayer(0, 2), baddie] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "DESTROYED", id: "entity:baddie@1,1" },
  ]);
});

// ── Baddie push interactions (shared/push.js's resolveMove) ────────────

test("resolveMove: pushing a block perpendicular into a baddie shoves it one tile, then the push proceeds", () => {
  const block = makeEntity("entity:block@1,1", "block", 1, 1, { solid: true });
  const baddie = makeBaddie("entity:baddie@1,2", 1, 2, "horizontal", 1);
  // A decoy diamond keeps diamondsRemaining > 0, isolating "does the push
  // resolve correctly" from the (correctly, separately tested elsewhere)
  // derived WIN check — same convention push.test.js's own tests use.
  const decoy = makeEntity("entity:diamond@2,0", "diamond", 2, 0, { collectible: true });
  const world = makeWorld(5, 3, { entities: [makePlayer(1, 0), block, baddie, decoy] });
  const state = loadedState(world);

  const result = resolveMove(state, world, 0, 1); // push straight down — perpendicular to a horizontal baddie
  assert.deepEqual(result, [
    { t: "MOVED", id: "entity:baddie@1,2", x: 1, y: 3 },
    { t: "MOVED", id: "entity:block@1,1", x: 1, y: 2 },
    { t: "MOVED", id: "entity:player", x: 1, y: 1 },
  ]);
});

test("resolveMove: a perpendicular baddie shove blocked at its destination denies the whole push", () => {
  const block = makeEntity("entity:block@1,1", "block", 1, 1, { solid: true });
  const baddie = makeBaddie("entity:baddie@1,2", 1, 2, "horizontal", 1);
  const world = makeWorld(4, 3, {
    walls: [[1, 3]], // the baddie's shove destination is a wall
    entities: [makePlayer(1, 0), block, baddie],
  });
  const state = loadedState(world);

  const result = resolveMove(state, world, 0, 1);
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.match(result.deny, /nowhere for it to go/);
});

test("resolveMove: pushing a block along a baddie's own axis onto it denies the whole push", () => {
  const block = makeEntity("entity:block@2,1", "block", 2, 1, { solid: true });
  const baddie = makeBaddie("entity:baddie@3,1", 3, 1, "horizontal", 1);
  const world = makeWorld(3, 6, { entities: [makePlayer(1, 1), block, baddie] });
  const state = loadedState(world);

  const result = resolveMove(state, world, 1, 0); // push right — ALONG the baddie's own horizontal axis
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.match(result.deny, /will not be shoved/);
});

// ── Contact damage ──────────────────────────────────────────────────────

test("contact damage fires once per newly-established contact, and re-arms after separation", () => {
  // A tight pocket (walls at x=1 and x=4) with the player fixed at (3,1)
  // and a baddie oscillating between (2,1) and (3,1) — it lands on the
  // player's tile, reflects off the wall while still touching (no repeat
  // damage), separates, then swings back onto the player again (re-armed
  // damage). Five successive ticks trace the whole cycle.
  const baddie = makeBaddie("entity:baddie@2,1", 2, 1, "horizontal", 1);
  const world = makeWorld(3, 6, {
    walls: [[1, 1], [4, 1]],
    entities: [makePlayer(3, 1), baddie],
  });
  let state = loadedState(world);

  const hurtEventsPerTick = [];
  for (let i = 0; i < 5; i++) {
    const events = resolveTick(state, world, "seed");
    hurtEventsPerTick.push(events.filter((e) => e.t === "HURT"));
    state = commit(state, world, events);
  }

  assert.deepEqual(
    hurtEventsPerTick.map((hs) => hs.length),
    [1, 0, 0, 0, 1],
    "HURT should fire on tick 1 (newly established) and tick 5 (re-armed after separation), not in between",
  );
  assert.deepEqual(hurtEventsPerTick[0], [{ t: "HURT", id: "entity:player", hp: 2 }]);
  assert.deepEqual(hurtEventsPerTick[4], [{ t: "HURT", id: "entity:player", hp: 1 }]);
  assert.equal(state.entities.get("entity:player").components.Health.hp, 1);
  assert.equal(state.over, false);
});

test("HP reaching zero from tick contact damage appends a derived LOSE", () => {
  const player = makePlayer(3, 1, { hp: 1 });
  const baddie = makeBaddie("entity:baddie@2,1", 2, 1, "horizontal", 1);
  const world = makeWorld(3, 6, { entities: [player, baddie] });
  const state = loadedState(world);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "MOVED", id: "entity:baddie@2,1", x: 3, y: 1, moveDir: 1 },
    { t: "HURT", id: "entity:player", hp: 0 },
    { t: "LOSE" },
  ]);

  const final = commit(state, world, events);
  assert.equal(final.over, true);
  assert.equal(final.outcome, "LOSE");
});

// ── Determinism (named-channel discipline, orchestrator decision #4) ──

test("resolveTick(state, world, seed) is deterministic: identical inputs (any seed) produce identical Event[]", () => {
  const baddie = makeBaddie("entity:baddie@2,1", 2, 1, "horizontal", 1);
  const mover = makeMovingBlock("entity:moving_block@1,3", 1, 3, "E");
  const world = makeWorld(5, 6, { entities: [makePlayer(0, 0), baddie, mover] });
  const state = loadedState(world);

  const a = resolveTick(state, world, "seed-x");
  const b = resolveTick(state, world, "seed-x");
  const c = resolveTick(state, world, "an entirely different seed value");

  assert.deepEqual(a, b);
  assert.deepEqual(a, c, "no shipped mover draws from `seed` yet, so even a different seed must not change the result");
});
