/* ── Unit tests for PR4 (docs/superpowers/specs/2026-07-07-s2c-pr4-combat-
   design.md): the run-scoped enemy entity tier, shared/tick.js's
   skeleton-family stepping + contact damage, and shared/module.js's
   "attack" verb. Hand-built worlds/states (tests/helpers/build-state.mjs)
   for precise scenarios (mirrors tests/reducer.test.js/module.test.js/
   tick.test.js's own style); the real @golem-engine/content compile()
   for the "ENTERED_TOMB seeds run.enemies" cross-check, so drift between
   shared/module.js's hardcoded SYNTHETIC_TOMB_FLOOR_1 placeholder and the
   real derived spawn list is caught. Closes 0 ceremony tests by design
   (combat/pickups are uncharacterized — see the design spec's own
   header) — this file plus pickups.test.js and the determinism.test.js
   extension ARE the proof. */
import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "@golem-engine/content";
import { h32 } from "@golem-engine/random";
import { validate, deriveWorldFromPack } from "../shared/module.js";
import { resolveTick } from "../shared/tick.js";
import { reduce, serializeState } from "../shared/reducer.js";
import { makeWorld, floorEnteredState } from "./helpers/build-state.mjs";
import { compileSyntheticFloorPack, SYNTHETIC_MAP_ID } from "./fixtures/synthetic-floor.mjs";
import { ENTITY_DEFS } from "../content/entities.mjs";
import { GUILD_HALL_MAP } from "../content/guild-hall-map.mjs";

function commit(state, world, events) {
  let seq = state.seq;
  for (const ev of events) state = reduce(state, world, { ...ev, seq: ++seq });
  return state;
}

function withEnemies(state, enemies) {
  return { ...state, run: { ...state.run, enemies } };
}

// ── resolveTick: skeleton-family stepping ──────────────────────────────

test("resolveTick: an in-range enemy steps one grid cell toward the player, deterministically", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 0, y: 0 }, enemyTypes: { skeleton: { dmg: 1, aggro: 360 } } });
  let state = floorEnteredState(world);
  state = withEnemies(state, [{ id: "e0", kind: "skeleton", pos: { x: 3, y: 0 }, hp: 4 }]);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "ENEMY_MOVED", id: "e0", x: 2, y: 0 },
  ]);

  const next = commit(state, world, events);
  assert.deepEqual(next.run.enemies, [{ id: "e0", kind: "skeleton", pos: { x: 2, y: 0 }, hp: 4 }]);
});

test("resolveTick: blocked by a wall — no move, silent retry", () => {
  const world = makeWorld({ rows: 5, cols: 5, walls: [[2, 0]], spawn: { x: 0, y: 0 }, enemyTypes: { skeleton: { dmg: 1, aggro: 360 } } });
  let state = floorEnteredState(world);
  state = withEnemies(state, [{ id: "e0", kind: "skeleton", pos: { x: 3, y: 0 }, hp: 4 }]);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [{ t: "TICK_ADVANCED", tick: 1 }], "the wall at (2,0) blocks the step entirely");
});

test("resolveTick: blocked by another enemy — no move", () => {
  const world = makeWorld({
    rows: 5,
    cols: 5,
    spawn: { x: 0, y: 0 },
    enemyTypes: { skeleton: { dmg: 1, aggro: 360 }, slime: { dmg: 0, aggro: 0, passive: true } },
  });
  let state = floorEnteredState(world);
  state = withEnemies(state, [
    { id: "e0", kind: "skeleton", pos: { x: 3, y: 0 }, hp: 4 },
    { id: "e1", kind: "slime", pos: { x: 2, y: 0 }, hp: 3 },
  ]);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [{ t: "TICK_ADVANCED", tick: 1 }], "e1 occupies e0's only step-toward-player cell");
});

