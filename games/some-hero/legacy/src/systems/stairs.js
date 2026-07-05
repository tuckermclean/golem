// Stairs: trigger only when the player enters a new tile, so standing on
// stairs doesn't fire repeatedly.

import { T, TL } from '../constants.js';
import { tileAt } from '../world/tilemap.js';
import { stairsOpen, sealMsg } from './puzzles.js';
import { enterTomb, exitTomb, descend, ascend } from '../world/zones.js';
import { missingCredentials } from './credentials.js';

/**
 * Check the player's current tile for stairs. Returns true if a zone/floor
 * transition happened (the frame's update should stop).
 */
export function handleStairs(game, fx) {
  const p = game.player;
  const ptx = Math.floor(p.x / T), pty = Math.floor(p.y / T);
  const tk = ptx + ',' + pty;
  if (tk === p.tk) return false;
  p.tk = tk;

  const v = tileAt(game.world, ptx, pty);
  if (v === TL.SD) {
    if (game.zone === 'ow') {
      // the Door Golem of Credential Verification
      const missing = missingCredentials(game.meta, game.player.swordLv);
      if (missing.length) { fx.onGolemEntry(missing); return false; }
      if (!game.meta.golemApproved) {
        game.meta.golemApproved = true;
        // the stamp ceremony; do not cut the pause. Entry waits for the
        // stamp — descending first would tell the player the verdict early.
        fx.onGolemApproval(() => enterTomb(game, fx));
        return false;
      }
      enterTomb(game, fx);
    }
    else if (stairsOpen(game)) descend(game, fx);
    else if (game.puzzle && game.puzzle.type === 'riddle') { fx.onRiddle(); return false; }
    else { fx.toast(sealMsg(game.puzzle)); return false; }
    return true;
  }
  if (v === TL.SU && game.zone === 'tomb') {
    if (game.floorNum <= 1) exitTomb(game, fx);
    else ascend(game, fx);   // emerge from the hole you went down
    return true;
  }
  return false;
}
