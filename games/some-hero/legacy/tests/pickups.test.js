import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TL, ST } from '../src/constants.js';
import { updatePickups } from '../src/systems/pickups.js';
import { blankGame, spyFx } from './helpers.js';

function put(game, kind, dist = 0, v = 1) {
  const pk = { kind, x: game.player.x + dist, y: game.player.y, v };
  game.pickups.push(pk);
  return pk;
}

test('magnet pulls items inside 60px; collection inside 16px', () => {
  const game = blankGame(), fx = spyFx();
  const near = put(game, 'gold', 40);
  const far = put(game, 'gold', 200);
  const x0n = near.x, x0f = far.x;
  updatePickups(game, 1 / 60, fx);
  assert.ok(near.x < x0n, 'near item should be pulled in');
  assert.equal(far.x, x0f, 'far item should not move');
  assert.equal(game.pickups.length, 2);  // nothing collected yet
});

test('gold adds value; collected items are removed', () => {
  const game = blankGame(), fx = spyFx();
  put(game, 'gold', 5, 3);
  updatePickups(game, 1 / 60, fx);
  assert.equal(game.player.gold, 3);
  assert.equal(game.pickups.length, 0);
  assert.equal(fx.last('sfx')[1], 'coin');
  assert.equal(fx.count('hudChanged'), 1);
});

test('heart heals but never overheals', () => {
  const game = blankGame(), fx = spyFx();
  game.player.hp = 9;
  put(game, 'heart', 5, 2);
  updatePickups(game, 1 / 60, fx);
  assert.equal(game.player.hp, 10);
});

test('potion stocks up; maxheart raises the cap; sword upgrades to sun-steel (tier 4)', () => {
  const game = blankGame(), fx = spyFx();
  put(game, 'potion', 5);
  put(game, 'maxheart', 5, 2);
  put(game, 'sword', 5);
  updatePickups(game, 1 / 60, fx);
  assert.equal(game.player.potions, 1);   // started with none
  assert.equal(game.player.maxhp, 12);
  assert.equal(game.player.swordLv, 4);
  assert.equal(fx.count('toast'), 2);  // maxheart + sword
});

test('key only opens the seal on a key floor', () => {
  const game = blankGame(), fx = spyFx();
  game.puzzle = { type: 'key', have: false };
  put(game, 'key', 5);
  updatePickups(game, 1 / 60, fx);
  assert.equal(game.puzzle.have, true);

  const game2 = blankGame(), fx2 = spyFx();
  game2.puzzle = { type: 'plates', solved: false };
  put(game2, 'key', 5);
  updatePickups(game2, 1 / 60, fx2);
  assert.equal(game2.puzzle.solved, false);
});

test('amulet wins: stage 4, WIN state, trapdoor under the player, no immediate retrigger', () => {
  const game = blankGame(), fx = spyFx();
  put(game, 'amulet', 5);
  updatePickups(game, 1 / 60, fx);
  assert.equal(game.quest.stage, 4);
  assert.equal(game.state, ST.WIN);
  const atx = Math.floor(game.player.x / T), aty = Math.floor(game.player.y / T);
  assert.equal(game.world.map[aty * game.world.w + atx], TL.SD);
  assert.equal(game.player.tk, atx + ',' + aty);  // edge-trigger armed against retrigger
  assert.equal(fx.count('onAmuletFound'), 1);
});

test('the gap guestbook: one menace entry, the Ledger corrects the spelling', () => {
  const game = blankGame(), fx = spyFx();
  put(game, 'guestbook', 5);
  updatePickups(game, 1 / 60, fx);
  assert.equal(game.meta.menace.length, 1);
  assert.match(game.meta.menace[0].deed, /guestbook/);
  assert.match(fx.last('toast')[1], /minded it/);
  assert.match(fx.last('toast')[1], /origenal/, 'the Ledger has corrected the spelling');
  assert.equal(game.pickups.length, 0);
});
