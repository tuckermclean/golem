import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { genDungeon, serializeDungeon, GW, GH } from "../shared/worldgen.js";
import { solve } from "../shared/solver.js";

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

const GOLDEN_SEEDS = ["plagueis", "lantern", "golem"];
for (const seed of GOLDEN_SEEDS)
  test(`golden worldgen: ${seed} (exact match — diff = MAJOR version bump)`, () => {
    const got = JSON.stringify(serializeDungeon(genDungeon(seed)), null, 1) + "\n";
    const want = readFileSync(new URL(`./golden/worldgen-${seed}.json`, import.meta.url), "utf8");
    assert.equal(got, want);
  });

test("500-seed harness: determinism + winnability", () => {
  for (let i = 0; i < 500; i++) {
    const seed = "harness" + i;
    const a = JSON.stringify(serializeDungeon(genDungeon(seed)));
    const b = JSON.stringify(serializeDungeon(genDungeon(seed)));
    assert.equal(a, b, `nondeterministic: ${seed}`);
    const r = solve(genDungeon(seed));
    assert.ok(r.winnable, `unwinnable: ${seed} (budget ${r.budget})`);
  }
});
