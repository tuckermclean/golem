import test from "node:test";
import assert from "node:assert/strict";
import { genDungeon } from "../shared/worldgen.js";
import { createState, applyEvent } from "../shared/reducer.js";
import { los, createPerception } from "../src/perceive.js";

/* ── los(): pure unit tests over a tiny hand-built grid — deterministic
   geometry, no dependence on worldgen. Rows are dun.grid[y][x]; "#" is a
   wall, anything else is floor. ─────────────────────────────────────── */
function grid(rows) {
  return { grid: rows.map((r) => r.split("")) };
}

test("los: a clear straight line has line-of-sight", () => {
  const dun = grid([
    ".....",
    ".....",
    ".....",
    ".....",
    ".....",
  ]);
  assert.equal(los(dun, 0, 0, 4, 0), true);
});

test("los: a clear diagonal line has line-of-sight", () => {
  const dun = grid([
    ".....",
    ".....",
    ".....",
    ".....",
    ".....",
  ]);
  assert.equal(los(dun, 0, 0, 4, 4), true);
});

test("los: a wall strictly between the endpoints blocks sight", () => {
  const dun = grid([
    "..#..",
    ".....",
    ".....",
    ".....",
    ".....",
  ]);
  assert.equal(los(dun, 0, 0, 4, 0), false);
});

test("los: a wall exactly on the far endpoint does NOT block (endpoints exempt)", () => {
  const dun = grid([
    "....#",
    ".....",
    ".....",
    ".....",
    ".....",
  ]);
  assert.equal(los(dun, 0, 0, 4, 0), true);
});

test("los: a wall exactly on the near endpoint does NOT block (endpoints exempt)", () => {
  const dun = grid([
    "#....",
    ".....",
    ".....",
    ".....",
    ".....",
  ]);
  assert.equal(los(dun, 0, 0, 4, 0), true);
});

test("los: adjacent tiles are always visible", () => {
  const dun = grid([
    "..",
    "..",
  ]);
  assert.equal(los(dun, 0, 0, 1, 0), true);
  assert.equal(los(dun, 0, 0, 0, 1), true);
  assert.equal(los(dun, 0, 0, 1, 1), true);
});

/* ── createPerception: client-local fog of war over a real dungeon, so
   tileRoom/radius are realistic (per the review brief). Seed "plagueis"
   is the repo's other frozen-fixture seed (shared with replay.test.js /
   client.test.js); the specific positions below were chosen by probing
   genDungeon("plagueis") for a lit-vs-occluded pair within the starting
   (light=360 ⇒ radius=6) view of the stairs — (10,12) sits behind a wall
   from the stairs and was the trickiest bit to pin down deterministically,
   since it depends on this seed's exact wall layout, not just distance. ─ */
const dun = genDungeon("plagueis");

function stateAt(pid, moves) {
  const st = createState();
  applyEvent(st, dun, { t: "JOIN", pid, name: "Ash", seq: 1 });
  let seq = 1;
  for (const [x, y] of moves)
    applyEvent(st, dun, { t: "MOVE", pid, x, y, seq: ++seq });
  return st;
}

test("perceive(): litT contains the player's own tile and in-radius visible tiles, and excludes an occluded tile", () => {
  const st = stateAt("p1", []); // player joins at the stairs (16,18)
  const P = createPerception({ dun, me: "p1", st });
  P.perceive();

  assert.ok(P.litT.has("16,18"), "own tile must be lit");
  assert.ok(P.litT.has("11,15"), "an in-radius, unobstructed tile must be lit");
  assert.ok(!P.litT.has("10,12"), "a wall-occluded tile must not be lit");
  assert.ok(!P.seenT.has("10,12"), "an occluded tile is never marked seen either");
});

test("perceive(): returns the entered room index once, and nothing on an immediate re-perceive at the same tile", () => {
  const st = stateAt("p1", []);
  const P = createPerception({ dun, me: "p1", st });

  assert.deepEqual(P.perceive(), [dun.tileRoom[18][16]]); // room 0, the stairs' room
  assert.deepEqual(P.perceive(), []); // same tile, same room — no re-entry
});

test("perceive(): seenT is cumulative across moves and never shrinks; litT is recomputed each call", () => {
  const st = stateAt("p1", []);
  const P = createPerception({ dun, me: "p1", st });
  P.perceive();
  assert.ok(P.litT.has("11,15"));
  assert.ok(P.seenT.has("11,15"));

  applyEvent(st, dun, { t: "MOVE", pid: "p1", x: 14, y: 16, seq: 2 });
  P.perceive();

  assert.ok(!P.litT.has("11,15"), "a tile no longer in view drops out of litT");
  assert.ok(P.seenT.has("11,15"), "but it stays remembered in seenT");
  assert.ok(P.litT.has("10,18"), "a newly-visible tile enters litT");
  assert.ok(P.seenT.has("10,18"));
});

test("perceive(): returns a newly-entered room index exactly once when moving into a new room", () => {
  const st = stateAt("p1", [[14, 16]]); // still inside room 0
  const P = createPerception({ dun, me: "p1", st });
  assert.deepEqual(P.perceive(), [0]); // enters room 0

  applyEvent(st, dun, { t: "MOVE", pid: "p1", x: 10, y: 12, seq: 3 }); // room 7's center
  assert.equal(dun.tileRoom[12][10], 7);
  assert.deepEqual(P.perceive(), [7]);
  assert.deepEqual(P.perceive(), []); // still there — no re-entry
});
