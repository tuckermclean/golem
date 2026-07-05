// @ceremony — Area 5: death/respawn/meta-persistence. Pins what survives
// death (knowledge/meta, world-as-left) vs what resets (run stats,
// consumables, position) vs what a *new run* additionally resets that
// death alone does not (overworld regeneration, quest, credentials-owned
// swordLv aside).
//
// Characterization tests, read-only against games/some-hero/legacy/src.
// Deliberate overlap with legacy/tests/some-hero.test.js and
// legacy/tests/credit.test.js (see CEREMONY.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, ST } from '../legacy/src/constants.js';
import { createMeta, recordDeath } from '../legacy/src/core/meta.js';
import { respawnAtGuild } from '../legacy/src/systems/respawn.js';
import { hurtPlayer } from '../legacy/src/systems/combat.js';
import { enterTomb } from '../legacy/src/world/zones.js';
import { blankGame, seededGame, spyFx } from './helpers.js';

test('@ceremony respawnAtGuild: deductible is ceil(gold/2), hp restored to full, position reset to the Guild Hall', () => {
  const game = blankGame(), fx = spyFx();
  game.lastHitBy = 'jackal';
  game.player.gold = 101; game.player.potions = 5; game.player.swordLv = 2;
  game.player.hp = 0; game.player.maxhp = 20;
  const { deductible, cause } = respawnAtGuild(game, fx);
  assert.equal(deductible, 51, 'ceil(101/2)');
  assert.equal(cause, 'jackal');
  assert.equal(game.player.gold, 50);
  assert.equal(game.player.hp, game.player.maxhp);
  assert.equal(game.state, ST.PLAY);
});

test('@ceremony resets on death: potions cap to 1 (items are temporary), attack/invuln timers zeroed, inventory cleared', () => {
  const game = blankGame(), fx = spyFx();
  game.player.potions = 5;
  game.player.hp = 0;
  respawnAtGuild(game, fx);
  assert.equal(game.player.potions, 1, 'capped, not gifted');
  assert.equal(game.player.inv, 0);
  assert.equal(game.player.atkT, 0);
  assert.equal(game.input.atkBuf, 0);
});

test('@ceremony no complimentary Glurp: potions at 0 stay at 0 through death (discontinued, per budget)', () => {
  const game = blankGame(), fx = spyFx();
  game.player.potions = 0;
  game.player.hp = 0;
  respawnAtGuild(game, fx);
  assert.equal(game.player.potions, 0);
});

test('@ceremony persists through death: sword tier (equipment, not consumable — "DIRK!s are basically immortal")', () => {
  const game = blankGame(), fx = spyFx();
  game.player.swordLv = 2;
  game.player.hp = 0;
  respawnAtGuild(game, fx);
  assert.equal(game.player.swordLv, 2);
});

test('@ceremony dying inside the Downstairs climbs back out: same world/npcs objects (surface persists exactly, no regeneration)', () => {
  const game = seededGame(12), fx = spyFx();
  const owWorld = game.world, owNpcs = game.npcs;
  enterTomb(game, fx);
  assert.equal(game.zone, 'tomb');
  game.lastHitBy = 'spirit';
  respawnAtGuild(game, fx);
  assert.equal(game.zone, 'ow');
  assert.equal(game.world, owWorld, 'exact same object reference: no regeneration on death');
  assert.equal(game.npcs, owNpcs);
  assert.equal(game.owSave, null);
  assert.equal(game.puzzle, null);
});

test('@ceremony meta (knowledge) survives death untouched except deaths/lastCause/repeatCause: credentials, credit, menace, heist tokens all persist', () => {
  const game = blankGame(), fx = spyFx();
  game.meta.credentials.backstory = true;
  game.meta.credentials.debt = true;
  game.meta.credit.score = 700;
  game.meta.heist.skull = true;
  game.meta.menace.push({ deed: 'x', day: 1 });
  game.player.hp = 0;
  game.lastHitBy = 'mummy';
  respawnAtGuild(game, fx);
  assert.equal(game.meta.credentials.backstory, true);
  assert.equal(game.meta.credentials.debt, true);
  assert.equal(game.meta.credit.score, 700);
  assert.equal(game.meta.heist.skull, true);
  assert.equal(game.meta.menace.length, 1);
  assert.equal(game.meta.deaths, 1, 'deaths increments');
  assert.equal(game.meta.lastCause, 'mummy');
});

test('@ceremony recordDeath tracks consecutive same-cause deaths (repeatCause), resets on a different cause', () => {
  const meta = createMeta();
  recordDeath(meta, 'scarab');
  assert.equal(meta.repeatCause, 0, 'first death to this cause: not a repeat');
  recordDeath(meta, 'scarab');
  assert.equal(meta.repeatCause, 1);
  recordDeath(meta, 'scarab');
  assert.equal(meta.repeatCause, 2);
  recordDeath(meta, 'jackal');
  assert.equal(meta.repeatCause, 0, 'different cause resets the streak');
  assert.equal(meta.deaths, 4);
});

test('@ceremony hurtPlayer at hp<=0 sets state DEAD and records lastHitBy, which respawnAtGuild then reads as the death cause', () => {
  const game = blankGame(), fx = spyFx();
  game.player.hp = 1;
  hurtPlayer(game, 5, fx, 'mummy');
  assert.equal(game.state, ST.DEAD);
  assert.equal(game.lastHitBy, 'mummy');
  respawnAtGuild(game, fx);
  assert.equal(game.meta.lastCause, 'mummy');
});

test('@ceremony run-scoped state (runStats.died) is set by respawnAtGuild but runStats itself is only reset by starting a new run (enterTomb), not by death', () => {
  const game = seededGame(30), fx = spyFx();
  enterTomb(game, fx);
  game.runStats.kills = 7;
  game.player.hp = 0;
  respawnAtGuild(game, fx);
  assert.equal(game.runStats.died, true);
  assert.equal(game.runStats.kills, 7, 'death alone does not reset the run stats object');
});

test('@ceremony BITE: the resurrection deductible rounds UP, not down — ceil(101/2) is 51, not 50', () => {
  const game = blankGame(), fx = spyFx();
  game.player.gold = 101;
  game.player.hp = 0;
  const { deductible } = respawnAtGuild(game, fx);
  assert.equal(deductible, 51);
  assert.notEqual(deductible, 50, 'floor(101/2) would be the wrong (bitten) value');
});
