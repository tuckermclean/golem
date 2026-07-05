// The endgame: the Cancellation Desk triangle check and the two endings.
// Pure — no DOM, no effects interface. dialogue.js calls these; tests call
// them directly.

import { ST } from '../constants.js';

export const TOKEN_LABELS = {
  skull:     'the Skull (proof of death)',
  gregory:   'Gregory (the security answer)',
  signature: 'the Signature'
};

/** What the Cancellation Desk reports: ready only when all three tokens held. */
export function deskStatus(meta) {
  const missing = ['skull', 'gregory', 'signature'].filter(k => !meta.heist[k]);
  return { ready: missing.length === 0, missing: missing.map(k => TOKEN_LABELS[k]) };
}

/** Ending A: cancel the apocalypse. */
export function applyCancel(game) {
  game.meta.cancelled = true;
  game.state = ST.WIN;
}

/**
 * Ending B: transfer ownership — the player becomes the account holder.
 * New Game+: meta is kept (heist tokens, menace, credit, knowledge).
 * main.js closes the WIN screen into newRun() when meta.owner is set.
 */
export function applyTransfer(game) {
  game.meta.owner = true;
  game.meta.cancelled = false;
  game.state = ST.WIN;
}
