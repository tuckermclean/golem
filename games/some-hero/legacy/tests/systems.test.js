import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TL, ST, VIL, RUIN } from '../src/constants.js';
import { movePlayer, tickTimers, bufferAttack } from '../src/systems/movement.js';
import { usePotion } from '../src/systems/potions.js';
import { burst, updateParticles } from '../src/entities/particles.js';
import { clampCamera } from '../src/core/camera.js';
import { nearestNpc, villageNpcs } from '../src/entities/npc.js';
import { spawnOverworld } from '../src/world/spawn.js';
import { generateOverworld } from '../src/world/overworld.js';
import { mulberry32 } from '../src/core/rng.js';
import { updateGame } from '../src/core/update.js';
import { createGame, newRun } from '../src/core/game.js';
import { blankGame, seededGame, spyFx, VIEW } from './helpers.js';

test('movePlayer normalizes diagonals and sets facing', () => {
  const game = blankGame();
  const { x, y } = game.player;
  const m = movePlayer(game, 1, 1, 1);
  assert.ok(m > 1.4);
  const dx = game.player.x - x, dy = game.player.y - y;
  assert.ok(Math.abs(Math.hypot(dx, dy) - game.player.speed) < 1e-6, 'diagonal speed not boosted');
  assert.ok(Math.abs(game.player.fx - Math.SQRT1_2) < 1e-6);
});

test('movePlayer ignores dead-zone input and keeps facing', () => {
  const game = blankGame();
  game.player.fx = -1;
  movePlayer(game, 0.005, 0, 1);
  assert.equal(game.player.fx, -1);
});

test('tickTimers decays toward zero, never below', () => {
  const game = blankGame();
  game.player.inv = 0.05; game.player.atkT = 1; game.input.atkBuf = .15; game.pushCd = .1;
  tickTimers(game, 0.1);
  assert.equal(game.player.inv, 0);
  assert.equal(game.player.atkT, 0.9);
  assert.ok(Math.abs(game.input.atkBuf - 0.05) < 1e-9);
  assert.equal(game.pushCd, 0);
});

test('usePotion heals 6 capped at max, consumes one, and refuses when full/empty/not playing', () => {
  const game = blankGame(), fx = spyFx();
  game.player.hp = 3; game.player.potions = 1;   // bought, not issued
  assert.equal(usePotion(game, fx), true);
  assert.equal(game.player.hp, 9);
  assert.equal(game.player.potions, 0);
  assert.equal(usePotion(game, fx), false);          // empty
  game.player.potions = 1;
  game.player.hp = game.player.maxhp;
  assert.equal(usePotion(game, fx), false);          // full
  game.player.hp = 1; game.state = ST.MENU;
  assert.equal(usePotion(game, fx), false);          // not playing
});

test('particles spawn, drift and die', () => {
  let parts = [];
  burst(parts, 0, 0, 12, '#fff', mulberry32(1));
  assert.equal(parts.length, 12);
  parts = updateParticles(parts, 0.3);
  assert.equal(parts.length, 12);
  assert.notEqual(parts[0].x, 0);
  parts = updateParticles(parts, 1.0);
  assert.equal(parts.length, 0);
});

test('camera centers on the player and clamps to map edges', () => {
  const world = { w: 72, h: 72 };
  const cam = { x: 0, y: 0 };
  clampCamera(cam, { x: 36 * T, y: 36 * T }, world, { w: 800 });
  assert.equal(cam.x, 36 * T - 400);
  clampCamera(cam, { x: 0, y: 0 }, world, { w: 800 });
  assert.equal(cam.x, 0);
  assert.equal(cam.y, 0);
  clampCamera(cam, { x: 72 * T, y: 72 * T }, world, { w: 800 });
  assert.equal(cam.x, 72 * T - 800);
  assert.equal(cam.y, 72 * T - 480);
});

test('nearestNpc finds within 44px only', () => {
  const npcs = villageNpcs();
  const n = npcs[0];
  assert.equal(nearestNpc(npcs, n.x + 10, n.y), n);
  assert.equal(nearestNpc(npcs, n.x + 500, n.y + 500), null);
});

