// Mirror of games/some-hero/ceremony/death-respawn-persistence.ceremony.test.js
// against rules/ instead of legacy/src.
//
// S2b PR3 (docs/superpowers/specs/2026-07-07-s2b-pr3-ceremony-machine-
// design.md) fills in the 2 real-zone tests S2a deferred (they needed a
// generated tomb + enterTomb(), which did not exist until this PR's
// ENTERED_TOMB/RESURRECTED events):
//  - "dying inside the Downstairs climbs back out: same world/npcs
//    objects..." (ceremony/death-respawn-persistence.ceremony.test.js:
//    60-72) — below, translated per the design spec's "'Same object' ->
//    byte-identical-serialized (locked)" section: some-hero's kernel
//    State never stores the derived World at all (doctrine #1), so
//    "same object reference" becomes "state.world deep-equals the ow
//    triple + a deriveWorldFromPack() snapshot is byte-identical
//    before-tomb vs after-climb-out". `game.npcs`/`game.owSave` have no
//    kernel-State analog (no NPC/entity tier yet; the World is never
//    stored) — intentionally NOT mirrored, not silently dropped; see the
//    test's own comment.
//  - "run-scoped state (runStats.died) is set by respawnAtGuild but
//    runStats itself is only reset by starting a new run (enterTomb)..."
//    (ceremony/death-respawn-persistence.ceremony.test.js:116-124).
// Both exercise the REAL kernel (shared/module.js/shared/reducer.js) via
// rules/tests/ceremony-kernel/kernel-helpers.mjs. The remaining 8 are
// pure-object tests, unchanged from S2a.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMeta, recordDeath, respawnAtGuild, hurtPlayer } from "../../meta.js";
import { blankGame, spyFx } from "./fixtures.js";
import { guildHallWorld, tombWorld, floorEnteredState, commit } from "./kernel-helpers.mjs";

const ST_DEAD = 3; // legacy/src/constants.js:33 ST.DEAD
const ST_PLAY = 1; // legacy/src/constants.js:33 ST.PLAY

// A plain-object, JSON-stringifiable snapshot of a derived World (the
// design spec's "snapshot deriveWorldFromPack serialized-form" —
// `walls` is a Set, so plain JSON.stringify(world) would silently drop
// it; sorted here for a stable byte-form).
function snapshotWorld(world) {
  return JSON.stringify({
    zone: world.zone,
    floorNum: world.floorNum,
    mapId: world.mapId,
    rows: world.rows,
    cols: world.cols,
    walls: [...world.walls].sort(),
    spawn: world.spawn,
    stairsAt: world.stairsAt,
    upstairsAt: world.upstairsAt,
    gate: world.gate,
  });
}

// Credentialed entry -> the tomb, via the same two-step dance door-
// golem.kernel.test.js's own wired tests use.
function enterTombFromGuildHall(ow) {
  let state = floorEnteredState(ow);
  state = {
    ...state,
    knowledge: { ...state.knowledge, credentials: { backstory: true, debt: true } },
    character: { ...state.character, swordLv: 1 },
  };
  for (const cmd of ["move 1 0", "move 1 0", "move 0 1", "move 0 1", "move 0 1"]) {
    ({ state } = commit(state, ow, cmd));
  }
  ({ state } = commit(state, ow, "proceed"));
  return state;
}

// ceremony/death-respawn-persistence.ceremony.test.js:20-31
test("@ceremony-kernel respawnAtGuild: deductible is ceil(gold/2), hp restored to full, position reset to the Guild Hall", () => {
  const game = blankGame(), fx = spyFx();
  game.lastHitBy = "jackal";
  game.player.gold = 101; game.player.potions = 5; game.player.swordLv = 2;
  game.player.hp = 0; game.player.maxhp = 20;
  const { deductible, cause } = respawnAtGuild(game, fx);
  assert.equal(deductible, 51, "ceil(101/2)");
  assert.equal(cause, "jackal");
  assert.equal(game.player.gold, 50);
  assert.equal(game.player.hp, game.player.maxhp);
  assert.equal(game.state, ST_PLAY);
});

// ceremony/death-respawn-persistence.ceremony.test.js:33-42
test("@ceremony-kernel resets on death: potions cap to 1 (items are temporary), attack/invuln timers zeroed, inventory cleared", () => {
  const game = blankGame(), fx = spyFx();
  game.player.potions = 5;
  game.player.hp = 0;
  respawnAtGuild(game, fx);
  assert.equal(game.player.potions, 1, "capped, not gifted");
  assert.equal(game.player.inv, 0);
  assert.equal(game.player.atkT, 0);
  assert.equal(game.input.atkBuf, 0);
});

// ceremony/death-respawn-persistence.ceremony.test.js:44-50
test("@ceremony-kernel no complimentary Glurp: potions at 0 stay at 0 through death (discontinued, per budget)", () => {
  const game = blankGame(), fx = spyFx();
  game.player.potions = 0;
  game.player.hp = 0;
  respawnAtGuild(game, fx);
  assert.equal(game.player.potions, 0);
});

// ceremony/death-respawn-persistence.ceremony.test.js:52-58
test('@ceremony-kernel persists through death: sword tier (equipment, not consumable — "DIRK!s are basically immortal")', () => {
  const game = blankGame(), fx = spyFx();
  game.player.swordLv = 2;
  game.player.hp = 0;
  respawnAtGuild(game, fx);
  assert.equal(game.player.swordLv, 2);
});

