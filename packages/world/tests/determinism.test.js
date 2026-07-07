/* Determinism round-trip: the full placeRooms → placePinnedRooms →
 * chainCorridors → featureEligibleRooms pipeline, run twice from the
 * same seeded rng sequence, must produce byte-identical output. This is
 * the property that makes the eventual named-channel floor generator's
 * golden tests possible (see the design spec). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  placeRooms,
  placePinnedRooms,
  chainCorridors,
  featureEligibleRooms,
} from "../dist/index.js";
import { mulberry32 } from "./helpers/rng.js";

function runPipeline(seed) {
  const rng = mulberry32(seed);
  const rooms = placeRooms(rng, {
    count: 9,
    wRange: [4, 8],
    hRange: [3, 6],
    gridW: 48,
    gridH: 30,
  });
  const pinned = placePinnedRooms(
    rng,
    rooms,
    [
      { w: 5, h: 4, tag: "breakroom" },
      { w: 6, h: 4, tag: "gap" },
      { w: 5, h: 5, tag: "desk" },
    ],
    { gridW: 48, gridH: 30 },
  );
  const allRooms = [...rooms, ...pinned];
  const corridors = chainCorridors(allRooms);
  const eligible = featureEligibleRooms(allRooms);
  return { rooms, pinned, corridors, eligible };
}

test("determinism: identical rng sequence yields byte-identical pipeline output", () => {
  const a = runPipeline(0xc0ffee);
  const b = runPipeline(0xc0ffee);
  assert.deepEqual(a, b);
});

test("determinism: different seeds are not expected to collide (sanity)", () => {
  const a = runPipeline(1);
  const b = runPipeline(2);
  assert.notDeepEqual(a, b);
});
