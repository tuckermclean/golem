#!/usr/bin/env node
/* Regenerates everything under packages/testkit/fixtures/
   topdown-puzzle-solutions/: for each level in tdp-solution-levels.mjs's
   LEVELS, derives that level's World, commits a LEVEL_LOADED event, then
   commits every command from games/topdown-puzzle/tests/solutions/
   <level>.moves.json through the REAL validate()+reduce() (no
   reimplementation of either), asserting the final outcome is "WIN".
   Writes <level>.log.json (the full committed event log) plus an
   index.json entry {level, log, finalHash} where
   finalHash = h32(serializeState(final) + "\n") — the exact same
   fixture shape/hashing convention packages/testkit/fixtures/golem/
   already uses (see gen-golem-fixtures.mjs), this project's one hashing
   primitive.

   This is DELTA C4's "recorded solution log... becomes a permanent
   fixture" DoD mechanism (docs/superpowers/specs/
   2026-07-06-c4-topdown-port-design.md, "The DoD mechanism"), unlike
   golem-grid's own gen-golem-fixtures.mjs, which can COMPUTE a winning
   route with the solver — topdown-puzzle has no solver, so its
   .moves.json inputs are authored (hand-played or, for PR1's mover-free
   synthetic level, found by a throwaway dev-time BFS — see the design
   doc's orchestrator decision #7) rather than generated here.

   Regenerating is a no-op if nothing upstream changed: rerun this
   script, `git diff --exit-code` on fixtures/topdown-puzzle-solutions/
   must be clean. If it isn't, a .moves.json file or shared/module.js's
   validate/reduce changed — that's a fixture update to review, not
   something to hand-edit. */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createState, reduce, serializeState } from "../../../games/topdown-puzzle/shared/reducer.js";
import { validate } from "../../../games/topdown-puzzle/shared/module.js";
import { h32 } from "@golem-engine/random";
import { LEVELS, deriveLevelWorld } from "./tdp-solution-levels.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = new URL("../fixtures/topdown-puzzle-solutions/", import.meta.url);
const SOLUTIONS_DIR = join(HERE, "..", "..", "..", "games", "topdown-puzzle", "tests", "solutions");

function loadMoves(level) {
  const movesPath = join(SOLUTIONS_DIR, `${level}.moves.json`);
  return JSON.parse(readFileSync(movesPath, "utf8"));
}

function commitScriptedLog(level, world) {
  let state = createState();
  const log = [];
  let seq = 0;
  const commit = (ev) => {
    const stamped = { ...ev, seq: ++seq };
    log.push(stamped);
    state = reduce(state, world, stamped);
  };

  commit({ t: "LEVEL_LOADED" });
  for (const cmd of loadMoves(level)) {
    const result = validate({ state, world }, cmd);
    if (!Array.isArray(result)) {
      throw new Error(`level ${level}: command "${cmd}" was denied: ${result.deny}`);
    }
    for (const ev of result) commit(ev);
  }

  if (state.outcome !== "WIN") {
    throw new Error(`level ${level}: scripted playthrough did not reach WIN (outcome=${state.outcome})`);
  }
  return { log, finalState: serializeState(state) + "\n" };
}

mkdirSync(FIXTURES_DIR, { recursive: true });

const index = [];
for (const level of LEVELS) {
  const world = deriveLevelWorld(level);
  const { log, finalState } = commitScriptedLog(level, world);

  const logOut = new URL(`${level}.log.json`, FIXTURES_DIR);
  writeFileSync(logOut, JSON.stringify(log, null, 1) + "\n");

  const finalHash = h32(finalState);
  index.push({ level, log: `${level}.log.json`, finalHash });
  console.log(`wrote ${level}: ${log.length} events, finalHash ${finalHash}`);
}

index.sort((a, b) => (a.level < b.level ? -1 : a.level > b.level ? 1 : 0));
writeFileSync(new URL("index.json", FIXTURES_DIR), JSON.stringify(index, null, 1) + "\n");
console.log(`wrote index.json (${index.length} level(s))`);
