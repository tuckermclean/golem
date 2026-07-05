// Lantern darkness: screen-space radial vignette around the player in the
// tomb. Color, falloff, and flicker come from the active skin's lantern.

import { getSkin } from './skins/index.js';

export function drawLantern(ctx, game, screen) {
  if (game.zone !== 'tomb') return;
  if (game.debug && game.debug.reveal) return;  // playtest: lights on
  const L = getSkin(game).lantern;
  const { W, H, scale } = screen;
  const px = (game.player.x - game.cam.x) * scale, py = (game.player.y - game.cam.y) * scale;
  const flick = 1 + Math.sin(game.t * 9) * L.flicker;
  const g = ctx.createRadialGradient(px, py, H * 0.15 * flick, px, py, H * 0.62 * flick);
  for (const [off, a] of L.stops) g.addColorStop(off, 'rgba(' + L.rgb + ',' + a + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (L.tint) { ctx.fillStyle = L.tint; ctx.fillRect(0, 0, W, H); }
}
