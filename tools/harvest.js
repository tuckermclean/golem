#!/usr/bin/env node
/* ── tools/harvest.js — L3 task L3, PR1 (see docs/superpowers/specs/
 * 2026-07-06-l3-data-tools-design.md). Walks REAL worldgen
 * (games/golem-grid/shared/worldgen.js's genDungeon) across a
 * deterministic seed range and emits, per seed, JSONL control rows for
 * all six trained tasks (A: facts→prose, B: NL→command, C: denial→
 * explanation, D: bounded NPC reply, E: command decomposition, F:
 * reference resolution).
 *
 * Every fact is read straight off genDungeon's output or off a REAL
 * call to games/golem-grid/shared/module.js's `validate()`/`reduce()`
 * — harvest.js never invents a fact, and never reimplements the
 * game's own legality/denial rules (doctrine #7: improve tables before
 * improving the generator; the "generator" here is the teacher, not
 * this harvester).
 *
 * All internal sampling choices (which room, which reason, which canned
 * question) are drawn from @golem-engine/random's channel(seed,
 * "harvest", ...) — never Math.random/Date.now (tools/check-bans.mjs
 * scans this file).
 *
 * Output: JSONL, one control row per line, sorted deterministically by
 * (seed, task, id) so re-running this script on an unchanged repo
 * reproduces the file byte-for-byte (same "regen is a no-op" property
 * tools/lang/gen_utterances.js already documents).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { channel, pick } from "@golem-engine/random";
import { genDungeon } from "../games/golem-grid/shared/worldgen.js";
import { createState, reduce } from "../games/golem-grid/shared/reducer.js";
import { validate as gameValidate } from "../games/golem-grid/shared/module.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { seeds: 2000, start: 0, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--seeds") a.seeds = Number(argv[++i]);
    else if (argv[i] === "--start") a.start = Number(argv[++i]);
    else if (argv[i] === "--out") a.out = argv[++i];
  }
  if (!a.out) {
    console.error("usage: harvest.js --out <path.jsonl> [--seeds N] [--start N]");
    process.exit(1);
  }
  return a;
}

// ── Small shared helpers ─────────────────────────────────────────────
// Training-corpus wire-command convention (mirrored EXACTLY in
// tools/lang/parse-cli.mjs's serializeWireCmd/itemSlugFromTarget — see
// that file's header comment): multi-word item names are underscore-
// joined in CMD/CMDS text, and Affordance `target` ids are authored as
// "<kind>/<slug>@<x>,<y>".
function slug(name) {
  return name.trim().replace(/\s+/g, "_");
}
function targetId(kind, name, x, y) {
  return `${kind}/${slug(name)}@${x},${y}`;
}

const DIR_DELTA = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const DIR_WORD = { n: "north", s: "south", e: "east", w: "west" };

function exitsAt(dun, x, y) {
  const out = [];
  for (const [d, [dx, dy]] of Object.entries(DIR_DELTA)) {
    const nx = x + dx,
      ny = y + dy;
    if (nx >= 0 && ny >= 0 && ny < dun.grid.length && nx < dun.grid[0].length && dun.grid[ny][nx] !== "#") {
      out.push(d);
    }
  }
  return out;
}

function itemsInRoom(dun, roomIdx) {
  const out = [];
  for (const [k, name] of dun.items) {
    const [x, y] = k.split(",").map(Number);
    if (dun.tileRoom[y][x] === roomIdx) out.push({ x, y, name });
  }
  return out;
}
function mobInRoom(dun, roomIdx) {
  for (const [k, name] of dun.mobs) {
    const [x, y] = k.split(",").map(Number);
    if (dun.tileRoom[y][x] === roomIdx) return { x, y, name };
  }
  return null;
}
function loreNear(dun, x, y) {
  for (const [k, tier] of dun.lore) {
    const [lx, ly] = k.split(",").map(Number);
    if (Math.abs(lx - x) <= 1 && Math.abs(ly - y) <= 1) return { x: lx, y: ly, tier };
  }
  return null;
}

const HOST = "h1", HOST_NAME = "Hera";
const PEER = "h2", PEER_NAME = "Bram";

/** A throwaway reducer state with two joined players, one teleported to
 * (x,y) — teleporting via a raw MOVE `reduce()` call (not `validate()`)
 * is fine here: harvest.js is authoring a SCENARIO to probe with the
 * real `validate()`, not playing the game live. State is discarded
 * after each probe. */
