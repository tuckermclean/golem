// Stratum I — The Front Office: the floor directory the Ledger reads aloud.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorLine } from '../src/content/floors.js';

test('floors 1-4 are named Front Office departments', () => {
  assert.match(floorLine(1), /Reception/);
  assert.match(floorLine(1), /bones/);
  assert.match(floorLine(2), /Gift Shop/);
  assert.match(floorLine(3), /MIND THE GAP/);
  assert.match(floorLine(4), /Middle Management/);
});

test('every 4th floor still announces the performance review (zones.test depends on this)', () => {
  assert.match(floorLine(4), /performance review/);
  assert.match(floorLine(8), /performance review/);
  assert.match(floorLine(12), /performance review/);
});

test('deeper non-review floors are plain numbers', () => {
  assert.equal(floorLine(5), 'Floor 5');
  assert.equal(floorLine(7), 'Floor 7');
});
