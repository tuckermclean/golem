/* K6 — gold-conservation invariant helper.
 *
 * drawer/OATH_AND_LEDGER.md §5 (line 115-116): "Conservation invariant as
 * CI test: sum(balances) == minted − burned, asserted on every replay.
 * Economy exploits are failing tests." DELTA.md K6 verbatim: "a
 * conservation-invariant test helper in testkit (sum(balances) == minted
 * − burned on any replay)".
 *
 * checkGoldConservation(events) folds GOLD_MINTED / GOLD_BURNED /
 * GOLD_TRANSFERRED / PURSE_DISTRIBUTED over per-key balances (keys are
 * the schema's namespaced ids — ordinary player ids like "player:p1" and
 * purse pseudo-accounts like "purse:relic" share the same balance map;
 * see the PURSE_DISTRIBUTED modeling note below) and checks
 * sum(balances) === minted − burned after EVERY folded event, failing at
 * the first violating seq.
 *
 * Pure function, no IO: takes an array of event-shaped objects (matching
 * packages/kernel/schemas/events.v1.json's economy $defs — GOLD_MINTED
 * {to, amount}, GOLD_BURNED {from, amount}, GOLD_TRANSFERRED {from, to,
 * amount}, PURSE_DISTRIBUTED {purse, amount, payouts: [{player, amount}]})
 * and returns a plain result object. Does not mutate its input.
 *
 * PURSE_DISTRIBUTED modeling (K6 brief item 7 — purse semantics were
 * unspecified in drawer/OATH_AND_LEDGER.md, so this is a DEFINED,
 * documented decision): a purse is modeled as an ordinary balance key
 * (the event's `purse` field) that gets debited by `amount`, then each
 * payouts[] line credits its player by its own `amount`. Because a debit
 * and its matching credits are folded through the SAME running sum, a
 * payouts[] that sums to exactly `amount` is a no-op on the invariant
 * (money moved, total unchanged); a payouts[] that does NOT sum to
 * `amount` shifts the running sum away from minted − burned and is
 * caught by the ordinary invariant check below — no separate "purse
 * mismatch" code path is needed.
 *
 * Explicitly OUT OF SCOPE for K6 (per the brief's own instruction: "the
 * sum equation is the law; per-account non-negativity is NOT in K6
 * scope"): a transfer/burn drawing an account negative does not, on its
 * own, violate sum(balances) === minted − burned (both operations are
 * zero-sum against the running total), so this helper does not flag
 * overdrafts. Enforcing non-negative balances is a validate-time concern
 * for whatever future validator consumes this vocabulary — out of scope
 * here by design, not by oversight.
 */

const ECONOMY_KINDS = new Set([
  "GOLD_MINTED",
  "GOLD_BURNED",
  "GOLD_TRANSFERRED",
  "PURSE_DISTRIBUTED",
]);

function bump(balances, key, delta) {
  balances.set(key, (balances.get(key) || 0) + delta);
}

function sumBalances(balances) {
  let total = 0;
  for (const v of balances.values()) total += v;
  return total;
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @returns {{ok: boolean, minted: number, burned: number,
 *            balances: Record<string, number>,
 *            violation?: {seq: unknown, t: string, expected: number, actual: number}}}
 */
export function checkGoldConservation(events) {
  const balances = new Map();
  let minted = 0;
  let burned = 0;

  // Fold in seq order, not array order — a replayed log's on-disk/array
  // order is not a contract this helper depends on.
  const ordered = [...events].filter((ev) => ECONOMY_KINDS.has(ev && ev.t)).sort((a, b) => a.seq - b.seq);

  for (const ev of ordered) {
    switch (ev.t) {
      case "GOLD_MINTED":
        minted += ev.amount;
        bump(balances, ev.to, ev.amount);
        break;
      case "GOLD_BURNED":
        burned += ev.amount;
        bump(balances, ev.from, -ev.amount);
        break;
      case "GOLD_TRANSFERRED":
        bump(balances, ev.from, -ev.amount);
        bump(balances, ev.to, ev.amount);
        break;
      case "PURSE_DISTRIBUTED":
        bump(balances, ev.purse, -ev.amount);
        for (const payout of ev.payouts) bump(balances, payout.player, payout.amount);
        break;
      default:
        continue;
    }

    const actual = sumBalances(balances);
    const expected = minted - burned;
    if (actual !== expected) {
      return {
        ok: false,
        minted,
        burned,
        balances: Object.fromEntries(balances),
        violation: { seq: ev.seq, t: ev.t, expected, actual },
      };
    }
  }

  return { ok: true, minted, burned, balances: Object.fromEntries(balances) };
}