function stateAt(dun, x, y, { over = false, peerAt = null } = {}) {
  let st = createState();
  st = reduce(st, dun, { t: "JOIN", pid: HOST, name: HOST_NAME, seq: 1 });
  st = reduce(st, dun, { t: "JOIN", pid: PEER, name: PEER_NAME, seq: 2 });
  st = reduce(st, dun, { t: "MOVE", pid: HOST, x, y, seq: 3 });
  if (peerAt) st = reduce(st, dun, { t: "MOVE", pid: PEER, x: peerAt.x, y: peerAt.y, seq: 4 });
  if (over) st = reduce(st, dun, { t: "LOSE", pid: HOST, seq: 5 });
  return st;
}

function isDeny(result) {
  return result && !Array.isArray(result) && typeof result.deny === "string";
}

// ── Row builders ──────────────────────────────────────────────────────
function controlString(fields) {
  return Object.entries(fields)
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
}

function taskARow(seed, id, fields) {
  return { task: "A", seed, id, control: controlString(fields), teacherSlot: "prose", groundTruth: {} };
}
function taskBRow(seed, id, fields, afford, cmd) {
  const control = controlString({ TASK: "B", ...fields, AFFORD: afford.length ? afford.join(";") : "none" });
  return { task: "B", seed, id, control, teacherSlot: "utterance", groundTruth: { cmd } };
}
function taskCRow(seed, id, fields, reason) {
  const control = controlString({ TASK: "C", ...fields, REASON: reason });
  return { task: "C", seed, id, control, teacherSlot: "explanation", groundTruth: { reason } };
}
function taskDRow(seed, id, fields) {
  const control = controlString({ TASK: "D", ...fields });
  return {
    task: "D",
    seed,
    id,
    control,
    teacherSlot: "reply",
    groundTruth: { doesntKnow: fields.DOESNT_KNOW === "none" ? [] : fields.DOESNT_KNOW.split("+") },
  };
}
function taskERow(seed, id, fields, afford, cmds) {
  const control = controlString({ TASK: "E", ...fields, AFFORD: afford.length ? afford.join(";") : "none" });
  return { task: "E", seed, id, control, teacherSlot: "utterance", groundTruth: { cmds } };
}
function taskFRow(seed, id, fields, afford, referent) {
  const control = controlString({ TASK: "F", ...fields, AFFORD: afford.join(";") });
  return { task: "F", seed, id, control, teacherSlot: "utterance", groundTruth: { referent } };
}

