import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T } from '../src/constants.js';
import { stairsOpen, sealMsg, checkPlates, checkTraps, updateTorches, igniteBraziers } from '../src/systems/puzzles.js';
import { blankGame, spyFx } from './helpers.js';

test('stairsOpen for each seal type', () => {
  const game = blankGame();
  game.puzzle = null;
  assert.equal(stairsOpen(game), true);

  game.puzzle = { type: 'warden' };
  game.boss = { dead: false };
  assert.equal(stairsOpen(game), false);
  game.boss.dead = true;
  assert.equal(stairsOpen(game), true);
  game.boss = null;                       // warden floor with no boss = open
  assert.equal(stairsOpen(game), true);

  game.puzzle = { type: 'key', have: false };
  assert.equal(stairsOpen(game), false);
  game.puzzle.have = true;
  assert.equal(stairsOpen(game), true);

  game.puzzle = { type: 'plates', solved: false };
  assert.equal(stairsOpen(game), false);
  game.puzzle.solved = true;
  assert.equal(stairsOpen(game), true);

  game.puzzle = { type: 'traps', need: 3, done: 0, solved: false };
  assert.equal(stairsOpen(game), false);
  game.puzzle.solved = true;
  assert.equal(stairsOpen(game), true);
});

test('sealMsg names each seal', () => {
  assert.match(sealMsg({ type: 'warden' }), /Warden/);
  assert.match(sealMsg({ type: 'key' }), /bronze key/);
  assert.match(sealMsg({ type: 'plates', done: 1, need: 2 }), /1\/2/);
  assert.match(sealMsg({ type: 'torch', n: 3 }), /3 braziers/);
  assert.match(sealMsg({ type: 'traps', done: 1, need: 4 }), /1\/4/);
  assert.match(sealMsg({ type: 'traps', done: 1, need: 4 }), /Step on them/);
});

test('checkTraps fires each trap once, counts incidents, and opens at the quota', () => {
  const game = blankGame(), fx = spyFx();
  game.puzzle = { type: 'traps', need: 2, done: 0, solved: false };
  const ptx = Math.floor(game.player.x / T), pty = Math.floor(game.player.y / T);
  game.traps = [{ tx: ptx, ty: pty, hit: false }, { tx: ptx + 3, ty: pty, hit: false }];

  checkTraps(game, fx);
  assert.equal(game.puzzle.done, 1);
  assert.equal(game.traps[0].hit, true);
  assert.equal(game.puzzle.solved, false);
  assert.match(fx.last('toast')[1], /INCIDENT #1 OF 2/);
  assert.equal(fx.last('sfx')[1], 'click');

  // standing on a fired trap does not double-count
  checkTraps(game, fx);
  assert.equal(game.puzzle.done, 1);

  // the second trap meets the quota and opens the seal
  game.player.x = (ptx + 3) * T + T / 2;
  checkTraps(game, fx);
  assert.equal(game.puzzle.done, 2);
  assert.equal(game.puzzle.solved, true);
  assert.equal(stairsOpen(game), true);
  assert.match(fx.last('toast')[1], /INCIDENT QUOTA MET/);
  assert.ok(fx.calls.some(c => c[0] === 'sfx' && c[1] === 'level'));

  // solved is latched; nothing more fires
  const before = fx.calls.length;
  checkTraps(game, fx);
  assert.equal(fx.calls.length, before);
});

test('checkPlates counts covered plates and solves when all covered', () => {
  const game = blankGame(), fx = spyFx();
  game.puzzle = { type: 'plates', need: 2, done: 0, solved: false };
  game.plates = [{ tx: 2, ty: 2, on: false }, { tx: 5, ty: 5, on: false }];
  game.blocks = [{ tx: 2, ty: 2 }, { tx: 9, ty: 9 }];

  checkPlates(game, fx);
  assert.equal(game.puzzle.done, 1);
  assert.equal(game.puzzle.solved, false);
  assert.equal(game.plates[0].on, true);

  game.blocks[1].tx = 5; game.blocks[1].ty = 5;
  checkPlates(game, fx);
  assert.equal(game.puzzle.solved, true);
  assert.equal(fx.count('toast'), 1);

  // solving is latched: uncovering afterwards doesn't unsolve
  game.blocks.length = 0;
  checkPlates(game, fx);
  assert.equal(game.puzzle.solved, true);
});

test('torch timers burn down and douse', () => {
  const game = blankGame(), fx = spyFx();
  game.puzzle = { type: 'torch', n: 2, time: 5, solved: false };
  game.torches = [{ tx: 1, ty: 1, lit: true, tm: 0.3 }, { tx: 2, ty: 2, lit: false, tm: 0 }];
  updateTorches(game, 0.2, fx);
  assert.equal(game.torches[0].lit, true);
  updateTorches(game, 0.2, fx);
  assert.equal(game.torches[0].lit, false);
  assert.equal(fx.last('sfx')[1], 'douse');
});

test('torch timers freeze once solved', () => {
  const game = blankGame(), fx = spyFx();
  game.puzzle = { type: 'torch', n: 1, time: 5, solved: true };
  game.torches = [{ tx: 1, ty: 1, lit: true, tm: 0.1 }];
  updateTorches(game, 1, fx);
  assert.equal(game.torches[0].lit, true);
});

test('igniteBraziers lights in range, solves when all burn at once', () => {
  const game = blankGame(), fx = spyFx();
  game.zone = 'tomb';
  game.puzzle = { type: 'torch', n: 2, time: 8, solved: false };
  game.torches = [
    { tx: 3, ty: 3, lit: false, tm: 0 },
    { tx: 9, ty: 9, lit: false, tm: 0 }
  ];
  // strike right on top of the first brazier
  const lit = igniteBraziers(game, 3 * T + T / 2, 3 * T + T / 2, 30, fx);
  assert.equal(lit, 1);
  assert.equal(game.torches[0].lit, true);
  assert.equal(game.torches[0].tm, 8);
  assert.equal(game.puzzle.solved, false);

  igniteBraziers(game, 9 * T + T / 2, 9 * T + T / 2, 30, fx);
  assert.equal(game.puzzle.solved, true);
  assert.match(fx.last('toast')[1], /seal lifts/);
});

test('igniteBraziers ignores far strikes and relighting', () => {
  const game = blankGame(), fx = spyFx();
  game.puzzle = { type: 'torch', n: 1, time: 8, solved: false };
  game.torches = [{ tx: 3, ty: 3, lit: false, tm: 0 }];
  assert.equal(igniteBraziers(game, 0, 0, 30, fx), 0);
  game.torches[0].lit = true;
  assert.equal(igniteBraziers(game, 3 * T + T / 2, 3 * T + T / 2, 30, fx), 0);
});
