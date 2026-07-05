#!/usr/bin/env node
/* Replays every committed fixtures/golem/<seed> log through the shared
   reducer against freshly derived worldgen, and asserts:
   (a) re-serialized worldgen === committed <seed>.world.json bytes
   (b) replay final hash (h32 of serializeState output) === index.json's
       finalHash for that seed.
   Exits non-zero on any mismatch. This is the runnable check that P0.3's
   part c will call from a root `freeze:verify` script. No fork of
   golem-grid logic: everything below imports the shared modules. */
import { readFileSync } from "node:fs";
import { genDungeon, serializeDungeon } from "../../../games/golem-grid/shared/worldgen.js";
import { createState, applyEvent, serializeState } from "../../../games/golem-grid/shared/reducer.js";
import { h32 } from "../../../games/golem-grid/shared/rng.js";

const FIXTURES_DIR = new URL("../fixtures/golem/", import.meta.url);

function loadIndex() {
  const path = new URL("index.json", FIXTURES_DIR);
  return JSON.parse(readFileSync(path, "utf8"));
}

function verifySeed(entry) {
  const worldPath = new URL(entry.world, FIXTURES_DIR);
  const logPath = new URL(entry.log, FIXTURES_DIR);

  const wantWorld = readFileSync(worldPath, "utf8");
  const log = JSON.parse(readFileSync(logPath, "utf8"));

  const dun = genDungeon(entry.seed);
  const gotWorld = JSON.stringify(serializeDungeon(dun), null, 1) + "\n";
  if (gotWorld !== wantWorld) {
    return { pass: false, reason: "worldgen mismatch (serialized dungeon != committed .world.json)" };
  }

  const st = createState();
  for (const ev of log) applyEvent(st, dun, ev);
  const finalState = serializeState(st) + "\n";
  const gotHash = h32(finalState);
  if (gotHash !== entry.finalHash) {
    return { pass: false, reason: `finalHash mismatch (got ${gotHash}, want ${entry.finalHash})` };
  }

  return { pass: true };
}

let index;
try {
  index = loadIndex();
} catch (err) {
  console.error(`verify-golem-fixtures: could not read fixtures/golem/index.json (${err.code || err.message})`);
  console.error("FAIL: 0/0 — no fixtures to verify");
  process.exit(1);
}

if (!Array.isArray(index) || index.length === 0) {
  console.error("verify-golem-fixtures: index.json is empty or not an array");
  console.error("FAIL: 0/0 — no fixtures to verify");
  process.exit(1);
}

let passed = 0;
let failed = 0;
for (const entry of index) {
  try {
    const result = verifySeed(entry);
    if (result.pass) {
      console.log(`PASS ${entry.seed}`);
      passed++;
    } else {
      console.log(`FAIL ${entry.seed}: ${result.reason}`);
      failed++;
    }
  } catch (err) {
    console.log(`FAIL ${entry.seed}: ${err.message}`);
    failed++;
  }
}

console.log(`\n${passed}/${index.length} PASS`);
process.exit(failed === 0 ? 0 : 1);
