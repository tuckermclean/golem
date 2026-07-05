import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TL } from '../src/constants.js';
import { tryPushBlock, settleBlocks } from '../src/systems/blocks.js';
import { blankGame, spyFx } from './helpers.js';

function tombGame() {
  const game = blankGame({ w: 10, h: 10, fill: TL.TF });
  game.zone = 'tomb';
  // player pressed up against the block at (5,5), as in real play
  game.player.x = 5 * T - game.player.w / 2;  // right edge touches the block
  game.player.y = 5 * T + T / 2;
  game.blocks = [{ tx: 5, ty: 5, rx: 5 * T, ry: 5 * T }];
  return game;
}

test('pushing a block into open floor moves it and sets the cooldown', () => {
  const game = tombGame(), fx = spyFx();
  assert.equal(tryPushBlock(game, 1, 0, 1, fx), true);
  assert.equal(game.blocks[0].tx, 6);
  assert.equal(game.pushCd, .24);
  assert.equal(fx.last('sfx')[1], 'push');
});

test('a wall behind the block refuses the push (longer cooldown)', () => {
  const game = tombGame(), fx = spyFx();
  game.world.map[5 * 10 + 6] = TL.TW;  // wall at (6,5)
  assert.equal(tryPushBlock(game, 1, 0, 1, fx), false);
  assert.equal(game.blocks[0].tx, 5);
  assert.equal(game.pushCd, .3);
});

test('another block behind refuses the push', () => {
  const game = tombGame(), fx = spyFx();
  game.blocks.push({ tx: 6, ty: 5, rx: 6 * T, ry: 5 * T });
  assert.equal(tryPushBlock(game, 1, 0, 1, fx), false);
});

test('push requires the tomb, real input magnitude, and no cooldown', () => {
  const game = tombGame(), fx = spyFx();
  game.zone = 'ow';
  assert.equal(tryPushBlock(game, 1, 0, 1, fx), false);
  game.zone = 'tomb';
  assert.equal(tryPushBlock(game, 1, 0, 0.3, fx), false);  // soft input
  game.pushCd = 1;
  assert.equal(tryPushBlock(game, 1, 0, 1, fx), false);    // cooling down
});

test('dominant axis decides the push direction', () => {
  const game = tombGame(), fx = spyFx();
  // mostly-vertical input pushes nothing (no block below)
  assert.equal(tryPushBlock(game, 0.3, 1, 1, fx), false);
  // mostly-horizontal pushes the block right
  assert.equal(tryPushBlock(game, 1, 0.3, 1, fx), true);
});

test('pushing a block onto a plate solves the plates puzzle', () => {
  const game = tombGame(), fx = spyFx();
  game.puzzle = { type: 'plates', need: 1, done: 0, solved: false };
  game.world.map[5 * 10 + 6] = TL.PLATE;
  game.plates = [{ tx: 6, ty: 5, on: false }];
  tryPushBlock(game, 1, 0, 1, fx);
  assert.equal(game.puzzle.solved, true);
  assert.equal(game.plates[0].on, true);
});

test('settleBlocks eases render position toward the tile', () => {
  const blocks = [{ tx: 6, ty: 5, rx: 5 * T, ry: 5 * T }];
  for (let i = 0; i < 60; i++) settleBlocks(blocks, 1 / 60);
  assert.ok(Math.abs(blocks[0].rx - 6 * T) < 1);
  assert.equal(blocks[0].ry, 5 * T);
});
