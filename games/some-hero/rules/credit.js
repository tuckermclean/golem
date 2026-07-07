// The Guild Revolving Credit Account. Ported verbatim from
// games/some-hero/legacy/src/systems/credit.js. All pure functions over
// meta. Not table-fed: none of these strings/numbers are in S1's 16-table
// inventory (content/tables.mjs) — the APR tiers/limits/payment math are
// numeric logic, and truthInLending's copy was left out of S1's locked
// scope, so it stays literal here, faithful to credit.js:117-132.

import { ledgerize } from "./ledger.js";

export const SCORE_MIN = 300, SCORE_MAX = 850, SCORE_START = 650; // credit.js:11

/** APR tiers, by score. Quantified. There is a form about it. (credit.js:14-19) */
export function aprFor(score) {
  if (score >= 750) return .0999;
  if (score >= 650) return .2499;
  if (score >= 550) return .3999;
  return .9999;
}

/** (credit.js:21-26) */
export function tierName(score) {
  if (score >= 750) return "PREFERRED ADVENTURER";
  if (score >= 650) return "STANDARD ADVENTURER";
  if (score >= 550) return "SUBPRIME ADVENTURER";
  return "ADVENTUROUS";
}

/** Credit limit: 4x verified income, adjusted by tier. No income, no limit. (credit.js:29-34) */
export function creditLimit(meta) {
  if ((meta.income || 0) <= 0) return 0;
  const s = meta.credit.score;
  const mult = s >= 750 ? 1.5 : s >= 650 ? 1 : s >= 550 ? .5 : .25;
  return Math.floor(meta.income * 4 * mult);
}

/**
 * May this purchase go on the account?
 * Reasons mirror the decline letters: 'delinquent' | 'no income' | 'score' | 'limit'.
 * (credit.js:36-47)
 */
export function canBorrow(meta, price) {
  const c = meta.credit;
  if (c.missed >= 2) return { ok: false, reason: "delinquent" };
  if ((meta.income || 0) <= 0) return { ok: false, reason: "no income" };
  if (c.score < 500) return { ok: false, reason: "score" };
  if (c.balance + price > creditLimit(meta)) return { ok: false, reason: "limit" };
  return { ok: true };
}

/** Put a purchase on the account. The debt credential is forever. (credit.js:49-53) */
export function borrow(meta, price) {
  meta.credit.balance += price;
  meta.credentials.debt = true;
}

/**
 * One excursion of interest (APR/12 — see the form, clause 3).
 * Returns the gold accrued (0 if no balance). (credit.js:55-65)
 */
export function accrueInterest(meta) {
  const c = meta.credit;
  if (c.balance <= 0) return 0;
  const interest = Math.ceil(c.balance * aprFor(c.score) / 12);
  c.balance += interest;
  return interest;
}

/** The minimum due at resurrection: an eighth of the balance, plus 2.
 *  Balances of 8 g or less are due in full. (credit.js:67-75) */
export function minPayment(credit) {
  if (credit.balance <= 0) return 0;
  if (credit.balance <= 8) return credit.balance;
  return Math.ceil(credit.balance / 8) + 2;
}

const clampScore = s => Math.max(SCORE_MIN, Math.min(SCORE_MAX, s)); // credit.js:77

/**
 * Collect the death-time payment from up to `goldAvailable`.
 * On-time: score +10. Shortfall: missed++, score -60.
 * Clearing the balance: missed resets, score +25.
 * Returns { due, paid, fee, missed } or null when there is no balance.
 * (credit.js:79-98)
 */
export function makeDeathPayment(meta, goldAvailable) {
  const c = meta.credit;
  if (c.balance <= 0) return null;
  const due = minPayment(c);
  const paid = Math.min(goldAvailable, due);
  c.balance -= paid;
  const short = paid < due;
  if (short) { c.missed++; c.score = clampScore(c.score - 60); }
  else c.score = clampScore(c.score + 10);
  const fee = Math.min(Math.max(0, goldAvailable - paid), 1);
  if (c.balance <= 0) { c.balance = 0; c.missed = 0; c.score = clampScore(c.score + 25); }
  return { due, paid, fee, missed: short };
}

/** Voluntarily pay the account down. Clearing it restores your good name. (credit.js:100-109) */
export function payDown(meta, amount) {
  const c = meta.credit;
  const paid = Math.min(amount, c.balance);
  c.balance -= paid;
  if (c.balance <= 0 && paid > 0) {
    c.balance = 0; c.missed = 0; c.score = clampScore(c.score + 25);
  }
  return paid;
}

const pct = apr => (apr * 100).toFixed(2) + "%"; // credit.js:111

/**
 * The Truth in Lending disclosure. Every number is live. (credit.js:113-132)
 */
export function truthInLending(meta) {
  const c = meta.credit;
  const apr = aprFor(c.score);
  const limit = creditLimit(meta);
  const projected = c.balance > 0 ? c.balance + Math.ceil(c.balance * apr / 12) : 0;
  return [
    "TRUTH IN LENDING DISCLOSURE — Guild Revolving Credit Account. Required by the Adventurer Financial Protection Act (pending, year forty of pending).",
    "ANNUAL PERCENTAGE RATE (APR): " + pct(apr) + ". Tier: " + tierName(c.score) + ". Your rate is determined by your credit score, currently " + c.score + " (range " + SCORE_MIN + "–" + SCORE_MAX + ").",
    "COMPOUNDING: interest compounds monthly. For purposes of compounding, one (1) dungeon excursion equals one (1) month. This is industry standard. The industry is us.",
    "CREDIT LIMIT: four times verified income, adjusted by tier. Your verified income is " + (meta.income || 0) + " g (income is verified by Guild payroll; slaying geese is payroll). Your limit is " + limit + " g.",
    "MINIMUM PAYMENT: one eighth of the balance plus 2 g, collected at resurrection; balances of 8 g or less are due in full. A convenience fee of 1 g applies for paying by death.",
    "LATE PAYMENTS: −60 to your score. Two missed payments suspends the account. We will still be friends. (See form 7b: We Will Not.)",
    "YOUR ACCOUNT: balance " + c.balance + " g · minimum due " + minPayment(c) + " g · projected balance after one excursion of nonpayment: " + projected + " g.",
    ledgerize("SIGNATURE: Some Hero (definitely original; notarized by the Ledger, who read every word and is very disappointed in clause 3)."),
  ];
}
