/* Unit tests for shared/module.js's narrativeFacts(state, world, event) —
 * DELTA S2c PR5 scope (docs/superpowers/specs/
 * 2026-07-07-s2c-pr5-narrativefacts-design.md). narrativeFacts is the
 * ONLY integration point the golem (doctrine #4) is allowed to read from,
 * so it must emit raw facts and NEVER prose: `DIED` -> {kind:"death",...},
 * `EXITED_TOMB` -> {kind:"grade",...}, every other event -> null.
 *
 * Live causes only (skeleton/mailbat) — scarab is a dead gen-1 holdover
 * (rules/ledger.js's own causePool() doc comment); never reintroduced. */
import test from "node:test";
import assert from "node:assert/strict";
import { narrativeFacts } from "../shared/module.js";
import { createState } from "../shared/reducer.js";
import { gradeRun, newRunStats } from "../rules/ledger.js";

// A dummy World — narrativeFacts never reads it (both facts this PR
// emits are derived entirely from state + the event), but the signature
// takes one per @golem-engine/kernel's GameModule shape.
const WORLD = {};

function baseState() {
  return createState();
}

// ── DIED -> {kind:"death", ...} ─────────────────────────────────────────

test("DIED: first death of a run emits deaths=1, repeatCause=0 for the given cause", () => {
  const state = baseState();
  const facts = narrativeFacts(state, WORLD, { t: "DIED", cause: "skeleton", seq: 5 });
  assert.deepEqual(facts, { kind: "death", cause: "skeleton", deaths: 1, repeatCause: 0 });
});

test("DIED: a second death to a DIFFERENT cause resets repeatCause to 0 and advances deaths", () => {
  const state = baseState();
  state.knowledge = { ...state.knowledge, deaths: 1, lastCause: "skeleton", repeatCause: 0 };
  const facts = narrativeFacts(state, WORLD, { t: "DIED", cause: "mailbat", seq: 9 });
  assert.deepEqual(facts, { kind: "death", cause: "mailbat", deaths: 2, repeatCause: 0 });
});

test("DIED: repeating the SAME cause increments repeatCause (the Ledger notices)", () => {
  const state = baseState();
  state.knowledge = { ...state.knowledge, deaths: 1, lastCause: "mailbat", repeatCause: 0 };
  const facts = narrativeFacts(state, WORLD, { t: "DIED", cause: "mailbat", seq: 9 });
  assert.deepEqual(facts, { kind: "death", cause: "mailbat", deaths: 2, repeatCause: 1 });

  const state2 = { ...state, knowledge: { ...state.knowledge, deaths: 2, lastCause: "mailbat", repeatCause: 1 } };
  const facts2 = narrativeFacts(state2, WORLD, { t: "DIED", cause: "mailbat", seq: 12 });
  assert.deepEqual(facts2, { kind: "death", cause: "mailbat", deaths: 3, repeatCause: 2 });
});

test("DIED: narrativeFacts is pure — the input state's knowledge is not mutated", () => {
  const state = baseState();
  state.knowledge = { ...state.knowledge, deaths: 1, lastCause: "skeleton", repeatCause: 0 };
  const before = JSON.stringify(state.knowledge);
  narrativeFacts(state, WORLD, { t: "DIED", cause: "skeleton", seq: 9 });
  assert.equal(JSON.stringify(state.knowledge), before, "state.knowledge must be untouched");
});

test("DIED facts never contain prose — only the neutral cause/deaths/repeatCause fields", () => {
  const state = baseState();
  const facts = narrativeFacts(state, WORLD, { t: "DIED", cause: "skeleton", seq: 1 });
  assert.deepEqual(Object.keys(facts).sort(), ["cause", "deaths", "kind", "repeatCause"]);
  assert.equal(typeof facts.cause, "string");
  assert.equal(typeof facts.deaths, "number");
  assert.equal(typeof facts.repeatCause, "number");
});

