/* ── MODULE: some-hero's KernelCore (deriveWorld/validate/reduce) — see
   @golem-engine/kernel's GameModule shape and docs/superpowers/specs/
   2026-07-07-s2b-state-tick-design.md ("The systems (PR2 scope)" +
   "Movement canonicalization"). PR2 covers grid-cardinal movement
   ("move dx dy" → MOVED, wall/bounds → Denial) and the "tick" verb
   (shared/tick.js's resolveTick — the C4 tick bridge, deterministic,
   currently a no-op-or-advance counter since the synthetic floor has no
   autonomous movers yet).

   Movement canonicalization (locked, flagged divergence — design spec
   "Movement canonicalization"): legacy is continuous-pixel AABB
   (legacy/src/world/tilemap.js's moveEnt/boxFree). This canonicalizes to
   grid-cardinal movement exactly like topdown-puzzle/golem-grid. This is
   a real, uncharacterized deviation from legacy (no ceremony test pins
   pixel movement) — same category as C4 dropping diagonal movement:
   high architecture value, zero fidelity risk.

   deriveWorldFromPack's "seed" is a `{zone,floorNum,mapId}` worldState
   (the design spec's `state.world` tier), not an RNG seed — same
   non-negotiable determinism, different world-DNA source as topdown-
   puzzle's own deriveWorldFromPack(pack, levelId). It is SYNCHRONOUS
   per the kernel's own discipline (packages/kernel/src/index.ts: "no
   async in validate/reduce/observe/affordances").

   THIS FILE HAS NO node:fs/node:path/node:url IMPORT, on purpose — a
   future browser client would import validate/reduce/deriveWorldFromPack
   straight from here (topdown-puzzle's PR3 precedent: even a single,
   never-called, lazily-placed reference to one of those builtins' named
   exports is enough to fail a Vite client build at bundle time). The
   actual filesystem read (readFileSync(content/pack.json)) lives in the
   Node-only shared/pack-loader.js, which imports deriveWorldFromPack FROM
   this file (never the reverse) and exposes the Node-side
   `deriveWorld(worldState)` convenience wrapper + the full
   `{deriveWorld,validate,reduce}` KernelCore for tests/fixture tooling.
   Tests that need a SYNTHETIC floor (tests/fixtures/synthetic-floor.mjs)
   call deriveWorldFromPack directly with their own compiled pack —
   never touching content/pack.json, never touching this file's (non-
   existent) fs code. */
import { evaluate } from "@golem-engine/content";
import { reduce } from "./reducer.js";
import { resolveTick } from "./tick.js";
import { missingCredentials } from "../rules/credentials.js";
import { pack as contentPack } from "../rules/pack.js";

/** Resolve a map legend entry to a fresh (shallow-cloned) component bag:
 *  either an authored template entity's components (legendEntry.entity)
 *  or an inline component bag (legendEntry.components) — same resolution
 *  games/topdown-puzzle/shared/module.js's own resolveComponents uses,
 *  and the same convention games/some-hero/content/guild-hall-map.mjs's
 *  '#'/'>' tokens already rely on (inline Identity components, no
 *  entity refs needed for pure geometry). */
function resolveComponents(pack, legendEntry) {
  const template = legendEntry.entity ? pack.entities[legendEntry.entity] : undefined;
  const source = template ? template.components : legendEntry.components || {};
  const components = {};
  for (const [name, data] of Object.entries(source)) {
    components[name] = data && typeof data === "object" ? { ...data } : data;
  }
  return components;
}

function isWallIdentity(identity) {
  return !!identity && identity.name === "wall";
}
function isSpawnIdentity(identity) {
  return !!identity && identity.name === "spawn";
}
// "Stairs Down" (existing "stairsAt" convention) vs "Stairs Up" (PR3's
// new "upstairsAt" — the voluntary-ascent tile, see the Fixture
// extension section of docs/superpowers/specs/
// 2026-07-07-s2b-pr3-ceremony-machine-design.md). Both names contain
// "stairs"; splitting on "up" keeps the existing "Stairs Down" ->
// stairsAt behavior (content/guild-hall-map.mjs's real committed '>' /
// tests/fixtures/synthetic-floor.mjs's own '>') byte-identical while
// adding the new '<' token without conflating the two directions.
function isDownstairsIdentity(identity) {
  return !!identity && typeof identity.name === "string" && /stairs/i.test(identity.name) && !/up/i.test(identity.name);
}
function isUpstairsIdentity(identity) {
  return !!identity && typeof identity.name === "string" && /stairs/i.test(identity.name) && /up/i.test(identity.name);
}

