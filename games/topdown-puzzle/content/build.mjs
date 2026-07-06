#!/usr/bin/env node
/* Writes games/topdown-puzzle/content/pack.json — the committed, frozen
   RuntimePack artifact DELTA C4's design doc calls for (docs/superpowers/
   specs/2026-07-06-c4-topdown-port-design.md, "deriveWorld(seed) — and
   the sync-vs-async problem"): shared/module.js's deriveWorld must be
   SYNCHRONOUS (the kernel's own discipline), but C2's compileContentPack()
   does real file IO (readFile/readdir) to assemble the source pack before
   compiling it. This script bridges that gap the same way the project
   already bridges "eval-gated build artifacts... pinned by manifest" for
   models (CLAUDE.md doctrine #8) and C1's own RuntimePack.hash: a
   committed, content-addressed build output, not a runtime dependency.

   This is the ONE new build step C4 adds; it imports C2's EXISTING,
   unmodified compileContentPack() (games/topdown-puzzle/content/
   index.mjs) — no changes to build-pack.mjs / entities.mjs / index.mjs.

   Regenerating is a no-op if nothing upstream changed: rerun this script
   and `git diff --exit-code content/pack.json` must be clean (mirrors
   gen-golem-fixtures.mjs / gen-tdp-snapshots.mjs's own documented
   discipline — see games/topdown-puzzle/tests/pack-build.test.js for the
   runnable version of that check). If it isn't clean, the six level
   files or the compiler changed — that's a fixture update to review, not
   something to hand-edit.

   Usage: node games/topdown-puzzle/content/build.mjs */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compileContentPack } from "./index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(HERE, "pack.json");

async function main() {
  const result = await compileContentPack();
  if (!result.ok) {
    console.error("compileContentPack() failed:");
    console.error(JSON.stringify(result.errors, null, 2));
    process.exitCode = 1;
    return;
  }
  const json = JSON.stringify(result.pack, null, 2) + "\n";
  writeFileSync(OUT_PATH, json);
  console.log(
    `wrote ${OUT_PATH} (${Object.keys(result.pack.maps).length} maps, hash ${result.pack.hash})`,
  );
}

await main();
