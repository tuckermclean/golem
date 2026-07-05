// Enemy AI: knockback, aggro chase (ghosts phase through walls), wander,
// contact damage, ghost map clamp, dead culling.

import { T } from '../constants.js';
import { moveEnt } from '../world/tilemap.js';
import { hurtPlayer } from './combat.js';

export function updateEnemies(game, dt, view, fx) {
  const p = game.player, w = game.world;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy);
    if (dist > view.w * 1.4) continue;  // off-screen cull
    e.flash = Math.max(0, e.flash - dt);

    // a waking wave: an armed timer flips to provoked and passes it on
    if (e.provokeT > 0) {
      e.provokeT -= dt;
      if (e.provokeT <= 0) {
        e.provokeT = 0;
        e.provoked = true;
        for (const o of game.enemies) {
          if (o !== e && o.kind === e.kind && !o.dead && !o.provoked && o.provokeT <= 0 &&
              Math.hypot(o.x - e.x, o.y - e.y) < T * 1.5) o.provokeT = .35;
        }
      }
    }

    // a retaliator is at peace until provoked; furniture doesn't even pace
    const hostile = !e.passive && (!e.retaliates || e.provoked);

    if (e.kb > 0) {
      e.kb -= dt;
      moveEnt(w, game.blocks, e, e.kbx * dt, e.kby * dt);
    } else if (hostile && dist < e.aggro) {
      // skeletons rattle (the wobble IS the rattle); scarabs kept it first
      const wob = e.kind === 'skeleton' || e.kind === 'scarab';
      const s = e.spd * (wob ? (0.8 + 0.4 * Math.sin(game.t * 6 + e.x)) : 1);
      if (e.ghost) { e.x += dx / dist * s * dt; e.y += dy / dist * s * dt; }
      else moveEnt(w, game.blocks, e, dx / dist * s * dt, dy / dist * s * dt);
    } else if (!(e.still && !e.provoked)) {
      e.wt -= dt;
      if (e.wt <= 0) {
        e.wt = 1 + game.rng() * 2;
        const a = game.rng() * Math.PI * 2;
        e.wx = Math.cos(a); e.wy = Math.sin(a);
      }
      if (e.ghost) { e.x += e.wx * e.spd * .4 * dt; e.y += e.wy * e.spd * .4 * dt; }
      else moveEnt(w, game.blocks, e, e.wx * e.spd * .4 * dt, e.wy * e.spd * .4 * dt);
    }

    if (hostile && dist < (e.w + p.w) / 2 + 2) hurtPlayer(game, e.dmg, fx, e.kind);
    if (e.ghost) {
      e.x = Math.max(T, Math.min(w.w * T - T, e.x));
      e.y = Math.max(T, Math.min(w.h * T - T, e.y));
    }
  }
  game.enemies = game.enemies.filter(e => !e.dead);
}
