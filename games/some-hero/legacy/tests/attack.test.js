import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TL, FINAL_FLOOR } from '../src/constants.js';
import { playerAttack, killBoss } from '../src/systems/attack.js';
import { bufferAttack } from '../src/systems/movement.js';
import { mkEnemy } from '../src/entities/enemy.js';
import { mkBoss } from '../src/entities/boss.js';
import { blankGame, spyFx } from './helpers.js';

test('attack needs a buffered press and respects the cooldown', () => {
  const game = blankGame(), fx = spyFx();
  assert.equal(playerAttack(game, fx), false);   // nothing buffered
  bufferAttack(game);
  assert.equal(playerAttack(game, fx), true);
  assert.equal(game.player.atkT, .34);
  bufferAttack(game);
  assert.equal(playerAttack(game, fx), false);   // still cooling down
});

test('swing hits enemies in front, not behind', () => {
  const game = blankGame(), fx = spyFx();
  game.player.fx = 1; game.player.fy = 0;
  const front = mkEnemy('scarab', game.player.x + 40, game.player.y);
  const behind = mkEnemy('scarab', game.player.x - 40, game.player.y);
  game.enemies = [front, behind];
  bufferAttack(game);
  playerAttack(game, fx);
  assert.ok(front.hp < front.maxhp, 'front enemy hit');
  assert.equal(behind.hp, behind.maxhp, 'behind enemy untouched');
});

test('swing lights a brazier in the tomb', () => {
  const game = blankGame({ fill: TL.TF }), fx = spyFx();
  game.zone = 'tomb';
  game.puzzle = { type: 'torch', n: 1, time: 8, solved: false };
  const tx = Math.floor((game.player.x + 30) / T), ty = Math.floor(game.player.y / T);
  game.torches = [{ tx, ty, lit: false, tm: 0 }];
  game.player.fx = 1; game.player.fy = 0;
  bufferAttack(game);
  playerAttack(game, fx);
  assert.equal(game.torches[0].lit, true);
  assert.equal(game.puzzle.solved, true);
});

test('hitting the sleeping boss wakes it', () => {
  const game = blankGame(), fx = spyFx();
  game.boss = mkBoss(game.player.x + 40, game.player.y);
  bufferAttack(game);
  playerAttack(game, fx);
  assert.ok(game.boss.hp < game.boss.maxhp);
  assert.equal(game.boss.state, 'idle');
});

test('overworld guardian death drops the amulet + gold and grants 100 xp', () => {
  const game = blankGame(), fx = spyFx();
  game.zone = 'ow';
  game.boss = mkBoss(200, 200, { hp: 1 });
  killBoss(game, fx);
  assert.ok(game.boss.dead);
  assert.equal(game.pickups.filter(p => p.kind === 'amulet').length, 1);
  assert.equal(game.pickups.filter(p => p.kind === 'gold').length, 6);
  assert.ok(game.player.lv > 1, '100 xp levels up from lv1');
});

test('tomb warden death drops a maxheart (and maybe a sword on deep floors)', () => {
  const game = blankGame(), fx = spyFx();
  game.zone = 'tomb'; game.floorNum = 8;
  game.player.swordLv = 1;
  game.boss = mkBoss(200, 200, { hp: 1 });
  killBoss(game, fx);
  assert.equal(game.pickups.filter(p => p.kind === 'maxheart').length, 1);
  assert.equal(game.pickups.filter(p => p.kind === 'amulet').length, 0);
  assert.match(fx.last('toast')[1], /Warden falls/);
});

test('full swing kill: attack -> dead enemy -> xp + loot', () => {
  const game = blankGame(), fx = spyFx();
  const e = mkEnemy('scarab', game.player.x + 40, game.player.y);
  e.hp = 1;
  game.enemies = [e];
  bufferAttack(game);
  playerAttack(game, fx);
  assert.ok(e.dead);
  assert.ok(game.player.xp > 0);
  assert.ok(game.pickups.length > 0);
});

test('a slap has the reach of a slap and does not launch a goose', () => {
  // beyond slap reach (14 + goose 12 = 26 from the hand) but within Pointy's (18 + 12 = 30)
  const game = blankGame(), fx = spyFx();
  game.player.swordLv = 0; game.player.fx = 1; game.player.fy = 0;
  const far = mkEnemy('goose', game.player.x + 24 + 27, game.player.y);
  game.enemies = [far];
  bufferAttack(game);
  playerAttack(game, fx);
  assert.equal(far.hp, far.maxhp, 'out of slap range');

  game.player.swordLv = 1; game.player.atkT = 0;
  bufferAttack(game);
  playerAttack(game, fx);
  assert.equal(far.hp, far.maxhp - 2, 'Pointy reaches');

  // knockback: a slap shoves at 56, a stick at 140
  const g2 = blankGame(), fx2 = spyFx();
  g2.player.swordLv = 0; g2.player.fx = 1; g2.player.fy = 0;
  const near = mkEnemy('goose', g2.player.x + 30, g2.player.y);
  g2.enemies = [near];
  bufferAttack(g2);
  playerAttack(g2, fx2);
  assert.equal(near.kbx, 56, 'a whap does not launch a goose');
  assert.equal(fx2.calls.find(c => c[0] === 'sfx')[1], 'slap');
});

test('reach is a property of the weapon: every tier swings further than the last', () => {
  // each enemy sits just beyond the previous tier's reach and inside its own
  // (hand at +24; hit when dist-from-hand < radius + goose 12)
  const RADII = [14, 18, 22, 26, 32];
  for (let tier = 1; tier <= 4; tier++) {
    const game = blankGame(), fx = spyFx();
    game.player.fx = 1; game.player.fy = 0;
    const dist = RADII[tier - 1] + 12 + 1;   // out of (tier-1)'s reach...
    assert.ok(dist < RADII[tier] + 12, 'and inside this tier\'s');
    const e = mkEnemy('goose', game.player.x + 24 + dist, game.player.y);
    game.enemies = [e];

    game.player.swordLv = tier - 1;
    bufferAttack(game);
    playerAttack(game, fx);
    assert.equal(e.hp, e.maxhp, 'tier ' + (tier - 1) + ' falls short at ' + dist);

    game.player.swordLv = tier; game.player.atkT = 0;
    bufferAttack(game);
    playerAttack(game, fx);
    assert.ok(e.hp < e.maxhp, 'tier ' + tier + ' connects at ' + dist);
  }
});

test('final boss killBoss: sets bossDead, grants xp, drops no loot', () => {
  const game = blankGame(), fx = spyFx();
  game.zone = 'tomb'; game.floorNum = FINAL_FLOOR;
  game.puzzle = { type: 'final', bossDead: false };
  game.boss = mkBoss(200, 200, { hp: 1, name: 'the Origenal Hero' });
  killBoss(game, fx);
  assert.ok(game.boss.dead, 'boss is dead');
  assert.equal(game.puzzle.bossDead, true, 'bossDead flag set');
  assert.equal(game.pickups.filter(p => p.kind === 'amulet').length, 0, 'no amulet dropped');
  assert.equal(game.pickups.filter(p => p.kind === 'maxheart').length, 0, 'no maxheart dropped');
  assert.ok(game.player.xp > 0, 'xp granted');
  assert.match(fx.last('toast')[1], /desk is yours/);
});
