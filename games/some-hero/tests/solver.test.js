/* ── Tests for shared/solver.js — S3 PR5's reachability/connectivity
   checker (design spec: docs/superpowers/specs/
   2026-07-07-s3-pr5-fuzz-solver-design.md). Three groups:
     1. `solve` on a fixed seed/floor is winnable (sanity: the checker
        doesn't reject good floors).
     2. A hand-crafted DISCONNECTED floor is caught (`winnable:false`
        with a `reason`) — proves the checker isn't vacuous.
     3. An in-suite fuzz sample (500 seeds x floors {1,4}) asserting
        winnable + connectivity + no-stairs-in-pinned-room + determinism,
        fast enough (milliseconds; BFS on a 34x34 grid is trivial) to run
        in `npm test`. This is NOT the 10K CI gate — that's
        `games/some-hero/tools/solve.js` / `make solve-some-hero`. */
import test from "node:test";
import assert from "node:assert/strict";
import { generateFloor } from "../shared/floorgen.js";
import { bfs, solve } from "../shared/solver.js";

test("solve: fixed seed/floor is winnable", () => {
  const floor = generateFloor("s3-pr5-seed", 1);
  const r = solve(floor);
  assert.equal(r.winnable, true, JSON.stringify(r));
});

test("solve: several fixed floors across seal types are all winnable", () => {
  // Cover key/plates/torch/riddle/traps/warden/final without relying on
  // which seal a random seed happens to draw.
  for (const [seed, floorNum] of [
    ["s3-pr5-key", 5],
    ["s3-pr5-plates", 1],
    ["s3-pr5-torch", 2],
    ["s3-pr5-riddle", 3],
    ["s3-pr5-traps", 7],
    ["s3-pr5-warden", 4],
    ["s3-pr5-final", 12],
  ]) {
    const floor = generateFloor(seed, floorNum);
    const r = solve(floor);
    assert.equal(r.winnable, true, `seed=${seed} floor=${floorNum}: ${JSON.stringify(r)}`);
  }
});

test("solve: catches a hand-crafted DISCONNECTED floor (not vacuous)", () => {
  // A 10x10 grid split in half by a solid wall row at y=5, with no gap —
  // spawn lives in the top half, stairsAt in the bottom half. This
  // floor cannot come out of generateFloor (its corridor chain always
  // connects every room) — it's constructed by hand specifically to
  // prove solve() actually rejects a bad floor rather than always
  // returning winnable:true.
  const gridW = 10;
  const gridH = 10;
  const walls = new Set();
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      // Everything is a wall except two small open rooms (top-left,
      // bottom-right) — no row/column of open tiles connects them.
      const inTopRoom = x >= 1 && x <= 2 && y >= 1 && y <= 2;
      const inBottomRoom = x >= 7 && x <= 8 && y >= 7 && y <= 8;
      if (!inTopRoom && !inBottomRoom) walls.add(`${x},${y}`);
    }
  }
  const floor = {
    gridW,
    gridH,
    walls,
    spawn: { x: 1, y: 1 },
    stairsAt: { x: 8, y: 8 },
    rooms: [
      { x: 1, y: 1, w: 2, h: 2, cx: 1, cy: 1 },
      { x: 7, y: 7, w: 2, h: 2, cx: 8, cy: 8 },
    ],
    pinnedRooms: [],
    enemies: [],
    pickups: [],
    puzzle: null,
    boss: null,
    props: [],
  };

  const r = solve(floor);
  assert.equal(r.winnable, false, "disconnected floor must be flagged unwinnable");
  assert.equal(typeof r.reason, "string");
  assert.ok(r.reason.length > 0, "a failing solve() must localize why");
  assert.match(r.reason, /unreachable/);
});

test("solve: catches stairs placed inside a pinned room's bbox", () => {
  // Fully connected (one open room), but stairsAt is deliberately placed
  // inside the pinned room's bounding box — the "no stairs in a pinned
  // room" invariant, violated on purpose.
  const gridW = 10;
  const gridH = 10;
  const walls = new Set();
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const inRoom = x >= 1 && x <= 8 && y >= 1 && y <= 8;
      if (!inRoom) walls.add(`${x},${y}`);
    }
  }
  const floor = {
    gridW,
    gridH,
    walls,
    spawn: { x: 1, y: 1 },
    stairsAt: { x: 5, y: 5 }, // inside the pinned room below
    rooms: [{ x: 1, y: 1, w: 8, h: 8, cx: 4, cy: 4 }],
    pinnedRooms: [{ x: 4, y: 4, w: 3, h: 3, cx: 5, cy: 5, tag: "breakroom" }],
    enemies: [],
    pickups: [],
    puzzle: null,
    boss: null,
    props: [],
  };

  const r = solve(floor);
  assert.equal(r.winnable, false);
  assert.match(r.reason, /pinned room/);
});

test("bfs: distances are correct on a tiny open floor", () => {
  const gridW = 3;
  const gridH = 1;
  const floor = { gridW, gridH, walls: new Set() };
  const dist = bfs(floor, { x: 0, y: 0 });
  assert.equal(dist.get("0,0"), 0);
  assert.equal(dist.get("1,0"), 1);
  assert.equal(dist.get("2,0"), 2);
});

test("bfs: a wall blocks reachability", () => {
  const gridW = 3;
  const gridH = 1;
  const floor = { gridW, gridH, walls: new Set(["1,0"]) };
  const dist = bfs(floor, { x: 0, y: 0 });
  assert.ok(dist.has("0,0"));
  assert.ok(!dist.has("1,0"));
  assert.ok(!dist.has("2,0"));
});

test("fuzz sample: 500 seeds x floors {1,4} all winnable + connected + no stairs-in-pinned-room + deterministic", () => {
  const SEED_COUNT = 500;
  const FLOORS = [1, 4];

  for (let i = 0; i < SEED_COUNT; i++) {
    const seed = `s3-pr5-fuzz-${i}`;
    for (const floorNum of FLOORS) {
      const floor = generateFloor(seed, floorNum);
      const r = solve(floor);
      assert.equal(r.winnable, true, `seed=${seed} floor=${floorNum}: ${JSON.stringify(r)}`);

      // Connectivity, re-derived independently of solve()'s internals.
      const dist = bfs(floor, floor.spawn);
      assert.ok(dist.has(`${floor.stairsAt.x},${floor.stairsAt.y}`), `seed=${seed} floor=${floorNum}: exit unreachable`);

      // No pinned room ever contains the stairs.
      for (const pr of floor.pinnedRooms) {
        const insideX = floor.stairsAt.x >= pr.x && floor.stairsAt.x < pr.x + pr.w;
        const insideY = floor.stairsAt.y >= pr.y && floor.stairsAt.y < pr.y + pr.h;
        assert.ok(!(insideX && insideY), `seed=${seed} floor=${floorNum}: stairs inside pinned room "${pr.tag}"`);
      }

      // Determinism: re-generating + re-solving the same (seed, floor)
      // gives the same winnability verdict.
      const again = solve(generateFloor(seed, floorNum));
      assert.deepEqual(again, r, `seed=${seed} floor=${floorNum}: solve() not deterministic`);
    }
  }
});