/** Does any legend entry in this map resolve to a `Lock` component?
 *  (PR3: the Door Golem gate — content/entities.mjs's `entity:door_golem`
 *  has `Lock: {unlockCondition, key}`, wired onto `map:guild_hall`'s 'G'
 *  token). Scanned over `map.legend` directly (every declared token),
 *  NOT the per-cell walk above — "independent of that entity's tile"
 *  (design spec): the golem's own tile is decorative/geometry-neutral
 *  (legacy's real check fires off the stairs tile, never the golem's
 *  position — legacy/src/systems/stairs.js:21-26), so the gate is a
 *  property of the MAP, not of any one cell. Only one gate per map is
 *  modeled (PR3's scope: one Door Golem, one gate); the first legend
 *  entry found with a `Lock` component wins. */
function findGate(pack, map) {
  for (const legendEntry of Object.values(map.legend)) {
    const components = resolveComponents(pack, legendEntry);
    if (components.Lock) {
      return { unlockCondition: components.Lock.unlockCondition, key: components.Lock.key };
    }
  }
  return null;
}

/** Pure: given an already-loaded RuntimePack and a `worldState`
 *  ({zone,floorNum,mapId} — the design spec's `state.world` tier),
 *  derive the immutable World: walls as a Set (static geometry, never
 *  part of mutable State, mirroring golem-grid's dun.grid / topdown-
 *  puzzle's world.walls), a `spawn` point, and `stairsAt` (if the map
 *  declares one; unused by PR2's move/tick proof — geometry only, no
 *  descent logic, that's PR3/S3's job).
 *
 *  Spawn convention: a legend entry whose resolved Identity.name is
 *  exactly "spawn" (the tests/fixtures/synthetic-floor.mjs convention,
 *  explicit and legible in the ASCII art) wins; if the map declares none
 *  (content/guild-hall-map.mjs's `map:guild_hall` has no such token —
 *  S1 never needed one), the first floor-token cell in row-major scan
 *  order is used instead. This lets ONE derivation function serve both
 *  the real committed Guild Hall map (design spec: "For the Guild Hall
 *  (zone:"ow"), derive from S1's map:guild_hall") and any test's own
 *  synthetic floor, without content/pack.json ever needing a new token.
 *
 *  Every OTHER map token (the Door Golem, credential markers, enemies,
 *  etc.) is deliberately geometry-neutral here — not blocking, not
 *  modeled as a mutable entity. Gating/combat is PR3/S2c's job (design
 *  spec's "Scope boundaries": no Door Golem gate, no combat, in PR2). */
export function deriveWorldFromPack(pack, worldState) {
  const { zone, floorNum, mapId } = worldState;
  const map = pack.maps[mapId];
  if (!map) {
    throw new Error(`deriveWorld: no such map "${mapId}" in the given pack`);
  }

  const walls = new Set();
  let spawn = null;
  let stairsAt = null;
  let upstairsAt = null;
  let firstFloor = null;

  for (let y = 0; y < map.cells.length; y++) {
    const row = map.cells[y];
    for (let x = 0; x < row.length; x++) {
      const token = row[x];
      if (token === map.floor) {
        if (!firstFloor) firstFloor = { x, y };
        continue;
      }
      const legendEntry = map.legend[token];
      if (!legendEntry) {
        throw new Error(`deriveWorld: map "${mapId}" cell (${x},${y}) uses unmapped token '${token}'`);
      }
      const components = resolveComponents(pack, legendEntry);
      const identity = components.Identity;
      if (isWallIdentity(identity)) {
        walls.add(`${x},${y}`);
        continue;
      }
      if (isSpawnIdentity(identity)) {
        spawn = { x, y };
        continue;
      }
      if (isUpstairsIdentity(identity)) {
        upstairsAt = { x, y };
        continue;
      }
      if (isDownstairsIdentity(identity)) {
        stairsAt = { x, y };
        continue;
      }
      // Everything else (Door Golem, credentials, enemies, ...) is
      // geometry-neutral for PR2/PR3 — walkable, unmodeled. See header.
    }
  }

  if (!spawn) spawn = firstFloor;
  if (!spawn) {
    throw new Error(`deriveWorld: map "${mapId}" has no floor cell to spawn on`);
  }

  const gate = findGate(pack, map);

  return { zone, floorNum, mapId, rows: map.rows, cols: map.cols, walls, spawn, stairsAt, upstairsAt, gate };
}

export { reduce };

function inBounds(world, x, y) {
  return x >= 0 && y >= 0 && x < world.cols && y < world.rows;
}
function isWall(world, x, y) {
  return world.walls.has(`${x},${y}`);
}
function atPoint(point, x, y) {
  return !!point && point.x === x && point.y === y;
}

