// Mirror of games/some-hero/ceremony/ledger-text.ceremony.test.js against
// rules/ instead of legacy/src.
//
// DEFERRED (2 of 11 tests — a content-table gap, NOT a wired-state-
// machine defer): "deathReport selection is deterministic: pool[(deaths-1)
// % pool.length], keyed by cause" (ceremony/ledger-text.ceremony.test.js:
// 25-32) and "deathReport selection advances through the pool as deaths
// accumulate" (ceremony/ledger-text.ceremony.test.js:34-45). Both pin
// exact text from legacy's CAUSE_REPORTS.scarab pool
// (legacy/src/systems/ledger.js:70-74). S1's content/tables.mjs
// deliberately extracted only the four Ceremony-route-reachable cause
// pools (skeleton/mailbat/consultant/unknown) — scarab was out of S1's
// locked scope and is absent from the committed, hash-pinned pack.json.
// S2a may not edit that frozen artifact (would break content-pack.test.js/
// content-review.test.js/hash-stability.test.js's exact 16-table/golden-
// hash pins), and hardcoding the scarab strings directly in rules/ledger.js
// would violate this PR's "read tables, don't hardcode" mandate. See
// rules/ledger.js's causePool() doc comment for the full explanation.
// Every other deathReport ceremony assertion is covered below.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMeta, recordDeath } from "../../meta.js";
import { ledgerize, deathReport, gradeRun, gradeRemark, lootLine, newRunStats } from "../../ledger.js";

// ceremony/ledger-text.ceremony.test.js:16-23
test("@ceremony-kernel ledgerize house-style spelling substitutions are pinned, case-preserving", () => {
  assert.equal(ledgerize("the original hero"), "the origenal hero");
  assert.equal(ledgerize("Original character"), "Origenal character");
  assert.equal(ledgerize("definitely victorious"), "definately victoreous");
  assert.equal(ledgerize("the nemesis returns"), "the nemisis returns");
  assert.equal(ledgerize("Nemesis returns"), "Nemisis returns", "capitalized nemesis is also case-preserved");
  assert.equal(ledgerize("a plain sentence"), "a plain sentence", "no false positives");
});

// ceremony/ledger-text.ceremony.test.js:47-55
test("@ceremony-kernel deathReport appends a repeat-noticing suffix keyed off meta.repeatCause, not deaths", () => {
  const m = createMeta();
  recordDeath(m, "scarab");
  assert.doesNotMatch(deathReport(m, "scarab"), /noticed|AGAIN/);
  recordDeath(m, "scarab"); // repeatCause becomes 1
  assert.match(deathReport(m, "scarab"), /\(Same one as last time\. The Ledger noticed\.\)$/);
  recordDeath(m, "scarab"); // repeatCause becomes 2
  assert.match(deathReport(m, "scarab"), /\(THE SAME ONE\. AGAIN\. The Ledger is no longer narrating this heroically\.\)$/);
});

// ceremony/ledger-text.ceremony.test.js:57-66
test('@ceremony-kernel deathReport falls back to the "unknown" pool for unlisted causes, including null', () => {
  const m = createMeta();
  recordDeath(m, null);
  const line = deathReport(m, null);
  assert.equal(line, 'Cause of death: unclear. The form does not have a box for this. We made a box. It says "?".');
  const m2 = createMeta();
  recordDeath(m2, "totally-unlisted-cause");
  assert.equal(deathReport(m2, "totally-unlisted-cause"),
    'Cause of death: unclear. The form does not have a box for this. We made a box. It says "?".');
});

// ceremony/ledger-text.ceremony.test.js:68-74
test('@ceremony-kernel after death #50, selection is overridden unconditionally to "Yeah."', () => {
  const m = createMeta();
  m.deaths = 50;
  assert.equal(deathReport(m, "mummy"), "Yeah.");
  m.deaths = 51;
  assert.equal(deathReport(m, "jackal"), "Yeah.", "stays overridden past 50");
});

