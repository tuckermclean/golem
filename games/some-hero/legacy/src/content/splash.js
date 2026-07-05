// The Ledger's collapsing patience at the title screen. Pure data, so the
// splash's one piece of writing is testable without a DOM.

export const SPLASH_LINES = [
  'our hero pressed a key. boldly. the wrongness of the key is noted.',
  'our hero pressed ANOTHER key. the Ledger admires persistance. the Ledger is lying.',
  'that one was not even a key. that was the screen.',
  'the Ledger has begun grading. current grade: present.',
  'EXTREMELY THE GOOD KIND of dedication. still the wrong key, though.',
  'the keys are decorative. the dungeon is downstairs. it has always been downstairs.',
  'the Start key is Enter. the Ledger was not supposed to tell you that. the Ledger is so bored.'
];

export const SPLASH_START_LINE = 'fine. FINE. loading. (the Ledger was not finished writing.)';

/** The i-th reaction, clamped to the last (the Ledger repeats itself, bored). */
export function splashLine(i) {
  return SPLASH_LINES[Math.min(i, SPLASH_LINES.length - 1)];
}
