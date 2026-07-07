/* featureEligibleRooms: tagged (pinned) rooms are never eligible for
 * stairs/feature placement (games/some-hero/legacy/src/world/
 * floorgen.js:72's `if (rooms[i].tag) continue;` generalized). */
import test from "node:test";
import assert from "node:assert/strict";
import { featureEligibleRooms } from "../dist/index.js";

test("featureEligibleRooms: excludes tagged rooms", () => {
  const rooms = [
    { x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2 },
    { x: 10, y: 0, w: 4, h: 4, cx: 12, cy: 2, tag: "breakroom" },
    { x: 20, y: 0, w: 4, h: 4, cx: 22, cy: 2 },
    { x: 30, y: 0, w: 4, h: 4, cx: 32, cy: 2, tag: "desk" },
  ];

  const eligible = featureEligibleRooms(rooms);
  assert.equal(eligible.length, 2);
  assert.ok(eligible.every((r) => !r.tag));
  assert.deepEqual(
    eligible.map((r) => r.cx),
    [2, 22],
  );
});

test("featureEligibleRooms: all-untagged input passes through unchanged", () => {
  const rooms = [
    { x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2 },
    { x: 10, y: 0, w: 4, h: 4, cx: 12, cy: 2 },
  ];
  assert.deepEqual(featureEligibleRooms(rooms), rooms);
});

test("featureEligibleRooms: all-tagged input yields empty array", () => {
  const rooms = [
    { x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2, tag: "a" },
    { x: 10, y: 0, w: 4, h: 4, cx: 12, cy: 2, tag: "b" },
  ];
  assert.deepEqual(featureEligibleRooms(rooms), []);
});
