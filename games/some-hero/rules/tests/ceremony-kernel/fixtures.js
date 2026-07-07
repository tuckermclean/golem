// Minimal, self-contained fixtures for the ceremony-kernel mirror suite.
//
// Deliberately NOT importing games/some-hero/legacy/ or ceremony/
// helpers.js (which itself imports legacy's createGame/mulberry32/
// makeEffects) — the hard constraint on this suite is "the mirror suite
// imports from rules/, not legacy" (S2a task brief). blankGame()/spyFx()
// below are a from-scratch reimplementation of ceremony/helpers.js's own
// blankGame()/spyFx(), built only from what the ported rules/* helpers
// actually read, and createMeta() is rules/meta.js's own port (not
// legacy's) — dogfooding the port under test.
//
// mulberry32 is legacy's tiny generic PRNG (games/some-hero/legacy/src/
// core/rng.js:3-12), transcribed here for test-fixture determinism only —
// it is a generic seeded-PRNG algorithm, not Ceremony logic, and no
// mirrored assertion depends on matching legacy's exact output stream
// (only on determinism/shape — see nextRiddle's ceremony-kernel tests).

import { createMeta } from "../../meta.js";

const T = 36; // legacy/src/constants.js:3 — tile size (plain engine constant, not narrative content)

/** Deterministic PRNG, same algorithm as legacy/src/core/rng.js:4-12. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tiny hand-built game on an all-floor map — mirrors
 *  ceremony/helpers.js's blankGame(), reimplemented with zero legacy
 *  import, supplying only the fields the ported rules/* helpers read. */
export function blankGame({ w = 12, h = 12 } = {}) {
  return {
    rng: mulberry32(7),
    state: 1, // ST.PLAY
    zone: "ow",
    floorNum: 0,
    owSave: null,
    puzzle: null,
    boss: null,
    torches: [],
    world: { w, h },
    parts: [],
    input: { atkBuf: 0 },
    debug: { god: false },
    player: {
      x: (w / 2) * T,
      y: (h / 2) * T,
      tk: Math.floor(w / 2) + "," + Math.floor(h / 2),
      swordLv: 1,
      gold: 0,
      potions: 0,
      hp: 20,
      maxhp: 20,
      inv: 0,
      atkT: 0,
    },
    meta: createMeta(),
    runStats: { depth: 0, kills: 0, died: false, killsByKind: {}, glurpsDrunk: 0, goldGained: 0 },
    lastHitBy: null,
  };
}

/** Effects object that records every call — mirrors ceremony/helpers.js's spyFx(). */
export function spyFx() {
  const calls = [];
  const names = ["sfx", "toast", "hudChanged", "questChanged", "onPlayerDeath", "onGolemEntry", "onGolemApproval", "onRiddle"];
  const fx = {};
  for (const name of names) fx[name] = (...args) => calls.push([name, ...args]);
  fx.calls = calls;
  fx.count = name => calls.filter(c => c[0] === name).length;
  fx.last = name => calls.filter(c => c[0] === name).at(-1);
  return fx;
}
