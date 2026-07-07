/* ── DELTA S1 PR2 DoD tests: the content-review checklist ("all strings
   present") for games/some-hero/content/tables.mjs. Per the design spec
   (docs/superpowers/specs/2026-07-07-s1-content-extraction-design.md,
   "Legacy code untouched" — mechanism), TESTS may import legacy/ — that
   is how characterization proves byte-identity; tables.mjs itself never
   does. Every table below is round-tripped through the live legacy
   exported function/behavior it was transcribed from and asserted
   deep-equal (or exact string equal) against its tables.mjs row(s).

   Also asserts the exact set of table ids compiled into pack.json, so a
   dropped (or accidentally renamed) table fails this suite immediately —
   the other half of the "all strings present" checklist. */

import test from "node:test";
import assert from "node:assert/strict";

import { TABLE_DEFS } from "../content/tables.mjs";
import { compileContentPack } from "../content/build-pack.mjs";

import { ledgerize, deathReport, gradeRemark, lootLine, union206Line, internLine } from "../legacy/src/systems/ledger.js";
import { entryLines, approvalLines } from "../legacy/src/content/golem.js";
import { sealMsg } from "../legacy/src/systems/puzzles.js";
import { nextRiddle, doorSigh } from "../legacy/src/systems/riddle.js";
import { floorLine } from "../legacy/src/content/floors.js";

function tableRows(id) {
  const t = TABLE_DEFS.find((t) => t.id === id);
  assert.ok(t, `table ${id} not found in TABLE_DEFS`);
  return t.rows;
}

// ── exact table-id set (the "no dropped table" half of the checklist) ──

test("TABLE_DEFS has exactly the 16 tables in the design spec's inventory", () => {
  const ids = TABLE_DEFS.map((t) => t.id).sort();
  assert.deepEqual(ids, [
    "table:door_golem_approval_lines",
    "table:door_golem_credential_lines",
    "table:door_golem_entry_lines",
    "table:floors_descent_lines",
    "table:ledger_cause_reports_consultant",
    "table:ledger_cause_reports_mailbat",
    "table:ledger_cause_reports_skeleton",
    "table:ledger_cause_reports_unknown",
    "table:ledger_grade_remarks",
    "table:ledger_house_style",
    "table:ledger_loot_lines",
    "table:ledger_misc",
    "table:riddle_door_sighs",
    "table:riddle_questions",
    "table:riddle_shame_options",
    "table:seal_messages",
  ]);
});

test("compiled pack.json's tables match TABLE_DEFS's ids exactly (schema-frozen, id-renamed-per-TableId-pattern)", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const compiledIds = Object.keys(result.pack.tables).sort();
  const sourceIds = TABLE_DEFS.map((t) => t.id).sort();
  assert.deepEqual(compiledIds, sourceIds);
});

// ── ledger.js ────────────────────────────────────────────────────────

test("table:ledger_house_style rows reproduce ledgerize()'s substitutions, lower- and upper-case", () => {
  for (const { word, replacement } of tableRows("table:ledger_house_style")) {
    assert.equal(ledgerize(word), replacement);
    const capitalized = word[0].toUpperCase() + word.slice(1);
    const capitalizedReplacement = replacement[0].toUpperCase() + replacement.slice(1);
    assert.equal(ledgerize(capitalized), capitalizedReplacement);
  }
});

function causeReportRows(cause, tableId) {
  const rows = tableRows(tableId);
  // deathReport(meta, cause) = ledgerize(pool[(deaths-1) % pool.length]);
  // repeatCause 0 (falsy) => no appended sentence; deaths < 50 => not the
  // post-50 'Yeah.' shortcut. deaths=1,2,3 walks the 3-entry pool in order.
  rows.forEach((expected, i) => {
    const meta = { deaths: i + 1, repeatCause: 0 };
    assert.equal(deathReport(meta, cause), expected, `${tableId}[${i}]`);
  });
}

test("table:ledger_cause_reports_skeleton matches deathReport('skeleton', ...)", () => {
  causeReportRows("skeleton", "table:ledger_cause_reports_skeleton");
});
test("table:ledger_cause_reports_mailbat matches deathReport('mailbat', ...)", () => {
  causeReportRows("mailbat", "table:ledger_cause_reports_mailbat");
});
test("table:ledger_cause_reports_consultant matches deathReport('consultant', ...)", () => {
  causeReportRows("consultant", "table:ledger_cause_reports_consultant");
});
test("table:ledger_cause_reports_unknown matches deathReport('some-unmapped-cause', ...) (CAUSE_REPORTS.unknown fallback)", () => {
  causeReportRows("this-cause-does-not-exist-in-legacy", "table:ledger_cause_reports_unknown");
});

test("table:ledger_grade_remarks matches gradeRemark() for every grade, F->S order preserved", () => {
  const rows = tableRows("table:ledger_grade_remarks");
  assert.deepEqual(
    rows.map((r) => r.grade),
    ["F", "D", "C", "B", "A", "S"],
  );
  for (const { grade, remark } of rows) {
    assert.equal(gradeRemark(grade), remark);
  }
});

test("table:ledger_loot_lines matches lootLine() for sword/maxheart/amulet", () => {
  for (const { kind, text } of tableRows("table:ledger_loot_lines")) {
    assert.equal(lootLine(kind), text);
  }
});

