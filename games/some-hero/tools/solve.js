#!/usr/bin/env node
/* Reachability/connectivity gate for some-hero tomb floors (S3 PR5's
   closer). Mirrors games/golem-grid/tools/solve.js's shape: parse
   `--seeds N` (default 10000), sweep seeds x floors, call
   `solve(generateFloor(seed, floorNum))`, report the winnable count,
   and exit non-zero on ANY unwinnable (seed, floor) — a real generator
   bug (disconnected floor / stairs-in-pinned-room / an unreachable
   seal gate), never something to weaken the gate over.

   Floor range: every floor 1..12 (FINAL_FLOOR, shared/floorgen.js:74),
   not a subset — floors 1-11 exercise every non-boss seal type plus the
   every-4th-floor warden fight, floor 12 is the final-boss floor.
   generateFloor is cheap (one 34x34 grid; BFS over it is a few thousand
   ops), so a full 10000 x 12 = 120,000-instance sweep is still fast —
   no need to sample floors down to a representative subset the way a
   heavier generator might require.

   No difficulty-band check here (unlike golem-grid's solve.js, which
   additionally gates a light-budget percentile band against
   tests/golden/solver-band.json) — S3 PR5's DoD is winnability only;
   some-hero has no such difficulty-band artifact yet. */
import { generateFloor } from "../shared/floorgen.js";
import { solve } from "../shared/solver.js";

const args = process.argv.slice(2);
const n = +(args[args.indexOf("--seeds") + 1] || 10000);
const report = args.includes("--report");

const FLOORS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12 (FINAL_FLOOR)

let winnable = 0;
let total = 0;
const failures = [];

for (let i = 0; i < n; i++) {
  const seed = `seed${i}`;
  for (const floorNum of FLOORS) {
    total++;
    const floor = generateFloor(seed, floorNum);
    const r = solve(floor);
    if (r.winnable) {
      winnable++;
    } else if (failures.length < 5) {
      failures.push({ seed, floorNum, reason: r.reason });
    }
  }
}

const stats = { seeds: n, floors: FLOORS.length, total, winnable, unwinnable: total - winnable };
console.log(JSON.stringify(stats, null, 2));
if (report) process.exit(0);

if (failures.length) {
  console.error(`UNWINNABLE: ${stats.unwinnable}/${total} floor instances, e.g.`, failures);
  process.exit(1);
}
console.log(`solver: ${n} seeds x ${FLOORS.length} floors (${total} instances) all winnable`);
