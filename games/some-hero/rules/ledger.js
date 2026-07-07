// THE LEDGER — ported from games/some-hero/legacy/src/systems/ledger.js.
// All pure functions over (meta, runStats). Table-fed from S1's
// content/pack.json wherever tables.mjs extracted the underlying strings.

import { tableRows, tables } from "./pack.js";

// table:ledger_house_style — {word, replacement} pairs, ledger.js:11-14.
// The \b/gi matching + case-preservation is S2's logic (tables.mjs's own
// header calls this out explicitly), reconstructed here exactly as legacy
// did it.
const HOUSE_STYLE = tableRows("table:ledger_house_style");

/** Apply the Ledger's house spelling. The Ledger notarized this function. (ledger.js:18-23) */
export function ledgerize(text) {
  let out = text;
  for (const { word, replacement } of HOUSE_STYLE) {
    const re = new RegExp("\\b" + word + "\\b", "gi");
    out = out.replace(re, m => (m[0] === m[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement));
  }
  return out;
}

// table:ledger_cause_reports_unknown — the fallback pool (ledger.js:96-98).
const CAUSE_UNKNOWN = tableRows("table:ledger_cause_reports_unknown");

/**
 * Legacy keys its cause-report pools directly off a `CAUSE_REPORTS` object
 * (ledger.js:26-100) and falls back to `.unknown` for anything not in it
 * (ledger.js:108: `CAUSE_REPORTS[cause] || CAUSE_REPORTS.unknown`). Here
 * the equivalent lookup is table-driven: `table:ledger_cause_reports_
 * <cause>`, falling back to `table:ledger_cause_reports_unknown` when that
 * table doesn't exist.
 *
 * DEVIATION (see S2a PR report): S1's content/tables.mjs deliberately
 * extracted only the four Ceremony-route-reachable pools (skeleton/
 * mailbat/consultant/unknown) — legacy's other causes (scarab/jackal/
 * spirit/mummy/pigeon/goose/veteran/cabinet/"the Reenactor"/"the Middle
 * Manager") were out of S1's locked scope and are simply absent from the
 * committed, hash-pinned pack.json. Because S2a may not edit that frozen
 * artifact, deathReport(meta, 'scarab') here falls back to the `unknown`
 * pool rather than reproducing legacy's real scarab text — the two
 * ledger-text.ceremony.test.js assertions that pin exact scarab-pool
 * strings are therefore NOT reproducible byte-identically yet, and are
 * explicitly deferred (not mirrored) rather than faked. Every other
 * deathReport ceremony assertion (unknown-pool fallback, repeat-cause
 * suffix, deaths>=50 override, the mailbat BITE) only depends on tables
 * that *are* committed and is mirrored below.
 */
function causePool(cause) {
  const t = tables[`table:ledger_cause_reports_${cause}`];
  return t ? t.rows : CAUSE_UNKNOWN;
}

/**
 * The Ledger writes up your death. Deterministic per (cause, deaths).
 * After death #50 the reports stop trying. (ledger.js:106-113)
 */
export function deathReport(meta, cause) {
  if (meta.deaths >= 50) return "Yeah.";
  const pool = causePool(cause);
  let line = pool[(meta.deaths - 1) % pool.length];
  if (meta.repeatCause === 1) line += " (Same one as last time. The Ledger noticed.)";
  if (meta.repeatCause >= 2) line += " (THE SAME ONE. AGAIN. The Ledger is no longer narrating this heroically.)";
  return ledgerize(line);
}

const GRADES = ["F", "D", "C", "B", "A", "S"]; // ledger.js:116

/**
 * Grade a run. Unfair on purpose, but deterministically unfair (ledger.js:
 * 128-142). Pure arithmetic — no table (GRADES/the rubric aren't
 * extracted strings, they're the logic).
 */
export function gradeRun(meta, run) {
  let g = 2; // C
  g += Math.floor(run.depth / 3);
  if (run.depth > 0 && run.depth >= meta.bestDepth) g++;
  if (run.kills >= 10) g++;
  if (run.killsByKind && run.killsByKind.slime) g--;
  if (run.died) {
    g--;
    if (meta.repeatCause >= 1) g--;
  } else {
    g++;
  }
  g = Math.max(0, Math.min(GRADES.length - 1, g));
  return GRADES[g];
}

// table:ledger_grade_remarks — [{grade, remark}], ledger.js:146-153.
const GRADE_REMARKS = tableRows("table:ledger_grade_remarks");

/** The Ledger's remark to accompany a grade. Table-fed. (ledger.js:145-154) */
export function gradeRemark(grade) {
  const row = GRADE_REMARKS.find(r => r.grade === grade);
  return ledgerize(row.remark);
}

// table:ledger_loot_lines — [{kind, text}], ledger.js:157-162.
const LOOT_LINES = tableRows("table:ledger_loot_lines");

/** Loot the Ledger considers EXTREMELY THE GOOD KIND. Table-fed. (ledger.js:156-163) */
export function lootLine(kind) {
  const row = LOOT_LINES.find(r => r.kind === kind);
  return ledgerize(row ? row.text : "");
}

// table:ledger_misc — [union206Line text, internLine text], ledger.js:167,172.
const LEDGER_MISC = tableRows("table:ledger_misc");

/** Stratum I monsters are unionized. (ledger.js:165-167) */
export function union206Line() {
  return ledgerize(LEDGER_MISC[0]);
}

/** The slime was not a member. The slime was an intern. (ledger.js:170-172) */
export function internLine() {
  return ledgerize(LEDGER_MISC[1]);
}

/** Fresh per-run stats. The riddle door and customs both read from this. (ledger.js:175-178) */
export function newRunStats() {
  return { depth: 0, kills: 0, died: false, killsByKind: {}, glurpsDrunk: 0, goldGained: 0 };
}
