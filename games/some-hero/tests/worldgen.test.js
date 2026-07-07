/* ── Golden-seed tests for shared/floorgen.js (DELTA S3 PR3). Mechanical
   mirror of games/golem-grid/tests/worldgen.test.js's pattern: a canary
   test of frozen facts, a serializeFloor determinism/JSON-stability
   test, a golden exact-match loop over a committed seed/floor matrix
   (games/some-hero/tools/gen-golden.mjs regenerates these — regenerating
   goldens is a VERSIONING EVENT, never a test fix), and a cheap
   determinism harness loop (NOT the 10K fuzz/solver gate — that's PR5).
   No design decisions here; just testing PR2's generator. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateFloor, serializeFloor } from "../shared/floorgen.js";

test("crypt/floor1 canary (frozen facts)", () => {
  const f = generateFloor("crypt", 1);
  assert.equal(f.rooms.length, 6);
  assert.equal(f.pinnedRooms.length, 0);
  assert.equal(f.puzzle.type, "plates");
  assert.equal(f.boss, null);
  assert.deepEqual(f.spawn, { x: 21, y: 21 });
  assert.deepEqual(f.stairsAt, { x: 5, y: 14 });
});

test("crypt/floor4 canary (warden seal — every 4th floor)", () => {
  const f = generateFloor("crypt", 4);
  assert.equal(f.puzzle.type, "warden");
  assert.ok(f.boss, "warden floor must have a boss");
  assert.equal(f.boss.kind, "warden");
  assert.equal(f.boss.x, 6);
  assert.equal(f.boss.y, 28);
  assert.equal(f.boss.stats.name, "the Middle Manager");
});

test("serializeFloor is deterministic and JSON-stable", () => {
  const a = JSON.stringify(serializeFloor(generateFloor("crypt", 1)));
  const b = JSON.stringify(serializeFloor(generateFloor("crypt", 1)));
  assert.equal(a, b);
});

// One per theme/seal-shape combination this matrix is meant to cover:
// 3 seeds x {1: normal seal, 4: warden (every 4th floor), 6: normal seal}.
const SEEDS = ["crypt", "ossuary", "reliquary"];
const FLOORS = [1, 4, 6];
for (const seed of SEEDS) {
  for (const floorNum of FLOORS) {
    test(`golden floorgen: ${seed}/${floorNum} (exact match — diff = worldgen versioning event)`, () => {
      const got = JSON.stringify(serializeFloor(generateFloor(seed, floorNum)), null, 1) + "\n";
      const want = readFileSync(new URL(`./golden/floor-${seed}-${floorNum}.json`, import.meta.url), "utf8");
      assert.equal(got, want);
    });
  }
}

test("400-seed harness: determinism (floor 1)", () => {
  for (let i = 0; i < 400; i++) {
    const seed = "harness" + i;
    const a = JSON.stringify(serializeFloor(generateFloor(seed, 1)));
    const b = JSON.stringify(serializeFloor(generateFloor(seed, 1)));
    assert.equal(a, b, `nondeterministic: ${seed}`);
  }
});
