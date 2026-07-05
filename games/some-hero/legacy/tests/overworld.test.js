import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TL, SOLID, VIL, RUIN, OVERWORLD } from '../src/constants.js';
import { generateOverworld } from '../src/world/overworld.js';
import { mulberry32 } from '../src/core/rng.js';

test('overworld has the right dimensions and a rock border', () => {
  const w = generateOverworld(mulberry32(3));
  assert.equal(w.w, OVERWORLD.W);
  assert.equal(w.h, OVERWORLD.H);
  for (let i = 0; i < w.w; i++) {
    assert.equal(w.map[i], TL.ROCK);
    assert.equal(w.map[(w.h - 1) * w.w + i], TL.ROCK);
  }
  for (let i = 0; i < w.h; i++) {
    assert.equal(w.map[i * w.w], TL.ROCK);
    assert.equal(w.map[i * w.w + w.w - 1], TL.ROCK);
  }
});

test('village well sits at VIL and is surrounded by walkable clearing', () => {
  const w = generateOverworld(mulberry32(5));
  assert.equal(w.map[VIL.y * w.w + VIL.x], TL.WELL);
  // immediate ring is paved (clearing radius 3.4 paves everything within)
  assert.equal(w.map[VIL.y * w.w + VIL.x + 1], TL.PAVE);
  assert.equal(w.map[(VIL.y + 1) * w.w + VIL.x], TL.PAVE);
});

test('ruins gate exists on the south wall', () => {
  const w = generateOverworld(mulberry32(9));
  const gx = Math.floor((RUIN.x0 + RUIN.x1) / 2);
  assert.notEqual(w.map[RUIN.y1 * w.w + gx], TL.RWALL);
});

test('village is reachable from the ruins gate over walkable tiles (10 seeds)', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const w = generateOverworld(mulberry32(seed));
    // BFS over non-solid tiles from village to the gate approach tile
    const gx = Math.floor((RUIN.x0 + RUIN.x1) / 2), gy = RUIN.y1 + 1;
    const start = VIL.y * w.w + VIL.x + 1; // next to the (solid) well
    const target = gy * w.w + gx;
    const seen = new Uint8Array(w.w * w.h);
    const q = [start]; seen[start] = 1;
    let found = false;
    while (q.length) {
      const i = q.pop();
      if (i === target) { found = true; break; }
      const x = i % w.w, y = (i / w.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
        const j = ny * w.w + nx;
        if (seen[j] || SOLID[w.map[j]]) continue;
        seen[j] = 1; q.push(j);
      }
    }
    assert.ok(found, `seed ${seed}: no walkable path from village to ruins gate`);
  }
});

test('generation is deterministic for a given rng seed', () => {
  const a = generateOverworld(mulberry32(77));
  const b = generateOverworld(mulberry32(77));
  assert.deepEqual(Array.from(a.map), Array.from(b.map));
});
