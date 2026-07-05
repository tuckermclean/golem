// Boss state machine: sleep -> idle (creep) -> tele(graph) -> dash -> idle.

import { moveEnt } from '../world/tilemap.js';
import { hurtPlayer } from './combat.js';
import { burst } from '../entities/particles.js';

export function updateBoss(game, dt, fx) {
  const b = game.boss;
  if (!b || b.dead) return;
  const p = game.player;
  b.flash = Math.max(0, b.flash - dt);
  const dx = p.x - b.x, dy = p.y - b.y, dist = Math.hypot(dx, dy);

  if (b.state === 'sleep') {
    if (dist < 170) {
      b.state = 'idle'; b.timer = 1; fx.sfx('boss');
      if (b.telegraph) fx.toast(b.telegraph);
    }
  } else if (b.state === 'idle') {
    b.timer -= dt;
    moveEnt(game.world, game.blocks, b, Math.sign(dx) * 34 * dt, Math.sign(dy) * 34 * dt);
    if (b.timer <= 0) { b.state = 'tele'; b.timer = .55; }
  } else if (b.state === 'tele') {
    b.timer -= dt;
    if (b.timer <= 0) {
      b.state = 'dash'; b.timer = .55;
      b.vx = dx / dist * 430; b.vy = dy / dist * 430;
    }
  } else if (b.state === 'dash') {
    b.timer -= dt;
    moveEnt(game.world, game.blocks, b, b.vx * dt, b.vy * dt);
    if (b.timer <= 0) {
      b.state = 'idle';
      b.timer = 1.3 + game.rng() * .8;
      burst(game.parts, b.x, b.y + 16, 8, '#c9b08a', game.rng);
    }
  }

  if (dist < (b.w + p.w) / 2) hurtPlayer(game, b.dmg, fx, b.name);
}
