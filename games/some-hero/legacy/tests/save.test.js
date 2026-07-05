// Persistence: knowledge survives the tab. Forward-compatible by merge.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveMeta, loadMeta, wipeSave, SAVE_KEY } from '../src/core/save.js';
import { createMeta, addMenace } from '../src/core/meta.js';

const memStorage = () => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    raw: m
  };
};

test('round-trip: what the Ledger knows, the Ledger still knows', () => {
  const s = memStorage();
  const meta = createMeta();
  meta.deaths = 7; meta.day = 4; meta.income = 15;
  meta.credit.balance = 62; meta.credit.score = 600; meta.credit.missed = 1;
  meta.credentials.debt = true; meta.golemApproved = true;
  addMenace(meta, 'Kicked a vending machine. It was witnessed.');
  assert.equal(saveMeta(meta, s), true);

  const loaded = loadMeta(s);
  assert.equal(loaded.deaths, 7);
  assert.equal(loaded.day, 4);
  assert.equal(loaded.income, 15);
  assert.deepEqual(loaded.credit, { balance: 62, score: 600, missed: 1 });
  assert.equal(loaded.credentials.debt, true);
  assert.equal(loaded.credentials.backstory, false);
  assert.equal(loaded.golemApproved, true);
  assert.equal(loaded.menace.length, 1);
});

test('forward compatibility: old saves gain new fields; unknown fields are dropped', () => {
  const s = memStorage();
  const old = createMeta();
  delete old.credit;                 // a save from before the credit era
  old.someFutureNonsense = 'yes';    // and from a fork, apparently
  old.deaths = 3;
  s.setItem(SAVE_KEY, JSON.stringify({ v: 1, meta: old }));

  const loaded = loadMeta(s);
  assert.equal(loaded.deaths, 3);
  assert.deepEqual(loaded.credit, createMeta().credit, 'missing nested object gets defaults');
  assert.equal('someFutureNonsense' in loaded, false, 'unknown fields dropped');
});

test('partial nested objects merge over defaults', () => {
  const s = memStorage();
  const old = createMeta();
  old.credit = { balance: 40 };      // score/missed missing
  s.setItem(SAVE_KEY, JSON.stringify({ v: 1, meta: old }));
  const loaded = loadMeta(s);
  assert.equal(loaded.credit.balance, 40);
  assert.equal(loaded.credit.score, 650, 'a polite assumption, restored');
  assert.equal(loaded.credit.missed, 0);
});

test('corrupt, absent, or unavailable storage: null, never a throw', () => {
  const s = memStorage();
  assert.equal(loadMeta(s), null, 'absent');
  s.setItem(SAVE_KEY, '{not json');
  assert.equal(loadMeta(s), null, 'corrupt');
  s.setItem(SAVE_KEY, JSON.stringify({ v: 1 }));
  assert.equal(loadMeta(s), null, 'missing meta');
  assert.equal(loadMeta(null), null, 'no storage at all');
  assert.equal(saveMeta(createMeta(), null), false);
  wipeSave(null);                    // no throw
});

test('wipeSave forgets; the Ledger pretends not to mind', () => {
  const s = memStorage();
  saveMeta(createMeta(), s);
  assert.ok(s.getItem(SAVE_KEY));
  wipeSave(s);
  assert.equal(s.getItem(SAVE_KEY), null);
});

test('heist tokens survive a round-trip', () => {
  const s = memStorage();
  const meta = createMeta();
  meta.heist.skull = true;
  saveMeta(meta, s);
  const loaded = loadMeta(s);
  assert.equal(loaded.heist.skull, true);
  assert.equal(loaded.heist.gregory, false, 'unset tokens default false');
  assert.equal(loaded.heist.signature, false);
});

test('old save lacking heist gains all-false defaults', () => {
  const s = memStorage();
  const old = createMeta();
  delete old.heist;
  delete old.cancelled;
  delete old.owner;
  s.setItem(SAVE_KEY, JSON.stringify({ v: 1, meta: old }));
  const loaded = loadMeta(s);
  assert.deepEqual(loaded.heist, { skull: false, gregory: false, signature: false });
  assert.equal(loaded.cancelled, false);
  assert.equal(loaded.owner, false);
});

test('cancelled and owner scalar flags survive a round-trip', () => {
  const s = memStorage();
  const meta = createMeta();
  meta.cancelled = true;
  meta.owner = false;
  saveMeta(meta, s);
  const loaded = loadMeta(s);
  assert.equal(loaded.cancelled, true);
  assert.equal(loaded.owner, false);
});
