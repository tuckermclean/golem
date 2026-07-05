// Ceremony-suite test helpers.
//
// Copied verbatim from games/some-hero/legacy/tests/helpers.js (legacy
// snapshot e3d17bb, see games/some-hero/legacy import commit) rather than
// imported from it. legacy/tests/ dies with the rest of legacy/ at
// archival (Phase 4, DELTA.md); this ceremony/ suite must run standalone
// as the port's spec (task P0.3b brief, decision 4/9), so it cannot
// depend on a legacy/tests/ file surviving that archival. Imports below
// still point at legacy/src/ (read-only), which decision 4 explicitly
// allows and which S2 is what actually gets ported.
//
// Do not edit games/some-hero/legacy/tests/helpers.js to keep this in
// sync — legacy/ is byte-frozen. If legacy/src's game/rng/effects APIs
// change post-archival, this file is reimplemented against the port
// directly, same as every other characterization test here.

import { T, TL } from '../legacy/src/constants.js';
import { mulberry32 } from '../legacy/src/core/rng.js';
import { makeEffects } from '../legacy/src/core/effects.js';
import { createGame, newRun } from '../legacy/src/core/game.js';

/** Effects object that records every call. */
export function spyFx() {
  const calls = [];
  const fx = makeEffects();
  for (const k of Object.keys(fx)) {
    fx[k] = (...args) => calls.push([k, ...args]);
  }
  fx.calls = calls;
  fx.count = name => calls.filter(c => c[0] === name).length;
  fx.last = name => calls.filter(c => c[0] === name).at(-1);
  return fx;
}

/** A deterministic full game (overworld generated, populated). */
export function seededGame(seed = 1) {
  const game = createGame({ rng: mulberry32(seed) });
  newRun(game);
  return game;
}

/** A tiny hand-built game on an all-floor map — no random spawns, no walls. */
export function blankGame({ w = 12, h = 12, fill = TL.SAND } = {}) {
  const game = createGame({ rng: mulberry32(7) });
  game.world = { map: new Uint8Array(w * h).fill(fill), w, h, h2: () => 0.5 };
  game.player.x = (w / 2) * T;
  game.player.y = (h / 2) * T;
  game.player.tk = Math.floor(game.player.x / T) + ',' + Math.floor(game.player.y / T);
  game.state = 1; // ST.PLAY
  return game;
}

export const VIEW = { w: 800 };
