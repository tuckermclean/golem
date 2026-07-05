// Act II heist mechanics: skull puzzle, first-pet deduction, signature gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSkullPuzzle, skullAgree, skullCorrect,
  gradeFirstPet, FIRST_PET_ANSWER,
  menaceEnough, trySignature, MENACE_THRESHOLD
} from '../src/systems/heist.js';
import { createMeta, addMenace } from '../src/core/meta.js';

// ---- skull puzzle ----

test('three agrees mark the skull puzzle done', () => {
  let s = makeSkullPuzzle();
  assert.equal(s.done, false);
  s = skullAgree(s); assert.equal(s.done, false, 'two more to go');
  s = skullAgree(s); assert.equal(s.done, false, 'one more to go');
  s = skullAgree(s); assert.equal(s.done, true, 'three agrees: deaccessioned');
  assert.equal(s.agreed, 3);
  assert.equal(s.step, 3);
});

test('fewer than three agrees leave the puzzle open', () => {
  let s = makeSkullPuzzle();
  skullAgree(s); skullAgree(s);
  assert.equal(s.done, false);
  assert.equal(s.agreed, 2);
});

test('correcting Brell advances the step but not the agree count', () => {
  let s = makeSkullPuzzle();
  s = skullAgree(s);
  s = skullCorrect(s);
  assert.equal(s.agreed, 1, 'correction does not count as an agree');
  assert.equal(s.step, 2, 'step still advances');
  assert.equal(s.done, false);
});

test('agreeing after done is a no-op', () => {
  let s = makeSkullPuzzle();
  skullAgree(s); skullAgree(s); skullAgree(s);  // done
  const before = { ...s };
  skullAgree(s);
  assert.deepEqual(s, before, 'no change after done');
});

// ---- first pet deduction ----

test('gradeFirstPet: Gregory (exact and variants) → true', () => {
  assert.equal(gradeFirstPet('Gregory'), true);
  assert.equal(gradeFirstPet('gregory'), true);
  assert.equal(gradeFirstPet('  GREGORY  '), true);
  assert.equal(gradeFirstPet('Gregory the rock'), true);
  assert.equal(gradeFirstPet('it was gregory, dear'), true);
});

test('gradeFirstPet: other answers → false', () => {
  assert.equal(gradeFirstPet('goose'), false);
  assert.equal(gradeFirstPet('skeleton'), false);
  assert.equal(gradeFirstPet('slime'), false);
  assert.equal(gradeFirstPet(''), false);
  assert.equal(gradeFirstPet('  '), false);
});

// ---- menace / signature ----

test('menaceEnough: true at threshold, false below', () => {
  const meta = createMeta();
  assert.equal(menaceEnough(meta), false, '0 deeds');
  for (let i = 0; i < MENACE_THRESHOLD - 1; i++) addMenace(meta, 'crime ' + i);
  assert.equal(menaceEnough(meta), false, MENACE_THRESHOLD - 1 + ' deeds — not quite');
  addMenace(meta, 'the last one');
  assert.equal(menaceEnough(meta), true, MENACE_THRESHOLD + ' deeds: enough');
});

test('trySignature: insufficient when below threshold', () => {
  const meta = createMeta();
  addMenace(meta, 'only one');
  assert.equal(trySignature(meta), 'insufficient');
  assert.equal(meta.heist.signature, false);
});

test('trySignature: granted at threshold and sets heist flag', () => {
  const meta = createMeta();
  for (let i = 0; i < MENACE_THRESHOLD; i++) addMenace(meta, 'crime ' + i);
  assert.equal(trySignature(meta), 'granted');
  assert.equal(meta.heist.signature, true, 'token set in meta');
});

test('trySignature: returns "have" when already granted', () => {
  const meta = createMeta();
  for (let i = 0; i < MENACE_THRESHOLD; i++) addMenace(meta, 'crime ' + i);
  trySignature(meta);                   // first call grants
  assert.equal(trySignature(meta), 'have', 'second call is a no-op');
  assert.equal(meta.heist.signature, true);
});
