/* DELTA K3 fixture pass-through: take one frozen P0.3 golem-grid seed
 * log (packages/testkit/fixtures/golem/golem.log.json — read-only) and
 * run its events through @golem-engine/kernel's "./log" chain (a
 * fresh appendEvent fold building an all-new array; the fixture file
 * itself is never written to, only read + JSON.parse'd, which already
 * yields an in-memory copy). Proves the chain machinery works over a
 * real, non-toy event stream, and that tampering a real MOVE event's
 * field is still caught at the right link.
 *
 * K3 does NOT stamp `prev` on golem-grid's actual wire/fixtures — see
 * CLAUDE.md/DELTA.md: live adoption is K5's call. This test only proves
 * the kernel's chain CAN wrap these events, not that it currently does.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appendEvent, verifyChain } from "@golem-engine/kernel/log";

const FIXTURES_DIR = new URL("../fixtures/golem/", import.meta.url);

function loadGolemEvents() {
  // Fresh parse every call — never mutate or share the fixture's JSON.
  return JSON.parse(readFileSync(new URL("golem.log.json", FIXTURES_DIR), "utf8"));
}

test("log-chain: chaining the golem fixture's events verifies ok end to end", () => {
  const events = loadGolemEvents();
  assert.ok(events.length > 20, "expected the golem fixture to carry a substantial event log");

  let chained = [];
  for (const ev of events) chained = appendEvent(chained, ev);

  assert.equal(chained.length, events.length);
  assert.deepEqual(verifyChain(chained), { ok: true });
});

test("log-chain: tampering a MOVE event's x field is caught at the right seq", () => {
  const events = loadGolemEvents();
  let chained = [];
  for (const ev of events) chained = appendEvent(chained, ev);

  const moveIndex = chained.findIndex((e) => e.t === "MOVE");
  assert.ok(moveIndex >= 0, "expected at least one MOVE event in the golem fixture");
  assert.ok(moveIndex + 1 < chained.length, "expected a successor entry after the tampered MOVE (so the break is observable)");

  const tampered = chained.map((e, i) => (i === moveIndex ? { ...e, x: e.x + 1000 } : e));

  const result = verifyChain(tampered);
  assert.equal(result.ok, false);
  // Per verifyChain's documented behavior: corrupting entry i's payload
  // (not its own prev) surfaces at entry i+1, the first link whose
  // recomputed prev no longer matches.
  assert.equal(result.at, chained[moveIndex + 1].seq);
});

test("log-chain: the fixture file on disk is untouched by this test", () => {
  const before = readFileSync(new URL("golem.log.json", FIXTURES_DIR), "utf8");
  const events = JSON.parse(before);
  let chained = [];
  for (const ev of events) chained = appendEvent(chained, ev);
  chained[1].x = -99999; // mutate the in-memory copy, not the file
  const after = readFileSync(new URL("golem.log.json", FIXTURES_DIR), "utf8");
  assert.equal(after, before, "fixture bytes on disk must be unchanged");
});
