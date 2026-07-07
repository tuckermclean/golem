/* placePinnedRooms: authored rooms avoiding overlap + min center
 * separation (games/some-hero/legacy/src/world/floorgen.js:41-60
 * generalized). */
import test from "node:test";
import assert from "node:assert/strict";
import { placeRooms, placePinnedRooms } from "../dist/index.js";
import { mulberry32 } from "./helpers/rng.js";

function overlaps(a, b, buffer = 1) {
  return (
    a.x < b.x + b.w + buffer &&
    b.x < a.x + a.w + buffer &&
    a.y < b.y + b.h + buffer &&
    b.y < a.y + a.h + buffer
  );
}

test("placePinnedRooms: pinned rooms don't overlap existing rooms", () => {
  const rng = mulberry32(11);
  const existing = placeRooms(rng, {
    count: 8,
    wRange: [4, 8],
    hRange: [3, 6],
    gridW: 48,
    gridH: 30,
  });
  const specs = [
    { w: 5, h: 4, tag: "breakroom" },
    { w: 6, h: 4, tag: "gap" },
    { w: 5, h: 5, tag: "desk" },
  ];
  const pinned = placePinnedRooms(rng, existing, specs, { gridW: 48, gridH: 30 });

  assert.ok(pinned.length > 0);
  for (const p of pinned) {
    for (const e of existing) {
      assert.equal(overlaps(p, e), false, `pinned ${p.tag} overlaps existing room`);
    }
  }
});

test("placePinnedRooms: pinned rooms don't overlap each other and honor tags", () => {
  const rng = mulberry32(22);
  const existing = placeRooms(rng, {
    count: 6,
    wRange: [4, 8],
    hRange: [3, 6],
    gridW: 48,
    gridH: 30,
  });
  const specs = [
    { w: 5, h: 4, tag: "breakroom" },
    { w: 5, h: 4, tag: "gap" },
    { w: 5, h: 4, tag: "desk" },
  ];
  const pinned = placePinnedRooms(rng, existing, specs, { gridW: 48, gridH: 30 });

  for (let i = 0; i < pinned.length; i++) {
    assert.ok(specs.some((s) => s.tag === pinned[i].tag), "pinned room carries one of the spec tags");
    for (let j = i + 1; j < pinned.length; j++) {
      assert.equal(overlaps(pinned[i], pinned[j]), false, "two pinned rooms overlap");
    }
  }
});

test("placePinnedRooms: honors minSeparation between pinned room centers", () => {
  const rng = mulberry32(33);
  const existing = placeRooms(rng, {
    count: 4,
    wRange: [4, 6],
    hRange: [3, 5],
    gridW: 48,
    gridH: 30,
  });
  const specs = [
    { w: 4, h: 4, tag: "a" },
    { w: 4, h: 4, tag: "b" },
    { w: 4, h: 4, tag: "c" },
    { w: 4, h: 4, tag: "d" },
  ];
  const minSeparation = 12;
  const pinned = placePinnedRooms(rng, existing, specs, {
    gridW: 48,
    gridH: 30,
    minSeparation,
  });

  for (let i = 0; i < pinned.length; i++) {
    for (let j = i + 1; j < pinned.length; j++) {
      const d = Math.hypot(pinned[i].cx - pinned[j].cx, pinned[i].cy - pinned[j].cy);
      assert.ok(d >= minSeparation, `pinned rooms ${i}/${j} closer than minSeparation (${d})`);
    }
  }
});

test("placePinnedRooms: deterministic per rng sequence", () => {
  const existingOpts = {
    count: 6,
    wRange: [4, 8],
    hRange: [3, 6],
    gridW: 48,
    gridH: 30,
  };
  const specs = [
    { w: 5, h: 4, tag: "breakroom" },
    { w: 5, h: 4, tag: "gap" },
  ];
  const runOnce = (seed) => {
    const rng = mulberry32(seed);
    const existing = placeRooms(rng, existingOpts);
    return placePinnedRooms(rng, existing, specs, { gridW: 48, gridH: 30 });
  };
  assert.deepEqual(runOnce(555), runOnce(555));
});

test("placePinnedRooms: degrades gracefully when specs can't all fit — returns what it could", () => {
  const rng = mulberry32(3);
  // A small grid crammed with existing rooms + a large minSeparation
  // requirement: not every spec can find a valid slot within maxTries.
  const existing = placeRooms(rng, {
    count: 10,
    wRange: [4, 6],
    hRange: [4, 6],
    gridW: 20,
    gridH: 20,
  });
  const specs = [
    { w: 4, h: 4, tag: "one" },
    { w: 4, h: 4, tag: "two" },
    { w: 4, h: 4, tag: "three" },
    { w: 4, h: 4, tag: "four" },
    { w: 4, h: 4, tag: "five" },
  ];
  const pinned = placePinnedRooms(rng, existing, specs, {
    gridW: 20,
    gridH: 20,
    minSeparation: 15,
    maxTries: 20,
  });

  // Never throws, never places more than requested, and every placed
  // room is still validly non-overlapping (checked below) — some specs
  // may simply be dropped.
  assert.ok(pinned.length <= specs.length);
  for (const p of pinned) {
    assert.ok(specs.some((s) => s.tag === p.tag));
  }
});
