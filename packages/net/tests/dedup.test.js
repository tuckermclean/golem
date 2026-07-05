/* Dedup unit tests for @golem-engine/net's makeDeduper (ported verbatim
 * from games/golem-grid/shared/dedup.js during K4). The double-delivery
 * and no-id cases below are ported straight from the freeze-era
 * games/golem-grid/tests/replay.test.js (see that file's "transport
 * dedup" and "dedup drops messages with no id" tests) so the behavior
 * this package now owns is provably the same behavior the page already
 * shipped. The >600-eviction branch is new: it was a gap left open at
 * the P0 freeze (the eviction branch was never exercised by any test),
 * and K4 is explicitly tasked with closing it. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeDeduper } from "@golem-engine/net";

const log = JSON.parse(
  readFileSync(
    new URL(
      "../../../games/golem-grid/tests/golden/replay-log.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("dedup drops messages with no id", () => {
  const fresh = makeDeduper();
  assert.equal(fresh(undefined), false);
  assert.equal(fresh("a"), true);
  assert.equal(fresh("a"), false);
});

test("transport dedup: double delivery must not double-apply", () => {
  const fresh = makeDeduper();
  let applied = 0;
  for (const ev of log) {
    const m = { k: "EVENT", _id: "m" + ev.seq, ev };
    for (const copy of [m, m])          // BC + storage bridge both fire
      if (copy && fresh(copy._id)) applied++;
  }
  assert.equal(applied, log.length);
});

test("dedup evicts the oldest half once the cap is exceeded (>600 branch)", () => {
  const fresh = makeDeduper(600);
  // Fill to exactly the cap: none of these should be evicted yet.
  for (let i = 0; i < 600; i++) assert.equal(fresh("id" + i), true);
  // id0 is still remembered — repeating it must be dropped.
  assert.equal(fresh("id0"), false);
  // Pushing one more over the cap triggers the eviction sweep, which
  // deletes the oldest cap/2 (300) entries in insertion order: id0..id299.
  assert.equal(fresh("id600"), true);
  // The oldest ids are now gone: fresh() lets them "through" again
  // because the dedup set no longer remembers them.
  assert.equal(fresh("id0"), true);
  assert.equal(fresh("id299"), true);
  // A recent id from before the sweep (id500, well past the evicted
  // range) must still be remembered.
  assert.equal(fresh("id500"), false);
});

test("custom cap is honored", () => {
  const fresh = makeDeduper(4);
  assert.equal(fresh("a"), true);
  assert.equal(fresh("b"), true);
  assert.equal(fresh("c"), true);
  assert.equal(fresh("d"), true);
  // size is now 4, not yet > cap; "e" pushes size to 5 > 4, triggering
  // eviction of the oldest cap/2 = 2 entries (a, b) *after* e is added.
  assert.equal(fresh("e"), true);
  assert.equal(fresh("a"), true);   // evicted — allowed through again
  assert.equal(fresh("c"), false);  // survived the sweep — still seen
});
