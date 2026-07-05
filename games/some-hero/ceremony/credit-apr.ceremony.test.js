// @ceremony — Area 3: credit/APR numbers (Guild Revolving Credit Account).
//
// Characterization tests, read-only against games/some-hero/legacy/src.
// This is deliberate duplication of legacy/tests/credit.test.js (see
// CEREMONY.md): the port's spec must not depend on legacy surviving.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCORE_MIN, SCORE_MAX, SCORE_START,
  aprFor, tierName, creditLimit, canBorrow, borrow, accrueInterest,
  minPayment, makeDeathPayment, payDown, truthInLending
} from '../legacy/src/systems/credit.js';
import { respawnAtGuild } from '../legacy/src/systems/respawn.js';
import { blankGame, spyFx } from './helpers.js';

test('@ceremony score constants: MIN 300, MAX 850, START 650', () => {
  assert.equal(SCORE_MIN, 300);
  assert.equal(SCORE_MAX, 850);
  assert.equal(SCORE_START, 650);
});

test('@ceremony APR tiers are exact: .0999 / .2499 / .3999 / .9999, tier names PREFERRED/STANDARD/SUBPRIME/ADVENTUROUS', () => {
  assert.equal(aprFor(800), .0999);
  assert.equal(aprFor(750), .0999);
  assert.equal(aprFor(749), .2499);
  assert.equal(aprFor(650), .2499);
  assert.equal(aprFor(649), .3999);
  assert.equal(aprFor(550), .3999);
  assert.equal(aprFor(549), .9999);
  assert.equal(aprFor(500), .9999);
  assert.equal(tierName(800), 'PREFERRED ADVENTURER');
  assert.equal(tierName(700), 'STANDARD ADVENTURER');
  assert.equal(tierName(600), 'SUBPRIME ADVENTURER');
  assert.equal(tierName(450), 'ADVENTUROUS');
});

test('@ceremony creditLimit: no income = 0; else 4x income scaled by tier multiplier (1.5x / 1x / .5x / .25x)', () => {
  const game = blankGame();
  assert.equal(creditLimit(game.meta), 0);
  game.meta.income = 15;
  assert.equal(creditLimit(game.meta), 60, '15 * 4 * 1 @ score 650');
  game.meta.credit.score = 750;
  assert.equal(creditLimit(game.meta), 90, '15 * 4 * 1.5');
  game.meta.credit.score = 560;
  assert.equal(creditLimit(game.meta), 30, '15 * 4 * .5');
  game.meta.credit.score = 540;
  assert.equal(creditLimit(game.meta), 15, '15 * 4 * .25');
});

test('@ceremony canBorrow declines with exact reasons: no income / limit / score(<500) / delinquent(missed>=2)', () => {
  const game = blankGame();
  assert.deepEqual(canBorrow(game.meta, 60), { ok: false, reason: 'no income' });
  game.meta.income = 15;
  assert.deepEqual(canBorrow(game.meta, 60), { ok: true });
  assert.equal(canBorrow(game.meta, 61).reason, 'limit');
  game.meta.credit.score = 480;
  assert.equal(canBorrow(game.meta, 10).reason, 'score');
  game.meta.credit.score = 650;
  game.meta.credit.missed = 2;
  assert.equal(canBorrow(game.meta, 10).reason, 'delinquent');
});

test('@ceremony borrow() adds principal; the debt credential is set and stays set after payDown', () => {
  const game = blankGame();
  game.meta.income = 15;
  borrow(game.meta, 60);
  assert.equal(game.meta.credit.balance, 60);
  assert.equal(game.meta.credentials.debt, true);
  payDown(game.meta, 60);
  assert.equal(game.meta.credentials.debt, true);
});

test('@ceremony interest compounds per excursion, one excursion == one month (APR/12, rounded up)', () => {
  const game = blankGame();
  game.meta.credit.balance = 60;   // 24.99% APR @ score 650
  const accrued = accrueInterest(game.meta);
  assert.equal(accrued, 2, 'ceil(60 * .2499 / 12) === 2');
  assert.equal(game.meta.credit.balance, 62);
  game.meta.credit.balance = 0;
  assert.equal(accrueInterest(game.meta), 0, 'no balance accrues nothing');
});

