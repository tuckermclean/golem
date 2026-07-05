// The splash screen's one piece of writing: the Ledger's collapsing patience.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPLASH_LINES, SPLASH_START_LINE, splashLine } from '../src/content/splash.js';

test('the Ledger has exactly seven stages of patience', () => {
  assert.equal(SPLASH_LINES.length, 7);
  assert.ok(SPLASH_LINES.every(l => l.length > 0));
});

test('past the last line, the Ledger just repeats itself', () => {
  assert.equal(splashLine(99), SPLASH_LINES.at(-1));
  assert.equal(splashLine(0), SPLASH_LINES[0]);
});

test('the Ledger eventually cracks and names the Start key', () => {
  assert.match(SPLASH_LINES.at(-1), /Enter/);
});

test('the Ledger was not finished writing', () => {
  assert.match(SPLASH_START_LINE, /not finished writing/);
});
