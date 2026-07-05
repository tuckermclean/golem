#!/usr/bin/env node
/* Winnability + difficulty gate. SPEC §8.3: fail on unwinnable seeds or
   difficulty-band drift. START_LIGHT is wired to the worst case here. */
import { readFileSync } from "node:fs";
import { genDungeon } from "../shared/worldgen.js";
import { solve } from "../shared/solver.js";
import { START_LIGHT } from "../shared/reducer.js";

const args = process.argv.slice(2);
const n = +(args[args.indexOf("--seeds") + 1] || 10000);
const report = args.includes("--report");

const budgets = [];
const losers = [];
let worst = { seed: null, budget: -1 };
for (let i = 0; i < n; i++) {
  const seed = "seed" + i;
  const r = solve(genDungeon(seed));
  if (!r.winnable) losers.push({ seed, ...r });
  budgets.push(r.budget);
  if (r.budget > worst.budget) worst = { seed, budget: r.budget };
}
budgets.sort((a, b) => a - b);
const pct = p => budgets[Math.floor(p / 100 * (budgets.length - 1))];
const stats = { seeds: n, START_LIGHT, min: budgets[0], p50: pct(50),
                p90: pct(90), p99: pct(99), max: worst.budget, worstSeed: worst.seed };
console.log(JSON.stringify(stats, null, 2));
if (report) process.exit(0);

if (losers.length) {
  console.error(`UNWINNABLE: ${losers.length}/${n} seeds, e.g.`, losers.slice(0, 5));
  process.exit(1);
}
const band = JSON.parse(readFileSync(new URL("../tests/golden/solver-band.json", import.meta.url), "utf8"));
for (const k of Object.keys(band)) {
  const [lo, hi] = band[k];
  if (stats[k] < lo || stats[k] > hi) {
    console.error(`difficulty drift: ${k}=${stats[k]} outside [${lo},${hi}]`);
    process.exit(1);
  }
}
console.log(`solver: ${n} seeds winnable, difficulty band OK`);
