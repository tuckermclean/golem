// @ceremony — Area 2: credential acquisition (how each of the three
// Door Golem credentials is obtained and represented in state).
//
// Characterization tests, read-only against games/some-hero/legacy/src.
// Overlaps deliberately with legacy/tests/golem-riddle.test.js and
// legacy/tests/credit.test.js (see CEREMONY.md) so this file survives
// legacy's archival on its own.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeta } from '../legacy/src/core/meta.js';
import { missingCredentials, grantBackstory, grantDebt } from '../legacy/src/systems/credentials.js';
import { borrow, payDown } from '../legacy/src/systems/credit.js';
import { blankGame } from './helpers.js';

test('@ceremony fresh meta.credentials starts as { backstory: false, debt: false } — no sword slot (the sword is not knowledge)', () => {
  const meta = createMeta();
  assert.deepEqual(meta.credentials, { backstory: false, debt: false });
});

test('@ceremony backstory credential: grantBackstory sets meta.credentials.backstory permanently true, no other field touched', () => {
  const meta = createMeta();
  grantBackstory(meta);
  assert.equal(meta.credentials.backstory, true);
  assert.equal(meta.credentials.debt, false, 'unrelated');
});

test('@ceremony debt credential: acquired indirectly, as a side effect of systems/credit.js borrow(), not a direct grant call', () => {
  const game = blankGame();
  game.meta.income = 15;
  assert.equal(game.meta.credentials.debt, false);
  borrow(game.meta, 60);
  assert.equal(game.meta.credentials.debt, true, 'one purchase on credit suffices');
  assert.equal(game.meta.credit.balance, 60);
});

test('@ceremony debt credential is knowledge: it survives paying the balance to zero', () => {
  const game = blankGame();
  game.meta.income = 15;
  borrow(game.meta, 60);
  payDown(game.meta, 60);
  assert.equal(game.meta.credit.balance, 0);
  assert.equal(game.meta.credentials.debt, true, 'crippling debt is knowledge; knowledge is permanent');
});

test('@ceremony grantDebt is also a direct setter used independently of the credit account (e.g. debug/cheat paths)', () => {
  const meta = createMeta();
  grantDebt(meta);
  assert.equal(meta.credentials.debt, true);
  assert.equal(meta.credit.balance, 0, 'granting the credential directly does not fabricate a balance');
});

test('@ceremony the sword credential is NOT meta-state: it is read live off game.player.swordLv on every gate check', () => {
  const game = blankGame();
  game.player.swordLv = 0;
  assert.deepEqual(missingCredentials(game.meta, game.player.swordLv), ['sword', 'backstory', 'debt']);
  game.player.swordLv = 1;   // equip a sword-shaped object
  assert.deepEqual(missingCredentials(game.meta, game.player.swordLv), ['backstory', 'debt']);
  game.player.swordLv = 0;   // un-equip: the golem checks the hand every time
  assert.deepEqual(missingCredentials(game.meta, game.player.swordLv), ['sword', 'backstory', 'debt'],
    'unlike backstory/debt, the sword credential is not persisted anywhere in meta');
});

test('@ceremony BITE: backstory/debt are meta-scoped booleans, not booleans on the transient game object', () => {
  const meta = createMeta();
  grantBackstory(meta);
  // A deliberately wrong claim — that credentials live on a fresh object
  // each call — would fail here because grantBackstory mutates and returns
  // the same meta object.
  const meta2 = grantBackstory(createMeta());
  assert.equal(meta2.credentials.backstory, true);
  assert.notEqual(meta.credentials, meta2.credentials, 'distinct meta instances have distinct credential state');
});
