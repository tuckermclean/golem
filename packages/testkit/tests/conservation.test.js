/* K6 — unit tests for packages/testkit/tools/conservation.mjs's
 * checkGoldConservation(events), the gold-conservation invariant helper
 * DELTA.md K6 requires: "sum(balances) == minted − burned on any
 * replay" (drawer/OATH_AND_LEDGER.md §5, line 115-116).
 *
 * Written RED-first per K6 brief item 7 ("TDD: helper tests RED first"):
 * this file was authored and run against a stub-only tools/conservation.mjs
 * (module didn't exist yet) to confirm every test failed for the right
 * reason (import error), before the implementation was written. See the
 * K6 report for the literal RED command/output.
 *
 * Scope decisions this file encodes (K6 brief item 7, "DECIDE by the
 * invariant's own wording"):
 *   - The sum equation (sum(balances) === minted - burned) IS the law.
 *   - Per-account non-negativity is explicitly NOT in K6 scope: an
 *     overdrafted transfer or a burn-more-than-held burn does not, by
 *     itself, break the sum invariant (both are zero-sum against the
 *     minted/burned totals), so the helper does not flag either. That is
 *     a validate-time concern for whatever future validator enforces it.
 *   - PURSE_DISTRIBUTED is modeled as debiting a pseudo-balance keyed by
 *     `purse` by `amount`, then crediting each payouts[] line to its
 *     player. A payouts[] that doesn't sum to `amount` therefore shows up
 *     as an ordinary sum-invariant violation (the debit and the credits
 *     no longer cancel), localized at that event's seq — no separate
 *     "purse mismatch" code path is needed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkGoldConservation } from "../tools/conservation.mjs";

test("green synthetic log: mint, transfer, burn, funded purse distribution all conserve", () => {
  const events = [
    { t: "GOLD_MINTED", seq: 1, to: "player:p1", amount: 100 },
    { t: "GOLD_TRANSFERRED", seq: 2, from: "player:p1", to: "player:p2", amount: 40 },
    { t: "GOLD_BURNED", seq: 3, from: "player:p2", amount: 10 },
    // Fund a purse from p1's remaining balance, then distribute it exactly.
    { t: "GOLD_TRANSFERRED", seq: 4, from: "player:p1", to: "purse:relic", amount: 20 },
    {
      t: "PURSE_DISTRIBUTED",
      seq: 5,
      purse: "purse:relic",
      amount: 20,
      payouts: [
        { player: "player:p1", amount: 12 },
        { player: "player:p3", amount: 8 },
      ],
    },
  ];

  const result = checkGoldConservation(events);

  assert.equal(result.ok, true);
  assert.equal(result.minted, 100);
  assert.equal(result.burned, 10);
  assert.equal(result.balances["player:p1"], 100 - 40 - 20 + 12); // 52
  assert.equal(result.balances["player:p2"], 40 - 10); // 30
  assert.equal(result.balances["player:p3"], 8);
  assert.equal(result.balances["purse:relic"], 0);
  const sum = Object.values(result.balances).reduce((a, b) => a + b, 0);
  assert.equal(sum, result.minted - result.burned);
  assert.equal(result.violation, undefined);
});

test("pure function: does not mutate its input events array", () => {
  const events = [
    { t: "GOLD_MINTED", seq: 1, to: "player:p1", amount: 5 },
    { t: "GOLD_BURNED", seq: 2, from: "player:p1", amount: 2 },
  ];
  const before = JSON.stringify(events);
  checkGoldConservation(events);
  assert.equal(JSON.stringify(events), before);
});

test("out of scope: transfer from an empty/overdrawn balance does not break the sum invariant", () => {
  // p1 never received a mint; this transfer overdraws p1 to -15. Per-account
  // non-negativity is explicitly out of scope for K6 (see header comment);
  // the sum(balances) == minted - burned equation still holds because the
  // transfer is zero-sum regardless of the sender's starting balance.
  const events = [
    { t: "GOLD_TRANSFERRED", seq: 1, from: "player:p1", to: "player:p2", amount: 15 },
  ];

  const result = checkGoldConservation(events);

  assert.equal(result.ok, true);
  assert.equal(result.balances["player:p1"], -15);
  assert.equal(result.balances["player:p2"], 15);
  assert.equal(result.minted, 0);
  assert.equal(result.burned, 0);
});

test("out of scope: burning more than an account holds does not break the sum invariant", () => {
  const events = [
    { t: "GOLD_BURNED", seq: 1, from: "player:p1", amount: 50 },
  ];

  const result = checkGoldConservation(events);

  assert.equal(result.ok, true);
  assert.equal(result.balances["player:p1"], -50);
  assert.equal(result.burned, 50);
});

test("violation: PURSE_DISTRIBUTED whose payouts[] don't sum to the purse amount is caught, localized at its seq", () => {
  const events = [
    { t: "GOLD_MINTED", seq: 1, to: "player:p1", amount: 100 },
    { t: "GOLD_TRANSFERRED", seq: 2, from: "player:p1", to: "purse:relic", amount: 20 },
    {
      // Only pays out 15 of the 20-gold purse — the missing 5 breaks
      // sum(balances) == minted - burned.
      t: "PURSE_DISTRIBUTED",
      seq: 3,
      purse: "purse:relic",
      amount: 20,
      payouts: [{ player: "player:p3", amount: 15 }],
    },
    // A later, correctly-summed event must not mask the seq-3 violation.
    { t: "GOLD_TRANSFERRED", seq: 4, from: "player:p3", to: "player:p1", amount: 1 },
  ];

  const result = checkGoldConservation(events);

  assert.equal(result.ok, false);
  assert.ok(result.violation, "expected a violation to be reported");
  assert.equal(result.violation.seq, 3);
  assert.equal(result.violation.t, "PURSE_DISTRIBUTED");
  assert.equal(result.violation.expected, 100); // minted(100) - burned(0)
  assert.equal(result.violation.actual, 95); // 5 short of the purse amount
});

test("violation localization: the FIRST violating seq is reported, not a later one", () => {
  const events = [
    { t: "GOLD_MINTED", seq: 1, to: "player:p1", amount: 10 },
    { t: "GOLD_TRANSFERRED", seq: 2, from: "player:p1", to: "purse:a", amount: 10 },
    {
      t: "PURSE_DISTRIBUTED",
      seq: 3,
      purse: "purse:a",
      amount: 10,
      payouts: [{ player: "player:p2", amount: 4 }], // 6 short — first break
    },
    {
      t: "PURSE_DISTRIBUTED",
      seq: 4,
      purse: "purse:nonexistent",
      amount: 3,
      payouts: [{ player: "player:p3", amount: 9 }], // also mismatched
    },
  ];

  const result = checkGoldConservation(events);

  assert.equal(result.ok, false);
  assert.equal(result.violation.seq, 3);
});

test("events out of seq order are folded in seq order, not array order", () => {
  const events = [
    { t: "GOLD_BURNED", seq: 2, from: "player:p1", amount: 10 },
    { t: "GOLD_MINTED", seq: 1, to: "player:p1", amount: 10 },
  ];

  const result = checkGoldConservation(events);

  assert.equal(result.ok, true);
  assert.equal(result.balances["player:p1"], 0);
});

test("non-economy event kinds are ignored by the fold", () => {
  const events = [
    { t: "JOIN", seq: 1, pid: "p1", name: "Ash" },
    { t: "GOLD_MINTED", seq: 2, to: "player:p1", amount: 7 },
    { t: "MOVE", seq: 3, pid: "p1", x: 1, y: 1 },
  ];

  const result = checkGoldConservation(events);

  assert.equal(result.ok, true);
  assert.equal(result.minted, 7);
  assert.equal(result.balances["player:p1"], 7);
});
