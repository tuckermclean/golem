// The Guild Revolving Credit Account: believable econ math, tested to the
// gold piece. The pressure is real; that is the joke.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aprFor, tierName, creditLimit, canBorrow, borrow, accrueInterest,
  minPayment, makeDeathPayment, payDown, truthInLending
} from '../src/systems/credit.js';
import { respawnAtGuild } from '../src/systems/respawn.js';
import { blankGame, spyFx } from './helpers.js';

test('APR is quantified by score tier', () => {
  assert.equal(aprFor(800), .0999);
  assert.equal(aprFor(750), .0999);
  assert.equal(aprFor(700), .2499);
  assert.equal(aprFor(600), .3999);
  assert.equal(aprFor(500), .9999);
  assert.match(tierName(800), /PREFERRED/);
  assert.match(tierName(450), /ADVENTUROUS/);
});

test('no income, no limit; the limit believes in you 4x your income, by tier', () => {
  const game = blankGame();
  assert.equal(creditLimit(game.meta), 0);
  game.meta.income = 15;
  assert.equal(creditLimit(game.meta), 60, 'one DIRK!, exactly');   // 15*4*1 @ 650
  game.meta.credit.score = 750;
  assert.equal(creditLimit(game.meta), 90);                          // 1.5x
  game.meta.credit.score = 560;
  assert.equal(creditLimit(game.meta), 30);                          // 0.5x
  game.meta.credit.score = 540;
  assert.equal(creditLimit(game.meta), 15);                          // 0.25x
});

test('canBorrow declines with the dignity of specificity', () => {
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

test('borrow adds principal and the debt credential is forever', () => {
  const game = blankGame();
  game.meta.income = 15;
  borrow(game.meta, 60);
  assert.equal(game.meta.credit.balance, 60);
  assert.equal(game.meta.credentials.debt, true);
  payDown(game.meta, 60);
  assert.equal(game.meta.credentials.debt, true, 'crippling debt is knowledge; knowledge is permanent');
});

test('interest compounds per excursion (one excursion = one month)', () => {
  const game = blankGame();
  game.meta.credit.balance = 60;            // 24.99% APR @ 650
  const accrued = accrueInterest(game.meta);
  assert.equal(accrued, Math.ceil(60 * .2499 / 12));   // 2
  assert.equal(game.meta.credit.balance, 62);
  game.meta.credit.balance = 0;
  assert.equal(accrueInterest(game.meta), 0, 'no balance, no interest');
});

test('the payment ladder: on-time +10, short -60 and missed++, clearing +25 and forgiveness', () => {
  const game = blankGame();
  const c = game.meta.credit;
  c.balance = 80;                            // due = 10+2 = 12
  assert.equal(minPayment(c), 12);

  let g = makeDeathPayment(game.meta, 50);   // can afford
  assert.deepEqual(g, { due: 12, paid: 12, fee: 1, missed: false });
  assert.equal(c.balance, 68);
  assert.equal(c.score, 660);

  g = makeDeathPayment(game.meta, 3);        // short
  assert.equal(g.missed, true);
  assert.equal(c.missed, 1);
  assert.equal(c.score, 600);

  c.balance = 5;                             // clearing restores your good name
  c.missed = 1;
  g = makeDeathPayment(game.meta, 50);
  assert.equal(c.balance, 0);
  assert.equal(c.missed, 0);
  assert.equal(c.score, 600 + 10 + 25);
});

test('score clamps to [300, 850]', () => {
  const game = blankGame();
  const c = game.meta.credit;
  c.balance = 100; c.score = 310;
  makeDeathPayment(game.meta, 0);            // -60 would underflow
  assert.equal(c.score, 300);
  c.balance = 4; c.score = 845;
  makeDeathPayment(game.meta, 50);           // +10 +25 would overflow
  assert.equal(c.score, 850);
});

test('garnishment rides the real death path, itemized, after the deductible', () => {
  const game = blankGame(), fx = spyFx();
  game.meta.income = 15;
  borrow(game.meta, 60);                     // due = 8+2 = 10
  game.player.gold = 101;
  game.player.hp = 0;
  const { deductible, garnish } = respawnAtGuild(game, fx);
  assert.equal(deductible, 51);
  assert.deepEqual(garnish, { due: 10, paid: 10, fee: 1, missed: false });
  assert.equal(game.player.gold, 101 - 51 - 10 - 1);
  assert.equal(game.meta.credit.balance, 50);

  // no balance: strict no-op (the original deductible math is untouched)
  const game2 = blankGame(), fx2 = spyFx();
  game2.player.gold = 101; game2.player.hp = 0;
  const r2 = respawnAtGuild(game2, fx2);
  assert.equal(r2.garnish, null);
  assert.equal(game2.player.gold, 50);
});

test('the Truth in Lending form is accurate to the gold piece', () => {
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
  assert.match(form.at(-1), /definately origenal/, 'notarized in house spelling');
});
