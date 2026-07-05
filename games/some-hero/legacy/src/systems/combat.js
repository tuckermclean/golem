// Combat resolution: damage formulas, hitting enemies, hurting the player.

import { T, ST } from '../constants.js';
import { burst } from '../entities/particles.js';
import { gainXp } from './progression.js';
import { dropLoot } from './loot.js';
import { recordPestKill } from './quest.js';
import { union206Line, internLine } from './ledger.js';

/** Player melee damage from sword tier + level.
 *  Tiers: 0 slap, 1 pointy stick, 2 DIRK!, 3 DIRK! ULTRA, 4 sun-steel. */
export function swordDmg(player) {
  return [1, 2, 3, 4, 6][player.swordLv] + ((player.lv - 1) >> 1);
}

/**
 * Damage the player. Respects invulnerability frames; grants 1.1s i-frames
 * on a hit. Switches state to DEAD at 0 hp. Returns true if damage landed.
 */
export function hurtPlayer(game, dmg, fx, cause = null) {
  if (game.debug && game.debug.god) return false;  // playtest god mode
  const p = game.player;
  if (p.inv > 0) return false;
  if (cause) game.lastHitBy = cause;
  p.hp -= dmg;
  p.inv = 1.1;
  fx.sfx('hurt');
  burst(game.parts, p.x, p.y, 10, '#e0644b', game.rng);
  fx.hudChanged();
  if (p.hp <= 0) {
    game.state = ST.DEAD;
    fx.onPlayerDeath();
  }
  return true;
}

/**
 * Damage an enemy: flash, knockback, death -> xp, loot, quest progress.
 * Striking a retaliator provokes it — and its kind remembers: same-kind
 * enemies within earshot turn hostile too.
 */
export function hitEnemy(game, e, dmg, kx, ky, fx) {
  e.hp -= dmg;
  e.flash = .15;
  e.kb = .18; e.kbx = kx; e.kby = ky;
  if (e.retaliates && !e.provoked) {
    e.provoked = true;
    if (e.kind === 'cabinet') {
      // the wave: adjacent drawers arm on a delay, and the dread travels
      // down the row (propagation continues in updateEnemies)
      for (const o of game.enemies) {
        if (o !== e && o.kind === 'cabinet' && !o.dead && !o.provoked && o.provokeT <= 0 &&
            Math.hypot(o.x - e.x, o.y - e.y) < T * 1.5) o.provokeT = .35;
      }
    } else {
      // the flock remembers, all at once
      for (const o of game.enemies) {
        if (o !== e && o.kind === e.kind && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 150) o.provoked = true;
      }
    }
  }
  fx.sfx('hit');
  burst(game.parts, e.x, e.y, 6, e.col || '#fff', game.rng);
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    game.runStats.kills++;
    game.runStats.killsByKind[e.kind] = (game.runStats.killsByKind[e.kind] || 0) + 1;
    if (e.kind === 'slime') {
      // it was an intern. it was TECHNICALLY doing its best.
      if (game.runStats.killsByKind.slime === 1) fx.toast(internLine());
    } else if (game.zone === 'tomb' && game.floorNum <= 4 &&
               game.runStats.kills - (game.runStats.killsByKind.slime || 0) === 1) {
      // the first Front Office casualty of each run was a union member
      fx.toast(union206Line());
    }
    gainXp(game, e.xpv, fx);
    dropLoot(game.pickups, e.x, e.y, game.rng, game.zone === 'tomb');
    if (e.kind === 'goose' && recordPestKill(game.quest)) fx.questChanged();
  }
}
