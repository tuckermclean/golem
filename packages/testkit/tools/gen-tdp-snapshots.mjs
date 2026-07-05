#!/usr/bin/env node
/* Regenerates packages/testkit/fixtures/topdown-puzzle/<level>.parse.json
   for every games/topdown-puzzle/levels/*.txt: a structural snapshot of
   that level's initial grid parse (DELTA.md P0.3: "Snapshot every
   topdown-puzzle level's initial grid parse").

   Token vocabulary was read from
   games/topdown-puzzle/legacy/src/scenes/KyeScene.js,
   buildLevelFromLines()'s switch statement (as of this writing, lines
   845-895; the case labels are at 858-891):
     '#' wall, 'B' block, 'D' diamond, '@' player,
     'H' baddie (axis 'horizontal'), 'V' baddie (axis 'vertical'),
     'M' memory hole,
     'E' movingblock dir 'right', 'W' movingblock dir 'left',
     'N' movingblock dir 'up',    'S' movingblock dir 'down'.
   Any other character (in practice only ' ') falls through the switch
   with no entity added — that's the floor. This matches
   games/topdown-puzzle/levels/manifest.json's independently-generated
   token histograms (games/topdown-puzzle/tools/gen-level-manifest.mjs):
   every key appearing there is one of the tokens above.

   These snapshots are STRUCTURAL, not behavioral: no Phaser import, no
   scene/physics construction — just the ASCII -> {rows, cols, cells,
   entities} parse that buildLevelFromLines performs before it ever
   touches this.physics/this.add. C2 (DELTA.md) later proves the
   kernel-ported compiler's entities are semantically equivalent to
   these.

   Snapshot shape: { file, rows, cols, cells, entities }.
     - cells: verbatim row strings, right-padded to `cols` with spaces.
     - entities: { "<token>": [[col, row], ...] }, one entry per distinct
       non-space token found in the file (every non-floor token is
       accounted for — parseLevel() throws on anything outside the known
       vocabulary, so a token can never be silently dropped). Positions
       are in raster-scan order (row-major, top-to-bottom / left-to-
       right), which is already deterministic from the scan. Entity keys
       (but not the fixed top-level {file, rows, cols, cells, entities}
       order, which is the layout's specified order) are sorted, since
       token-to-token order isn't semantic.
   2-space indent, trailing newline — same conventions as part a
   (verify-golem-fixtures.mjs) and gen-level-manifest.mjs.

   Regenerating is a no-op if nothing upstream changed: rerun this
   script and `git diff --exit-code` must be clean. If it isn't, the
   level files or this parser changed — that's a fixture update to
   review, not something to hand-edit.

   No logic forked: verify-tdp-snapshots.mjs imports parseLevel() and
   loadLevelFiles() from this file directly. */

import { mkdirSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = join(HERE, '..', '..', '..', 'games', 'topdown-puzzle', 'levels');
const FIXTURES_DIR = join(HERE, '..', 'fixtures', 'topdown-puzzle');

// Confirmed against KyeScene.js's buildLevelFromLines() switch (see header
// comment above for the file/line pointer). Anything not in this set (and
// not a space) is unrecognized and parseLevel() throws rather than drop it.
const KNOWN_TOKENS = new Set(['#', 'B', 'D', '@', 'H', 'V', 'M', 'E', 'W', 'N', 'S']);

function splitLines(text) {
  const lines = text.split(/\r?\n/);
  // Drop a single trailing empty element caused by a final newline, so row
  // counts don't depend on whether the file ends with \n (same fix-up as
  // gen-level-manifest.mjs's splitLines).
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export function parseLevel(filename, text) {
  const rawLines = splitLines(text);
  const rows = rawLines.length;
  const cols = rawLines.reduce((max, line) => Math.max(max, line.length), 0);
  const cells = rawLines.map((line) => line.padEnd(cols, ' '));

  const entities = {};
  for (let row = 0; row < cells.length; row++) {
    const line = cells[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === ' ') continue;
      if (!KNOWN_TOKENS.has(ch)) {
        throw new Error(
          `${filename}: unrecognized token '${ch}' at row ${row}, col ${col} — not in KyeScene vocabulary (${[...KNOWN_TOKENS].join(' ')})`
        );
      }
      (entities[ch] ??= []).push([col, row]);
    }
  }

  const sortedEntities = {};
  for (const key of Object.keys(entities).sort()) sortedEntities[key] = entities[key];

  return { file: filename, rows, cols, cells, entities: sortedEntities };
}

export async function loadLevelFiles() {
  const entries = await readdir(LEVELS_DIR);
  return entries.filter((name) => name.endsWith('.txt')).sort();
}

async function main() {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const levelFiles = await loadLevelFiles();
  let count = 0;
  for (const filename of levelFiles) {
    const text = await readFile(join(LEVELS_DIR, filename), 'utf8');
    const snapshot = parseLevel(filename, text);
    const outName = `${basename(filename, '.txt')}.parse.json`;
    const json = JSON.stringify(snapshot, null, 2) + '\n';
    await writeFile(join(FIXTURES_DIR, outName), json);
    console.log(
      `wrote ${outName}: rows=${snapshot.rows} cols=${snapshot.cols} entities=${Object.keys(snapshot.entities).join(',')}`
    );
    count++;
  }
  console.log(`wrote ${count} snapshot(s)`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
