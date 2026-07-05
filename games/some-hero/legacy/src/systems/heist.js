// Act II heist mechanics: the skull puzzle, the first-pet deduction, and the
// signature gate. All pure — no DOM, no side effects. dialogue.js calls
// these; tests call them directly.

import { grantToken } from '../core/meta.js';

// ---- the Skull (Docent Brell's plaque-logic puzzle) ----

/**
 * Three-round dialogue puzzle: agree with Brell's off-by-one "corrections"
 * three times and the museum auto-deaccessions the skull.
 */
export function makeSkullPuzzle() {
  return { step: 0, agreed: 0, done: false };
}

/** Player agrees with Brell's wrong correction. */
export function skullAgree(state) {
  if (state.done) return state;
  state.agreed++;
  state.step++;
  if (state.agreed >= 3) state.done = true;
  return state;
}

/** Player correctly contradicts Brell — no progress, no penalty. */
export function skullCorrect(state) {
  state.step++;
  return state;
}

// ---- Malgrath's First Pet ----

export const FIRST_PET_ANSWER = 'gregory';

/**
 * Did the player name Gregory (the rock)?
 * Accepts any string containing "gregory" — case-insensitive, leading/trailing
 * whitespace trimmed. Even an 11-year-old can get this.
 */
export function gradeFirstPet(answer) {
  return String(answer).trim().toLowerCase().includes(FIRST_PET_ANSWER);
}

// ---- the Signature (menace threshold) ----

/**
 * How many documented petty crimes before the gauntlet will sign.
 * Topside deeds: kick GLURP-O-MATIC, touch radios, royal grass, museum tag.
 * Tomb deeds: Skritch's radio, gap guestbook. Threshold set low so it's
 * reachable without dedicated grinding.
 */
export const MENACE_THRESHOLD = 3;

export function menaceEnough(meta) {
  return meta.menace.length >= MENACE_THRESHOLD;
}

/**
 * Try to obtain the signature. Returns:
 *   'have'        — token already granted
 *   'insufficient' — menace count below threshold
 *   'granted'     — token newly granted (call fx.sfx etc. after)
 */
export function trySignature(meta) {
  if (meta.heist.signature) return 'have';
  if (!menaceEnough(meta)) return 'insufficient';
  grantToken(meta, 'signature');
  return 'granted';
}
