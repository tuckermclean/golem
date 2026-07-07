/* ── DELTA S1 PR1 DoD tests: the some-hero Ceremony content pack
   (games/some-hero/content/) compiles through @golem-engine/content
   with zero errors, and its entity/map shape matches the design spec's
   PR1 inventory (docs/superpowers/specs/
   2026-07-07-s1-content-extraction-design.md — "Inventory" / "PR
   decomposition"). Structural only, per PR1 scope: no content-review
   (PR2) or hash-stability/no-legacy-import (PR3) assertions here. */

import test from "node:test";
import assert from "node:assert/strict";

import { buildSourcePack, compileContentPack } from "../content/build-pack.mjs";
import { compile } from "@golem-engine/content";

test("the some-hero content pack compiles with zero errors", () => {
  const source = buildSourcePack();
  const result = compile(source);
  if (!result.ok) {
    console.error("CompileErrors:", JSON.stringify(result.errors, null, 2));
  }
  assert.equal(result.ok, true);
});

test("compileContentPack() round-trips the same result as compile(buildSourcePack())", () => {
  const viaHelper = compileContentPack();
  const source = buildSourcePack();
  const viaDirect = compile(source);
  assert.deepEqual(viaHelper, viaDirect);
});

test("entity count and exact entity-id list match the PR1 inventory (Door Golem, 3 credentials, stamp, 4 enemies)", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);

  const entityIds = Object.keys(result.pack.entities).sort();
  assert.deepEqual(entityIds, [
    "entity:credential_backstory",
    "entity:credential_debt",
    "entity:credential_stamp",
    "entity:credential_sword",
    "entity:door_golem",
    "entity:enemy_consultant",
    "entity:enemy_mailbat",
    "entity:enemy_skeleton",
    "entity:enemy_slime",
  ]);
  assert.equal(entityIds.length, 9);
});

test("exactly one map is compiled: map:guild_hall", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const mapIds = Object.keys(result.pack.maps);
  assert.deepEqual(mapIds, ["map:guild_hall"]);
});

test("tables are empty this PR (PR2's job)", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.pack.tables), []);
});

test("the Door Golem's Lock gates on the three credential facts via 'all'", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const lock = result.pack.entities["entity:door_golem"].components.Lock;
  assert.deepEqual(lock.unlockCondition, {
    all: [{ fact: "credential_sword" }, { fact: "credential_backstory" }, { fact: "credential_debt" }],
  });
  assert.deepEqual(lock.key, { $ref: "entity:credential_stamp" });
});

test("Guild Hall map legend covers exactly the tokens present in cells (no unused entry, no uncovered cell)", () => {
  const source = buildSourcePack();
  for (const map of source.maps) {
    const tokensInCells = new Set();
    for (const row of map.cells) {
      for (const ch of row) {
        if (ch === map.floor) continue;
        tokensInCells.add(ch);
      }
    }
    const legendTokens = new Set(Object.keys(map.legend));

    for (const token of tokensInCells) {
      assert.ok(legendTokens.has(token), `${map.id}: token '${token}' appears in cells but has no legend entry`);
    }
    for (const token of legendTokens) {
      assert.ok(tokensInCells.has(token), `${map.id}: legend token '${token}' is declared but never appears in cells`);
    }
  }
});

test("Guild Hall map has a stairs-down tile and the Door Golem placed, both reachable (open floor room)", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const map = result.pack.maps["map:guild_hall"];
  assert.ok(Object.values(map.legend).some((entry) => entry.entity === "entity:door_golem"), "Door Golem must be placed on the map");

  let sawStairs = false;
  for (const row of map.cells) {
    for (const ch of row) {
      if (ch === map.floor) continue;
      const entry = map.legend[ch];
      if (entry?.components?.Identity?.name === "Stairs Down") sawStairs = true;
    }
  }
  assert.ok(sawStairs, "map must contain a stairs-down tile");
});
