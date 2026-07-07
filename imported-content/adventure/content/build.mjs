#!/usr/bin/env node
/* Writes imported-content/adventure/content/pack.json — the committed,
   frozen RuntimePack artifact (design spec: "build.mjs compiles via
   @golem-engine/content's compile() and writes a frozen pack.json
   (hash-pinned; regen a no-op)"). Mirrors games/some-hero/content/
   build.mjs / games/topdown-puzzle/content/build.mjs's frozen-artifact
   discipline: this is the one build step, importing content/index.mjs's
   EXISTING, unmodified compileContentPack() — no changes to
   build-pack.mjs/entities.mjs/index.mjs from running this script.

   Regenerating is a no-op if nothing upstream changed: rerun this script
   and `git diff --exit-code content/pack.json` must be clean.

   Usage: node imported-content/adventure/content/build.mjs */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compileContentPack } from "./index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(HERE, "pack.json");

function main() {
  const result = compileContentPack();
  if (!result.ok) {
    console.error("compileContentPack() failed:");
    console.error(JSON.stringify(result.errors, null, 2));
    process.exitCode = 1;
    return;
  }
  const json = JSON.stringify(result.pack, null, 2) + "\n";
  writeFileSync(OUT_PATH, json);
  console.log(
    `wrote ${OUT_PATH} (${Object.keys(result.pack.entities).length} entities, ${Object.keys(result.pack.maps).length} maps, hash ${result.pack.hash})`,
  );
}

main();
