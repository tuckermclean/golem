import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, makeHash2, makeNoise } from '../src/core/rng.js';

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('mulberry32 outputs stay in [0,1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('different seeds diverge', () => {
  const a = mulberry32(1), b = mulberry32(2);
  let same = 0;
  for (let i = 0; i < 50; i++) if (a() === b()) same++;
  assert.ok(same < 5);
});

test('hash2 is deterministic and in [0,1)', () => {
  const h = makeHash2(123.4, 567.8);
  assert.equal(h(3, 9), h(3, 9));
  for (let i = 0; i < 200; i++) {
    const v = h(i * 1.7, i * 0.3);
    assert.ok(v >= 0 && v < 1);
  }
});

test('value noise interpolates smoothly and stays in range', () => {
  const noise = makeNoise(makeHash2(11, 22));
  // exact lattice points equal the hash
  const h = makeHash2(11, 22);
  assert.ok(Math.abs(noise(4, 7) - h(4, 7)) < 1e-9);
  // small steps produce small changes
  let prev = noise(0, 0);
  for (let x = 0.01; x < 1; x += 0.01) {
    const v = noise(x, 0);
    assert.ok(v >= 0 && v < 1);
    assert.ok(Math.abs(v - prev) < 0.2, 'noise jumped discontinuously');
    prev = v;
  }
});
