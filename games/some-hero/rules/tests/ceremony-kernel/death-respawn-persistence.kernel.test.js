// Mirror of games/some-hero/ceremony/death-respawn-persistence.ceremony.test.js
// against rules/ instead of legacy/src.
//
// DEFERRED to S2b (2 of 10 tests, real-zone tests needing a generated
// tomb + enterTomb()):
//  - "dying inside the Downstairs climbs back out: same world/npcs
//    objects..." (ceremony/death-respawn-persistence.ceremony.test.js:
//    60-72) — exercises respawnAtGuild's real-zone climb-out branch
//    (restoreSurface), explicitly out of S2a scope per rules/meta.js's
//    respawnAtGuild doc comment.
//  - "run-scoped state (runStats.died) is set by respawnAtGuild but
//    runStats itself is only reset by starting a new run (enterTomb)..."
//    (ceremony/death-respawn-persistence.ceremony.test.js:116-124).
// The remaining 8 are pure-object tests and are covered below.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMeta, recordDeath, respawnAtGuild, hurtPlayer } from "../../meta.js";
import { blankGame, spyFx } from "./fixtures.js";

const ST_DEAD = 3; // legacy/src/constants.js:33 ST.DEAD
const ST_PLAY = 1; // legacy/src/constants.js:33 ST.PLAY

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

// ceremony/death-respawn-persistence.ceremony.test.js:126-133
test("@ceremony-kernel BITE: the resurrection deductible rounds UP, not down — ceil(101/2) is 51, not 50", () => {
  const game = blankGame(), fx = spyFx();
  game.player.gold = 101;
  game.player.hp = 0;
  const { deductible } = respawnAtGuild(game, fx);
  assert.equal(deductible, 51);
  assert.notEqual(deductible, 50, "floor(101/2) would be the wrong (bitten) value");
});
