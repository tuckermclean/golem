import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TL } from '../src/constants.js';
import { tileAt, solidAt, boxFree, moveEnt, tileWalkable } from '../src/world/tilemap.js';

function world3x3(tiles) {
  return { map: Uint8Array.from(tiles), w: 3, h: 3 };
}

test('tileAt reads tiles and treats out-of-bounds as ROCK', () => {
  const w = world3x3([TL.SAND, TL.WATER, TL.SAND, TL.SAND, TL.ROCK, TL.SAND, TL.SAND, TL.SAND, TL.SAND]);
  assert.equal(tileAt(w, 1, 0), TL.WATER);
  assert.equal(tileAt(w, 1, 1), TL.ROCK);
  assert.equal(tileAt(w, -1, 0), TL.ROCK);
  assert.equal(tileAt(w, 0, 3), TL.ROCK);
});

test('solidAt maps pixel coords through SOLID table', () => {
  const w = world3x3([TL.SAND, TL.WATER, TL.SAND, TL.SAND, TL.SAND, TL.SAND, TL.SAND, TL.SAND, TL.SAND]);
  assert.equal(solidAt(w, T * 1.5, T * 0.5), true);   // water
  assert.equal(solidAt(w, T * 0.5, T * 0.5), false);  // sand
});

test('boxFree rejects overlap with solid tiles and with blocks', () => {
  const w = world3x3(new Array(9).fill(TL.SAND));
  assert.equal(boxFree(w, [], T + 2, T + 2, 18, 18), true);
  // a block parked on tile (1,1)
  assert.equal(boxFree(w, [{ tx: 1, ty: 1 }], T + 2, T + 2, 18, 18), false);
  // box poking into a wall
  const w2 = world3x3([TL.SAND, TL.ROCK, TL.SAND, TL.SAND, TL.SAND, TL.SAND, TL.SAND, TL.SAND, TL.SAND]);
  assert.equal(boxFree(w2, [], T - 9, 2, 18, 18), false);
});

test('moveEnt resolves axes independently (wall slide)', () => {
  // wall to the right of the entity; moving diagonally should still move in y
  const w = world3x3([
    TL.SAND, TL.ROCK, TL.SAND,
    TL.SAND, TL.ROCK, TL.SAND,
    TL.SAND, TL.SAND, TL.SAND
  ]);
  const e = { x: T * 0.5, y: T * 0.5, w: 18, h: 18 };
  moveEnt(w, [], e, 30, 10);   // x blocked by rock column, y free
  assert.equal(e.x, T * 0.5);
  assert.equal(e.y, T * 0.5 + 10);
});

test('moveEnt moves freely on open ground', () => {
  const w = world3x3(new Array(9).fill(TL.SAND));
  const e = { x: T, y: T, w: 10, h: 10 };
  moveEnt(w, [], e, 5, -3);
  assert.equal(e.x, T + 5);
  assert.equal(e.y, T - 3);
});

test('tileWalkable: tomb floor and plates yes; walls and blocked tiles no', () => {
  const w = world3x3([
    TL.TW, TL.TW, TL.TW,
    TL.TW, TL.TF, TL.PLATE,
    TL.TW, TL.SU, TL.TW
  ]);
  assert.equal(tileWalkable(w, [], 1, 1), true);
  assert.equal(tileWalkable(w, [], 2, 1), true);            // plate
  assert.equal(tileWalkable(w, [], 0, 0), false);           // wall
  assert.equal(tileWalkable(w, [], 1, 2), false);           // stairs are not pushable-onto
  assert.equal(tileWalkable(w, [{ tx: 1, ty: 1 }], 1, 1), false); // occupied by block
});
