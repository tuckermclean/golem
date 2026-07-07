// Persistent meta-state: everything that survives death and respawn.
// "Items are temporary; knowledge is permanent" — this is where the
// permanent half lives. createMeta/startRun/recordDeath/recordDepth/
// addMenace/grantToken/heistComplete ported verbatim from
// games/some-hero/legacy/src/core/meta.js.
//
// respawnAtGuild (legacy/src/systems/respawn.js) and hurtPlayer (legacy/
// src/systems/combat.js) are also ported here as "the other pure state
// setters the tests exercise" (S2a design spec's meta.js bucket) — both
// live in different legacy files, but the death-respawn-persistence
// ceremony area's pure-object assertions are exactly about meta/game
// state transitions, not real combat or real zone transitions, so they
// are grouped with meta.js's pure setters rather than getting their own
// rules/respawn.js + rules/combat.js for two functions each.
//
// swordLv is character-tier, read live off game.player — never persisted
// into meta (meta.credentials has no "sword" slot; see rules/
// credentials.js). meta's permanent facts are a plain object, NOT C3's
// Knowledge{knows: string[]} component (design spec, "Purity / doctrine").

import { T, ST, VIL } from "./constants.js";
import { makeDeathPayment } from "./credit.js";

/** (meta.js:7-38) */
export function createMeta() {
  return {
    deaths: 0,
    runs: 0,
    day: 1,
    lastCause: null,
    repeatCause: 0,
    grades: [],
    bestDepth: 0,
    credentials: {
      backstory: false,
      debt: false,
    },
    golemApproved: false,
    menace: [],
    income: 0,
    credit: {
      balance: 0,
      score: 650,
      missed: 0,
    },
    heist: {
      skull: false,
      gregory: false,
      signature: false,
    },
    cancelled: false,
    owner: false,
  };
}

/** A dungeon run begins: advance surface time. (meta.js:40-45) */
export function startRun(meta) {
  meta.runs++;
  meta.day++;
  return meta;
}

/** Record a death and track cause repetition for the grading rubric. (meta.js:47-54) */
export function recordDeath(meta, cause) {
  meta.deaths++;
  if (cause && cause === meta.lastCause) meta.repeatCause++;
  else meta.repeatCause = 0;
  meta.lastCause = cause || null;
  return meta;
}

/** (meta.js:56-59) */
export function recordDepth(meta, floor) {
  meta.bestDepth = Math.max(meta.bestDepth, floor);
  return meta;
}

/** Document a petty crime. The golem always knows. (meta.js:61-65) */
export function addMenace(meta, deed) {
  meta.menace.push({ deed, day: meta.day });
  return meta;
}

/** Grant one heist token by name ('skull', 'gregory', or 'signature'). (meta.js:67-71) */
export function grantToken(meta, which) {
  meta.heist[which] = true;
  return meta;
}

/** True only when all three heist tokens are held. (meta.js:73-76) */
export function heistComplete(meta) {
  return meta.heist.skull && meta.heist.gregory && meta.heist.signature;
}

/**
 * Process a death and respawn the player at the Guild Hall (the village).
 * Returns { deductible, cause, garnish } for the incident report.
 * (systems/respawn.js:21-58)
 *
 * The real-zone climb-out branch (legacy: `if (game.zone === 'tomb' &&
 * game.owSave) { restoreSurface(game); game.owSave = null; }`, via
 * legacy/src/world/zones.js's restoreSurface) is a real zone transition —
 * out of S2a's pure-helpers scope (design spec "Scope boundaries"),
 * deferred to S2b. Every pure-object ceremony assertion this module
 * mirrors keeps game.zone === 'ow' and game.owSave === null, so that
 * branch is never entered by anything S2a's mirror suite exercises.
 */
export function respawnAtGuild(game, fx) {
  const cause = game.lastHitBy || null;
  recordDeath(game.meta, cause);
  game.runStats.died = true;

  if (game.zone === "tomb" && game.owSave) {
    // S2b: real zone climb-out via legacy world/zones.js's restoreSurface(game).
  }
  game.parts = [];

  const p = game.player;
  const deductible = Math.ceil(p.gold / 2);
  p.gold -= deductible;

  const garnish = makeDeathPayment(game.meta, p.gold);
  if (garnish) p.gold -= garnish.paid + garnish.fee;

  p.potions = Math.min(p.potions, 1);
  p.hp = p.maxhp;
  p.inv = 0; p.atkT = 0;
  game.input.atkBuf = 0;

  p.x = (VIL.x + 1.5) * T;
  p.y = (VIL.y + 1.5) * T;
  p.tk = Math.floor(p.x / T) + "," + Math.floor(p.y / T);

  game.state = ST.PLAY;
  fx.hudChanged();
  fx.questChanged();
  return { deductible, cause, garnish };
}

/**
 * Damage the player. Respects invulnerability frames; grants 1.1s
 * i-frames on a hit. Switches state to DEAD at 0 hp. Returns true if
 * damage landed. (systems/combat.js:20-35)
 *
 * The particle burst() call (legacy/src/entities/particles.js, an rng-
 * consuming rendering side effect) is intentionally omitted: no ceremony
 * assertion observes game.parts, and porting particles.js would pull
 * rendering into S2a's pure-helpers scope. Enemy-facing combat (hitEnemy,
 * swordDmg) is real combat and is not ported here at all — out of scope
 * per the design spec.
 */
export function hurtPlayer(game, dmg, fx, cause = null) {
  if (game.debug && game.debug.god) return false; // playtest god mode
  const p = game.player;
  if (p.inv > 0) return false;
  if (cause) game.lastHitBy = cause;
  p.hp -= dmg;
  p.inv = 1.1;
  fx.sfx("hurt");
  fx.hudChanged();
  if (p.hp <= 0) {
    game.state = ST.DEAD;
    fx.onPlayerDeath();
  }
  return true;
}
