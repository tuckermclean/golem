import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TL } from '../src/constants.js';
import { updateEnemies } from '../src/systems/enemies.js';
import { mkEnemy, ENEMY_TYPES, pickTombKind } from '../src/entities/enemy.js';
import { mulberry32 } from '../src/core/rng.js';
import { blankGame, spyFx, VIEW } from './helpers.js';

test('mkEnemy copies the archetype', () => {
  const e = mkEnemy('mummy', 10, 20);
  assert.equal(e.hp, ENEMY_TYPES.mummy.hp);
  assert.equal(e.w, ENEMY_TYPES.mummy.r * 2);
  assert.equal(e.ghost, false);
  assert.equal(mkEnemy('spirit', 0, 0).ghost, true);
});

test('pickTombKind never returns furniture (cabinets are placed, not spawned)', () => {
  for (const f of [1, 3, 5, 9]) {
    for (let s = 0; s < 100; s++) {
      const k = pickTombKind(f, mulberry32(s * 10 + f));
      assert.notEqual(k, 'cabinet');
      assert.ok(['skeleton', 'mailbat', 'consultant'].includes(k));
    }
  }
});

test('the wave: a struck cabinet wakes its neighbors with a delay, down the row', () => {
  const game = blankGame({ w: 40, h: 40 }), fx = spyFx();
  // three cabinets in a row, one tile apart; player far away
  const y = game.player.y, x0 = game.player.x + 300;
  const a = mkEnemy('cabinet', x0, y);
  const b = mkEnemy('cabinet', x0 + T, y);
  const c = mkEnemy('cabinet', x0 + T * 2, y);
  const far = mkEnemy('cabinet', x0 + T * 10, y);
  game.enemies = [a, b, c, far];

  a.provoked = true;            // as hitEnemy would set it...
  b.provokeT = .35;             // ...and arm the neighbor

  updateEnemies(game, .2, VIEW, fx);
  assert.equal(b.provoked, false, 'still counting down');
  updateEnemies(game, .2, VIEW, fx);
  assert.equal(b.provoked, true, 'the second drawer wakes');
  assert.ok(c.provokeT > 0, 'the third is armed');
  assert.equal(c.provoked, false);
  updateEnemies(game, .4, VIEW, fx);
  assert.equal(c.provoked, true, 'the wave reaches the end of the row');
  assert.equal(far.provoked, false, 'a different row sleeps on');
  assert.equal(far.provokeT, 0);
});

test('behavior flags: passive never chases or hurts; retaliators wait to be struck', () => {
  const game = blankGame(), fx = spyFx();
  // the intern, directly underfoot: no chase, no contact damage
  const slime = mkEnemy('slime', game.player.x + 5, game.player.y);
  game.enemies = [slime];
  updateEnemies(game, 1 / 60, VIEW, fx);
  assert.equal(game.player.hp, 10, 'the intern is harmless');

  // a pigeon in aggro range: peaceable until provoked
  const pigeon = mkEnemy('pigeon', game.player.x + 60, game.player.y);
  game.enemies = [pigeon];
  const x0 = pigeon.x;
  updateEnemies(game, 1 / 60, VIEW, fx);
  assert.ok(Math.abs(pigeon.x - x0) < 2, 'unprovoked pigeon does not charge');
  pigeon.provoked = true;
  updateEnemies(game, 1 / 60, VIEW, fx);
  assert.ok(pigeon.x < x0, 'provoked pigeon charges');
});

test('still furniture does not wander until provoked', () => {
  const game = blankGame({ w: 60, h: 60 }), fx = spyFx();
  const cab = mkEnemy('cabinet', game.player.x + 1000, game.player.y);
  game.enemies = [cab];
  const x0 = cab.x, y0 = cab.y;
  for (let i = 0; i < 60; i++) updateEnemies(game, 1 / 30, VIEW, fx);
  assert.equal(cab.x, x0, 'the cabinet is furniture');
  assert.equal(cab.y, y0);
  cab.provoked = true;
  for (let i = 0; i < 60; i++) updateEnemies(game, 1 / 30, VIEW, fx);
  assert.ok(cab.x !== x0 || cab.y !== y0, 'provoked furniture moves');
});

test('aggro: an enemy in range moves toward the player', () => {
  const game = blankGame(), fx = spyFx();
  const e = mkEnemy('jackal', game.player.x + 100, game.player.y);
  game.enemies = [e];
  const x0 = e.x;
  updateEnemies(game, 1 / 60, VIEW, fx);
  assert.ok(e.x < x0);
});

test('out of aggro range the enemy wanders instead', () => {
  const game = blankGame({ w: 60, h: 60 }), fx = spyFx();
  const e = mkEnemy('scarab', game.player.x + 1000, game.player.y);  // aggro 150
  game.enemies = [e];
  updateEnemies(game, 1 / 60, VIEW, fx);
  assert.ok(e.wt > 0, 'picked a wander heading');
});

test('ghosts phase through walls; solid enemies do not', () => {
  const game = blankGame({ w: 20, h: 20 }), fx = spyFx();
  // wall column between enemy and player
  const wallX = Math.floor(game.player.x / T) + 2;
  for (let y = 0; y < 20; y++) game.world.map[y * 20 + wallX] = TL.ROCK;
  const ghost = mkEnemy('spirit', (wallX + 2) * T, game.player.y);
  const solid = mkEnemy('mummy', (wallX + 2) * T, game.player.y + 4);
  game.enemies = [ghost, solid];
  const gx0 = ghost.x, sx0 = solid.x;
  for (let i = 0; i < 120; i++) updateEnemies(game, 1 / 30, VIEW, fx);
  assert.ok(ghost.x < gx0 - T, 'ghost crossed toward the player');
  // the solid enemy is stopped at the wall, strictly right of it
  assert.ok(solid.x > wallX * T, 'mummy held back by the wall');
  assert.ok(solid.x <= sx0, 'mummy did not pass');
});

test('knockback overrides chasing', () => {
  const game = blankGame(), fx = spyFx();
  const e = mkEnemy('jackal', game.player.x + 60, game.player.y);
  e.kb = .18; e.kbx = 140; e.kby = 0;
  game.enemies = [e];
  const x0 = e.x;
  updateEnemies(game, 1 / 60, VIEW, fx);
  assert.ok(e.x > x0, 'pushed away despite aggro');
});

test('contact deals damage; dead enemies are culled', () => {
  const game = blankGame(), fx = spyFx();
  const toucher = mkEnemy('scarab', game.player.x + 5, game.player.y);
  const corpse = mkEnemy('scarab', 50, 50);
  corpse.dead = true;
  game.enemies = [toucher, corpse];
  updateEnemies(game, 1 / 60, VIEW, fx);
  assert.equal(game.player.hp, 10 - toucher.dmg);
  assert.equal(game.enemies.length, 1);
  assert.equal(game.enemies[0], toucher);
});

test('far off-screen enemies are skipped entirely', () => {
  const game = blankGame({ w: 100, h: 100 }), fx = spyFx();
  const e = mkEnemy('jackal', game.player.x + VIEW.w * 2, game.player.y);
  game.enemies = [e];
  const x0 = e.x;
  updateEnemies(game, 1 / 60, VIEW, fx);
  assert.equal(e.x, x0);
});
