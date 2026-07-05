// Populate a freshly generated overworld: plaza fauna (mostly peaceable —
// the kingdom is a certified Safe Workplace; the goose declined
// certification), the veterans still securing the Victory Site, the
// Reenactor mid-performance, and the village NPCs.

import { T, TL, VIL, RUIN } from '../constants.js';
import { tileAt } from './tilemap.js';
import { mkEnemy } from '../entities/enemy.js';
import { mkBoss } from '../entities/boss.js';
import { villageNpcs } from '../entities/npc.js';

export function spawnOverworld(world, rng = Math.random) {
  const enemies = [];
  const onSand = (x, y) => {
    const v = tileAt(world, x, y);
    return v === TL.SAND || v === TL.DUNE || v === TL.ROAD;
  };

  let tries = 0;
  while (enemies.length < 26 && tries++ < 3000) {
    const x = 2 + (rng() * (world.w - 4)) | 0, y = 2 + (rng() * (world.h - 4)) | 0;
    if (!onSand(x, y)) continue;
    if (Math.hypot(x - VIL.x, y - VIL.y) < 11) continue;                       // village safe zone
    if (x >= RUIN.x0 - 2 && x <= RUIN.x1 + 2 && y >= RUIN.y0 - 2 && y <= RUIN.y1 + 2) continue;
    enemies.push(mkEnemy(rng() < .62 ? 'pigeon' : 'goose', x * T + T / 2, y * T + T / 2));
  }

  // the veterans, still holding the Victory Site (the war is extremely still on)
  for (let i = 0; i < 6; i++) {
    const x = RUIN.x0 + 2 + (rng() * (RUIN.x1 - RUIN.x0 - 4)) | 0,
          y = RUIN.y0 + 2 + (rng() * (RUIN.y1 - RUIN.y0 - 4)) | 0;
    if (tileAt(world, x, y) === TL.RFLOOR) enemies.push(mkEnemy('veteran', x * T + T / 2, y * T + T / 2));
  }

  const boss = mkBoss(((RUIN.x0 + RUIN.x1) / 2) * T, ((RUIN.y0 + RUIN.y1) / 2 - 1) * T, {
    hp: 40, dmg: 2,
    name: 'the Reenactor',
    telegraph: '"AND THEN — THE FAMOUS CHARGE!" He has raised a small flag.'
  });
  const npcs = villageNpcs();

  // the Glurp man sets up his stand ON the caravan road, properly up the
  // road — far enough that the jingle is something you walk INTO on the
  // way to the Victory Site, not village ambience
  const gnoll = npcs.find(n => n.name === 'Gift Shop Gnoll');
  if (gnoll) {
    let best = null, bestD = Infinity;
    for (let y = 2; y < world.h - 2; y++) for (let x = 2; x < world.w - 2; x++) {
      if (tileAt(world, x, y) !== TL.ROAD) continue;
      const d = Math.hypot(x - VIL.x, y - VIL.y);
      if (d >= 10 && d < bestD) { bestD = d; best = { x, y }; }
    }
    if (best) { gnoll.x = best.x * T + T / 2; gnoll.y = best.y * T - 4; }
  }

  return { enemies, boss, npcs };
}
