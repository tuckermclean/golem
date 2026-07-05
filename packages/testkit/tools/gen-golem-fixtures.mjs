#!/usr/bin/env node
/* Regenerates everything under packages/testkit/fixtures/golem/: for each
   of the 25 frozen seeds, a worldgen snapshot (same serialization as
   games/golem-grid/tests/golden/worldgen-*.json), a recorded event log
   (same event format as tests/golden/replay-log.json) driving the shared
   reducer along the solver's winning route, and an index.json recording
   each seed's finalHash (h32 of the serialized final state, matching the
   byte-identity mechanism games/golem-grid/tests/replay.test.js uses for
   its own golden — h32 is the project's one hashing primitive, see
   shared/rng.js). No logic forked from golem-grid: everything below
   imports the shared modules and mirrors tools/gen-golden.mjs +
   tools/gen-replay-fixture.mjs exactly.

   Regenerating is a no-op if nothing upstream changed: this script is
   deterministic (rerun twice, `git diff --exit-code` clean). If it isn't,
   that's a versioning event in golem-grid, not a fixture bug — do not
   hand-edit the outputs. */
import { writeFileSync, mkdirSync } from "node:fs";
import { genDungeon, serializeDungeon } from "../../../games/golem-grid/shared/worldgen.js";
import { shortestPath } from "../../../games/golem-grid/shared/solver.js";
import { createState, applyEvent, serializeState, itemAt } from "../../../games/golem-grid/shared/reducer.js";
import { h32 } from "../../../games/golem-grid/shared/rng.js";

const FIXTURES_DIR = new URL("../fixtures/golem/", import.meta.url);
mkdirSync(FIXTURES_DIR, { recursive: true });

// Controller-decided seed list (brief §"controller decisions" item 2):
// the existing golden trio, the solver's worst-case depth seed, seed1..seed21.
const SEEDS = [
  "golem", "lantern", "plagueis", "seed6904",
  ...Array.from({ length: 21 }, (_, i) => `seed${i + 1}`),
];

function scriptedLog(seed, dun) {
  const st = createState();
  const log = [];
  let seq = 0;
  const emit = ev => { ev.seq = ++seq; log.push(ev); applyEvent(st, dun, ev); };

  emit({ t: "JOIN", pid: "p1", name: "Ash" });
  emit({ t: "JOIN", pid: "p2", name: "Brine" });
  emit({ t: "SAY", pid: "p1", text: "down we go", x: dun.stairs.x, y: dun.stairs.y, scope: "room" });
  for (const [x, y] of shortestPath(dun, dun.stairs, { x: dun.prize.x, y: dun.prize.y })) {
    emit({ t: "MOVE", pid: "p1", x, y });
    const it = itemAt(st, dun, x, y);
    if (it) emit({ t: "TAKE", pid: "p1", item: it, x, y });
  }
  emit({ t: "TAKE_PRIZE", pid: "p1" });
  emit({ t: "SAY", pid: "p1", text: "got it — heavy", scope: "party" });
  for (const [x, y] of shortestPath(dun, { x: dun.prize.x, y: dun.prize.y }, dun.stairs))
    emit({ t: "MOVE", pid: "p1", x, y });
  emit({ t: "WIN", pid: "p1" });

  if (st.D.get("gameover") !== "WIN") {
    throw new Error(`seed ${seed}: scripted playthrough did not reach WIN`);
  }
  return { log, finalState: serializeState(st) + "\n" };
}

const index = [];
for (const seed of SEEDS) {
  const dun = genDungeon(seed);

  const worldOut = new URL(`${seed}.world.json`, FIXTURES_DIR);
  const worldJSON = JSON.stringify(serializeDungeon(dun), null, 1) + "\n";
  writeFileSync(worldOut, worldJSON);

  const { log, finalState } = scriptedLog(seed, dun);
  const logOut = new URL(`${seed}.log.json`, FIXTURES_DIR);
  writeFileSync(logOut, JSON.stringify(log, null, 1) + "\n");

  index.push({
    seed,
    world: `${seed}.world.json`,
    log: `${seed}.log.json`,
    finalHash: h32(finalState),
  });

  console.log(`wrote ${seed}: ${log.length} events, finalHash ${h32(finalState)}`);
}

index.sort((a, b) => (a.seed < b.seed ? -1 : a.seed > b.seed ? 1 : 0));
writeFileSync(new URL("index.json", FIXTURES_DIR), JSON.stringify(index, null, 1) + "\n");
console.log(`wrote index.json (${index.length} seeds)`);