/* ── PR3: world-swap constants (the "real novelty" — see the design
   spec's "The real novelty: world-swap mid-session"). Real procedural
   floor generation is S3's job and `packages/world` is still a stub, so
   there is no live "the tomb" World this file can derive on demand —
   `deriveWorldFromPack` above only knows how to resolve an ALREADY-
   COMPILED pack's map, and shared/module.js must not import a test
   fixture (tests/fixtures/synthetic-floor.mjs's own header: "used by
   TESTS ONLY... this dependency direction is deliberate, so S3 is not
   pulled forward by this PR").

   The Guild Hall (`map:guild_hall`) is different: it is a REAL committed
   map (content/guild-hall-map.mjs, frozen in content/pack.json), and
   `rules/pack.js` already compiles it synchronously with zero node:fs
   (content/index.mjs's compileContentPack() rebuilds it from the very
   same JS source modules pack.json was built from — no disk read, browser-
   bundle-safe, same discipline this file's own header documents for
   itself). So the ow-side spawn point below is REAL, computed once and
   memoized; only the tomb-side spawn is a documented placeholder. */
const GUILD_HALL_WORLD_STATE = { zone: "ow", floorNum: 0, mapId: "map:guild_hall" };
let _guildHallWorld;
function guildHallSpawn() {
  if (!_guildHallWorld) _guildHallWorld = deriveWorldFromPack(contentPack, GUILD_HALL_WORLD_STATE);
  return _guildHallWorld.spawn;
}

// The synthetic tomb-floor-1's own spawn point ('@' at (1,1) —
// tests/fixtures/synthetic-floor.mjs's layout comment). This literal
// MUST match that fixture exactly; it is the one place PR3 hardcodes a
// "the tomb exists" placeholder, standing in for S3's real floor
// generation. Whoever builds S3 replaces this constant (and
// `enteredTombEvent` below) wholesale — nothing else in this file reads
// tomb geometry.
const SYNTHETIC_TOMB_FLOOR_1 = {
  zone: "tomb",
  floorNum: 1,
  mapId: "map:tomb_floor_1_synthetic",
  spawn: { x: 1, y: 1 },
};

function enteredTombEvent() {
  return { t: "ENTERED_TOMB", ...SYNTHETIC_TOMB_FLOOR_1 };
}
function exitedTombEvent() {
  return { t: "EXITED_TOMB", zone: "ow", floorNum: 0, mapId: "map:guild_hall", spawn: guildHallSpawn() };
}

/** The Door Golem's `FactLookup` (packages/content's `evaluate()`
 *  contract): resolves the three `unlockCondition` facts content/
 *  entities.mjs's `entity:door_golem` authors (`credential_sword`/
 *  `credential_backstory`/`credential_debt` — see that file's own
 *  comment) against a SIMULATED state (sim-and-inspect: `sim` is the
 *  post-MOVED throwaway fold, per this function's one caller). Reads
 *  live off `sim.character.swordLv` (the sword is whatever's in hand,
 *  never persisted — rules/credentials.js's own header) and
 *  `sim.knowledge.credentials` (the two permanent credentials). */
function credentialFactLookup(sim) {
  return (fact) => {
    if (fact === "credential_sword") return sim.character.swordLv >= 1;
    if (fact === "credential_backstory") return !!sim.knowledge.credentials.backstory;
    if (fact === "credential_debt") return !!sim.knowledge.credentials.debt;
    return undefined;
  };
}

/** Sim-and-inspect: fold `events` through a throwaway reduce() (seq-
 *  incrementing from `state.seq`, same idiom games/topdown-puzzle/
 *  shared/push.js's resolveMove uses for its own WIN check), returning
 *  the resulting simulated State without touching the real one. */
function foldThrough(state, world, events) {
  let sim = state;
  let seq = state.seq;
  for (const ev of events) sim = reduce(sim, world, { ...ev, seq: ++seq });
  return sim;
}