test("resolveTick: out of aggro range — no move", () => {
  const world = makeWorld({ rows: 8, cols: 8, spawn: { x: 0, y: 0 }, enemyTypes: { skeleton: { dmg: 1, aggro: 36 } } }); // aggro 36px / T(36) = 1 tile
  let state = floorEnteredState(world);
  state = withEnemies(state, [{ id: "e0", kind: "skeleton", pos: { x: 5, y: 0 }, hp: 4 }]);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [{ t: "TICK_ADVANCED", tick: 1 }], "distance 5 > aggro range 1");
});

test("resolveTick: a passive enemy never chases, however large its aggro", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 0, y: 0 }, enemyTypes: { slime: { dmg: 0, aggro: 999999, passive: true } } });
  let state = floorEnteredState(world);
  state = withEnemies(state, [{ id: "e0", kind: "slime", pos: { x: 1, y: 0 }, hp: 3 }]);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [{ t: "TICK_ADVANCED", tick: 1 }]);
});

// ── resolveTick: contact damage ────────────────────────────────────────

test("resolveTick: newly-established contact (stepping onto/adjacent-to the player) fires HURT", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 0, y: 0 }, enemyTypes: { skeleton: { dmg: 1, aggro: 360 } } });
  let state = floorEnteredState(world);
  state = withEnemies(state, [{ id: "e0", kind: "skeleton", pos: { x: 2, y: 0 }, hp: 4 }]);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "ENEMY_MOVED", id: "e0", x: 1, y: 0 },
    { t: "HURT", amount: 1, cause: "skeleton" },
  ]);

  const next = commit(state, world, events);
  assert.equal(next.character.hp, 9);
});

test("resolveTick: HURT bridges to DIED when it brings the player to hp<=0", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 0, y: 0 }, enemyTypes: { skeleton: { dmg: 5, aggro: 360 } } });
  let state = floorEnteredState(world);
  state = { ...state, character: { ...state.character, hp: 3 } };
  state = withEnemies(state, [{ id: "e0", kind: "skeleton", pos: { x: 2, y: 0 }, hp: 4 }]);

  const events = resolveTick(state, world, "seed");
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "ENEMY_MOVED", id: "e0", x: 1, y: 0 },
    { t: "HURT", amount: 5, cause: "skeleton" },
    { t: "DIED", cause: "skeleton" },
  ]);

  const next = commit(state, world, events);
  assert.equal(next.pending.kind, "resurrection");
});

test("resolveTick: contact re-arms on separation — does not re-fire every tick while still touching", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 0, y: 0 }, enemyTypes: { skeleton: { dmg: 1, aggro: 360 } } });
  let state = floorEnteredState(world);
  // Already adjacent (distance 1) entering this tick — contact was
  // established on some earlier tick, not this one.
  state = withEnemies(state, [{ id: "e0", kind: "skeleton", pos: { x: 1, y: 0 }, hp: 4 }]);

  const events = resolveTick(state, world, "seed");
  // The skeleton steps onto the player's own tile (enemies are not
  // blocked by the player — design spec) but no SECOND HURT fires: it
  // was already in contact (adjacent) before this tick.
  assert.deepEqual(events, [
    { t: "TICK_ADVANCED", tick: 1 },
    { t: "ENEMY_MOVED", id: "e0", x: 0, y: 0 },
  ]);
});

// ── validate("attack <id>") ─────────────────────────────────────────────

