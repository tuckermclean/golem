import test from "node:test";
import assert from "node:assert/strict";
import { genDungeon } from "../shared/worldgen.js";
import { solve, shortestPath } from "../shared/solver.js";

test("plagueis: depth 34, budget 102, winnable", () => {
  const r = solve(genDungeon("plagueis"));
  assert.deepEqual(r, { winnable: true, depth: 34, budget: 102 });
});

test("shortestPath stairs→prize has length == depth and ends at the prize", () => {
  const d = genDungeon("plagueis");
  const path = shortestPath(d, d.stairs, { x: d.prize.x, y: d.prize.y });
  assert.equal(path.length, 34);
  assert.deepEqual(path[path.length - 1], [d.prize.x, d.prize.y]);
  for (const [x, y] of path) assert.notEqual(d.grid[y][x], "#");
});

test("shortestPath to a wall tile is null", () => {
  const d = genDungeon("plagueis");
  assert.equal(shortestPath(d, d.stairs, { x: 0, y: 0 }), null); // border is wall
});
