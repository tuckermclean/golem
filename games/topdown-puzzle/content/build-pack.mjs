/* ── topdown-puzzle ASCII importer (DELTA C2).
   Reads games/topdown-puzzle/levels/*.txt (the same files
   packages/testkit/tools/gen-tdp-snapshots.mjs snapshots for P0.3) and
   assembles a @golem-engine/content SOURCE pack: the shared template
   entities from entities.mjs, plus one MapSource per level with
   `cells` copied verbatim and a `legend` built from exactly the tokens
   present in that level (never a fixed universal legend — C1's
   freezeMap() only errors on an uncovered *cell*, not an unused legend
   *entry*, so building the legend from the actual token set is what
   keeps "no unused legend token" true without a separate prune step).

   This file is the one place in C2 allowed to do file IO / ASCII
   parsing: @golem-engine/content's compile() stays pure and synchronous
   (unknown in, RuntimePack or errors out — no file/YAML loading inside
   the package, per its design doc's Open Questions #6). Turning
   `.txt` files into `cells` arrays is precisely the importer's job. */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compile } from "@golem-engine/content";
import { ENTITY_TEMPLATES } from "./entities.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = join(HERE, "..", "levels");

// The map's reserved "empty" token (@golem-engine/content's `floor`
// field). Matches every topdown-puzzle level's own convention (the
// space character never appears as a legend key in levels/manifest.json
// or packages/testkit/fixtures/topdown-puzzle/*.parse.json).
export const FLOOR = " ";

// token -> legend-entry template. Grounded in games/topdown-puzzle/
// legacy/src/scenes/KyeScene.js's buildLevelFromLines() switch
// (case labels ~858-891) — see entities.mjs for the full behavioral
// citation of each entity kind.
export const TOKEN_LEGEND = Object.freeze({
  "#": { entity: "entity:wall" },
  B: { entity: "entity:block" },
  D: { entity: "entity:diamond" },
  "@": { entity: "entity:player_start" },
  H: { entity: "entity:baddie_horizontal" }, // addBaddie(x, y, 'horizontal')
  V: { entity: "entity:baddie_vertical" }, // addBaddie(x, y, 'vertical')
  M: { entity: "entity:memory_hole" },
  E: { entity: "entity:moving_block", facing: "E" }, // addMovingBlock(x, y, 'right')
  W: { entity: "entity:moving_block", facing: "W" }, // addMovingBlock(x, y, 'left')
  N: { entity: "entity:moving_block", facing: "N" }, // addMovingBlock(x, y, 'up')
  S: { entity: "entity:moving_block", facing: "S" }, // addMovingBlock(x, y, 'down')
});

function splitLines(text) {
  const lines = text.split(/\r?\n/);
  // Drop a single trailing empty element caused by a final newline, so
  // row counts don't depend on whether the file ends with \n (same
  // fix-up as gen-tdp-snapshots.mjs / gen-level-manifest.mjs).
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

export async function loadLevelFiles() {
  const entries = await readdir(LEVELS_DIR);
  return entries.filter((name) => name.endsWith(".txt")).sort();
}

export function mapIdFor(filename) {
  const stem = filename.replace(/\.txt$/, "");
  return `map:tdp_${stem}`;
}

/** Parse one level's ASCII text into a content MapSource. Pure given
 *  (filename, text) — no IO here, so this is directly unit-testable. */
export function buildMapSource(filename, text) {
  const rawLines = splitLines(text);
  const cols = rawLines.reduce((max, line) => Math.max(max, line.length), 0);
  const cells = rawLines.map((line) => line.padEnd(cols, FLOOR));

  const tokensPresent = new Set();
  for (const row of cells) {
    for (const ch of row) {
      if (ch === FLOOR) continue;
      tokensPresent.add(ch);
    }
  }

  const legend = {};
  for (const token of tokensPresent) {
    const entry = TOKEN_LEGEND[token];
    if (!entry) {
      throw new Error(
        `${filename}: unrecognized token '${token}' — not in the KyeScene vocabulary ` +
          `(${Object.keys(TOKEN_LEGEND).join(" ")})`,
      );
    }
    legend[token] = { ...entry };
  }

  return { id: mapIdFor(filename), floor: FLOOR, legend, cells };
}

/** Reads every level file and assembles the full source pack (the
 *  value @golem-engine/content's compile() expects as `unknown`). */
export async function buildSourcePack() {
  const files = await loadLevelFiles();
  const maps = [];
  for (const filename of files) {
    const text = await readFile(join(LEVELS_DIR, filename), "utf8");
    maps.push(buildMapSource(filename, text));
  }
  return {
    name: "topdown-puzzle",
    version: 1,
    entities: ENTITY_TEMPLATES,
    tables: [],
    maps,
  };
}

/** Builds the source pack and compiles it through @golem-engine/content,
 *  returning the same CompileResult compile() itself returns. */
export async function compileContentPack() {
  const source = await buildSourcePack();
  return compile(source);
}
