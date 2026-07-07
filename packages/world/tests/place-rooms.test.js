/* placeRooms: rejection-sampled non-overlapping rooms
 * (games/golem-grid/shared/worldgen.js:11-19 generalized). */
import test from "node:test";
import assert from "node:assert/strict";
import { placeRooms } from "../dist/index.js";
import { mulberry32 } from "./helpers/rng.js";

function overlaps(a, b, buffer = 1) {
  return (
    a.x < b.x + b.w + buffer &&
    b.x < a.x + a.w + buffer &&
    a.y < b.y + b.h + buffer &&
    b.y < a.y + a.h + buffer
  );
}

test("placeRooms: rooms are non-overlapping", () => {
  const rng = mulberry32(12345);
  const rooms = placeRooms(rng, {
    count: 10,
    wRange: [4, 8],
    hRange: [3, 6],
    gridW: 48,
    gridH: 30,
  });

  assert.ok(rooms.length > 0, "expected at least one room to be placed");
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      assert.equal(
        overlaps(rooms[i], rooms[j]),
        false,
        `rooms ${i} and ${j} overlap: ${JSON.stringify(rooms[i])} / ${JSON.stringify(rooms[j])}`,
      );
    }
  }
});

test("placeRooms: rooms stay within grid bounds", () => {
  const rng = mulberry32(999);
  const gridW = 48;
  const gridH = 30;
  const rooms = placeRooms(rng, {
    count: 12,
    wRange: [4, 8],
    hRange: [3, 6],
    gridW,
    gridH,
  });

  assert.ok(rooms.length > 0);
  for (const r of rooms) {
    assert.ok(r.x >= 0 && r.y >= 0, "room origin within grid");
    assert.ok(r.x + r.w <= gridW, "room right edge within grid");
    assert.ok(r.y + r.h <= gridH, "room bottom edge within grid");
    assert.ok(r.cx === r.x + (r.w >> 1) && r.cy === r.y + (r.h >> 1), "center matches origin+size");
  }
});

test("placeRooms: respects count as an upper bound", () => {
  const rng = mulberry32(42);
  const rooms = placeRooms(rng, {
    count: 5,
    wRange: [4, 8],
    hRange: [3, 6],
    gridW: 48,
    gridH: 30,
  });
  assert.ok(rooms.length <= 5);
});

test("placeRooms: respects maxTries (degrades gracefully, never spins forever)", () => {
  const rng = mulberry32(7);
  // A tiny grid with big rooms and a low maxTries: it is not possible to
  // place many non-overlapping rooms here, so the function must return
  // early with fewer than `count` rooms rather than hang or throw.
  const rooms = placeRooms(rng, {
    count: 20,
    wRange: [6, 8],
    hRange: [6, 8],
    gridW: 12,
    gridH: 12,
    maxTries: 10,
  });
  assert.ok(rooms.length < 20);
});

test("placeRooms: deterministic per rng sequence", () => {
  const opts = {
    count: 10,
    wRange: [4, 8],
    hRange: [3, 6],
    gridW: 48,
    gridH: 30,
  };
  const roomsA = placeRooms(mulberry32(2026), opts);
  const roomsB = placeRooms(mulberry32(2026), opts);
  assert.deepEqual(roomsA, roomsB);
});
