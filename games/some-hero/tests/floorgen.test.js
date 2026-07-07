/* ── Unit tests for shared/floorgen.js — DELTA S3 PR2's channel-based
   tomb floor generator (design spec: docs/superpowers/specs/
   2026-07-07-s3-pr2-floorgen-design.md "Tests"). Covers structural
   validity (connected, in-bounds, exit untagged, no pinned room holds
   the stairs), seal-type-matches-floor-rule, the LIVE-roster guard (no
   dead desert kind ever appears), channel independence (a puzzle-channel
   change leaves layout's rooms byte-identical), and determinism. This is
   an ISOLATED port — not wired into shared/module.js yet (PR4); no
   golden fixtures (PR3), no fuzz/solver gate (PR5). */
import test from "node:test";
import assert from "node:assert/strict";
import { generateFloor } from "../shared/floorgen.js";

const LIVE_ROSTER = new Set(["skeleton", "mailbat", "consultant", "slime", "cabinet"]);
const DEAD_DESERT_KINDS = new Set(["scarab", "jackal", "spirit", "mummy", "pigeon", "goose", "veteran"]);

/** BFS over the floor's own walls Set from `from` to `to` (4-neighbor,
 *  in-bounds only) — proves the generated floor is fully connected. */
function bfsReachable(floor, from, to) {
  const key = (x, y) => `${x},${y}`;
  const seen = new Set([key(from.x, from.y)]);
  const queue = [from];
  while (queue.length) {
    const { x, y } = queue.shift();
    if (x === to.x && y === to.y) return true;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= floor.gridW || ny >= floor.gridH) continue;
      if (floor.walls.has(key(nx, ny))) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}

test("generateFloor: structurally valid floor for a fixed seed/floor", () => {
  const floor = generateFloor("s3-pr2-seed", 2);

  assert.ok(floor.rooms.length > 0, "expected at least one room");
  assert.ok(!floor.walls.has(`${floor.spawn.x},${floor.spawn.y}`), "spawn must not be a wall tile");
  assert.ok(!floor.walls.has(`${floor.stairsAt.x},${floor.stairsAt.y}`), "stairsAt must not be a wall tile");

  // BFS spawn -> exit reachable.
  assert.ok(
    bfsReachable(floor, floor.spawn, floor.stairsAt),
    "exit must be reachable from spawn (rooms fully connected via corridors)",
  );

  // Exit is an untagged room — the stairs tile's room must not be one of
  // the pinnedRooms (floorgen.js:72's "pinned rooms hold story content,
  // not stairs" rule).
  for (const pr of floor.pinnedRooms) {
    const insideX = floor.stairsAt.x >= pr.x && floor.stairsAt.x < pr.x + pr.w;
    const insideY = floor.stairsAt.y >= pr.y && floor.stairsAt.y < pr.y + pr.h;
    assert.ok(!(insideX && insideY), `stairsAt must not fall inside pinned room ${pr.tag}`);
  }

  // All room/pinned-room bounds stay within the grid.
  for (const r of [...floor.rooms, ...floor.pinnedRooms]) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= floor.gridW && r.y + r.h <= floor.gridH);
  }
});

test("generateFloor: no pinned room ever contains the stairs (with authored pinned specs)", () => {
  const pinnedSpecs = [
    { w: 5, h: 4, tag: "breakroom" },
    { w: 4, h: 3, tag: "gap" },
  ];
  const floor = generateFloor("s3-pr2-seed-pinned", 3, pinnedSpecs);

  for (const pr of floor.pinnedRooms) {
    const insideX = floor.stairsAt.x >= pr.x && floor.stairsAt.x < pr.x + pr.w;
    const insideY = floor.stairsAt.y >= pr.y && floor.stairsAt.y < pr.y + pr.h;
    assert.ok(!(insideX && insideY), `stairsAt must not fall inside pinned room ${pr.tag}`);
  }
  assert.ok(bfsReachable(floor, floor.spawn, floor.stairsAt), "pinned rooms must still leave spawn->exit connected");
});

test("generateFloor: seal type matches the floor rule", () => {
  // Warden every 4th floor.
  const wardenFloor = generateFloor("s3-pr2-seal", 4);
  assert.equal(wardenFloor.puzzle.type, "warden");
  assert.ok(wardenFloor.boss, "warden floor must have a boss");
  assert.equal(wardenFloor.boss.kind, "warden");

  // Final on FINAL_FLOOR (12).
  const finalFloor = generateFloor("s3-pr2-seal", 12);
  assert.equal(finalFloor.puzzle.type, "final");
  assert.ok(finalFloor.boss, "final floor must have a boss");
  assert.equal(finalFloor.boss.kind, "final");

  // Otherwise, one of key/plates/torch/riddle/traps, no boss.
  const otherFloor = generateFloor("s3-pr2-seal", 5);
  assert.ok(["key", "plates", "torch", "riddle", "traps"].includes(otherFloor.puzzle.type));
  assert.equal(otherFloor.boss, null);

  // forceSeal override.
  const forced = generateFloor("s3-pr2-seal", 5, [], { forceSeal: "riddle" });
  assert.equal(forced.puzzle.type, "riddle");
});

test("generateFloor: LIVE roster only — never a dead desert kind", () => {
  // Sweep several floors so cabinets (floors 3+), slimes, and the
  // pickTombKind table all get exercised.
  for (let f = 1; f <= 12; f++) {
    const floor = generateFloor("s3-pr2-roster", f);
    for (const e of floor.enemies) {
      assert.ok(LIVE_ROSTER.has(e.kind), `floor ${f}: enemy kind "${e.kind}" is not in the LIVE roster`);
      assert.ok(!DEAD_DESERT_KINDS.has(e.kind), `floor ${f}: dead desert kind "${e.kind}" appeared — regression`);
    }
  }
});

test("generateFloor: channel independence — forceSeal leaves layout's rooms byte-identical", () => {
  const base = generateFloor("s3-pr2-channels", 6);
  const forced = generateFloor("s3-pr2-channels", 6, [], { forceSeal: "traps" });

  assert.deepEqual(forced.rooms, base.rooms, "layout's rooms must be unaffected by the puzzle channel's draw");
  assert.deepEqual(forced.pinnedRooms, base.pinnedRooms);
  assert.deepEqual(forced.spawn, base.spawn);
  assert.deepEqual([...forced.walls].sort(), [...base.walls].sort());

  // Sanity: the forced seal actually took effect (the test is meaningful).
  assert.equal(forced.puzzle.type, "traps");
});

test("generateFloor: determinism — same (seed, floor) deep-equals twice", () => {
  const a = generateFloor("s3-pr2-determinism", 7);
  const b = generateFloor("s3-pr2-determinism", 7);

  // Sets don't deepEqual directly in node:assert in a useful way for our
  // purposes here, so compare sorted array projections plus everything
  // else structurally.
  assert.deepEqual([...a.walls].sort(), [...b.walls].sort());
  assert.deepEqual({ ...a, walls: undefined }, { ...b, walls: undefined });
});