// ── EXITED_TOMB -> {kind:"grade", ...} ──────────────────────────────────

test("EXITED_TOMB: emits the grade/depth/kills/killsByKind/died facts, matching the reducer's own gradeRun call", () => {
  const state = baseState();
  state.run = { ...state.run, runStats: { ...newRunStats(), depth: 3, kills: 12, killsByKind: {}, died: false } };
  const facts = narrativeFacts(state, WORLD, { t: "EXITED_TOMB", zone: "ow", floorNum: 0, mapId: "map:guild_hall", seq: 40 });

  const expectedGrade = gradeRun(state.knowledge, { ...state.run.runStats, died: false });
  assert.deepEqual(facts, {
    kind: "grade",
    grade: expectedGrade,
    depth: 3,
    kills: 12,
    killsByKind: {},
    died: false,
  });
});

test("EXITED_TOMB: uses PRE-event knowledge (personal-best/bestDepth not yet bumped) — same inputs the reducer's gradeRun call uses", () => {
  const state = baseState();
  // A personal best already on the books at depth 5; this run only made
  // it to depth 2, so the "beat personal best" grade bonus must NOT apply.
  state.knowledge = { ...state.knowledge, bestDepth: 5 };
  state.run = { ...state.run, runStats: { ...newRunStats(), depth: 2, kills: 0, killsByKind: {}, died: false } };
  const facts = narrativeFacts(state, WORLD, { t: "EXITED_TOMB", zone: "ow", floorNum: 0, mapId: "map:guild_hall", seq: 12 });

  // C(2) + floor(2/3)=0 + no personal-best bonus (2 < 5) + survive(+1) = 3 -> "B"
  assert.equal(facts.grade, "B");
});

test("EXITED_TOMB: died carries the raw runStats.died value even though grading always treats a voluntary exit as died:false", () => {
  const state = baseState();
  // A death happened earlier this run (RESURRECTED sets runStats.died=true
  // and does NOT reset it — shared/reducer.js's own documented invariant),
  // then the hero pressed on and voluntarily exited.
  state.run = { ...state.run, runStats: { ...newRunStats(), depth: 1, kills: 0, killsByKind: {}, died: true } };
  const facts = narrativeFacts(state, WORLD, { t: "EXITED_TOMB", zone: "ow", floorNum: 0, mapId: "map:guild_hall", seq: 12 });
  assert.equal(facts.died, true, "the raw fact reflects this run's real died flag");
  // But the grade itself must still be computed with died:false (the
  // reducer's own override for voluntary exits — never penalized as a death).
  const expectedGrade = gradeRun(state.knowledge, { ...state.run.runStats, died: false });
  assert.equal(facts.grade, expectedGrade);
});

// ── everything else -> null ──────────────────────────────────────────────

test("every other event kind emits null (no narration)", () => {
  const state = baseState();
  const noOpEvents = [
    { t: "FLOOR_ENTERED", zone: "ow", floorNum: 0, mapId: "map:guild_hall", seq: 1 },
    { t: "MOVED", x: 1, y: 1, seq: 2 },
    { t: "TICK_ADVANCED", tick: 1, seq: 3 },
    { t: "GOLEM_DENIED", missing: [], seq: 4 },
    { t: "GOLEM_APPROVED", seq: 5 },
    { t: "ENTERED_TOMB", zone: "tomb", floorNum: 1, mapId: "map:tomb_floor_1_synthetic", spawn: { x: 1, y: 1 }, seq: 6 },
    { t: "RIDDLE_ASKED", seq: 7 },
    { t: "HURT", amount: 3, cause: "skeleton", seq: 8 },
    { t: "RESURRECTED", cause: "skeleton", seq: 9 },
  ];
  for (const ev of noOpEvents) {
    assert.equal(narrativeFacts(state, WORLD, ev), null, `expected null facts for ${ev.t}`);
  }
});
