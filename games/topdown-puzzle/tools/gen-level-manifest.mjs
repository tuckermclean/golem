#!/usr/bin/env node
// Scans games/topdown-puzzle/levels/*.txt and writes
// games/topdown-puzzle/levels/manifest.json — a deterministic inventory
// of every ASCII level file: filename, sha256, rows, cols (max line
// length), and a token histogram (count of each non-space character).
//
// Deterministic output: sorted filenames, sorted token-histogram keys,
// 2-space indent, trailing newline. Run it twice; the output must be
// byte-identical (`git diff --exit-code` after re-run is the DoD check).
//
// Usage: node games/topdown-puzzle/tools/gen-level-manifest.mjs
// No dependencies beyond Node's standard library.

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = join(HERE, '..', 'levels');
const MANIFEST_PATH = join(LEVELS_DIR, 'manifest.json');

function splitLines(text) {
  const lines = text.split(/\r?\n/);
  // Drop a single trailing empty element caused by a final newline, so
  // row counts don't depend on whether the file ends with \n.
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function tokenHistogram(lines) {
  const counts = {};
  for (const line of lines) {
    for (const ch of line) {
      if (ch === ' ') continue;
      counts[ch] = (counts[ch] || 0) + 1;
    }
  }
  const sortedKeys = Object.keys(counts).sort();
  const sorted = {};
  for (const key of sortedKeys) sorted[key] = counts[key];
  return sorted;
}

async function main() {
  const entries = await readdir(LEVELS_DIR);
  const levelFiles = entries.filter((name) => name.endsWith('.txt')).sort();

  const levels = [];
  for (const filename of levelFiles) {
    const path = join(LEVELS_DIR, filename);
    const buf = await readFile(path);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const lines = splitLines(buf.toString('utf8'));
    const rows = lines.length;
    const cols = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const tokens = tokenHistogram(lines);
    levels.push({ filename, sha256, rows, cols, tokens });
  }

  const manifest = { levels };
  const json = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(MANIFEST_PATH, json);
  console.log(`Wrote ${MANIFEST_PATH} (${levels.length} level(s)).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