test('attack: ENEMY_HURT when it survives, ENEMY_KILLED (+ killsByKind) when it does not', () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 0, y: 0 } });
  let state = floorEnteredState(world);
  state = withEnemies(state, [{ id: "e0", kind: "skeleton", pos: { x: 1, y: 0 }, hp: 2 }]);

  let result = validate({ state, world }, "attack e0");
  assert.deepEqual(result, [{ t: "ENEMY_HURT", id: "e0", amount: 1 }], "swordLv 0 -> 1 damage, hp 2->1, not yet dead");
  state = commit(state, world, result);
  assert.equal(state.run.enemies[0].hp, 1);

  result = validate({ state, world }, "attack e0");
  assert.deepEqual(result, [
    { t: "ENEMY_HURT", id: "e0", amount: 1 },
    { t: "ENEMY_KILLED", id: "e0", kind: "skeleton" },
  ]);
  state = commit(state, world, result);
  assert.deepEqual(state.run.enemies, [], "the killed enemy is removed from run.enemies");
  assert.equal(state.run.runStats.kills, 1);
  assert.deepEqual(state.run.runStats.killsByKind, { skeleton: 1 });
});

test("attack: Denial when no such enemy is present", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 0, y: 0 } });
  const state = floorEnteredState(world);
  const result = validate({ state, world }, "attack nope");
  assert.ok(!Array.isArray(result));
  assert.match(result.deny, /nothing here/);
});

test("attack: Denial when the target is too far to strike", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 0, y: 0 } });
  let state = floorEnteredState(world);
  state = withEnemies(state, [{ id: "e0", kind: "skeleton", pos: { x: 4, y: 0 }, hp: 4 }]);
  const result = validate({ state, world }, "attack e0");
  assert.ok(!Array.isArray(result));
  assert.match(result.deny, /Too far/);
});

// ── ENTERED_TOMB seeds run.enemies from the derived spawn list ─────────

test("ENTERED_TOMB seeds run.enemies from the same spawn list deriveWorldFromPack computes for the synthetic tomb floor", () => {
  // Cross-check half: the real derivation (guards drift between shared/
  // module.js's hardcoded placeholder and the actual synthetic fixture —
  // same rationale as tests/gate-credentials-crosscheck.test.js).
  const compiled = compileSyntheticFloorPack();
  assert.ok(compiled.ok, "the synthetic floor pack must compile");
  const tomb = deriveWorldFromPack(compiled.pack, { zone: "tomb", floorNum: 1, mapId: SYNTHETIC_MAP_ID });
  assert.deepEqual(tomb.enemySpawns, [{ kind: "skeleton", pos: { x: 3, y: 3 } }]);
  assert.equal(tomb.enemyTypes.skeleton.hp, 4);
  assert.equal(tomb.enemyTypes.skeleton.dmg, 1);

  // Live half: the real ow -> tomb ceremony (mirrors rules/tests/
  // ceremony-kernel/door-golem.kernel.test.js's own "pass" scenario) —
  // proves ENTERED_TOMB, as actually emitted by validate()'s "move" case,
  // seeds run.enemies for real.
  const owCompiled = compile({
    name: "combat-test-guild-hall",
    version: 1,
    entities: ENTITY_DEFS,
    tables: [],
    maps: [GUILD_HALL_MAP],
  });
  assert.ok(owCompiled.ok);
  const ow = deriveWorldFromPack(owCompiled.pack, { zone: "ow", floorNum: 0, mapId: "map:guild_hall" });

  let state = floorEnteredState(ow);
  state = {
    ...state,
    knowledge: { ...state.knowledge, credentials: { backstory: true, debt: true } },
    character: { ...state.character, swordLv: 1 },
  };
  for (const cmd of ["move 1 0", "move 1 0", "move 0 1", "move 0 1", "move 0 1"]) {
    const result = validate({ state, world: ow }, cmd);
    assert.ok(Array.isArray(result), `expected "${cmd}" to be legal`);
    state = commit(state, ow, result);
  }
  assert.equal(state.world.zone, "ow", "still topside — GOLEM_APPROVED, ceremony pending");

  const proceedResult = validate({ state, world: ow }, "proceed");
  assert.ok(Array.isArray(proceedResult));
  state = commit(state, ow, proceedResult);

  assert.equal(state.world.zone, "tomb");
  assert.deepEqual(state.run.enemies, [{ id: "e0", kind: "skeleton", pos: { x: 3, y: 3 }, hp: 4 }]);
  // The seeded enemy's hp/kind/pos match what the real derivation above
  // independently computed — no drift between the two.
  assert.deepEqual(
    state.run.enemies.map((e) => ({ kind: e.kind, pos: e.pos })),
    tomb.enemySpawns,
  );
  assert.equal(state.run.enemies[0].hp, tomb.enemyTypes.skeleton.hp);
});

