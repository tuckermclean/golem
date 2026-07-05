// Per-frame orchestration. This is the only place that knows the order in
// which the atomic systems run; it contains no game rules itself.

import { ST } from '../constants.js';
import { movePlayer, tickTimers } from '../systems/movement.js';
import { handleStairs } from '../systems/stairs.js';
import { tryPushBlock, settleBlocks } from '../systems/blocks.js';
import { updateTorches, checkTraps } from '../systems/puzzles.js';
import { tombQuestLine } from '../systems/quest.js';
import { nearestNpc } from '../entities/npc.js';
import { playerAttack } from '../systems/attack.js';
import { updateEnemies } from '../systems/enemies.js';
import { updateBoss } from '../systems/boss-ai.js';
import { updatePickups } from '../systems/pickups.js';
import { updateParticles } from '../entities/particles.js';
import { clampCamera } from './camera.js';

/**
 * @param {object} game      mutable game state (createGame)
 * @param {object} controls  { mx, my } movement intent in [-1,1]
 * @param {number} dt        seconds
 * @param {object} view      { w: viewWidth-in-world-px }
 * @param {object} fx        effects interface (makeEffects)
 */
export function updateGame(game, controls, dt, view, fx) {
  game.t += dt;
  if (game.state !== ST.PLAY) return;

  const m = movePlayer(game, controls.mx, controls.my, dt);
  tickTimers(game, dt);

  if (handleStairs(game, fx)) return;  // zone/floor changed; stop this frame

  tryPushBlock(game, controls.mx, controls.my, m, fx);
  settleBlocks(game.blocks, dt);
  updateTorches(game, dt, fx);
  checkTraps(game, fx);

  if (game.zone === 'tomb') fx.setQuestHTML(tombQuestLine(game));

  // interact-or-attack
  const npc = nearestNpc(game.npcs, game.player.x, game.player.y);
  fx.nearNpc(npc);
  if (game.input.atkBuf > 0 && game.player.atkT <= 0 && npc) {
    game.input.atkBuf = 0;
    fx.requestTalk(npc);
    return;
  }
  playerAttack(game, fx);

  updateEnemies(game, dt, view, fx);
  updateBoss(game, dt, fx);
  updatePickups(game, dt, fx);

  game.parts = updateParticles(game.parts, dt);
  clampCamera(game.cam, game.player, game.world, view);
}
