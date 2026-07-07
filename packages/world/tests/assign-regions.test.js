/* assignRegions: region membership derived from room.tag (A2 — see
 * docs/superpowers/specs/2026-07-07-a2-regions-design.md). Fixtures are
 * inline and shaped like both games' real room output (golem-grid's
 * ROOM_KINDS-tagged rooms, some-hero's PinnedRoom) WITHOUT importing
 * either game. */
import test from "node:test";
import assert from "node:assert/strict";
import { assignRegions } from "../dist/index.js";

test("assignRegions: tagged rooms resolve to their own region", () => {
  // Shaped like golem-grid's ROOM_KINDS-tagged rooms
  // (games/golem-grid/shared/themes.js: "hall","gallery","vault", ...).
  const rooms = [
    { x: 0, y: 0, w: 5, h: 4, cx: 2, cy: 2, tag: "hall" },
    { x: 10, y: 0, w: 4, h: 4, cx: 12, cy: 2, tag: "vault" },
  ];
  const regions = assignRegions(rooms);

  assert.equal(regions.regionAt(2, 2), "hall");
  assert.equal(regions.regionAt(0, 0), "hall");
  assert.equal(regions.regionAt(4, 3), "hall"); // bbox inclusive corner (x+w-1, y+h-1)
  assert.equal(regions.regionAt(12, 2), "vault");
  assert.equal(regions.regionAt(10, 0), "vault");
});

test("assignRegions: some-hero-shaped PinnedRooms resolve to their tag", () => {
  // Shaped like some-hero's floorgen.js pinnedRooms
  // (games/some-hero/shared/floorgen.js: "breakroom"/"gap"/"desk" tags).
  const rooms = [
    { x: 3, y: 3, w: 5, h: 4, cx: 5, cy: 5, tag: "breakroom" },
    { x: 20, y: 10, w: 6, h: 4, cx: 23, cy: 12, tag: "gap" },
    { x: 30, y: 20, w: 5, h: 5, cx: 32, cy: 22, tag: "desk" },
  ];
  const regions = assignRegions(rooms);

  assert.equal(regions.regionAt(5, 5), "breakroom");
  assert.equal(regions.regionAt(23, 12), "gap");
  assert.equal(regions.regionAt(32, 22), "desk");
  assert.deepEqual(regions.regionNames(), ["breakroom", "gap", "desk"]);
});

test("assignRegions: untagged rooms never produce a region", () => {
  const rooms = [
    { x: 0, y: 0, w: 5, h: 5, cx: 2, cy: 2 }, // untagged, e.g. a plain golem-grid room
    { x: 10, y: 0, w: 4, h: 4, cx: 12, cy: 2, tag: "vault" },
  ];
  const regions = assignRegions(rooms);

  // Every cell inside the untagged room's bbox is still null.
  assert.equal(regions.regionAt(2, 2), null);
  assert.equal(regions.regionAt(0, 0), null);
  assert.equal(regions.regionAt(4, 4), null);
  // The tagged room is unaffected.
  assert.equal(regions.regionAt(12, 2), "vault");
  assert.deepEqual(regions.regionNames(), ["vault"]);
});

test("assignRegions: corridor cells and cells outside any room bbox are null", () => {
  const rooms = [
    { x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2, tag: "hall" },
    { x: 20, y: 20, w: 4, h: 4, cx: 22, cy: 22, tag: "vault" },
  ];
  const regions = assignRegions(rooms);

  // A corridor cell chaining the two rooms' centers, well outside
  // either bbox.
  assert.equal(regions.regionAt(10, 10), null);
  // Just past a tagged room's bbox edge (w=4 means x in [0,3]).
  assert.equal(regions.regionAt(4, 0), null);
  assert.equal(regions.regionAt(0, 4), null);
  // Far outside any room.
  assert.equal(regions.regionAt(-5, -5), null);
  assert.equal(regions.regionAt(1000, 1000), null);
});

test("assignRegions: regionAt does bbox correctness at every boundary", () => {
  const room = { x: 5, y: 5, w: 3, h: 2, cx: 6, cy: 5, tag: "vault" };
  const regions = assignRegions([room]);

  // bbox is x in [5,7], y in [5,6] (half-open on w/h: x<x+w, y<y+h).
  for (let x = 5; x <= 7; x++) {
    for (let y = 5; y <= 6; y++) {
      assert.equal(regions.regionAt(x, y), "vault", `(${x},${y}) should be inside`);
    }
  }
  // one past each edge
  assert.equal(regions.regionAt(8, 5), null);
  assert.equal(regions.regionAt(5, 7), null);
  assert.equal(regions.regionAt(4, 5), null);
  assert.equal(regions.regionAt(5, 4), null);
});

test("assignRegions: regionNames lists distinct tags in first-seen order", () => {
  const rooms = [
    { x: 0, y: 0, w: 2, h: 2, cx: 1, cy: 1, tag: "hall" },
    { x: 5, y: 0, w: 2, h: 2, cx: 6, cy: 1 }, // untagged, contributes nothing
    { x: 10, y: 0, w: 2, h: 2, cx: 11, cy: 1, tag: "vault" },
    { x: 15, y: 0, w: 2, h: 2, cx: 16, cy: 1, tag: "hall" }, // second "hall" room, same tag
  ];
  const regions = assignRegions(rooms);
  assert.deepEqual(regions.regionNames(), ["hall", "vault"]);
});

test("assignRegions: overlap resolution — first tagged room by input order wins", () => {
  // Two tagged rooms whose bboxes overlap on (5,5): "first" spans
  // x in [0,6), y in [0,6); "second" spans x in [4,10), y in [4,10).
  const rooms = [
    { x: 0, y: 0, w: 6, h: 6, cx: 3, cy: 3, tag: "first" },
    { x: 4, y: 4, w: 6, h: 6, cx: 7, cy: 7, tag: "second" },
  ];
  const regions = assignRegions(rooms);

  // The overlap cell resolves to the first room in input order.
  assert.equal(regions.regionAt(5, 5), "first");
  // Cells only "second" covers still resolve correctly.
  assert.equal(regions.regionAt(9, 9), "second");
  // Cells only "first" covers still resolve correctly.
  assert.equal(regions.regionAt(0, 0), "first");

  // Reversing input order flips which region wins the overlap cell —
  // proving the resolution really is "first by input order", not e.g.
  // "smallest area" or "last write wins" by some other rule.
  const reversed = assignRegions([rooms[1], rooms[0]]);
  assert.equal(reversed.regionAt(5, 5), "second");
});
