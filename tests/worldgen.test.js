import test from "node:test";
import assert from "node:assert/strict";
import { genDungeon, serializeDungeon, GW, GH } from "../shared/worldgen.js";

test("plagueis canary (SPEC §9 — frozen facts)", () => {
  const d = genDungeon("plagueis");
  assert.equal(d.theme, "salt_counting_house");
  assert.equal(d.rooms.length, 12);
  assert.equal(d.dist[d.prize.y][d.prize.x], 34);
  assert.equal(d.grid[d.stairs.y][d.stairs.x], "<");
  assert.equal(d.lore.size, 3);
});

test("serializeDungeon is deterministic and JSON-stable", () => {
  const a = JSON.stringify(serializeDungeon(genDungeon("plagueis")));
  const b = JSON.stringify(serializeDungeon(genDungeon("plagueis")));
  assert.equal(a, b);
  assert.equal(GW, 48);
  assert.equal(GH, 30);
});
