// Toasts: reading-speed durations, a queue instead of clobbering, and
// preemption after a minimum display so feedback never lags the game.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeToast } from '../src/ui/toast.js';

const el = () => ({ textContent: '', style: { opacity: 0 } });

test('duration scales with message length (clamped 2.4s–7s)', () => {
  const e = el(), t = makeToast(e);
  t.show('short');
  t.tick(2.3);
  assert.equal(e.style.opacity, 1, 'short message still up at 2.3s');
  t.tick(0.2);
  assert.equal(e.style.opacity, 0, 'short message ends at 2.4s');

  t.show('x'.repeat(70));            // 70/14 = 5s
  t.tick(4.8);
  assert.equal(e.style.opacity, 1);
  t.tick(0.3);
  assert.equal(e.style.opacity, 0);
});

test('messages queue instead of clobbering; a queued toast preempts after 1.2s', () => {
  const e = el(), t = makeToast(e);
  t.show('first message, of a reasonable reading length for a toast');
  t.show('second message');
  assert.match(e.textContent, /first/, 'the first is not clobbered');
  t.tick(1.0);
  assert.match(e.textContent, /first/, 'no preempt before the minimum display');
  t.tick(0.3);
  assert.match(e.textContent, /second/, 'preempted after 1.2s');
  t.tick(2.5);
  assert.equal(e.style.opacity, 0, 'queue drained, toast gone');
});

test('the queue keeps the freshest three', () => {
  const e = el(), t = makeToast(e);
  t.show('current');
  for (let i = 1; i <= 5; i++) t.show('queued ' + i);
  t.tick(1.3); assert.match(e.textContent, /queued 3/);
  t.tick(1.3); assert.match(e.textContent, /queued 4/);
  t.tick(1.3); assert.match(e.textContent, /queued 5/);
});
