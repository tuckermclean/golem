// Shared test helpers: deterministic headless game fixtures.

import { T, TL } from '../src/constants.js';
import { mulberry32 } from '../src/core/rng.js';
import { makeEffects } from '../src/core/effects.js';
import { createGame, newRun } from '../src/core/game.js';

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
