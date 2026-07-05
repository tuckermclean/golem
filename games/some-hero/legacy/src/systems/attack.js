// The player's sword swing: cooldown, strike point, brazier lighting,
// enemy hits, boss hits and boss death rewards.

import { burst } from '../entities/particles.js';
import { swordDmg, hitEnemy } from './combat.js';
import { gainXp } from './progression.js';
import { igniteBraziers } from './puzzles.js';

export const STRIKE_REACH = 24;  // hand offset from player center
export const BRAZIER_R = 30;     // lamp-lighting radius (not a combat reach problem)

// Strike radius by weapon tier: reach is a property of the weapon.
// A slap is a slap, Pointy is a stick, a DIRK! is short ("basically a
// sword"), the ULTRA is engineered, and sun-steel swings like it means it.
export const STRIKE_RADII = [14, 18, 22, 26, 32];
export const strikeRadius = swordLv =>
  STRIKE_RADII[Math.min(swordLv, STRIKE_RADII.length - 1)];

/**
 * Resolve one buffered attack if the cooldown allows. Returns true if a
 * swing happened. (NPC interaction is decided by the caller before this.)
 */
export function playerAttack(game, fx) {
  const p = game.player;
  if (game.input.atkBuf <= 0 || p.atkT > 0) return false;
  game.input.atkBuf = 0;
  p.atkT = .34;
  const slap = p.swordLv === 0;
  fx.sfx(slap ? 'slap' : 'swing');

  const fm = Math.hypot(p.fx, p.fy) || 1, fxd = p.fx / fm, fyd = p.fy / fm;
  const hx = p.x + fxd * STRIKE_REACH, hy = p.y + fyd * STRIKE_REACH;
  // reach scales with the weapon; a slap also does not launch a goose —
  // full knockback would shove enemies out of their own contact range
  // every hit, which is what made bare-handed goose abatement safe
  const Rb = strikeRadius(p.swordLv);
  const kb = slap ? 56 : 140;

  // light braziers at fixed radius: lamps don't care what you're holding
  if (game.zone === 'tomb') igniteBraziers(game, hx, hy, BRAZIER_R, fx);

  // enemies
  for (const e of game.enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - hx, e.y - hy) < Rb + e.w / 2) {
      hitEnemy(game, e, swordDmg(p), fxd * kb, fyd * kb, fx);
    }
  }

  // boss
  const b = game.boss;
  if (b && !b.dead && Math.hypot(b.x - hx, b.y - hy) < Rb + b.w / 2) {
    b.hp -= swordDmg(p);
    b.flash = .15;
    fx.sfx('hit');
    burst(game.parts, b.x, b.y - 10, 8, '#c9b08a', game.rng);
    if (b.state === 'sleep') { b.state = 'idle'; b.timer = 1; fx.sfx('boss'); }
    if (b.hp <= 0 && !b.dead) killBoss(game, fx);
  }
  return true;
}

/** Boss death: rewards differ between the overworld Guardian, tomb Wardens, and the final boss. */
export function killBoss(game, fx) {
  const b = game.boss;
  b.dead = true;
  fx.sfx('win');
  burst(game.parts, b.x, b.y, 36, '#f2d27a', game.rng);
  // the Origenal Hero (final floor): no loot — just open the desk and let him sit down
  if (game.zone === 'tomb' && game.puzzle && game.puzzle.type === 'final') {
    gainXp(game, 200, fx);
    game.puzzle.bossDead = true;
    fx.toast('"...Fine. I\'ll be in the break room. The desk is yours, kid."');
    fx.questChanged();
    return;
  }
  if (game.zone === 'ow') {
    gainXp(game, 100, fx);
    game.pickups.push({ kind: 'amulet', x: b.x, y: b.y, v: 1 });
    for (let i = 0; i < 6; i++) {
      game.pickups.push({ kind: 'gold', x: b.x + (game.rng() - .5) * 50, y: b.y + (game.rng() - .5) * 50, v: 3 });
    }
  } else {
    gainXp(game, 60 + game.floorNum * 15, fx);
    game.pickups.push({ kind: 'maxheart', x: b.x, y: b.y, v: 2 });
    for (let i = 0; i < 5; i++) {
      game.pickups.push({ kind: 'gold', x: b.x + (game.rng() - .5) * 50, y: b.y + (game.rng() - .5) * 50, v: 3 });
    }
    if (game.floorNum >= 4 && game.player.swordLv < 4 && game.rng() < .6) {
      game.pickups.push({ kind: 'sword', x: b.x, y: b.y + 24, v: 1 });
    }
    fx.toast(b.name === 'the Middle Manager'
      ? 'Per his last attack: none. The stairs open.'
      : 'The Warden falls — the stairs open.');
  }
}