test("table:ledger_misc matches union206Line()/internLine()", () => {
  const [union206, intern] = tableRows("table:ledger_misc");
  assert.equal(union206Line(), union206);
  assert.equal(internLine(), intern);
});

// ── golem.js ─────────────────────────────────────────────────────────

test("table:door_golem_credential_lines matches CRED_LINES (via entryLines()'s per-missing lookup)", () => {
  const rows = tableRows("table:door_golem_credential_lines");
  const game = { player: { swordLv: 0 } };
  const result = entryLines(game, ["sword", "backstory", "debt"]);
  // result = [HALT, swordVerdict(...), CRED_LINES.sword, CRED_LINES.backstory, CRED_LINES.debt, 'ENTRY: DENIED...']
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.text]));
  assert.equal(result[2], byKey.sword);
  assert.equal(result[3], byKey.backstory);
  assert.equal(result[4], byKey.debt);
});

test("table:door_golem_entry_lines matches entryLines()'s static lines (HALT open, ENTRY:DENIED close)", () => {
  const [halt, entryDenied] = tableRows("table:door_golem_entry_lines");
  const game = { player: { swordLv: 1 } };
  const result = entryLines(game, []); // no missing credentials => [HALT, swordVerdict, 'ENTRY: DENIED...']
  assert.equal(result[0], halt);
  assert.equal(result[2], entryDenied);
});

test("table:door_golem_approval_lines matches approvalLines()'s static lines (every index but swordVerdict's)", () => {
  const rows = tableRows("table:door_golem_approval_lines");
  const game = { player: { swordLv: 4 } };
  const result = approvalLines(game);
  assert.equal(result.length, 11);
  assert.equal(rows.length, 10);
  assert.equal(result[0], rows[0]); // HALT
  // result[1] is swordVerdict(...) — dynamic, excluded from the table.
  for (let i = 1; i < rows.length; i++) {
    assert.equal(result[i + 1], rows[i], `approvalLines()[${i + 1}] vs rows[${i}]`);
  }
});

// ── puzzles.js ───────────────────────────────────────────────────────

test("table:seal_messages reconstructs sealMsg() for every puzzle type", () => {
  const rows = tableRows("table:seal_messages");
  const byType = Object.fromEntries(rows.map((r) => [r.type, r.parts]));

  assert.equal(sealMsg({ type: "warden" }), byType.warden[0]);
  assert.equal(sealMsg({ type: "final" }), byType.final[0]);
  assert.equal(sealMsg({ type: "key" }), byType.key[0]);
  assert.equal(sealMsg({ type: "riddle" }), byType.riddle[0]);

  const plates = byType.plates;
  assert.equal(sealMsg({ type: "plates", done: 2, need: 5 }), plates[0] + 2 + plates[1] + 5 + plates[2]);

  const traps = byType.traps;
  assert.equal(sealMsg({ type: "traps", done: 1, need: 3 }), traps[0] + 1 + traps[1] + 3 + traps[2]);

  const torch = byType.torch;
  // any type not explicitly matched hits sealMsg's final catch-all branch.
  assert.equal(sealMsg({ type: "torch", n: 4 }), torch[0] + 4 + torch[1]);
});

// ── riddle.js ────────────────────────────────────────────────────────

test("table:riddle_questions matches nextRiddle()'s static question text for attempts 3/2/1/0(no-kinds)", () => {
  const [shameQ, floorQ, glurpsQ, fallbackQ] = tableRows("table:riddle_questions");
  const rng = () => 0;

  assert.equal(nextRiddle({ puzzle: { attempts: 3 }, runStats: {}, floorNum: 1 }, rng).q, shameQ);
  assert.equal(nextRiddle({ puzzle: { attempts: 2 }, runStats: {}, floorNum: 7 }, rng).q, floorQ);
  assert.equal(nextRiddle({ puzzle: { attempts: 1 }, runStats: { glurpsDrunk: 0 }, floorNum: 1 }, rng).q, glurpsQ);
  assert.equal(
    nextRiddle({ puzzle: { attempts: 0 }, runStats: { kills: 0, killsByKind: {} }, floorNum: 1 }, rng).q,
    fallbackQ,
  );
});

test("table:riddle_shame_options matches nextRiddle()'s shame-path options (attempts >= 3)", () => {
  const rows = tableRows("table:riddle_shame_options");
  const result = nextRiddle({ puzzle: { attempts: 3 }, runStats: {}, floorNum: 1 }, () => 0);
  assert.deepEqual(result.options, rows);
  assert.equal(result.shame, true);
});

test("table:riddle_door_sighs matches doorSigh(1)/doorSigh(2)/doorSigh(3)", () => {
  const rows = tableRows("table:riddle_door_sighs");
  assert.equal(doorSigh(1), rows[0]);
  assert.equal(doorSigh(2), rows[1]);
  assert.equal(doorSigh(3), rows[2]);
});

// ── floors.js ────────────────────────────────────────────────────────

test("table:floors_descent_lines matches floorLine(1)", () => {
  const [floor1] = tableRows("table:floors_descent_lines");
  assert.equal(floorLine(1), floor1);
});
