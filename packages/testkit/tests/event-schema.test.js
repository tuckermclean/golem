/* K6 — event schema v1 conformance tests.
 *
 * Two halves:
 *  1. Positive: every event in every packages/testkit/fixtures/golem/
 *     *.log.json AND games/golem-grid/tests/golden/replay-log.json
 *     validates against packages/kernel/schemas/events.v1.json. This is
 *     the same assertion packages/testkit/tools/validate-events.mjs makes
 *     as a runnable CI gate; this test file exists so `npm test` (node
 *     --test discovery) catches a schema regression too, not just the
 *     dedicated tool.
 *  2. Negative: one deliberately malformed event per failure mode is
 *     REJECTED — wrong type, missing required, unknown kind, extra
 *     property (additionalProperties:false), and a bad namespaced-id
 *     pattern / bound on a drawer kind (GOLD_TRANSFERRED with a
 *     non-namespaced id and, separately, a negative amount; LOAN_ISSUED
 *     missing terms_hash) — per K6 brief item 6's explicit examples.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
// ajv's default export only recognizes the draft-07 meta-schema; this
// schema is draft 2020-12 (K6 brief controller decision #2), so the
// dedicated 2020 build is required — see validate-events.mjs's own note.
import Ajv2020 from "ajv/dist/2020.js";

const SCHEMA_PATH = new URL("../../kernel/schemas/events.v1.json", import.meta.url);
const FIXTURES_DIR = new URL("../fixtures/golem/", import.meta.url);
const GOLDEN_PATH = new URL(
  "../../../games/golem-grid/tests/golden/replay-log.json",
  import.meta.url,
);

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateEvent = ajv.compile(schema);

function logFiles() {
  return readdirSync(FIXTURES_DIR)
    .filter((n) => n.endsWith(".log.json"))
    .sort()
    .map((n) => new URL(n, FIXTURES_DIR));
}

test("every frozen fixture event validates against events.v1.json", () => {
  let total = 0;
  const failures = [];
  for (const url of logFiles()) {
    const events = JSON.parse(readFileSync(url, "utf8"));
    for (const ev of events) {
      total++;
      if (!validateEvent(ev)) {
        failures.push({ file: path.basename(url.pathname), seq: ev.seq, errors: validateEvent.errors });
      }
    }
  }
  assert.equal(total, 2496, "expected 2,496 events across the 25 frozen fixture logs");
  assert.deepEqual(failures, []);
});

test("the replay golden's events validate against events.v1.json", () => {
  const events = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
  const failures = [];
  for (const ev of events) {
    if (!validateEvent(ev)) failures.push({ seq: ev.seq, errors: validateEvent.errors });
  }
  assert.equal(events.length, 75, "expected 75 events in the replay golden");
  assert.deepEqual(failures, []);
});

test("negative: wrong type (seq as a string) is rejected", () => {
  const bad = { t: "MOVE", pid: "p1", x: 1, y: 1, seq: "4" };
  assert.equal(validateEvent(bad), false);
});

test("negative: missing required field (MOVE without y) is rejected", () => {
  const bad = { t: "MOVE", pid: "p1", x: 1, seq: 4 };
  assert.equal(validateEvent(bad), false);
});

test("negative: unknown event kind is rejected", () => {
  const bad = { t: "FROBNICATE", pid: "p1", seq: 4 };
  assert.equal(validateEvent(bad), false);
});

test("negative: extra property (additionalProperties:false) is rejected", () => {
  const bad = { t: "MOVE", pid: "p1", x: 1, y: 1, seq: 4, extra: true };
  assert.equal(validateEvent(bad), false);
});

test("negative: drawer kind — GOLD_TRANSFERRED with a non-namespaced id is rejected", () => {
  const bad = { t: "GOLD_TRANSFERRED", seq: 1, from: "p1", to: "player:p2", amount: 10 };
  assert.equal(validateEvent(bad), false);
});

test("negative: drawer kind — GOLD_TRANSFERRED with a negative amount is rejected", () => {
  const bad = { t: "GOLD_TRANSFERRED", seq: 1, from: "player:p1", to: "player:p2", amount: -10 };
  assert.equal(validateEvent(bad), false);
});

test("negative: drawer kind — LOAN_ISSUED missing terms_hash is rejected", () => {
  const bad = {
    t: "LOAN_ISSUED",
    seq: 1,
    loan: "loan:1",
    lender: "player:p1",
    borrower: "player:p2",
    principal: 100,
    rate: 0.05,
    term: 30,
  };
  assert.equal(validateEvent(bad), false);
});

test("positive control: a well-formed drawer event (GOLD_TRANSFERRED) DOES validate", () => {
  const good = { t: "GOLD_TRANSFERRED", seq: 1, from: "player:p1", to: "player:p2", amount: 10 };
  assert.equal(validateEvent(good), true, JSON.stringify(validateEvent.errors));
});

// Phase-1 whole-phase review, K6 nit: NamespacedId's pattern
// (^[a-z][a-z0-9_-]*:) accepted an empty local part and any trailing
// suffix; it is now required + end-anchored (^[a-z][a-z0-9_-]*:[a-z0-9_-]+$).
test("negative: NamespacedId with an empty local part ('player:') is rejected", () => {
  const bad = { t: "GOLD_TRANSFERRED", seq: 1, from: "player:", to: "player:p2", amount: 10 };
  assert.equal(validateEvent(bad), false);
});

test("negative: NamespacedId with a trailing/multi-colon suffix ('player:p1:x') is rejected", () => {
  const bad = { t: "GOLD_TRANSFERRED", seq: 1, from: "player:p1:x", to: "player:p2", amount: 10 };
  assert.equal(validateEvent(bad), false);
});

test("positive control: a NamespacedId with an underscore/hyphen local part still validates", () => {
  const good = { t: "GOLD_TRANSFERRED", seq: 1, from: "region:zone_3", to: "player:p-2", amount: 1 };
  assert.equal(validateEvent(good), true, JSON.stringify(validateEvent.errors));
});
