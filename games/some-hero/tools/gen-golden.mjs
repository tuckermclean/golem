#!/usr/bin/env node
/* Regenerating goldens is a VERSIONING EVENT (floorgen MAJOR bump), never
   a test fix. If a golden test fails, the extraction/refactor is wrong.
   Mirrors games/golem-grid/tools/gen-golden.mjs exactly. */
import { writeFileSync, mkdirSync } from "node:fs";
import { generateFloor, serializeFloor } from "../shared/floorgen.js";

const SEEDS = ["crypt", "ossuary", "reliquary"]; // 3 seeds
const FLOORS = [1, 4, 6]; // 4 is a warden floor (every 4th); 1 and 6 are normal seal floors

mkdirSync(new URL("../tests/golden/", import.meta.url), { recursive: true });
for (const seed of SEEDS) {
  for (const floorNum of FLOORS) {
    const out = new URL(`../tests/golden/floor-${seed}-${floorNum}.json`, import.meta.url);
    writeFileSync(out, JSON.stringify(serializeFloor(generateFloor(seed, floorNum)), null, 1) + "\n");
    console.log("wrote", out.pathname);
  }
}
