#!/usr/bin/env node
/* Regenerates tests/golden/replay-{log,final}.json. Only rerun this if the
   event schema itself changes — that is a versioning event, say so. */
import { writeFileSync } from "node:fs";
import { genDungeon } from "../shared/worldgen.js";
import { shortestPath } from "../shared/solver.js";
import { createState, applyEvent, serializeState, itemAt, light } from "../shared/reducer.js";

const seed = "plagueis";
const dun = genDungeon(seed);
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

writeFileSync(new URL("../tests/golden/replay-log.json", import.meta.url),
  JSON.stringify(log, null, 1) + "\n");
writeFileSync(new URL("../tests/golden/replay-final.json", import.meta.url),
  serializeState(st) + "\n");
console.log(`replay fixture: ${log.length} events, final light ${light(st)}`);