test('@ceremony minPayment: 1/8 of balance + 2, full balance due at or below 8g', () => {
  assert.equal(minPayment({ balance: 0 }), 0);
  assert.equal(minPayment({ balance: 8 }), 8, 'sweep rule: due in full at 8g or less');
  assert.equal(minPayment({ balance: 9 }), Math.ceil(9 / 8) + 2);
  assert.equal(minPayment({ balance: 80 }), 12, 'ceil(80/8) + 2 === 12');
});

test('@ceremony death-payment ladder: on-time +10, short -60 and missed++, clearing +25 and forgiveness', () => {
  const game = blankGame();
  const c = game.meta.credit;
  c.balance = 80;
  assert.equal(minPayment(c), 12);

  let g = makeDeathPayment(game.meta, 50);
  assert.deepEqual(g, { due: 12, paid: 12, fee: 1, missed: false });
  assert.equal(c.balance, 68);
  assert.equal(c.score, 660);

  g = makeDeathPayment(game.meta, 3);
  assert.equal(g.missed, true);
  assert.equal(c.missed, 1);
  assert.equal(c.score, 600);

  c.balance = 5;
  c.missed = 1;
  g = makeDeathPayment(game.meta, 50);
  assert.equal(c.balance, 0);
  assert.equal(c.missed, 0);
  assert.equal(c.score, 635, '600 + 10 + 25');
});

test('@ceremony score clamps to [300, 850]', () => {
  const game = blankGame();
  const c = game.meta.credit;
  c.balance = 100; c.score = 310;
  makeDeathPayment(game.meta, 0);
  assert.equal(c.score, 300);
  c.balance = 4; c.score = 845;
  makeDeathPayment(game.meta, 50);
  assert.equal(c.score, 850);
});

test('@ceremony garnishment rides the real death path, itemized, after the resurrection deductible', () => {
  const game = blankGame(), fx = spyFx();
  game.meta.income = 15;
  borrow(game.meta, 60);
  game.player.gold = 101;
  game.player.hp = 0;
  const { deductible, garnish } = respawnAtGuild(game, fx);
  assert.equal(deductible, 51, 'ceil(101/2)');
  assert.deepEqual(garnish, { due: 10, paid: 10, fee: 1, missed: false });
  assert.equal(game.player.gold, 101 - 51 - 10 - 1);
  assert.equal(game.meta.credit.balance, 50);

  const game2 = blankGame(), fx2 = spyFx();
  game2.player.gold = 101; game2.player.hp = 0;
  const r2 = respawnAtGuild(game2, fx2);
  assert.equal(r2.garnish, null, 'no balance: strict no-op');
  assert.equal(game2.player.gold, 50);
});

test('@ceremony Truth in Lending disclosure: exact line count and pinned strings, including house-spelling notarization', () => {
  const game = blankGame();
  game.meta.income = 15;
  borrow(game.meta, 60);
  const form = truthInLending(game.meta);
  assert.equal(form.length, 8);
  assert.match(form[1], /24\.99%/);
  assert.match(form[1], /STANDARD ADVENTURER/);
  assert.match(form[1], /650/);
  assert.match(form[2], /one \(1\) dungeon excursion equals one \(1\) month/);
  assert.match(form[3], /verified income is 15 g/);
  assert.match(form[3], /limit is 60 g/);
  assert.match(form[6], /balance 60 g/);
  assert.match(form[6], /minimum due 10 g/);
  assert.match(form[6], /projected.*62 g/);
  assert.match(form.at(-1), /definately origenal/, 'the Ledger notarizes in house spelling (a bug-shaped feature, pinned as-is)');
});

test('@ceremony BITE: APR at score 650 is .2499, not .25 — a rounder-looking wrong constant fails', () => {
  assert.equal(aprFor(650), .2499);
  assert.notEqual(aprFor(650), .25, 'the real constant is .2499, exactly — this assertion is the bite');
});