// ── Per-seed harvesting ────────────────────────────────────────────────
function harvestSeed(seedNum) {
  const seed = String(seedNum);
  const dun = genDungeon(seed);
  const rows = [];
  const g = channel(seed, "harvest");

  // Farthest room from the stairs — the "distant, genuinely outside the
  // envelope" source for Task D's DOESNT_KNOW facts.
  let distantRoom = dun.rooms[0];
  for (const rm of dun.rooms) if (dun.dist[rm.cy][rm.cx] > dun.dist[distantRoom.cy][distantRoom.cx]) distantRoom = rm;
  const distantMob = mobInRoom(dun, distantRoom.idx);
  const distantItems = itemsInRoom(dun, distantRoom.idx);
  const distantFact = distantItems[0] ? slug(distantItems[0].name) : distantMob ? slug(distantMob.name) : distantRoom.kind;

  let taskCEmittedReasons = new Set();
  let taskECount = 0;
  let taskFCount = 0;

  for (const room of dun.rooms) {
    const { cx: x, cy: y, idx, kind, tone } = room;
    const depth = dun.dist[y][x];
    const exits = exitsAt(dun, x, y);
    if (exits.length === 0) continue; // pathological; never happens in a connected dungeon, but be defensive

    const items = itemsInRoom(dun, idx);
    const mob = mobInRoom(dun, idx);
    const itemsField = items.length ? items.map((i) => slug(i.name)).join("+") : "none";
    const mobField = mob ? slug(mob.name) : "none";

    // ── Task A: one "look"/room-beat row per room ──
    rows.push(
      taskARow(seed, `r${idx}-look`, {
        EVENT: "look",
        THEME: dun.theme,
        ROOM: kind,
        TONE: tone,
        DEPTH: String(depth),
        EXITS: exits.join(","),
        ITEMS: itemsField,
        MOB: mobField,
      }),
    );

    // ── Task A: take (if an item sits in this room) ──
    if (items.length) {
      const it = items[0];
      const stAt = stateAt(dun, it.x, it.y);
      const result = gameValidate({ st: stAt, dun, from: HOST }, "take");
      if (!isDeny(result)) {
        rows.push(
          taskARow(seed, `r${idx}-take`, {
            EVENT: "take",
            THEME: dun.theme,
            ITEMS: slug(it.name),
            MOB: "none",
          }),
        );
      }
    }

    // ── Task A: read (if lore sits near this room's center) ──
    const lore = loreNear(dun, x, y);
    if (lore) {
      rows.push(taskARow(seed, `r${idx}-read`, { EVENT: "read", THEME: dun.theme, ITEMS: "none", MOB: "none" }));
    }

    // ── Task B: NL -> command, opportunistic per room ──
    if (items.length) {
      const it = items[0];
      const stAt = stateAt(dun, it.x, it.y);
      const result = gameValidate({ st: stAt, dun, from: HOST }, "take");
      if (!isDeny(result)) {
        const afford = [`take:${targetId("item", it.name, it.x, it.y)}:${it.name}`];
        rows.push(taskBRow(seed, `r${idx}-take`, { THEME: dun.theme, ROOM: kind }, afford, `take ${slug(it.name)}`));
      }
    } else {
      const dir = pick(channel(seed, "harvest", "B", "dir", String(idx)), exits);
      const [dx, dy] = DIR_DELTA[dir];
      const stAt = stateAt(dun, x, y);
      const result = gameValidate({ st: stAt, dun, from: HOST }, `move ${dx} ${dy}`);
      if (!isDeny(result)) {
        rows.push(taskBRow(seed, `r${idx}-move`, { THEME: dun.theme, ROOM: kind }, [], `move ${dx} ${dy}`));
      }
    }

    // ── Task D: bounded NPC reply — one "knows the room" row per room ──
    const knows = [kind, dun.theme, ...(mob ? [slug(mob.name)] : [])].join("+");
    const question = pick(channel(seed, "harvest", "D", "q", String(idx)), [
      "What is this place?",
      "Is anything dangerous nearby?",
      "What lies deeper in?",
    ]);
    rows.push(
      taskDRow(seed, `r${idx}-room`, {
        THEME: dun.theme,
        TOPIC: "room",
        KNOWS: knows,
        DOESNT_KNOW: slug(distantRoom.kind) === kind ? "none" : slug(distantRoom.kind),
        QUESTION: question,
      }),
    );

    // ── Task E: take-then-move, one per seed (first room it's legal in) ──
    if (taskECount === 0 && items.length) {
      const it = items[0];
      const stAt = stateAt(dun, it.x, it.y);
      const takeResult = gameValidate({ st: stAt, dun, from: HOST }, "take");
      if (!isDeny(takeResult)) {
        const stAfterTake = reduce(stAt, dun, { ...takeResult[0], seq: stAt.seq + 1 });
        const dir = pick(channel(seed, "harvest", "E", "dir", String(idx)), exits);
        const [dx, dy] = DIR_DELTA[dir];
        const moveResult = gameValidate({ st: stAfterTake, dun, from: HOST }, `move ${dx} ${dy}`);
        if (!isDeny(moveResult)) {
          const afford = [`take:${targetId("item", it.name, it.x, it.y)}:${it.name}`];
          rows.push(
            taskERow(
              seed,
              `r${idx}-take-move`,
              { THEME: dun.theme, ROOM: kind },
              afford,
              [`take ${slug(it.name)}`, `move ${dx} ${dy}`],
            ),
          );
          taskECount++;
        }
      }
    }

    // ── Task F: reference resolution, one per seed (first item found) ──
    if (taskFCount === 0 && items.length) {
      const it = items[0];
      const ref = targetId("item", it.name, it.x, it.y);
      const afford = [`take:${ref}:${it.name}+it,that,the thing`];
      rows.push(
        taskFRow(
          seed,
          `r${idx}-ref`,
          { THEME: dun.theme, ANTECEDENT_TEXT: `A ${it.name} rests here, half in shadow.` },
          afford,
          ref,
        ),
      );
      taskFCount++;
    }
  }

  // ── Task D: one "distant" (refusal-shaped) row per seed ──
  const anchorRoom = dun.rooms[0];
  // distantFact must be genuinely OUTSIDE the KNOWS envelope; if it
  // happens to coincide with the anchor room's own kind (e.g. both
  // rooms are "hall"), fall back to the theme's prize name — always
  // textually distinct from a room-kind word.
  const safeDistantFact = distantFact === anchorRoom.kind ? slug(dun.T.prize) : distantFact;
  rows.push(
    taskDRow(seed, "d-distant", {
      THEME: dun.theme,
      TOPIC: "distant",
      KNOWS: anchorRoom.kind,
      DOESNT_KNOW: safeDistantFact,
      QUESTION: "What's in the deepest chamber?",
    }),
  );

  // ── Task C: denial -> explanation, one row per REASON per seed ──
  // WALL: find a tile bordering a real wall.
  outerWall: for (const room of dun.rooms) {
    for (let yy = room.y; yy < room.y + room.h; yy++) {
      for (let xx = room.x; xx < room.x + room.w; xx++) {
        for (const [d, [dx, dy]] of Object.entries(DIR_DELTA)) {
          const nx = xx + dx,
            ny = yy + dy;
          const blocked = nx < 0 || ny < 0 || ny >= dun.grid.length || nx >= dun.grid[0].length || dun.grid[ny][nx] === "#";
          if (blocked) {
            const stAt = stateAt(dun, xx, yy);
            const result = gameValidate({ st: stAt, dun, from: HOST }, `move ${dx} ${dy}`);
            if (isDeny(result)) {
              rows.push(
                taskCRow(seed, "c-wall", { THEME: dun.theme, EVENT: "move", DIR: d, EXITS: exitsAt(dun, xx, yy).join(",") || "none" }, "WALL"),
              );
              break outerWall;
            }
          }
        }
      }
    }
  }
  // NOTHING_HERE: an item-less tile.
  for (const room of dun.rooms) {
    if (itemsInRoom(dun, room.idx).length > 0) continue;
    const stAt = stateAt(dun, room.cx, room.cy);
    const result = gameValidate({ st: stAt, dun, from: HOST }, "take");
    if (isDeny(result)) {
      rows.push(taskCRow(seed, "c-nothing", { THEME: dun.theme, EVENT: "take" }, "NOTHING_HERE"));
      break;
    }
  }
  // WRONG_ITEM: a tile with an item, ask for a different one.
  for (const room of dun.rooms) {
    const items = itemsInRoom(dun, room.idx);
    if (!items.length) continue;
    const it = items[0];
    const stAt = stateAt(dun, it.x, it.y);
    const result = gameValidate({ st: stAt, dun, from: HOST }, "take a completely different thing");
    if (isDeny(result)) {
      rows.push(taskCRow(seed, "c-wrongitem", { THEME: dun.theme, EVENT: "take", ITEMS: slug(it.name) }, "WRONG_ITEM"));
      break;
    }
  }
  // NO_LORE: a tile with no lore nearby.
  for (const room of dun.rooms) {
    if (loreNear(dun, room.cx, room.cy)) continue;
    const stAt = stateAt(dun, room.cx, room.cy);
    const result = gameValidate({ st: stAt, dun, from: HOST }, "read");
    if (isDeny(result)) {
      rows.push(taskCRow(seed, "c-nolore", { THEME: dun.theme, EVENT: "read" }, "NO_LORE"));
      break;
    }
  }
  // NO_SUCH_PLAYER: whisper to someone who never joined.
  {
    const stAt = stateAt(dun, anchorRoom.cx, anchorRoom.cy);
    const result = gameValidate({ st: stAt, dun, from: HOST }, "whisper Ghost hello");
    if (isDeny(result)) rows.push(taskCRow(seed, "c-noplayer", { THEME: dun.theme, EVENT: "whisper" }, "NO_SUCH_PLAYER"));
  }
  // UNKNOWN_VERB.
  {
    const stAt = stateAt(dun, anchorRoom.cx, anchorRoom.cy);
    const result = gameValidate({ st: stAt, dun, from: HOST }, "dance");
    if (isDeny(result)) rows.push(taskCRow(seed, "c-unknownverb", { THEME: dun.theme, EVENT: "dance" }, "UNKNOWN_VERB"));
  }
  // GAME_OVER.
  {
    const stAt = stateAt(dun, anchorRoom.cx, anchorRoom.cy, { over: true });
    const result = gameValidate({ st: stAt, dun, from: HOST }, "move 0 -1");
    if (isDeny(result)) rows.push(taskCRow(seed, "c-gameover", { THEME: dun.theme, EVENT: "move" }, "GAME_OVER"));
  }

  return rows;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = [];
  for (let s = args.start; s < args.start + args.seeds; s++) {
    rows.push(...harvestSeed(s));
  }
  rows.sort((a, b) => {
    const bySeed = Number(a.seed) - Number(b.seed);
    if (bySeed !== 0) return bySeed;
    if (a.task !== b.task) return a.task < b.task ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const out = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  writeFileSync(args.out, out);
  console.log(`harvest: wrote ${rows.length} rows across ${args.seeds} seeds -> ${args.out}`);
}

main();
