#!/usr/bin/env node
/* Regenerating goldens is a VERSIONING EVENT (worldgen MAJOR bump), never a
   test fix. If a golden test fails, the extraction/refactor is wrong. */
import { writeFileSync, mkdirSync } from "node:fs";
import { genDungeon, serializeDungeon } from "../shared/worldgen.js";

const SEEDS = ["plagueis", "lantern", "golem"]; // one per theme
mkdirSync(new URL("../tests/golden/", import.meta.url), { recursive: true });
for (const seed of SEEDS) {
  const out = new URL(`../tests/golden/worldgen-${seed}.json`, import.meta.url);
  writeFileSync(out, JSON.stringify(serializeDungeon(genDungeon(seed)), null, 1) + "\n");
  console.log("wrote", out.pathname);
}
