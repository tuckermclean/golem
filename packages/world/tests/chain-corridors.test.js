/* chainCorridors: pure L-corridor geometry connecting room centers
 * (games/golem-grid/shared/worldgen.js:22-30 / games/some-hero/legacy/
 * src/world/floorgen.js:61-66 generalized). Connectivity is proven by a
 * BFS over a grid built from room footprints + corridor cells. */
import test from "node:test";
import assert from "node:assert/strict";
import { placeRooms, chainCorridors } from "../dist/index.js";
import { mulberry32 } from "./helpers/rng.js";

function buildWalkableSet(rooms, corridorCells) {
  const walkable = new Set();
  const key = (x, y) => `${x},${y}`;
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        walkable.add(key(x, y));
      }
    }
  }
  for (const c of corridorCells) {
    walkable.add(key(c.x, c.y));
  }
  return walkable;
}

function bfsReachable(startX, startY, walkable) {
  const key = (x, y) => `${x},${y}`;
  const seen = new Set([key(startX, startY)]);
  const queue = [[startX, startY]];
  while (queue.length) {
    const [cx, cy] = queue.shift();
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = key(nx, ny);
      if (walkable.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
  }
  return seen;
}

test("chainCorridors: every room center is reachable from room 0 (BFS)", () => {
  const rng = mulberry32(2020);
  const rooms = placeRooms(rng, {
    count: 10,
    wRange: [4, 8],
    hRange: [3, 6],
    gridW: 48,
    gridH: 30,
  });
  assert.ok(rooms.length >= 2, "need at least 2 rooms to test connectivity");

  const corridorCells = chainCorridors(rooms);
  const walkable = buildWalkableSet(rooms, corridorCells);
  const reachable = bfsReachable(rooms[0].cx, rooms[0].cy, walkable);

  for (const r of rooms) {
    assert.ok(reachable.has(`${r.cx},${r.cy}`), `room center (${r.cx},${r.cy}) unreachable from room 0`);
  }
});

test("chainCorridors: pure — same input yields identical output, no rng needed", () => {
  const rooms = [
    { x: 1, y: 1, w: 4, h: 4, cx: 3, cy: 3 },
    { x: 10, y: 2, w: 5, h: 5, cx: 12, cy: 4 },
    { x: 20, y: 15, w: 6, h: 4, cx: 23, cy: 17 },
  ];
  const a = chainCorridors(rooms);
  const b = chainCorridors(rooms);
  assert.deepEqual(a, b);
  // no side effects on the input
  assert.deepEqual(rooms, [
    { x: 1, y: 1, w: 4, h: 4, cx: 3, cy: 3 },
    { x: 10, y: 2, w: 5, h: 5, cx: 12, cy: 4 },
    { x: 20, y: 15, w: 6, h: 4, cx: 23, cy: 17 },
  ]);
});

test("chainCorridors: empty/singleton room list yields no corridor cells", () => {
  assert.deepEqual(chainCorridors([]), []);
  assert.deepEqual(chainCorridors([{ x: 0, y: 0, w: 2, h: 2, cx: 1, cy: 1 }]), []);
});
