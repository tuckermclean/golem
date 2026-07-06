/* ── DELTA C2 DoD tests: the topdown-puzzle ASCII importer's content
   pack (games/topdown-puzzle/content/) compiles through
   @golem-engine/content and is semantically equivalent to the P0.3
   parse snapshots (packages/testkit/fixtures/topdown-puzzle/*.parse.json).
   These fixtures are read-only ground truth here — never edited. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

import { buildSourcePack, compileContentPack, mapIdFor, TOKEN_LEGEND } from "../content/build-pack.mjs";
import { compile } from "@golem-engine/content";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, "..", "..", "..", "packages", "testkit", "fixtures", "topdown-puzzle");
const LEVELS_DIR = join(HERE, "..", "levels");

async function loadFixtures() {
  const entries = await readdir(FIXTURES_DIR);
  const names = entries.filter((n) => n.endsWith(".parse.json")).sort();
  const fixtures = new Map();
  for (const name of names) {
    const json = JSON.parse(await readFile(join(FIXTURES_DIR, name), "utf8"));
    fixtures.set(basename(name, ".parse.json"), json);
  }
  return fixtures;
}

/** From a compiled RuntimeMap, derive {rows, cols, cells, entities}
 *  in the exact shape of the P0.3 fixtures: entities maps each
 *  non-floor token to its [x, y] occurrences in row-major
 *  (top-to-bottom, left-to-right) scan order, keys sorted. */
function deriveParseShape(map) {
  const entities = {};
  for (let row = 0; row < map.cells.length; row++) {
    const line = map.cells[row];
    for (let col = 0; col < line.length; col++) {
      const token = line[col];
      if (token === map.floor) continue;
      (entities[token] ??= []).push([col, row]);
    }
  }
  const sorted = {};
  for (const key of Object.keys(entities).sort()) sorted[key] = entities[key];
  return { rows: map.rows, cols: map.cols, cells: map.cells, entities: sorted };
}

test("every level's .txt file compiles into the source pack with zero errors", async () => {
  const source = await buildSourcePack();
  const result = compile(source);
  if (!result.ok) {
    console.error("CompileErrors:", JSON.stringify(result.errors, null, 2));
  }
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.pack.maps).length, 6);
});

test("compileContentPack() round-trips the same result as compile(buildSourcePack())", async () => {
  const viaHelper = await compileContentPack();
  const source = await buildSourcePack();
  const viaDirect = compile(source);
  assert.deepEqual(viaHelper, viaDirect);
});

test("snapshot-equivalence: each compiled RuntimeMap matches its P0.3 parse fixture", async () => {
  const fixtures = await loadFixtures();
  assert.equal(fixtures.size, 6, "expected 6 committed P0.3 topdown-puzzle fixtures");

  const source = await buildSourcePack();
  const result = compile(source);
  assert.equal(result.ok, true, "pack must compile before snapshots can be compared");

  for (const [stem, fixture] of fixtures) {
    const mapId = mapIdFor(`${stem}.txt`);
    const compiledMap = result.pack.maps[mapId];
    assert.ok(compiledMap, `expected compiled map '${mapId}' for fixture ${stem}`);

    const derived = deriveParseShape(compiledMap);
    assert.deepEqual(
      derived,
      { rows: fixture.rows, cols: fixture.cols, cells: fixture.cells, entities: fixture.entities },
      `map ${mapId} must be semantically equivalent to ${stem}.parse.json`,
    );
  }
});

test("legend covers exactly the tokens present in each level (no unused entry, no uncovered cell)", async () => {
  const source = await buildSourcePack();
  for (const map of source.maps) {
    const tokensInCells = new Set();
    for (const row of map.cells) {
      for (const ch of row) {
        if (ch === map.floor) continue;
        tokensInCells.add(ch);
      }
    }
    const legendTokens = new Set(Object.keys(map.legend));

    // No uncovered non-floor cell: every token found in the grid has a
    // legend entry.
    for (const token of tokensInCells) {
      assert.ok(legendTokens.has(token), `${map.id}: token '${token}' appears in cells but has no legend entry`);
    }
    // No unused legend token: every legend entry is actually used.
    for (const token of legendTokens) {
      assert.ok(tokensInCells.has(token), `${map.id}: legend token '${token}' is declared but never appears in cells`);
    }
  }
});

test("directional mover tokens (E/W/N/S) are covered by the legend vocabulary", () => {
  // Levels 005/006 (per games/topdown-puzzle/levels/manifest.json) do
  // use all four directional-mover tokens, so this is exercised by real
  // level data, not just declared vocabulary.
  for (const token of ["E", "W", "N", "S"]) {
    assert.ok(token in TOKEN_LEGEND, `expected TOKEN_LEGEND to cover directional mover '${token}'`);
    assert.equal(TOKEN_LEGEND[token].entity, "entity:moving_block");
    assert.equal(TOKEN_LEGEND[token].facing, token);
  }
});

test("all 6 legacy level files are present and produce 6 maps", async () => {
  const entries = await readdir(LEVELS_DIR);
  const levelFiles = entries.filter((n) => n.endsWith(".txt")).sort();
  assert.deepEqual(levelFiles, ["001.txt", "002.txt", "003.txt", "004.txt", "005.txt", "006.txt"]);
});
