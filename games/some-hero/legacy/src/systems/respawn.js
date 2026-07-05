// Death sends you Topside. Resurrection happens at the Guild Hall, so the
// overworld IS the hub. Items are temporary; knowledge (meta) is permanent.
//
// Slice rules:
//  - the surface persists exactly as you left it (no regeneration)
//  - hp restored to full
//  - resurrection deductible: half your gold, rounded up
//  - dungeon consumables don't survive: potions reset to 1
//  - sword tier persists (you bought/earned that knowledge-adjacent thing;
//    also DIRK! brand swords are basically a sword and basically immortal)

import { T, VIL, ST } from '../constants.js';
import { recordDeath } from '../core/meta.js';
import { makeDeathPayment } from './credit.js';
import { restoreSurface } from '../world/zones.js';

/**
 * Process a death and respawn the player at the Guild Hall (the village).
 * Returns { deductible, cause } for the incident report.
 */
export function respawnAtGuild(game, fx) {
  const cause = game.lastHitBy || null;
  recordDeath(game.meta, cause);
  game.runStats.died = true;

  // climb out of the Downstairs if that's where you died
  if (game.zone === 'tomb' && game.owSave) {
    restoreSurface(game);
    game.owSave = null;
  }
  game.parts = [];

  // the deductible
  const p = game.player;
  const deductible = Math.ceil(p.gold / 2);
  p.gold -= deductible;

  // the account does not respect the body bin: minimum payment + the
  // convenience fee for paying by death (strict no-op with no balance)
  const garnish = makeDeathPayment(game.meta, p.gold);
  if (garnish) p.gold -= garnish.paid + garnish.fee;

  // items are temporary; the complimentary Glurp is discontinued (budget)
  p.potions = Math.min(p.potions, 1);
  p.hp = p.maxhp;
  p.inv = 0; p.atkT = 0;
  game.input.atkBuf = 0;

  // back to the resurrection desk
  p.x = (VIL.x + 1.5) * T;
  p.y = (VIL.y + 1.5) * T;
  p.tk = Math.floor(p.x / T) + ',' + Math.floor(p.y / T);

  game.state = ST.PLAY;
  fx.hudChanged();
  fx.questChanged();
  return { deductible, cause, garnish };
}
