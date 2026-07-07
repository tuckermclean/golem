/* ── FLOORGEN — channel-based tomb floor generator (S3 PR2 design spec:
   docs/superpowers/specs/2026-07-07-s3-pr2-floorgen-design.md). Pure
   port of games/some-hero/legacy/src/world/floorgen.js's generateFloor
   onto @golem-engine/random named channels + @golem-engine/world's
   generic room/pinned-room/corridor primitives (S3 PR1, merged).

   ISOLATED PORT — not wired into shared/module.js/deriveWorld yet (S3
   PR4's job); no golden fixtures (PR3), no fuzz/solver gate (PR5).
   Importable standalone by tests only, mirroring games/golem-grid's own
   shared/worldgen.js placement in this game's shared/ tree.

   Coordinates are TILE-grid cells (small integer x,y), matching this
   game's already-live kernel/grid convention (shared/module.js's
   deriveWorldFromPack and tests/fixtures/synthetic-floor.mjs both work
   in tile cells) — NOT legacy's world-pixel positions (legacy multiplies
   every placed position by T=36, legacy/src/constants.js:3). This is the
   same kind of documented, deliberate canonicalization shared/module.js's
   own header already calls out for movement ("Movement canonicalization"
   — legacy is continuous-pixel AABB, the port is grid-cardinal).

   Named-channel decomposition (locked by the design spec):
     - "layout"  room count/size/pos, pinned-room placement, corridor
                 chain -> @golem-engine/world's placeRooms/
                 placePinnedRooms/chainCorridors, plus spawn/exit
                 selection via featureEligibleRooms.
     - "puzzle"  seal-type selection + trap/plate/torch/riddle counts
                 and positions. Warden/final boss STATS are rng-free
                 (pure functions of floor number, ported from
                 entities/boss.js below); only a boss's tile POSITION is
                 decided in this section, and that position is itself
                 derived from spawn/exit/pinned-room geometry, not rng.
     - "spawns"  enemy kind + gold loot + cabinet furniture runs + slime
                 placement, keyed PER ROOM
                 (channel(seed,"spawns",String(floorNum),String(roomIdx)))
                 so adding content to one room never reshuffles another
                 room's draws (games/golem-grid/shared/worldgen.js:56's
                 "roomfill" precedent). NOTE: legacy's own algorithm
                 draws all of this from ONE shared rng across a "pick a
                 random mid-room per enemy" loop (floorgen.js:169-232) —
                 the per-room-indexed restructuring below is a
                 deliberate, documented redesign the design spec calls
                 for explicitly ("per-room draws use a per-room-indexed
                 channel"), not a byte-for-byte transcription of that
                 loop's iteration order. The PORTED pieces are the count
                 formulas, the enemy-kind table, and the cabinet-run
                 wall-adjacency algorithm; the loop SHAPE around them is
                 new.
     - "decor"   pinned-room props (breakroom table/chairs, desk table,
                 gap guestbook). Legacy uses ZERO rng here (fixed
                 offsets, floorgen.js:234-254) — this channel is
                 reserved/mostly-inert, wired for forward-compat only,
                 exactly as the design spec states; no randomness is
                 invented to justify its existence. Legacy's sub-tile
                 pixel offsets (e.g. "-38px, +10px") don't have an exact
                 tile-grid equivalent now that positions are whole tiles
                 (see the coordinate note above) — props land on
                 approximate adjacent tiles around the pinned room's
                 center; exact layout is a future rendering-layer concern
                 (props are inert data here, never consumed yet).

   Import discipline: nothing from games/some-hero/legacy/ — every
   legacy behavior transcribed here is cited by file:line instead. */

import { channel, pick, chance, rint } from "@golem-engine/random";
import {
  placeRooms,
  placePinnedRooms,
  chainCorridors,
  featureEligibleRooms,
} from "@golem-engine/world";

// ---- ported constants (games/some-hero/legacy/src/constants.js:7,38) ----
const TOMB_W = 34, TOMB_H = 34; // constants.js:7 TOMB = { W: 34, H: 34 }
const FINAL_FLOOR = 12; // constants.js:38

