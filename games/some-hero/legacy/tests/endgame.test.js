// The endgame: desk status, applyCancel, applyTransfer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deskStatus, applyCancel, applyTransfer, TOKEN_LABELS } from '../src/systems/endgame.js';
import { createMeta, grantToken, heistComplete } from '../src/core/meta.js';
import { blankGame } from './helpers.js';
import { ST } from '../src/constants.js';

// ---- deskStatus ----

test('deskStatus: all tokens missing → not ready, all three labels returned', () => {
  const meta = createMeta();
  const st = deskStatus(meta);
  assert.equal(st.ready, false);
  assert.equal(st.missing.length, 3);
  assert.ok(st.missing.includes(TOKEN_LABELS.skull));
  assert.ok(st.missing.includes(TOKEN_LABELS.gregory));
  assert.ok(st.missing.includes(TOKEN_LABELS.signature));
});

test('deskStatus: one token granted → two missing', () => {
  const meta = createMeta();
  grantToken(meta, 'skull');
  const st = deskStatus(meta);
  assert.equal(st.ready, false);
  assert.equal(st.missing.length, 2);
  assert.ok(!st.missing.includes(TOKEN_LABELS.skull), 'skull no longer missing');
});

test('deskStatus: two tokens granted → one missing', () => {
  const meta = createMeta();
  grantToken(meta, 'skull'); grantToken(meta, 'gregory');
  const st = deskStatus(meta);
  assert.equal(st.ready, false);
  assert.equal(st.missing.length, 1);
  assert.ok(st.missing.includes(TOKEN_LABELS.signature));
});

test('deskStatus: all three granted → ready, nothing missing', () => {
  const meta = createMeta();
  grantToken(meta, 'skull'); grantToken(meta, 'gregory'); grantToken(meta, 'signature');
  const st = deskStatus(meta);
  assert.equal(st.ready, true);
  assert.equal(st.missing.length, 0);
});

// ---- applyCancel ----

test('applyCancel sets cancelled flag and state WIN', () => {
  const game = blankGame();
  applyCancel(game);
  assert.equal(game.meta.cancelled, true);
  assert.equal(game.meta.owner, false, 'owner unchanged');
  assert.equal(game.state, ST.WIN);
});

// ---- applyTransfer ----

test('applyTransfer sets owner flag, clears cancelled, state WIN', () => {
  const game = blankGame();
  game.meta.cancelled = true;    // make sure it's cleared
  applyTransfer(game);
  assert.equal(game.meta.owner, true);
  assert.equal(game.meta.cancelled, false);
  assert.equal(game.state, ST.WIN);
});

// ---- meta helpers ----

test('grantToken sets the named heist token', () => {
  const meta = createMeta();
  assert.equal(meta.heist.skull, false);
  grantToken(meta, 'skull');
  assert.equal(meta.heist.skull, true);
  assert.equal(meta.heist.gregory, false, 'others unchanged');
});

test('heistComplete: true only when all three granted', () => {
  const meta = createMeta();
  assert.equal(heistComplete(meta), false, 'none granted');
  grantToken(meta, 'skull');
  assert.equal(heistComplete(meta), false, 'one granted');
  grantToken(meta, 'gregory');
  assert.equal(heistComplete(meta), false, 'two granted');
  grantToken(meta, 'signature');
  assert.equal(heistComplete(meta), true, 'all three granted');
});
