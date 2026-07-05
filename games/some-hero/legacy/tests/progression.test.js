import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpNeed, gainXp } from '../src/systems/progression.js';
import { blankGame, spyFx } from './helpers.js';

test('xpNeed scales quadratically: early levels move, mid-game wants bosses', () => {
  assert.equal(xpNeed({ lv: 1 }), 28);
  assert.equal(xpNeed({ lv: 2 }), 52);
  assert.equal(xpNeed({ lv: 3 }), 92);
  assert.equal(xpNeed({ lv: 5 }), 220);
});

test('gainXp below threshold just accumulates', () => {
  const game = blankGame(), fx = spyFx();
  gainXp(game, 10, fx);
  assert.equal(game.player.lv, 1);
  assert.equal(game.player.xp, 10);
  assert.equal(fx.count('hudChanged'), 1);
});

test('level up: +2 maxhp, +2 hp (NOT a full heal), xp carries over', () => {
  const game = blankGame(), fx = spyFx();
  game.player.hp = 4;
  gainXp(game, 31, fx);  // need 28 at lv1
  assert.equal(game.player.lv, 2);
  assert.equal(game.player.maxhp, 12);
  assert.equal(game.player.hp, 6, 'capacity gained, wounds kept — the gap persists');
  assert.equal(game.player.xp, 3);
  assert.equal(fx.count('sfx'), 1);
  assert.ok(game.parts.length >= 18);
});

test('a huge grant cascades through multiple levels', () => {
  const game = blankGame(), fx = spyFx();
  gainXp(game, 28 + 52 + 10, fx);
  assert.equal(game.player.lv, 3);
  assert.equal(game.player.xp, 10);
  assert.equal(game.player.maxhp, 14);
});
