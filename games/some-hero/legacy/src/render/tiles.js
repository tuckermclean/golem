// Tile layer rendering: shared culling loop + base fill; all per-tile look
// (colors and decoration) comes from the active skin.

import { T } from '../constants.js';
import { tileAt } from '../world/tilemap.js';
import { getSkin } from './skins/index.js';

export function drawTiles(ctx, game, view) {
  const S = getSkin(game);
  const { world, cam } = game;
  const h2 = world.h2;
  const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(world.w - 1, Math.ceil((cam.x + view.w) / T));
  const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(world.h - 1, Math.ceil((cam.y + view.h) / T));

  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const v = tileAt(world, x, y), px = x * T, py = y * T;
    ctx.fillStyle = S.tcol[v]; ctx.fillRect(px, py, T, T);
    const d = S.tileDeco[v];
    if (d) d(ctx, px, py, x, y, h2(x * 5, y * 9), game);
  }
}
