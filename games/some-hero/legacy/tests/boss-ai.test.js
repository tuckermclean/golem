import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateBoss } from '../src/systems/boss-ai.js';
import { mkBoss, wardenStats } from '../src/entities/boss.js';
import { blankGame, spyFx } from './helpers.js';

function bossGame(dist = 400) {
  const game = blankGame({ w: 30, h: 30 });
  game.boss = mkBoss(game.player.x + dist, game.player.y);
  return game;
}

test('boss sleeps until the player comes within 170px', () => {
  const game = bossGame(400), fx = spyFx();
  updateBoss(game, 1 / 60, fx);
  assert.equal(game.boss.state, 'sleep');

  game.boss.x = game.player.x + 150;
  updateBoss(game, 1 / 60, fx);
  assert.equal(game.boss.state, 'idle');
  assert.equal(fx.last('sfx')[1], 'boss');
});

test('idle creeps toward the player, then telegraphs, then dashes', () => {
  const game = bossGame(150), fx = spyFx();
  updateBoss(game, 1 / 60, fx);          // wake
  const x0 = game.boss.x;
  updateBoss(game, 0.5, fx);             // idle creep
  assert.ok(game.boss.x < x0, 'creeps toward player');
  updateBoss(game, 0.6, fx);             // idle timer expires
  assert.equal(game.boss.state, 'tele');
  updateBoss(game, 0.6, fx);             // telegraph expires
  assert.equal(game.boss.state, 'dash');
  assert.ok(game.boss.vx < 0, 'dash aims at the player');
  assert.ok(Math.hypot(game.boss.vx, game.boss.vy) > 400);
  const xd = game.boss.x;
  updateBoss(game, 0.1, fx);
  assert.ok(game.boss.x < xd, 'dash moves fast');
  updateBoss(game, 0.6, fx);             // dash ends
  assert.equal(game.boss.state, 'idle');
});

test('contact with the boss hurts the player', () => {
  const game = bossGame(10), fx = spyFx();
  game.boss.state = 'idle'; game.boss.timer = 5;
  updateBoss(game, 1 / 60, fx);
  assert.ok(game.player.hp < 10);
});

test('dead or missing boss is inert', () => {
  const game = bossGame(10), fx = spyFx();
  game.boss.dead = true;
  updateBoss(game, 1, fx);
  assert.equal(game.player.hp, 10);
  game.boss = null;
  updateBoss(game, 1, fx);  // no throw
});

test('warden stats scale with floor; floor 4 is the Middle Manager himself', () => {
  const w4 = wardenStats(4);
  assert.equal(w4.hp, Math.ceil(40 * 1.72));
  assert.equal(w4.dmg, 2);
  assert.equal(w4.name, 'the Middle Manager');
  assert.match(w4.telegraph, /circle back/);
  assert.equal(wardenStats(8).dmg, 3);
  assert.equal(wardenStats(8).name, 'the Warden');
  assert.ok(wardenStats(12).hp > wardenStats(4).hp);
});
