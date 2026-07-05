// The tomb's seal puzzles: warden, bronze key, pressure plates, braziers,
// and the Room That Renovation Forgot (legacy traps, incident counter).

import { T } from '../constants.js';
import { burst } from '../entities/particles.js';
import { ledgerize } from './ledger.js';

/** May the player take the down-stairs on this floor? */
export function stairsOpen(game) {
  const pz = game.puzzle;
  if (!pz) return true;
  if (pz.type === 'warden') return game.boss ? game.boss.dead : true;
  if (pz.type === 'final') return false;   // no down-stairs on the final floor
  if (pz.type === 'key') return pz.have;
  return !!pz.solved;
}

/** Message shown when bumping sealed stairs. */
export function sealMsg(puzzle) {
  if (puzzle.type === 'warden') return 'The seal holds — slay the Warden.';
  if (puzzle.type === 'final') return 'The cancellation desk is here. The Hero stands between you and it.';
  if (puzzle.type === 'key') return 'Sealed. A bronze key lies on this floor.';
  if (puzzle.type === 'plates') return 'Sealed. Push the blocks onto the glowing plates (' + puzzle.done + '/' + puzzle.need + ').';
  if (puzzle.type === 'riddle') return 'Sealed. The door has a question. The door has been waiting.';
  if (puzzle.type === 'traps') return 'Sealed. INCIDENT COUNTER: ' + puzzle.done + '/' + puzzle.need +
    '. The traps ran out of darts years ago. Nobody told the counter. Step on them.';
  return 'Sealed. All ' + puzzle.n + ' braziers must burn at once.';
}

/** Recompute which plates are covered; solve when all are. */
export function checkPlates(game, fx) {
  const pz = game.puzzle;
  if (!pz || pz.type !== 'plates' || pz.solved) return;
  let done = 0;
  for (const p of game.plates) {
    p.on = game.blocks.some(b => b.tx === p.tx && b.ty === p.ty);
    if (p.on) done++;
  }
  pz.done = done;
  if (done >= pz.need) {
    pz.solved = true;
    fx.sfx('level');
    fx.toast('The stone seal grinds open!');
  }
}

/**
 * The Room That Renovation Forgot: fire any un-hit trap under the player.
 * The traps have no darts left, but the incident counter still counts —
 * the exit opens at exactly `need` triggers. Stepping ON them is the answer.
 */
export function checkTraps(game, fx) {
  const pz = game.puzzle;
  if (!pz || pz.type !== 'traps' || pz.solved) return;
  const ptx = Math.floor(game.player.x / T), pty = Math.floor(game.player.y / T);
  for (const tr of game.traps) {
    if (tr.hit || tr.tx !== ptx || tr.ty !== pty) continue;
    tr.hit = true;
    pz.done++;
    fx.sfx('click');
    burst(game.parts, game.player.x, game.player.y - 6, 6, '#9a9486', game.rng);
    if (pz.done >= pz.need) {
      pz.solved = true;
      fx.sfx('level');
      fx.toast(ledgerize('INCIDENT QUOTA MET (' + pz.need + '/' + pz.need +
        '). The seal opens, satisfied that safety has officially failed the required number of times.'));
    } else {
      fx.toast('CLICK. No dart. INCIDENT #' + pz.done + ' OF ' + pz.need + ' recorded anyway.');
    }
  }
}

/** Burn down lit braziers; an expired one goes dark. */
export function updateTorches(game, dt, fx) {
  const pz = game.puzzle;
  if (!pz || pz.type !== 'torch' || pz.solved) return;
  for (const to of game.torches) {
    if (to.lit) {
      to.tm -= dt;
      if (to.tm <= 0) { to.lit = false; fx.sfx('douse'); }
    }
  }
}

/**
 * Try to light braziers near the sword's strike point (hx, hy).
 * Solves the puzzle if every brazier burns at once. Returns lit count.
 */
export function igniteBraziers(game, hx, hy, R, fx) {
  const pz = game.puzzle;
  if (!pz || pz.type !== 'torch') return 0;
  let lit = 0;
  for (const to of game.torches) {
    const cx = to.tx * T + T / 2, cy = to.ty * T + T / 2;
    if (!to.lit && Math.hypot(cx - hx, cy - hy) < R + 14) {
      to.lit = true;
      to.tm = pz.time;
      lit++;
      fx.sfx('ignite');
      burst(game.parts, cx, cy - 8, 8, '#f2a64b', game.rng);
      if (!pz.solved && game.torches.every(o => o.lit)) {
        pz.solved = true;
        fx.sfx('level');
        fx.toast('The flames hold — the seal lifts!');
      }
    }
  }
  return lit;
}
