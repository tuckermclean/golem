// Camera: center on the player, clamped to the map bounds.

import { T, VH } from '../constants.js';

export function clampCamera(cam, player, world, view) {
  cam.x = Math.max(0, Math.min(world.w * T - view.w, player.x - view.w / 2));
  cam.y = Math.max(0, Math.min(world.h * T - VH, player.y - VH / 2));
  return cam;
}
