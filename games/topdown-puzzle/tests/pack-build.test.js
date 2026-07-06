/* DELTA C4 PR1's "regen is a no-op" DoD test for content/build.mjs, per
 * the design doc's Test plan table: "Compiled pack is a frozen,
 * reproducible artifact". Mirrors gen-golem-fixtures.mjs / gen-tdp-
 * snapshots.mjs's own documented discipline, but as an in-process
 * assertion rather than a `git diff --exit-code` shell check, so it
 * runs under plain `node --test` / `npm test` without shelling out to
 * git: re-running compileContentPack() (the exact function content/
 * build.mjs calls) must reproduce content/pack.json's committed bytes
 * exactly, byte for byte, including the trailing newline. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compileContentPack } from "../content/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_PATH = join(HERE, "..", "content", "pack.json");

test("regenerating content/pack.json from compileContentPack() is a byte-for-byte no-op", async () => {
  const committed = readFileSync(PACK_PATH, "utf8");

  const result = await compileContentPack();
  assert.equal(result.ok, true, "compileContentPack() must succeed");
  const regenerated = JSON.stringify(result.pack, null, 2) + "\n";

  assert.equal(
    regenerated,
    committed,
    "content/pack.json is stale — rerun `node games/topdown-puzzle/content/build.mjs` and commit the diff as a reviewed fixture update",
  );
});

test("content/pack.json carries all 6 real levels, none of them the PR1 synthetic mechanism-proof level", async () => {
  const result = await compileContentPack();
  assert.equal(result.ok, true);
  const mapIds = Object.keys(result.pack.maps).sort();
  assert.deepEqual(mapIds, [
    "map:tdp_001",
    "map:tdp_002",
    "map:tdp_003",
    "map:tdp_004",
    "map:tdp_005",
    "map:tdp_006",
  ]);
});
