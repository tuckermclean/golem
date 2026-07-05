// Overworld generation: desert noise, oasis water, palms, village clearing,
// ruins with a south gate, and a caravan road that guarantees the way from
// the village to the ruins is passable.

import { TL, OVERWORLD, VIL, RUIN } from '../constants.js';
import { makeHash2, makeNoise } from '../core/rng.js';

/**
 * @param {function():number} rng - Math.random-compatible source for the seeds.
 * @returns world: { map, w, h, seedX, seedY, h2, noise }
 */
export function generateOverworld(rng = Math.random) {
  const w = OVERWORLD.W, h = OVERWORLD.H;
  const seedX = rng() * 999, seedY = rng() * 999;
  const h2 = makeHash2(seedX, seedY);
  const noise = makeNoise(h2);
  const map = new Uint8Array(w * h);

  // base terrain
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = noise(x * .085, y * .085) * .7 + noise(x * .2, y * .2) * .3;
    let v = TL.SAND;
    if (n < .30) v = TL.WATER;
    else if (n > .74) v = TL.ROCK;
    else if (n > .6) v = TL.DUNE;
    map[y * w + x] = v;
  }

  // palms next to water
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (map[y * w + x] === TL.SAND) {
      let nearW = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        if (map[(y + dy) * w + x + dx] === TL.WATER) nearW = true;
      if (nearW && h2(x * 3, y * 7) < .3) map[y * w + x] = TL.PALM;
    }
  }

  // village clearing + well
  for (let y = VIL.y - 6; y <= VIL.y + 6; y++) for (let x = VIL.x - 6; x <= VIL.x + 6; x++) {
    const d = Math.hypot(x - VIL.x, y - VIL.y);
    if (d < 6.3) map[y * w + x] = d < 3.4 ? TL.PAVE : TL.SAND;
  }
  map[VIL.y * w + VIL.x] = TL.WELL;

  // ruins: walled rectangle, south gate, scattered pillars
  for (let y = RUIN.y0; y <= RUIN.y1; y++) for (let x = RUIN.x0; x <= RUIN.x1; x++) {
    let v = TL.RFLOOR;
    const edge = (x === RUIN.x0 || x === RUIN.x1 || y === RUIN.y0 || y === RUIN.y1);
    if (edge && !(y === RUIN.y1 && Math.abs(x - (RUIN.x0 + RUIN.x1) / 2) < 2)) v = TL.RWALL;
    else if (!edge && x % 4 === 1 && y % 4 === 1 && h2(x, y) < .7) v = TL.RWALL;
    map[y * w + x] = v;
  }

  // caravan road: village -> ruins gate, clearing obstacles as it goes
  let rx = VIL.x, ry = VIL.y;
  const gx = Math.floor((RUIN.x0 + RUIN.x1) / 2), gy = RUIN.y1 + 1;
  while (rx !== gx || ry !== gy) {
    if (rx !== gx && (ry === gy || h2(rx, ry) < .55)) rx += Math.sign(gx - rx);
    else ry += Math.sign(gy - ry);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = rx + dx, Y = ry + dy;
      if (X < 1 || Y < 1 || X >= w - 1 || Y >= h - 1) continue;
      const cur = map[Y * w + X];
      if (cur === TL.WATER || cur === TL.ROCK || cur === TL.PALM || cur === TL.DUNE)
        map[Y * w + X] = (dx === 0 && dy === 0) ? TL.ROAD : TL.SAND;
      else if (dx === 0 && dy === 0 && cur === TL.SAND) map[Y * w + X] = TL.ROAD;
    }
  }

  // rock border
  for (let i = 0; i < w; i++) { map[i] = TL.ROCK; map[(h - 1) * w + i] = TL.ROCK; }
  for (let i = 0; i < h; i++) { map[i * w] = TL.ROCK; map[i * w + w - 1] = TL.ROCK; }

  return { map, w, h, seedX, seedY, h2, noise };
}
