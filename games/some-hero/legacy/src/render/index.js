// Frame renderer. Composes the render passes; holds no game rules.

import { VH } from '../constants.js';
import { drawTiles } from './tiles.js';
import { drawBlocks, drawTorches, drawTraps, drawProps, drawPickups } from './objects.js';
import { drawNpc, drawEnemy, drawBoss, drawPlayer } from './actors.js';
import { drawLantern } from './lighting.js';
import { getSkin } from './skins/index.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} game
 * @param {object} screen  { W, H, dpr, scale, viewW } from the resize handler
 */
export function render(ctx, game, screen) {
  const { W, H, dpr, scale, viewW } = screen;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = getSkin(game).pal.bg; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-game.cam.x, -game.cam.y);

  drawTiles(ctx, game, { w: viewW, h: VH });
  drawTraps(ctx, game);
  drawProps(ctx, game);
  drawBlocks(ctx, game);
  drawTorches(ctx, game);
  drawPickups(ctx, game);

  // entities, y-sorted for painter's order
  const ents = [];
  for (const n of game.npcs) ents.push({ y: n.y, f: () => drawNpc(ctx, n, game) });
  for (const e of game.enemies) ents.push({ y: e.y, f: () => drawEnemy(ctx, e, game) });
  if (game.boss && !game.boss.dead) ents.push({ y: game.boss.y, f: () => drawBoss(ctx, game) });
  ents.push({ y: game.player.y, f: () => drawPlayer(ctx, game) });
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) e.f();

  // particles
  for (const p of game.parts) {
    ctx.globalAlpha = Math.max(0, p.l);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawLantern(ctx, game, screen);
}
