/* ── DELTA S1 PR3 DoD test: "hashes stable" — the second half of S1's
   content-review checklist (the first half, "all strings present", is
   PR2's content-review.test.js). Mirrors packages/content/tests/
   hash-stability.test.js's three-property proof (same-process double
   hash, JSON round-trip, exact-match golden hex) plus games/topdown-
   puzzle's regen-is-a-no-op check: a fresh compile of the source pack
   must reproduce the committed content/pack.json byte-for-byte (same
   hash), so the frozen artifact can never silently drift from its
   sources.

   The GOLDEN_HASH is the same golden-file religion CLAUDE.md mandates
   for worldgen: if this constant ever needs updating, that is a
   deliberate content-versioning event — say so in the commit. A silent
   diff here means either the sources changed without regenerating
   pack.json, or @golem-engine/content's hash function changed underneath
   the pack. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hashPack } from "@golem-engine/content";
import { compileContentPack } from "../content/index.mjs";

const committed = JSON.parse(
  readFileSync(new URL("../content/pack.json", import.meta.url), "utf8"),
);

// The committed frozen hash of the Ceremony content pack (9 entities,
// 1 map, 16 tables). Regenerate deliberately (games/some-hero/content/
// build.mjs) and call it out if any content source changes.
const GOLDEN_HASH = "c85d0a5095884c149fb54c9002a5683bb1383602f314d20f561d47e60ef29766";

test("committed pack.json carries the golden hash", () => {
  assert.equal(committed.hash, GOLDEN_HASH);
});

test("hashPack: same-process double-hash equality", () => {
  const first = hashPack(committed.entities, committed.tables, committed.maps);
  const second = hashPack(committed.entities, committed.tables, committed.maps);
  assert.equal(first, second);
});

test("hashPack: the committed pack's parts hash to its own committed hash", () => {
  assert.equal(hashPack(committed.entities, committed.tables, committed.maps), GOLDEN_HASH);
});

test("hashPack: hash survives a JSON round-trip (proxy for cross-machine stability)", () => {
  const rt = JSON.parse(JSON.stringify({ entities: committed.entities, tables: committed.tables, maps: committed.maps }));
  assert.equal(hashPack(rt.entities, rt.tables, rt.maps), GOLDEN_HASH);
});

test("regen is a no-op: a fresh compile of the sources reproduces the committed pack", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  assert.equal(result.pack.hash, GOLDEN_HASH, "fresh compile drifted from committed pack.json — regenerate content/pack.json");
  // Full byte-identity, not just the hash: the committed artifact must
  // equal what build.mjs would write today.
  assert.deepEqual(result.pack, committed);
});