export function validate(ctx, cmd) {
  const { state, world } = ctx;
  const [verb, ...rest] = String(cmd).trim().split(/\s+/);
  switch (verb) {
    case "move": {
      const dx = +rest[0];
      const dy = +rest[1];
      if (Math.abs(dx) + Math.abs(dy) !== 1) return []; // garbage deltas silently ignored (golem-grid/topdown-puzzle's own move convention)
      const { x, y } = state.character.pos;
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(world, nx, ny) || isWall(world, nx, ny)) {
        return { deny: "Something solid stops you." };
      }

      const events = [{ t: "MOVED", x: nx, y: ny }];
      // Every gate/seal/ascent check below is a sim-and-inspect DERIVED
      // event, exactly like topdown-puzzle's WIN/LOSE (shared/push.js):
      // compute the primary MOVED, fold it through a throwaway reduce,
      // inspect the result, append derived events (design spec, "Events
      // + reducer cases").
      const sim = foldThrough(state, world, events);

      if (world.zone === "ow" && world.gate && atPoint(world.stairsAt, nx, ny)) {
        // The Door Golem of Credential Verification (design spec's
        // "Content-side: derive the gate").
        const passed = evaluate(world.gate.unlockCondition, credentialFactLookup(sim));
        if (!passed) {
          // BITE: the gate is read-only on denial — no reducer case
          // mutates state for GOLEM_DENIED (a pure no-op besides seq).
          events.push({ t: "GOLEM_DENIED", missing: missingCredentials(sim.knowledge, sim.character.swordLv) });
        } else if (!sim.knowledge.golemApproved) {
          // Ceremony must play before descent — the verdict is hidden
          // (world/zone untouched) until "proceed" consumes state.pending.
          events.push({ t: "GOLEM_APPROVED" });
        } else {
          // Already approved: routine second (and every later) entry.
          events.push(enteredTombEvent());
        }
      } else if (
        world.zone === "tomb" &&
        atPoint(world.stairsAt, nx, ny) &&
        sim.run.puzzle &&
        sim.run.puzzle.type === "riddle" &&
        !sim.run.puzzle.solved
      ) {
        // The sealed riddle door: ask, never toast, never a zone
        // transition (ceremony/seal-stairs.ceremony.test.js:137-151).
        // Only this one branch of the full seal system is in scope
        // here — see design spec's "Scope boundaries".
        events.push({ t: "RIDDLE_ASKED" });
      } else if (world.zone === "tomb" && atPoint(world.upstairsAt, nx, ny)) {
        // The voluntary ascent (design spec's "Fixture extension" — the
        // new '<' token). No seal, no condition: always legal.
        events.push(exitedTombEvent());
      }

      return events;
    }
    case "proceed": {
      // Consumes the ceremony half of the unified two-step pending slot
      // (design spec's "The unified two-step slot"). No matching
      // pending -> Denial; consuming twice is impossible (GOLEM_APPROVED
      // is only ever emitted again by re-approaching an ALREADY-
      // approved golem, which routes straight to ENTERED_TOMB instead).
      if (!state.pending || state.pending.kind !== "ceremony") {
        return { deny: "There is no ceremony to proceed from." };
      }
      return [enteredTombEvent()];
    }
    case "hurt": {
      // The HURT/DIED bridge (design spec: "Real damage sources are
      // S2c; the 2 wired death tests set hp:=0 directly" — this verb IS
      // that direct set, driven through validate() so the full
      // HURT->DIED->pending chain is exercised the same way any other
      // derived event is).
      const amount = +rest[0];
      const cause = rest[1] ?? null;
      const events = [{ t: "HURT", amount, cause }];
      const sim = foldThrough(state, world, events);
      if (sim.character.hp <= 0) {
        events.push({ t: "DIED", cause });
      }
      return events;
    }
    case "resurrect": {
      // Consumes the resurrection half of the same pending slot.
      if (!state.pending || state.pending.kind !== "resurrection") {
        return { deny: "There is nothing to resurrect from." };
      }
      const ev = { t: "RESURRECTED", cause: state.pending.cause };
      if (state.world.zone === "tomb") {
        // Real zone climb-out (design spec's RESURRECTED field list:
        // "world: if zone==='tomb' -> {zone:'ow',...}; if already ow,
        // leave" + "character.pos = the ow map's derived world.spawn").
        ev.world = { zone: "ow", floorNum: 0, mapId: "map:guild_hall" };
        ev.spawn = guildHallSpawn();
      }
      return [ev];
    }
    case "tick":
      // The fixed-step beat (design spec's "the C4 tick bridge").
      // world.mapId is threaded through as resolveTick's `seed` param —
      // the sanctioned named-channel path, unexercised by the synthetic
      // floor's (mover-free) PR2 tick, reserved for a future
      // nondeterministic one (mirrors topdown-puzzle/shared/module.js's
      // own "tick" case exactly).
      return resolveTick(state, world, world.mapId);
    default:
      return { deny: `The world does not know the verb "${verb}".` };
  }
}

/** A partial KernelCore — `{validate, reduce}`, deliberately WITHOUT
 *  `deriveWorld` (see this file's header comment: deriveWorld's Node-side
 *  filesystem read lives in shared/pack-loader.js, which assembles the
 *  FULL `{deriveWorld,validate,reduce}` KernelCore for Node consumers).
 *  Enough for @golem-engine/kernel's replay(), which only ever reads
 *  `.reduce` — same posture as topdown-puzzle/golem-grid's own `module`
 *  export. */
export const module = { validate, reduce };
