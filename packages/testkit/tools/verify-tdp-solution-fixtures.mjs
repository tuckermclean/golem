#!/usr/bin/env node
/* Replays every committed fixtures/topdown-puzzle-solutions/<level> log
   against a FRESHLY re-derived world (never the world
   gen-tdp-solution-fixtures.mjs happened to build), and asserts:
   (a) the replay reaches outcome "WIN"
   (b) replay final hash (h32 of serializeState output) === index.json's
       finalHash for that level
   Exits non-zero on any mismatch. This is the literal "recorded
   solution log replays bit-identically" proof DELTA C4's DoD asks for
   (docs/superpowers/specs/2026-07-06-c4-topdown-port-design.md, "The DoD
   mechanism"). No logic forked from the generator: LEVELS/
   deriveLevelWorld come from tdp-solution-levels.mjs, the same registry
   gen-tdp-solution-fixtures.mjs uses.

   Optional first CLI arg: an alternate fixtures/topdown-puzzle-solutions/
   directory to verify (defaults to the committed packages/testkit/
   fixtures/topdown-puzzle-solutions/) — same convention as
   verify-golem-fixtures.mjs / verify-tdp-snapshots.mjs. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createState, reduce, serializeState } from "../../../games/topdown-puzzle/shared/reducer.js";
import { h32 } from "@golem-engine/random";
import { deriveLevelWorld } from "./tdp-solution-levels.mjs";

const dirArg = process.argv[2];
const FIXTURES_DIR = dirArg
  ? pathToFileURL(path.resolve(dirArg) + path.sep)
  : new URL("../fixtures/topdown-puzzle-solutions/", import.meta.url);

function loadIndex() {
  return JSON.parse(readFileSync(new URL("index.json", FIXTURES_DIR), "utf8"));
}

function verifyLevel(entry) {
  const logPath = new URL(entry.log, FIXTURES_DIR);
  const log = JSON.parse(readFileSync(logPath, "utf8"));

  const world = deriveLevelWorld(entry.level);
  let state = createState();
  for (const ev of log) state = reduce(state, world, ev);

  if (state.outcome !== "WIN") {
    return { pass: false, reason: `replay did not reach WIN (outcome=${state.outcome ?? "undefined"})` };
  }

  const finalHash = h32(serializeState(state) + "\n");
  if (finalHash !== entry.finalHash) {
    return { pass: false, reason: `finalHash mismatch (got ${finalHash}, want ${entry.finalHash})` };
  }

  return { pass: true };
}

let index;
try {
  index = loadIndex();
} catch (err) {
  console.error(`verify-tdp-solution-fixtures: could not read index.json (${err.code || err.message})`);
  console.error("FAIL: 0/0 — no fixtures to verify");
  process.exit(1);
}

if (!Array.isArray(index) || index.length === 0) {
  console.error("verify-tdp-solution-fixtures: index.json is empty or not an array");
  console.error("FAIL: 0/0 — no fixtures to verify");
  process.exit(1);
}

let passed = 0;
let failed = 0;
for (const entry of index) {
  try {
    const result = verifyLevel(entry);
    if (result.pass) {
      console.log(`PASS ${entry.level}`);
      passed++;
    } else {
      console.log(`FAIL ${entry.level}: ${result.reason}`);
      failed++;
    }
  } catch (err) {
    console.log(`FAIL ${entry.level}: ${err.message}`);
    failed++;
  }
}

console.log(`\n${passed}/${index.length} PASS`);
process.exit(failed === 0 ? 0 : 1);
