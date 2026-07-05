// Pushable stone blocks (the plates puzzle).

import { T } from '../constants.js';
import { tileWalkable } from '../world/tilemap.js';
import { checkPlates } from './puzzles.js';

/**
 * Attempt to push the block in front of the player along the dominant
 * movement axis. Mirrors the original: requires movement magnitude > 0.4
 * and an expired push cooldown; a successful push costs 0.24s, a blocked
 * one 0.3s. Returns true if a block moved.
 */
export function tryPushBlock(game, mx, my, m, fx) {
  if (game.zone !== 'tomb' || m <= 0.4 || game.pushCd > 0) return false;
  const dirx = Math.abs(mx) >= Math.abs(my) ? Math.sign(mx) : 0;
  const diry = dirx === 0 ? Math.sign(my) : 0;
  if (!dirx && !diry) return false;

  const p = game.player;
  const fpx = p.x + dirx * (p.w / 2 + 8), fpy = p.y + diry * (p.h / 2 + 8);
  const btx = Math.floor(fpx / T), bty = Math.floor(fpy / T);
  const b = game.blocks.find(o => o.tx === btx && o.ty === bty);
  if (!b) return false;

  const ptx = Math.floor(p.x / T), pty = Math.floor(p.y / T);
  const nx = b.tx + dirx, ny = b.ty + diry;
  if (tileWalkable(game.world, game.blocks, nx, ny) && !(nx === ptx && ny === pty)) {
    b.tx = nx; b.ty = ny;
    game.pushCd = .24;
    fx.sfx('push');
    checkPlates(game, fx);
    return true;
  }
  game.pushCd = .3;
  return false;
}

/** Ease blocks' rendered positions toward their tile positions. */
export function settleBlocks(blocks, dt) {
  for (const b of blocks) {
    b.rx += (b.tx * T - b.rx) * Math.min(1, dt * 14);
    b.ry += (b.ty * T - b.ry) * Math.min(1, dt * 14);
  }
}