test('spawnOverworld: ~26+ fauna, none in the village, the Reenactor asleep at the Victory Site', () => {
  const world = generateOverworld(mulberry32(6));
  const s = spawnOverworld(world, mulberry32(6));
  assert.ok(s.enemies.length >= 20);
  for (const e of s.enemies) {
    if (e.kind === 'veteran') continue;  // veterans hold the Victory Site
    const d = Math.hypot(e.x / T - VIL.x, e.y / T - VIL.y);
    assert.ok(d >= 10, 'enemy spawned inside the village safe zone');
    assert.ok(e.kind === 'pigeon' || e.kind === 'goose', 'plaza fauna only');
  }
  assert.equal(s.boss.state, 'sleep');
  assert.equal(s.boss.name, 'the Reenactor');
  assert.match(s.boss.telegraph, /FAMOUS CHARGE/);
  const btx = s.boss.x / T, bty = s.boss.y / T;
  assert.ok(btx >= RUIN.x0 && btx <= RUIN.x1 && bty >= RUIN.y0 && bty <= RUIN.y1);
  assert.equal(s.npcs.length, 15);  // 10 original + 5 heist-path NPCs
  assert.equal(s.npcs.filter(n => n.name === 'Picketing Hero').length, 3, 'the picket line is a line');
  assert.ok(s.npcs.filter(n => n.name === 'Picketing Hero').every(n => n.sign), 'signs up');
  // the Glurp man's stand is ON the caravan road, properly up the road
  const gnoll = s.npcs.find(n => n.name === 'Gift Shop Gnoll');
  assert.ok(gnoll.stand, 'he has a stand');
  const gtx = Math.floor(gnoll.x / T), gty = Math.floor((gnoll.y + 4) / T);
  assert.equal(world.map[gty * world.w + gtx], TL.ROAD, 'the stand sits on the road');
  const gd = Math.hypot(gtx - VIL.x, gty - VIL.y);
  assert.ok(gd >= 10 && gd <= 18, 'properly up the road, got ' + gd.toFixed(1));
});

test('newRun resets the player and quest and repopulates', () => {
  const game = seededGame(2);
  game.player.gold = 999; game.player.lv = 9; game.quest.stage = 3; game.deepest = 5;
  newRun(game);
  assert.equal(game.player.gold, 0);
  assert.equal(game.player.lv, 1);
  assert.equal(game.quest.stage, 0);
  assert.equal(game.deepest, 0);
  assert.equal(game.zone, 'ow');
  assert.ok(game.enemies.length > 0);
});

test('updateGame is inert outside PLAY but still advances time', () => {
  const game = seededGame(3), fx = spyFx();
  game.state = ST.MENU;
  const x0 = game.player.x;
  updateGame(game, { mx: 1, my: 0 }, 1 / 60, VIEW, fx);
  assert.equal(game.player.x, x0);
  assert.ok(game.t > 0);
});

test('updateGame full frame: moves, reports nearby npc, clamps camera', () => {
  const game = seededGame(3), fx = spyFx();
  game.state = ST.PLAY;
  // park the player next to an npc
  const n = game.npcs[0];
  game.player.x = n.x + 20; game.player.y = n.y;
  game.player.tk = Math.floor(game.player.x / T) + ',' + Math.floor(game.player.y / T);
  updateGame(game, { mx: 0, my: 0 }, 1 / 60, VIEW, fx);
  assert.equal(fx.last('nearNpc')[1], n);

  // an interact press next to an npc requests dialogue instead of swinging
  bufferAttack(game);
  updateGame(game, { mx: 0, my: 0 }, 1 / 60, VIEW, fx);
  assert.equal(fx.count('requestTalk'), 1);
  assert.equal(game.player.atkT, 0, 'no swing happened');
});

test('updateGame publishes the live quest line while in the tomb', async () => {
  const game = seededGame(3), fx = spyFx();
  game.state = ST.PLAY;
  const { enterTomb } = await import('../src/world/zones.js');
  enterTomb(game, fx);
  updateGame(game, { mx: 0, my: 0 }, 1 / 60, VIEW, fx);
  assert.ok(fx.count('setQuestHTML') >= 1);
  assert.match(fx.last('setQuestHTML')[1], /Floor 1/);
});

test('Glurp refusals come with reasons; a drink is a wet glurp', () => {
  const game = blankGame(), fx = spyFx();
  game.player.potions = 0; game.player.hp = 3;
  usePotion(game, fx);
  assert.match(fx.last('toast')[1], /Out of Glurp/);
  game.player.potions = 1; game.player.hp = game.player.maxhp;
  usePotion(game, fx);
  assert.match(fx.last('toast')[1], /insufficiently hurt, sad, cursed, or dead-ish/);
  game.player.hp = 3;
  assert.equal(usePotion(game, fx), true);
  assert.equal(fx.last('sfx')[1], 'glurp');
});
