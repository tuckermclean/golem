import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropLoot } from '../src/systems/loot.js';
import { mulberry32 } from '../src/core/rng.js';

test('dropLoot always scatters 1-3 gold near the death point', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const pickups = [];
    dropLoot(pickups, 100, 200, mulberry32(seed));
    const gold = pickups.filter(p => p.kind === 'gold');
    assert.ok(gold.length >= 1 && gold.length <= 3, `gold count ${gold.length}`);
    for (const g of gold) {
      assert.ok(Math.abs(g.x - 100) <= 11 && Math.abs(g.y - 200) <= 11);
      assert.equal(g.v, 1);
    }
  }
});

test('bonus drop is heart ~10% topside; Glurp is sold, never found', () => {
  let hearts = 0, n = 4000;
  for (let seed = 0; seed < n; seed++) {
    const pickups = [];
    dropLoot(pickups, 0, 0, mulberry32(seed));
    hearts += pickups.filter(p => p.kind === 'heart').length;
    assert.ok(pickups.filter(p => p.kind === 'heart').length <= 1);
    assert.equal(pickups.filter(p => p.kind === 'potion').length, 0, 'no potion drops anywhere');
  }
  assert.ok(hearts / n > 0.07 && hearts / n < 0.13, `heart rate ${hearts / n}`);
});

test('the dungeon drops no heals: gold only (Glurp is the only medicine down there)', () => {
  const pickups = [];
  // a seed sweep would hit the 10%/6% branches topside; in the dungeon, never
  for (let s = 0; s < 60; s++) dropLoot(pickups, 0, 0, mulberry32(s), true);
  assert.ok(pickups.length >= 60, 'gold still scatters');
  assert.ok(pickups.every(p => p.kind === 'gold'), 'no hearts, no potions');
});
