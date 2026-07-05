// Atomic tile-map operations. A `world` is { map: Uint8Array, w, h, ... }.
// Pushable blocks live outside the map, so collision queries that must
// respect them take a `blocks` array too.

import { T, TL, SOLID } from '../constants.js';

/** Tile id at tile coords; out-of-bounds reads as ROCK. */
export function tileAt(world, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return TL.ROCK;
  return world.map[ty * world.w + tx];
}

/** Is the tile under world-pixel (px,py) solid? */
export function solidAt(world, px, py) {
  return SOLID[tileAt(world, Math.floor(px / T), Math.floor(py / T))];
}

/** Can an axis-aligned box (top-left x,y, size w,h) occupy this space? */
export function boxFree(world, blocks, x, y, w, h) {
  if (solidAt(world, x, y) || solidAt(world, x + w, y) ||
      solidAt(world, x, y + h) || solidAt(world, x + w, y + h) ||
      solidAt(world, x + w / 2, y) || solidAt(world, x + w / 2, y + h)) return false;
  for (const b of blocks) {
    const bx = b.tx * T, by = b.ty * T;
    if (x < bx + T && x + w > bx && y < by + T && y + h > by) return false;
  }
  return true;
}

/** Move an entity (center x/y, size w/h) with per-axis collision. */
export function moveEnt(world, blocks, e, dx, dy) {
  if (dx !== 0 && boxFree(world, blocks, e.x - e.w / 2 + dx, e.y - e.h / 2, e.w, e.h)) e.x += dx;
  if (dy !== 0 && boxFree(world, blocks, e.x - e.w / 2, e.y - e.h / 2 + dy, e.w, e.h)) e.y += dy;
}

/** Tomb: can a pushed block (or spawned object) rest on this tile? */
export function tileWalkable(world, blocks, tx, ty) {
  const v = tileAt(world, tx, ty);
  return (v === TL.TF || v === TL.PLATE) && !blocks.some(b => b.tx === tx && b.ty === ty);
}