// ceremony/ledger-text.ceremony.test.js:76-87
test("@ceremony-kernel gradeRun selection: base C, +1 per 3 depth, +1 personal-best, +1 for 10+ kills, -1 for slime kill, -1/-2 for dying (repeat)", () => {
  const order = ["F", "D", "C", "B", "A", "S"];
  const m = createMeta();
  assert.equal(gradeRun(m, { depth: 0, kills: 0, died: false }), "B", "C(2) + survive(+1) + personal best at depth 0 is NOT counted (depth>0 required) => B");
  assert.equal(gradeRun(m, { depth: 3, kills: 0, died: false }), "S", "C(2) +1 depth/3 +1 personal best(3>=0) +1 survive = 5 -> S, clamped at max");
  const guilty = gradeRun(m, { depth: 0, kills: 0, died: false, killsByKind: { slime: 1 } });
  const clean = gradeRun(m, { depth: 0, kills: 0, died: false, killsByKind: {} });
  assert.equal(order.indexOf(guilty), order.indexOf(clean) - 1, "harming the intern costs exactly one letter grade");
  const onceRepeat0 = gradeRun({ ...m, repeatCause: 0 }, { depth: 3, kills: 5, died: true });
  const repeat1 = gradeRun({ ...m, repeatCause: 1 }, { depth: 3, kills: 5, died: true });
  assert.equal(order.indexOf(onceRepeat0) - order.indexOf(repeat1), 1, "dying to the same cause twice drops one more grade");
});

// ceremony/ledger-text.ceremony.test.js:89-96
test("@ceremony-kernel gradeRemark text is selected per grade letter, in house style (ledgerized)", () => {
  assert.equal(gradeRemark("S"), "The Ledger has used its BEST pen.");
  assert.equal(gradeRemark("A"), "The Ledger is prepared to call this heroism, with reservations.");
  assert.equal(gradeRemark("B"), "Adequate. The king would be proud, which should worry you.");
  assert.equal(gradeRemark("C"), "Our hero strode boldly into the— FINE. Walked. The grade stands.");
  assert.equal(gradeRemark("D"), "The Ledger has written this page in pencil, out of mercy.");
  assert.equal(gradeRemark("F"), "The Ledger is not angry. The Ledger is documenting.");
});

// ceremony/ledger-text.ceremony.test.js:98-103
test("@ceremony-kernel lootLine selects by loot kind; unknown kinds render nothing", () => {
  assert.equal(lootLine("sword"), "SUN-STEEL. AN ACTUAL SWORD. EXTREMELY THE GOOD KIND. The Ledger is pressing very hard with the pen.");
  assert.equal(lootLine("maxheart"), "CONSTITUTION INCREASE. The Ledger has underlined it twice.");
  assert.equal(lootLine("amulet"), "TICKET #44,107: STAMPED. The Ledger is doing a voice. It is the same voice.");
  assert.equal(lootLine("gold"), "", "gold has no Ledger commentary");
});

// ceremony/ledger-text.ceremony.test.js:105-107
test("@ceremony-kernel newRunStats: the fresh shape the door/riddle/customs all read from", () => {
  assert.deepEqual(newRunStats(), { depth: 0, kills: 0, died: false, killsByKind: {}, glurpsDrunk: 0, goldGained: 0 });
});

// ceremony/ledger-text.ceremony.test.js:109-115
test("@ceremony-kernel BITE: deathReport at deaths=1 selects pool index 0, not index 1 — an off-by-one selection fails", () => {
  const m = createMeta();
  recordDeath(m, "mailbat");
  assert.equal(deathReport(m, "mailbat"), "Cause of death: mailbat. The memo was marked URGENT. So, it turns out, was the mailbat.");
  assert.notEqual(deathReport(m, "mailbat"), "Employee failed to sign for a delivery. Delivery insisted.",
    "that is pool index 1 (deaths=2), the wrong (bitten) selection for deaths=1");
});
