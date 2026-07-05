#!/usr/bin/env node
/* Regenerates every games/topdown-puzzle/levels/*.txt parse in-memory via
   gen-tdp-snapshots.mjs's parseLevel(), and byte-compares against the
   committed packages/testkit/fixtures/topdown-puzzle/<level>.parse.json.
   Exits non-zero on any mismatch or missing fixture. This is the runnable
   check root `freeze:verify` calls for the P0.3c leg of DELTA.md P0.3
   ("Snapshot every topdown-puzzle level's initial grid parse").

   No logic forked from the generator: parseLevel()/loadLevelFiles() are
   imported directly from gen-tdp-snapshots.mjs.

   Optional first CLI arg: an alternate fixtures/topdown-puzzle/ directory
   to verify (defaults to the committed packages/testkit/fixtures/
   topdown-puzzle/). Exists solely so a canary/smoke run can point the
   verifier at a tampered copy in /tmp without touching the repo (same
   convention as verify-golem-fixtures.mjs). */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLevel, loadLevelFiles } from './gen-tdp-snapshots.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = join(HERE, '..', '..', '..', 'games', 'topdown-puzzle', 'levels');

const dirArg = process.argv[2];
const FIXTURES_DIR = dirArg ? path.resolve(dirArg) : join(HERE, '..', 'fixtures', 'topdown-puzzle');

async function verifyLevel(filename) {
  const text = await readFile(join(LEVELS_DIR, filename), 'utf8');
  const want = parseLevel(filename, text);
  const wantJSON = JSON.stringify(want, null, 2) + '\n';

  const fixtureName = `${basename(filename, '.txt')}.parse.json`;
  const fixturePath = join(FIXTURES_DIR, fixtureName);

  let gotJSON;
  try {
    gotJSON = await readFile(fixturePath, 'utf8');
  } catch (err) {
    return { pass: false, reason: `missing fixture ${fixtureName} (${err.code || err.message})` };
  }

  if (gotJSON !== wantJSON) {
    return { pass: false, reason: `parse mismatch for ${fixtureName} (regenerated parse != committed snapshot)` };
  }

  return { pass: true };
}

let levelFiles;
try {
  levelFiles = await loadLevelFiles();
} catch (err) {
  console.error(`verify-tdp-snapshots: could not read levels dir (${err.code || err.message})`);
  console.error('FAIL: 0/0 — no levels to verify');
  process.exit(1);
}

if (levelFiles.length === 0) {
  console.error('verify-tdp-snapshots: no level files found under games/topdown-puzzle/levels/');
  console.error('FAIL: 0/0 — no levels to verify');
  process.exit(1);
}

let passed = 0;
let failed = 0;
for (const filename of levelFiles) {
  try {
    const result = await verifyLevel(filename);
    if (result.pass) {
      console.log(`PASS ${filename}`);
      passed++;
    } else {
      console.log(`FAIL ${filename}: ${result.reason}`);
      failed++;
    }
  } catch (err) {
    console.log(`FAIL ${filename}: ${err.message}`);
    failed++;
  }
}

console.log(`\n${passed}/${levelFiles.length} PASS`);
process.exit(failed === 0 ? 0 : 1);
