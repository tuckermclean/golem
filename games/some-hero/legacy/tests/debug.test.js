// The cheat menu's headless half: every playtest jump must keep the same
// invariants the real game keeps, or the Ledger/customs/grading would crash
// on states no honest player can reach.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TL, ST, VIL } from '../src/constants.js';
import { gotoVillage, gotoTrapdoor, gotoFloor, setQuestStage, dieNow, triggerWin } from '../src/systems/debug.js';
import { respawnAtGuild } from '../src/systems/respawn.js';
import { hurtPlayer } from '../src/systems/combat.js';
import { updatePickups } from '../src/systems/pickups.js';
import { questLabel } from '../src/systems/quest.js';
import { seededGame, blankGame, spyFx } from './helpers.js';

test('gotoFloor from topside starts a real run and keeps every invariant', () => {
  const game = seededGame(31), fx = spyFx();
  game.state = ST.PLAY;
  gotoFloor(game, 8, fx);
  assert.equal(game.zone, 'tomb');
  assert.equal(game.floorNum, 8);
  assert.ok(game.owSave, 'overworld stashed');
  assert.equal(game.meta.runs, 1, 'exactly one run started');
  assert.equal(game.meta.day, 2);
  assert.equal(game.runStats.depth, 8);
  assert.equal(game.deepest, 8);
  // the destination floor announces itself; intermediates were muted
  assert.match(fx.last('toast')[1], /Floor 8/);

  // jumping shallower within the run re-ticks nothing
  gotoFloor(game, 3, fx);
  assert.equal(game.floorNum, 3);
  assert.equal(game.meta.runs, 1, 'still the same run');
  assert.equal(game.deepest, 8, 'depth record keeps its max');
});

test('gotoVillage from deep in the dungeon restores the surface exactly', () => {
  const game = seededGame(32), fx = spyFx();
  game.state = ST.PLAY;
  const owWorld = game.world, owNpcs = game.npcs;
  gotoFloor(game, 5, fx);
  gotoVillage(game, fx);
  assert.equal(game.zone, 'ow');
  assert.equal(game.world, owWorld, 'the surface persists exactly');
  assert.equal(game.npcs, owNpcs);
  assert.equal(game.owSave, null);
  assert.deepEqual(game.traps, []);
  assert.equal(Math.floor(game.player.x / T), VIL.x + 1);
  // death processing still works from here (no dangling owSave)
  game.player.hp = 0;
  respawnAtGuild(game, fx);   // smoke: no crash
});

test('gotoTrapdoor carves a trapdoor when the medallion has not, and stands you beside it', () => {
  const game = seededGame(33), fx = spyFx();
  game.state = ST.PLAY;
  gotoTrapdoor(game, fx);
  const ptx = Math.floor(game.player.x / T), pty = Math.floor(game.player.y / T);
  assert.equal(game.world.map[pty * game.world.w + (ptx + 1)], TL.SD, 'trapdoor one step east');
  assert.equal(game.zone, 'ow');
});

test('god mode: hurtPlayer is a no-op, no hurt sfx, no death', () => {
  const game = blankGame(), fx = spyFx();
  game.debug.god = true;
  game.player.hp = 1;
  assert.equal(hurtPlayer(game, 999, fx, 'goose'), false);
  assert.equal(game.player.hp, 1);
  assert.equal(game.state, ST.PLAY);
  assert.ok(!fx.calls.some(c => c[0] === 'sfx' && c[1] === 'hurt'));
});

test('dieNow goes through the real death path, despite i-frames', () => {
  const game = blankGame(), fx = spyFx();
  game.player.inv = 5;
  dieNow(game, fx);
  assert.equal(game.state, ST.DEAD);
  assert.equal(fx.count('onPlayerDeath'), 1);
});

test('setQuestStage keeps the kill counter consistent and labels render', () => {
  const game = blankGame(), fx = spyFx();
  for (let n = 0; n <= 4; n++) {
    setQuestStage(game, n, fx);
    assert.equal(game.quest.stage, n);
    assert.ok(questLabel(game.quest, 0).length > 0);
  }
  assert.equal(game.quest.kills, game.quest.need, 'stage 4 implies the hunt is done');
  setQuestStage(game, 1, fx);
  assert.equal(game.quest.kills, 0, 'restarting the hunt resets kills');
});

test('triggerWin drops the medallion; the magnet finishes the job', () => {
  const game = blankGame(), fx = spyFx();
  triggerWin(game, fx);
  updatePickups(game, 1 / 60, fx);
  assert.equal(game.state, ST.WIN);
  assert.equal(game.quest.stage, 4);
  assert.equal(fx.count('onAmuletFound'), 1);
});

test('gotoFloor respects the day: jumping around restores cached floors', () => {
  const game = seededGame(34), fx = spyFx();
  game.state = ST.PLAY;
  gotoFloor(game, 8, fx);
  const f8world = game.world;
  gotoFloor(game, 3, fx);
  assert.equal(game.floorNum, 3);
  gotoFloor(game, 8, fx);
  assert.equal(game.world, f8world, 'floor 8 came back as left, not regenerated');
});