// ── serializeState: stable enemy ordering ───────────────────────────────

test("serializeState sorts run.enemies by id — the hash does not depend on array order", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 0, y: 0 } });
  const base = floorEnteredState(world);

  const a = withEnemies(base, [
    { id: "e1", kind: "skeleton", pos: { x: 1, y: 1 }, hp: 4 },
    { id: "e0", kind: "skeleton", pos: { x: 2, y: 2 }, hp: 3 },
  ]);
  const b = withEnemies(base, [
    { id: "e0", kind: "skeleton", pos: { x: 2, y: 2 }, hp: 3 },
    { id: "e1", kind: "skeleton", pos: { x: 1, y: 1 }, hp: 4 },
  ]);

  assert.notDeepEqual(a.run.enemies, b.run.enemies, "sanity: different array order");
  assert.equal(serializeState(a), serializeState(b));
  assert.equal(h32(serializeState(a)), h32(serializeState(b)));
});

/* ── Adversarial-review corrections (combat/tick review) ─────────────── */

test("review fix: a second enemy's NEWLY-established contact deals damage even when another enemy is already glued to the player", () => {
  const world = makeWorld({ rows: 10, cols: 10, spawn: { x: 5, y: 5 }, enemyTypes: { skeleton: { aggro: 150, dmg: 3 } }, mapId: "tomb:x:0:1" });
  let state = floorEnteredState(world);
  state = {
    ...state,
    character: { ...state.character, hp: 10, pos: { x: 5, y: 5 } },
    run: {
      ...state.run,
      enemies: [
        { id: "e0", kind: "skeleton", pos: { x: 5, y: 5 }, hp: 4 }, // already ON the player (glued, dist 0)
        { id: "e1", kind: "skeleton", pos: { x: 7, y: 5 }, hp: 4 }, // 2 away — will step to (6,5), NEWLY adjacent
      ],
    },
  };

  const res = resolveTick(state, world, world.mapId);
  const hurts = res.filter((e) => e.t === "HURT");
  assert.equal(hurts.length, 1, "e1's fresh contact must land — the glued e0 no longer masks it");
  assert.equal(hurts[0].amount, 3);
});

test("review fix: while slain (pending resurrection), only 'resurrect' is legal — move/attack deny, tick no-ops", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 2, y: 2 }, enemyTypes: { skeleton: { aggro: 150, dmg: 3 } }, mapId: "tomb:x:0:1" });
  let state = floorEnteredState(world);
  state = {
    ...state,
    character: { ...state.character, hp: 0, pos: { x: 2, y: 2 } },
    pending: { kind: "resurrection", cause: "skeleton" },
    run: { ...state.run, enemies: [{ id: "e0", kind: "skeleton", pos: { x: 3, y: 2 }, hp: 4 }] },
  };

  const move = validate({ state, world }, "move 1 0");
  assert.ok(!Array.isArray(move) && move.deny, "a dead player cannot move");
  const attack = validate({ state, world }, "attack e0");
  assert.ok(!Array.isArray(attack) && attack.deny, "a dead player cannot attack");

  const tick = validate({ state, world }, "tick");
  assert.deepEqual(tick, [], "tick is a no-op while dead — no enemy moves, no corpse-hurting HURT/DIED");

  const resurrect = validate({ state, world }, "resurrect");
  assert.ok(Array.isArray(resurrect), "resurrect is still legal");
  assert.equal(resurrect[0].t, "RESURRECTED");
});