// ceremony/death-respawn-persistence.ceremony.test.js:60-72
test("@ceremony-kernel dying inside the Downstairs climbs back out: the ow world persists exactly (no regeneration)", () => {
  const ow = guildHallWorld();
  const owWorldStateBefore = { zone: ow.zone, floorNum: ow.floorNum, mapId: ow.mapId };
  const owSnapshotBefore = snapshotWorld(ow);

  let state = enterTombFromGuildHall(ow);
  assert.equal(state.world.zone, "tomb");

  const tomb = tombWorld();
  ({ state } = commit(state, tomb, "hurt 999 spirit"));
  assert.equal(state.pending?.kind, "resurrection");
  assert.equal(state.pending?.cause, "spirit");

  ({ state } = commit(state, tomb, "resurrect"));
  assert.equal(state.world.zone, "ow");
  assert.deepEqual(
    state.world,
    owWorldStateBefore,
    "exact same world triple: no regeneration on death",
  );
  assert.equal(
    snapshotWorld(guildHallWorld()),
    owSnapshotBefore,
    "the derived ow World itself is byte-identical before-tomb vs after-climb-out",
  );
  assert.equal(state.run.puzzle, null);
  // legacy also asserts game.npcs===owNpcs and game.owSave===null.
  // Intentionally NOT mirrored: some-hero's kernel State has no NPC/
  // entity tier yet (S2c+), and doctrine #1 means the World is never
  // stored on State at all (game.owSave's whole job — stashing the ow
  // World — has no kernel analog to even be null); not a silent
  // omission, see this file's header.
});

// ceremony/death-respawn-persistence.ceremony.test.js:74-91
test("@ceremony-kernel meta (knowledge) survives death untouched except deaths/lastCause/repeatCause: credentials, credit, menace, heist tokens all persist", () => {
  const game = blankGame(), fx = spyFx();
  game.meta.credentials.backstory = true;
  game.meta.credentials.debt = true;
  game.meta.credit.score = 700;
  game.meta.heist.skull = true;
  game.meta.menace.push({ deed: "x", day: 1 });
  game.player.hp = 0;
  game.lastHitBy = "mummy";
  respawnAtGuild(game, fx);
  assert.equal(game.meta.credentials.backstory, true);
  assert.equal(game.meta.credentials.debt, true);
  assert.equal(game.meta.credit.score, 700);
  assert.equal(game.meta.heist.skull, true);
  assert.equal(game.meta.menace.length, 1);
  assert.equal(game.meta.deaths, 1, "deaths increments");
  assert.equal(game.meta.lastCause, "mummy");
});

// ceremony/death-respawn-persistence.ceremony.test.js:93-104
test("@ceremony-kernel recordDeath tracks consecutive same-cause deaths (repeatCause), resets on a different cause", () => {
  const meta = createMeta();
  recordDeath(meta, "scarab");
  assert.equal(meta.repeatCause, 0, "first death to this cause: not a repeat");
  recordDeath(meta, "scarab");
  assert.equal(meta.repeatCause, 1);
  recordDeath(meta, "scarab");
  assert.equal(meta.repeatCause, 2);
  recordDeath(meta, "jackal");
  assert.equal(meta.repeatCause, 0, "different cause resets the streak");
  assert.equal(meta.deaths, 4);
});

// ceremony/death-respawn-persistence.ceremony.test.js:106-114
test("@ceremony-kernel hurtPlayer at hp<=0 sets state DEAD and records lastHitBy, which respawnAtGuild then reads as the death cause", () => {
  const game = blankGame(), fx = spyFx();
  game.player.hp = 1;
  hurtPlayer(game, 5, fx, "mummy");
  assert.equal(game.state, ST_DEAD);
  assert.equal(game.lastHitBy, "mummy");
  respawnAtGuild(game, fx);
  assert.equal(game.meta.lastCause, "mummy");
});

// ceremony/death-respawn-persistence.ceremony.test.js:116-124
test("@ceremony-kernel run-scoped state (runStats.died) is set by RESURRECTED but runStats itself is only reset by starting a new run (ENTERED_TOMB), not by death", () => {
  const ow = guildHallWorld();
  let state = enterTombFromGuildHall(ow);
  state = { ...state, run: { ...state.run, runStats: { ...state.run.runStats, kills: 7 } } };

  const tomb = tombWorld();
  ({ state } = commit(state, tomb, "hurt 999"));
  ({ state } = commit(state, tomb, "resurrect"));

  assert.equal(state.run.runStats.died, true);
  assert.equal(state.run.runStats.kills, 7, "death alone does not reset the run stats object");
});

// ceremony/death-respawn-persistence.ceremony.test.js:126-133
test("@ceremony-kernel BITE: the resurrection deductible rounds UP, not down — ceil(101/2) is 51, not 50", () => {
  const game = blankGame(), fx = spyFx();
  game.player.gold = 101;
  game.player.hp = 0;
  const { deductible } = respawnAtGuild(game, fx);
  assert.equal(deductible, 51);
  assert.notEqual(deductible, 50, "floor(101/2) would be the wrong (bitten) value");
});