// ---- ported enemy-kind table (games/some-hero/legacy/src/entities/
// enemy.js:46-51 pickTombKind). Legacy's `f` parameter is unused by the
// function body — dropped here, not a behavior change. Only LIVE tomb
// kinds appear (consultant/mailbat/skeleton); legacy's pickTombKind
// never draws a dead desert kind (scarab/jackal/spirit/mummy) or an
// overworld kind (pigeon/goose/veteran) — those live in enemy.js's
// ENEMY_TYPES table but are never reachable from this function. ----
function pickTombKind(rng) {
  const r = rng();
  if (r < 0.25) return "consultant";
  if (r < 0.55) return "mailbat";
  return "skeleton";
}

// ---- ported boss stats (games/some-hero/legacy/src/entities/boss.js:
// 17-26 wardenStats — pure fn of floor number, zero rng) ----
function wardenStats(f) {
  return {
    hp: Math.ceil(40 * (1 + f * 0.18)),
    dmg: 2 + (f >> 3),
    name: f === 4 ? "the Middle Manager" : "the Warden",
    telegraph:
      f === 4
        ? "\"Let's circle back.\" — and he means it physically."
        : "\"PERFORMANCE REVIEW,\" it intones. The review is physical.",
  };
}

// ---- final-floor boss stats (games/some-hero/legacy/src/world/
// floorgen.js:99-104's inline mkBoss({hp:200,dmg:4,...}) call — also
// rng-free) ----
const FINAL_BOSS_STATS = {
  hp: 200,
  dmg: 4,
  name: "the Origenal Hero",
  telegraph: "\"Forty years I held this line. THREE WEEKS, kid.\"",
};

const SEALS = ["key", "plates", "torch", "riddle", "traps", "warden"]; // floorgen.js:92
const SEAL_TYPES = ["key", "plates", "torch", "riddle", "traps"]; // floorgen.js:110

function cellKey(x, y) {
  return `${x},${y}`;
}

/**
 * Generate a tomb floor as a plain, pure data object.
 *
 * @param {string|number} seed world seed (hashed into every channel)
 * @param {number} floorNum floor number (1-based)
 * @param {Array<{w?:number,h?:number,tag:string}>} pinnedSpecs authored
 *        "load-bearing" rooms (legacy floorgen.js's `pinned` param),
 *        default [].
 * @param {{forceSeal?:string}} opts playtest override for the seal type
 *        (floorgen.js:19-21's `opts.forceSeal`); invalid/absent values
 *        change nothing (floorgen.js:93).
 */
