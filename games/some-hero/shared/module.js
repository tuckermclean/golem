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
import { reduce } from "./reducer.js";
import { resolveTick } from "./tick.js";

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
function isStairsIdentity(identity) {
  return !!identity && typeof identity.name === "string" && /stairs/i.test(identity.name);
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
      if (isStairsIdentity(identity)) {
        stairsAt = { x, y };
        continue;
      }
      // Everything else (Door Golem, credentials, enemies, ...) is
      // geometry-neutral for PR2 — walkable, unmodeled. See header.
    }
  }

  if (!spawn) spawn = firstFloor;
  if (!spawn) {
    throw new Error(`deriveWorld: map "${mapId}" has no floor cell to spawn on`);
  }

  return { zone, floorNum, mapId, rows: map.rows, cols: map.cols, walls, spawn, stairsAt };
}

export { reduce };

function inBounds(world, x, y) {
  return x >= 0 && y >= 0 && x < world.cols && y < world.rows;
}
function isWall(world, x, y) {
  return world.walls.has(`${x},${y}`);
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
      return [{ t: "MOVED", x: nx, y: ny }];
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
