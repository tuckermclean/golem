// Player locomotion and the per-frame countdown timers.

import { moveEnt } from '../world/tilemap.js';

/**
 * Apply a movement intent (mx,my in [-1,1]) to the player.
 * Normalizes diagonals, moves with collision, updates facing.
 * Returns the input magnitude (used by block pushing).
 */
export function movePlayer(game, mx, my, dt) {
  const m = Math.hypot(mx, my);
  if (m > 0.01) {
    mx /= Math.max(1, m); my /= Math.max(1, m);
    moveEnt(game.world, game.blocks, game.player, mx * game.player.speed * dt, my * game.player.speed * dt);
    game.player.fx = mx; game.player.fy = my;
  }
  return m;
}

/** Decay invulnerability, attack cooldown, attack buffer and push cooldown. */
export function tickTimers(game, dt) {
  const p = game.player;
  p.inv = Math.max(0, p.inv - dt);
  p.atkT = Math.max(0, p.atkT - dt);
  game.input.atkBuf = Math.max(0, game.input.atkBuf - dt);
  game.pushCd = Math.max(0, game.pushCd - dt);
}

/** Buffer an attack press (consumed by the attack system within 0.15s). */
export function bufferAttack(game) {
  game.input.atkBuf = .15;
}