export function generateFloor(seed, floorNum, pinnedSpecs = [], opts = {}) {
  const s = String(seed);
  const gridW = TOMB_W, gridH = TOMB_H;

  // ---------------------------------------------------------------
  // "layout" channel: room count/size/pos, pinned rooms, corridors,
  // spawn/exit (floorgen.js:33-38, :41-60, :61-66, :68-75).
  // ---------------------------------------------------------------
  const layoutRng = channel(s, "layout", String(floorNum));
  const roomCount = 6 + Math.min(4, floorNum >> 1); // floorgen.js:32 (deterministic, no draw)
  const rooms = placeRooms(layoutRng, {
    count: roomCount,
    wRange: [4, 8], // floorgen.js:34 rw = 4 + rint(rng,5)
    hRange: [4, 7], // floorgen.js:34 rh = 4 + rint(rng,4)
    gridW,
    gridH,
  });
  const pinnedRooms = placePinnedRooms(layoutRng, rooms, pinnedSpecs, {
    gridW,
    gridH,
    minSeparation: 10, // floorgen.js:53
    maxTries: 80, // floorgen.js:49
  });
  const allRooms = [...rooms, ...pinnedRooms];
  const corridorCells = chainCorridors(allRooms); // floorgen.js:61-66

  const spawnRoom = allRooms[0]; // floorgen.js:69 "spawn = first room"
  const eligibleForExit = featureEligibleRooms(allRooms).filter((r) => r !== spawnRoom);
  let exitRoom = eligibleForExit[0] || allRooms[1] || spawnRoom; // floorgen.js:70 fallback
  let bestDist = -1;
  for (const r of eligibleForExit) {
    const d = Math.hypot(r.cx - spawnRoom.cx, r.cy - spawnRoom.cy); // floorgen.js:73
    if (d > bestDist) {
      bestDist = d;
      exitRoom = r;
    }
  }

  // Floor/wall sets (grid cells): every room + corridor cell is floor;
  // everything else within the grid is a wall (floorgen.js:24-25's
  // Uint8Array map, filled TW then carved TF, generalized to a Set).
  const floorSet = new Set();
  for (const r of allRooms) {
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) floorSet.add(cellKey(xx, yy));
    }
  }
  for (const c of corridorCells) floorSet.add(cellKey(c.x, c.y));
  const walls = new Set();
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      if (!floorSet.has(cellKey(x, y))) walls.add(cellKey(x, y));
    }
  }

  const midRooms = allRooms.filter((r) => r !== spawnRoom && r !== exitRoom && !r.tag); // floorgen.js:80
  const blocks = []; // plate-pushed blocks (floorgen.js:27, populated by "plates" below)

  // floorgen.js:82-89 freeSpotIn (tileWalkable === TF||PLATE && !blocked)
  // generalized to floorSet-membership + block-occupancy.
  function freeSpotIn(rng, r) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const tx = r.x + 1 + rint(rng, Math.max(1, r.w - 2));
      const ty = r.y + 1 + rint(rng, Math.max(1, r.h - 2));
      if (floorSet.has(cellKey(tx, ty)) && !blocks.some((b) => b.x === tx && b.y === ty)) {
        return { x: tx, y: ty };
      }
    }
    return { x: r.cx, y: r.cy };
  }

  // ---------------------------------------------------------------
  // "puzzle" channel: seal-type selection + trap/plate/torch/riddle
  // placement (floorgen.js:91-166). Warden/final boss STATS are pure
  // (wardenStats/FINAL_BOSS_STATS above); only a boss's tile position
  // is decided here, and it comes from spawn/exit/pinned-room geometry
  // (no extra rng draw).
  // ---------------------------------------------------------------
  const puzzleRng = channel(s, "puzzle", String(floorNum));
  const forced = SEALS.includes(opts.forceSeal) ? opts.forceSeal : null; // floorgen.js:93
  const pickPuzzleRoom = () =>
    midRooms.length ? midRooms[rint(puzzleRng, midRooms.length)] : exitRoom; // floorgen.js:81

  let puzzle = null;
  let boss = null;
  const pickups = [];

  if (floorNum >= FINAL_FLOOR && !forced) {
    // floorgen.js:94-104
    const deskRoom = pinnedRooms.find((r) => r.tag === "desk") || exitRoom;
    puzzle = { type: "final", bossDead: false };
    boss = {
      kind: "final",
      x: deskRoom.cx,
      y: deskRoom.cy - 1,
      stats: { ...FINAL_BOSS_STATS, maxhp: FINAL_BOSS_STATS.hp },
    };
  } else if (forced ? forced === "warden" : floorNum % 4 === 0) {
    // floorgen.js:105-108
    puzzle = { type: "warden" };
    const stats = wardenStats(floorNum);
    boss = { kind: "warden", x: exitRoom.cx, y: exitRoom.cy - 1, stats: { ...stats, maxhp: stats.hp } };
  } else {
    const ty = forced || pick(puzzleRng, SEAL_TYPES); // floorgen.js:111
    if (ty === "riddle") {
      puzzle = { type: "riddle", solved: false, attempts: 0 }; // floorgen.js:112-113
    } else if (ty === "traps") {
      // floorgen.js:114-128
      const need = 3 + rint(puzzleRng, 3) + Math.min(2, floorNum >> 2);
      const traps = [];
      let placed = 0, guard = 0;
      while (placed < need && guard++ < 80) {
        const r = pickPuzzleRoom();
        const spot = freeSpotIn(puzzleRng, r);
        if (!floorSet.has(cellKey(spot.x, spot.y))) continue;
        if (traps.some((o) => o.x === spot.x && o.y === spot.y)) continue;
        traps.push({ x: spot.x, y: spot.y, hit: false });
        placed++;
      }
      puzzle = traps.length
        ? { type: "traps", need: traps.length, done: 0, solved: false, traps }
        : { type: "key", have: true }; // floorgen.js:128 degenerate fallback: open
    } else if (ty === "key") {
      // floorgen.js:129-132
      puzzle = { type: "key", have: false };
      const r = pickPuzzleRoom();
      const spot = freeSpotIn(puzzleRng, r);
      pickups.push({ kind: "key", x: spot.x, y: spot.y, amount: 1 });
    } else if (ty === "plates") {
      // floorgen.js:133-152
      const need = Math.min(3, 2 + (floorNum >> 3));
      const plates = [];
      let placed = 0, guard = 0;
      while (placed < need && guard++ < 80) {
        const r = pickPuzzleRoom();
        if (r.w < 4 || r.h < 4) continue;
        const ptx = r.x + 1 + rint(puzzleRng, r.w - 2);
        const pty = r.y + 1 + rint(puzzleRng, r.h - 2);
        if (!floorSet.has(cellKey(ptx, pty))) continue;
        // block 2 tiles away inside the room, with a clear lane
        const btx = Math.min(r.x + r.w - 2, Math.max(r.x + 1, ptx + (chance(puzzleRng, 0.5) ? -2 : 2)));
        if (btx === ptx || !floorSet.has(cellKey(btx, pty))) continue;
        if (blocks.some((b) => b.x === btx && b.y === pty)) continue;
        plates.push({ x: ptx, y: pty, on: false });
        blocks.push({ x: btx, y: pty });
        placed++;
      }
      puzzle = plates.length
        ? { type: "plates", need: plates.length || 1, done: 0, solved: false, plates, blocks: [...blocks] }
        : { type: "key", have: true }; // floorgen.js:152 degenerate fallback: open
    } else {
      // torch (floorgen.js:153-165)
      const n = 3 + Math.min(2, floorNum >> 2);
      const time = Math.max(6, 14 - floorNum * 0.6);
      const torches = [];
      let placed = 0, guard = 0;
      while (placed < n && guard++ < 80) {
        const r = pickPuzzleRoom();
        const spot = freeSpotIn(puzzleRng, r);
        if (torches.some((o) => o.x === spot.x && o.y === spot.y)) continue;
        torches.push({ x: spot.x, y: spot.y, lit: false, tm: 0 });
        placed++;
      }
      puzzle = { type: "torch", n: torches.length || 1, time, solved: false, torches };
    }
  }

  // ---------------------------------------------------------------
  // "spawns" channel: enemy kind + gold loot + cabinet furniture runs
  // + slimes, keyed per-room (see file header for the documented
  // redesign vs. legacy's shared-rng loop).
  // ---------------------------------------------------------------
  const spawnRooms = midRooms.length ? midRooms : [exitRoom]; // floorgen.js:81's pickRoom() fallback
  const enemyBudget = (puzzle.type === "warden" ? 3 : 6) + Math.min(10, floorNum); // floorgen.js:169
  const goldBudget = 4 + (floorNum >> 1); // floorgen.js:180

  const enemyCounts = new Array(spawnRooms.length).fill(0);
  for (let i = 0; i < enemyBudget; i++) enemyCounts[i % spawnRooms.length]++;
  const goldCounts = new Array(spawnRooms.length).fill(0);
  for (let i = 0; i < goldBudget; i++) goldCounts[i % spawnRooms.length]++;

  const enemies = [];
  for (let idx = 0; idx < spawnRooms.length; idx++) {
    const room = spawnRooms[idx];
    const roomIdx = allRooms.indexOf(room);
    const rr = channel(s, "spawns", String(floorNum), String(roomIdx));

    for (let n = 0; n < enemyCounts[idx]; n++) {
      // floorgen.js:170-178's kind pick + freeSpotIn; stats intentionally
      // dropped per the design spec ("just kind + position" — the
      // content pack supplies stats at derive time, PR4).
      const kind = pickTombKind(rr);
      const pos = freeSpotIn(rr, room);
      enemies.push({ kind, x: pos.x, y: pos.y });
    }
    for (let n = 0; n < goldCounts[idx]; n++) {
      // floorgen.js:180-183
      const pos = freeSpotIn(rr, room);
      pickups.push({ kind: "gold", x: pos.x, y: pos.y, amount: 2 });
    }

    // ---- archival furniture (floors 3+): cabinets in wall-adjacent
    // runs (floorgen.js:185-225's placement algorithm; the floor-wide
    // "wantRuns" count is replaced by a per-room chance gate — a
    // documented redesign, see file header). ----
    if (floorNum >= 3 && room.w >= 4 && room.h >= 4 && chance(rr, 0.35)) {
      const side = rint(rr, 4); // 0 top, 1 bottom, 2 left, 3 right — floorgen.js:194
      const len = 2 + rint(rr, 4); // 2-5 drawers of trouble — floorgen.js:195
      const cells = [];
      if (side < 2) {
        const ty = side === 0 ? room.y : room.y + room.h - 1;
        const wy = side === 0 ? ty - 1 : ty + 1;
        const x0 = room.x + 1 + rint(rr, Math.max(1, room.w - len - 1));
        for (let i = 0; i < len && x0 + i < room.x + room.w; i++) {
          if (!floorSet.has(cellKey(x0 + i, ty)) || floorSet.has(cellKey(x0 + i, wy))) break;
          cells.push([x0 + i, ty]);
        }
      } else {
        const tx = side === 2 ? room.x : room.x + room.w - 1;
        const wx = side === 2 ? tx - 1 : tx + 1;
        const y0 = room.y + 1 + rint(rr, Math.max(1, room.h - len - 1));
        for (let i = 0; i < len && y0 + i < room.y + room.h; i++) {
          if (!floorSet.has(cellKey(tx, y0 + i)) || floorSet.has(cellKey(wx, y0 + i))) break;
          cells.push([tx, y0 + i]);
        }
      }
      if (cells.length >= 2) {
        for (const [cx, cy] of cells) enemies.push({ kind: "cabinet", x: cx, y: cy });
      }
    }

    // ---- the interns: slimes (floorgen.js:227-232; a per-room chance
    // gate replaces the floor-wide 0-2 count — documented redesign). ----
    if (chance(rr, 0.12)) {
      const pos = freeSpotIn(rr, room);
      enemies.push({ kind: "slime", x: pos.x, y: pos.y });
    }
  }

  // ---------------------------------------------------------------
  // "decor" channel: pinned-room props (floorgen.js:234-254). Legacy
  // draws ZERO rng here (fixed offsets) — no channel() call is made;
  // deliberate, not an oversight (design spec: "decor is a reserved/
  // mostly-inert channel wired for forward-compat").
  // ---------------------------------------------------------------
  const props = [];
  for (const r of pinnedRooms) {
    if (r.tag === "breakroom") {
      // floorgen.js:236-244 (approximate tile placement — see header note
      // on legacy's sub-tile pixel offsets not having an exact tile
      // equivalent)
      const tx = r.cx, ty = r.cy;
      props.push({ kind: "table", x: tx, y: ty });
      props.push({ kind: "chair", x: tx - 1, y: ty, face: 1 });
      props.push({ kind: "chair", x: tx + 1, y: ty, face: -1 });
      props.push({ kind: "chair", x: tx, y: ty + 1, face: 0 });
    }
    if (r.tag === "gap") {
      // floorgen.js:246-249: MIND THE GAP. The gap has a guestbook. Sign it.
      pickups.push({ kind: "guestbook", x: r.cx, y: r.cy, amount: 1 });
    }
    if (r.tag === "desk") {
      // floorgen.js:250-253
      props.push({ kind: "table", x: r.cx, y: r.cy });
    }
  }

  return {
    gridW,
    gridH,
    walls,
    spawn: { x: spawnRoom.cx, y: spawnRoom.cy },
    // floorgen.js:76-78: the SD tile; ascending arrives here. On the
    // final floor legacy never paints an SD tile at all ("no down-stairs
    // — the cancellation desk is here; nowhere deeper") — the position
    // is still returned as geometry (the exit room still exists), but
    // whether it is a FUNCTIONAL descent is a derive-time (PR4) concern.
    stairsAt: { x: exitRoom.cx, y: exitRoom.cy },
    rooms,
    pinnedRooms,
    enemies,
    pickups,
    puzzle,
    boss,
    props,
  };
}
