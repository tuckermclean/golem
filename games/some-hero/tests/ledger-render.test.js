/* Round-trip test: renderLedger(narrativeFacts(state, world, event)) must
 * reproduce the EXACT prose rules/ledger.js's deathReport/gradeRemark
 * produce — the facts->template->prose seam DELTA S2c PR5 exists to prove
 * (docs/superpowers/specs/2026-07-07-s2c-pr5-narrativefacts-design.md).
 * Expected strings are the same ones games/some-hero/rules/tests/
 * ceremony-kernel/ledger-text.kernel.test.js pins (itself the S2a mirror
 * of games/some-hero/ceremony/ledger-text.ceremony.test.js) — reproduced
 * here, not imported, since this test lives in tests/ rather than rules/
 * tests/ceremony-kernel/. Live causes only (skeleton/mailbat); never
 * scarab (dead gen-1 holdover). */
import test from "node:test";
import assert from "node:assert/strict";
import { narrativeFacts } from "../shared/module.js";
import { createState } from "../shared/reducer.js";
import { deathReport, gradeRemark, gradeRun, newRunStats } from "../rules/ledger.js";
import { renderLedger } from "../src/ledger-render.js";

const WORLD = {};

test("round-trip: a first death to mailbat renders the exact ledger-text.kernel.test.js pinned BITE string", () => {
  const state = createState();
  const facts = narrativeFacts(state, WORLD, { t: "DIED", cause: "mailbat", seq: 5 });

  const rendered = renderLedger(facts);
  assert.equal(rendered, "Cause of death: mailbat. The memo was marked URGENT. So, it turns out, was the mailbat.");
  // Directly against rules/ledger.js itself, proving the round-trip
  // matches — not just a hardcoded expectation.
  assert.equal(rendered, deathReport({ deaths: 1, repeatCause: 0 }, "mailbat"));
});

test("round-trip: repeating the same cause renders the repeat-noticing suffix, matching deathReport directly", () => {
  const state = createState();
  state.knowledge = { ...state.knowledge, deaths: 1, lastCause: "skeleton", repeatCause: 0 };
  const facts = narrativeFacts(state, WORLD, { t: "DIED", cause: "skeleton", seq: 9 });

  const rendered = renderLedger(facts);
  assert.match(rendered, /\(Same one as last time\. The Ledger noticed\.\)$/);
  assert.equal(rendered, deathReport({ deaths: 2, repeatCause: 1 }, "skeleton"));
});

test("round-trip: after death #50, renders the unconditional override, matching deathReport directly", () => {
  const state = createState();
  state.knowledge = { ...state.knowledge, deaths: 49, lastCause: null, repeatCause: 0 };
  const facts = narrativeFacts(state, WORLD, { t: "DIED", cause: "skeleton", seq: 50 });

  assert.equal(facts.deaths, 50);
  const rendered = renderLedger(facts);
  assert.equal(rendered, "Yeah.");
  assert.equal(rendered, deathReport({ deaths: 50, repeatCause: 0 }, "skeleton"));
});

test("round-trip: a graded run renders the exact ledger-text.kernel.test.js pinned remark for grade S", () => {
  const state = createState();
  state.run = { ...state.run, runStats: { ...newRunStats(), depth: 3, kills: 5, killsByKind: {}, died: false } };
  const facts = narrativeFacts(state, WORLD, { t: "EXITED_TOMB", zone: "ow", floorNum: 0, mapId: "map:guild_hall", seq: 40 });

  assert.equal(facts.grade, "S");
  const rendered = renderLedger(facts);
  assert.equal(rendered, "The Ledger has used its BEST pen.");
  assert.equal(rendered, gradeRemark(facts.grade));
  assert.equal(rendered, gradeRemark(gradeRun(state.knowledge, { ...state.run.runStats, died: false })));
});

test("round-trip: reachable grade letters (C/B/A/S) all render gradeRemark exactly, via facts computed by narrativeFacts", () => {
  // EXITED_TOMB always grades with died:false (a voluntary exit is never
  // a death — shared/reducer.js's own EXITED_TOMB case), so the "died"
  // penalty branch never fires here and "survive" (+1) always does; F/D
  // are therefore unreachable through this event path (min is C: base
  // C(2) + survive(+1) - slime(1) = C). Only the reachable letters are
  // exercised below.
  const cases = [
    { desc: "depth 0, harmed the slime intern", depth: 0, killsByKind: { slime: 1 }, grade: "C" },
    { desc: "depth 0, clean", depth: 0, killsByKind: {}, grade: "B" },
    { desc: "depth 3 (personal best), harmed the slime intern", depth: 3, killsByKind: { slime: 1 }, grade: "A" },
    { desc: "depth 3 (personal best), clean", depth: 3, killsByKind: {}, grade: "S" },
  ];
  for (const { desc, depth, killsByKind, grade } of cases) {
    const state = createState();
    state.run = { ...state.run, runStats: { ...newRunStats(), depth, kills: 0, killsByKind, died: false } };
    const facts = narrativeFacts(state, WORLD, { t: "EXITED_TOMB", zone: "ow", floorNum: 0, mapId: "map:guild_hall", seq: 1 });
    assert.equal(facts.grade, grade, desc);
    assert.equal(renderLedger(facts), gradeRemark(grade), desc);
  }
});

test("renderLedger(null) — no facts, no narration", () => {
  assert.equal(renderLedger(null), "");
});
