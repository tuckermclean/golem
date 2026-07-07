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
   Node-only shared/pack-loader.js, which imports deriveWorld FROM
   this file (never the reverse) and exposes the Node-side
   `deriveWorld(worldState, seed?)` convenience wrapper + the full
   `{deriveWorld,validate,reduce}` KernelCore for tests/fixture tooling.
   Tests that need a SYNTHETIC floor (tests/fixtures/synthetic-floor.mjs)
   call deriveWorldFromPack directly with their own compiled pack —
   never touching content/pack.json, never touching this file's (non-
   existent) fs code.

   S3 PR4 (docs/superpowers/specs/2026-07-07-s3-pr4-derive-wiring-
   design.md) adds `deriveWorld(pack, worldState, seed?)` — an ADDITIVE
   dispatcher wrapping the original `deriveWorldFromPack` (unchanged,
   still exported, still the only path a "map:" mapId ever takes) with a
   new "tomb:" mapId branch that calls shared/floorgen.js's generateFloor
   (S3 PR2) instead of resolving a compiled pack.maps entry. See that
   function's own header, further down this file, for the full design. */
import { evaluate } from "@golem-engine/content";
import { channel } from "@golem-engine/random";
import { reduce } from "./reducer.js";
import { resolveTick, WARDEN } from "./tick.js";
import { generateFloor } from "./floorgen.js";
import { stairsOpen } from "../rules/puzzles.js";
import { missingCredentials } from "../rules/credentials.js";
import { pack as contentPack } from "../rules/pack.js";
import { recordDeath } from "../rules/meta.js";
import { gradeRun } from "../rules/ledger.js";
import { nextRiddle, answerRiddle } from "../rules/riddle.js";

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

/* ── PR4: the enemy entity tier (docs/superpowers/specs/
   2026-07-07-s2c-pr4-combat-design.md's "The new design surface"). A
   legend entry resolves to an enemy iff its component bag carries an
   `Actor` stat bag (content/entities.mjs's opaque hp/spd/dmg/xp/r/col/
   aggro/flags convention, the same "C1 does not validate component
   shape" latitude that file's own header documents) — same litmus as
   isWallIdentity/isSpawnIdentity above, just keyed on a different
   component instead of Identity.name. */
function isEnemyComponents(components) {
  return !!components.Actor;
}

/** kind ("skeleton"/"mailbat"/...) -> stat bag, built from EVERY entity
 *  in the pack that carries an Actor bag (design spec: "world.enemyTypes
 *  [kind] — so the reducer reads stats from world, not hardcoded") —
 *  PACK-scoped, not MAP-scoped: an enemy kind's stats are available even
 *  if this particular map never places one, mirroring how `pack.entities`
 *  itself is a flat, map-independent dictionary. `Health.max` is the
 *  authored hp (content/entities.mjs's Health{hp,max} mirrors mkEnemy()'s
 *  own `hp: base.hp, maxhp: base.hp`, so `.max` and `.hp` agree at
 *  authoring time; `.max` is used here since it is the one field every
 *  Health component is guaranteed to carry). */
function buildEnemyTypes(pack) {
  const types = {};
  for (const entity of Object.values(pack.entities)) {
    const { components } = entity;
    if (!isEnemyComponents(components) || !components.Identity) continue;
    const { Actor, Health, Identity } = components;
    types[Identity.name] = {
      hp: Health ? Health.max : undefined,
      spd: Actor.spd,
      dmg: Actor.dmg,
      xp: Actor.xp,
      r: Actor.r,
      col: Actor.col,
      aggro: Actor.aggro,
      ghost: !!Actor.ghost,
      passive: !!Actor.passive,
    };
  }
  return types;
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
 *  Every OTHER map token (the Door Golem, credential markers, ...) is
 *  deliberately geometry-neutral here — not blocking, not modeled as a
 *  mutable entity. Gating is PR3's job; enemy spawns ARE modeled here as
 *  of PR4 (`world.enemySpawns`/`world.enemyTypes` — design spec's "The
 *  new design surface: an entity tier"); pickups are NOT (test-world-
 *  only, injected directly onto a hand-built/derived world's
 *  `pickupAt` Map — see tests/helpers/build-state.mjs's `makeWorld`). */
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
  const enemySpawns = [];

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
      if (isEnemyComponents(components)) {
        // Walkable, row-major scan order (never reordered by state) —
        // the deterministic id-assignment order shared/module.js's
        // enteredTombEvent() / a future S3 floor generator relies on.
        enemySpawns.push({ kind: identity.name, pos: { x, y } });
        continue;
      }
      // Everything else (Door Golem, credentials, ...) is geometry-
      // neutral for PR2/PR3/PR4 — walkable, unmodeled. See header.
    }
  }

  if (!spawn) spawn = firstFloor;
  if (!spawn) {
    throw new Error(`deriveWorld: map "${mapId}" has no floor cell to spawn on`);
  }

  const gate = findGate(pack, map);
  const enemyTypes = buildEnemyTypes(pack);
  // pickupAt starts empty: no committed map (real or synthetic) authors
  // gold/potion tokens yet — tests inject entries directly (see this
  // function's own header comment) — but every World this function
  // returns carries the field, so "move"'s pickup check never has to
  // special-case a hand-built vs. derived World.
  const pickupAt = new Map();

  return {
    zone,
    floorNum,
    mapId,
    rows: map.rows,
    cols: map.cols,
    walls,
    spawn,
    stairsAt,
    upstairsAt,
    gate,
    enemySpawns,
    enemyTypes,
    pickupAt,
  };
}

export { reduce };

/* ── S3 PR4: the `deriveWorld` dispatcher (docs/superpowers/specs/
   2026-07-07-s3-pr4-derive-wiring-design.md's "The dispatcher
   (additive)"). `worldState.mapId`'s own prefix says which generation
   strategy owns it — the mapId string IS the generation key (doctrine
   #1: the world is a pure function of a seed, never stored, so every
   fact this dispatch needs lives entirely inside the mapId it is
   handed): "map:..." keeps using the existing pack.maps token-grid path
   (deriveWorldFromPack, byte-for-byte unchanged — this covers BOTH
   map:guild_hall and the synthetic map:tomb_floor_1_synthetic fixture,
   exactly as today); "tomb:..." is the NEW path, parsing
   "tomb:<topSeed>:<runs>:<floorNum>" and calling shared/floorgen.js's
   generateFloor(topSeed, floorNum) (S3 PR2) instead. */
const TOMB_MAP_PREFIX = "tomb:";

/** Parses "tomb:<topSeed>:<runs>:<floorNum>" — the mapId shape this
 *  file's own enteredTombEvent() below constructs when a seed is
 *  threaded through. `runsSegment` (the middle "<runs>" segment, a
 *  string — not renamed/parsed to a number, it is never arithmetic'd,
 *  only threaded through verbatim) is carried for legibility/uniqueness
 *  (a future multi-run save-slot concern) and, as of the riddle-seal
 *  resolution design, IS read back out by descendedEvent() below (so the
 *  next floor's mapId keeps the same run segment — only `floorNum`
 *  advances on a floor-to-floor descent). `topSeed`/`floorNum` are the
 *  only two fields generateFloor itself needs, since it is a pure
 *  function of exactly those two values. */
function parseTombMapId(mapId) {
  const rest = mapId.slice(TOMB_MAP_PREFIX.length);
  const firstColon = rest.indexOf(":");
  const secondColon = rest.indexOf(":", firstColon + 1);
  return {
    topSeed: rest.slice(0, firstColon),
    runsSegment: rest.slice(firstColon + 1, secondColon),
    floorNum: Number(rest.slice(secondColon + 1)),
  };
}

/** Builds the SAME derived-World shape deriveWorldFromPack produces
 *  (see that function's own header), from a freshly-generated floor
 *  (shared/floorgen.js's generateFloor) instead of a compiled
 *  pack.maps entry. `enemyTypes` still comes from the PACK
 *  (buildEnemyTypes(pack), UNCHANGED) — the generated floor only ever
 *  supplies kind+position, never stats (floorgen.js's own header: "the
 *  content pack supplies stats at derive time, PR4"). Tomb floors have
 *  no Door Golem (`gate: null`) and no generator-authored ascent tile
 *  (`upstairsAt: null` — only the hand-authored synthetic fixture has
 *  one; S3's generator has no '<' equivalent yet). */
function deriveWorldFromGeneratedFloor(pack, worldState, floor) {
  const { zone, floorNum, mapId } = worldState;
  const pickupAt = new Map();
  for (const p of floor.pickups) pickupAt.set(`${p.x},${p.y}`, { kind: p.kind, amount: p.amount });
  return {
    zone,
    floorNum,
    mapId,
    rows: floor.gridH,
    cols: floor.gridW,
    walls: new Set(floor.walls),
    spawn: floor.spawn,
    stairsAt: floor.stairsAt,
    upstairsAt: null,
    gate: null,
    enemySpawns: floor.enemies.map((e) => ({ kind: e.kind, pos: { x: e.x, y: e.y } })),
    enemyTypes: buildEnemyTypes(pack),
    pickupAt,
    puzzle: floor.puzzle,
    pinnedRooms: floor.pinnedRooms,
  };
}

/** The `deriveWorld` dispatcher. ADDITIVE over deriveWorldFromPack (see
 *  above): a "map:" mapId is routed to the unchanged existing path; a
 *  "tomb:" mapId is routed to the new generated-floor path. `seed` is
 *  accepted for signature parity with validate's own `ctx.seed` (design
 *  spec: "add an optional seed param to the derive function's
 *  signature") but is not itself consulted here — the generation seed
 *  is already embedded in `mapId` (the one and only generation key, per
 *  doctrine #1), so re-deriving the SAME mapId always reproduces the
 *  SAME floor regardless of what `seed` happens to be passed alongside
 *  it. */
export function deriveWorld(pack, worldState, seed) {
  void seed;
  const { mapId } = worldState;
  if (typeof mapId === "string" && mapId.startsWith(TOMB_MAP_PREFIX)) {
    const { topSeed, floorNum } = parseTombMapId(mapId);
    const floor = generateFloor(topSeed, floorNum);
    return deriveWorldFromGeneratedFloor(pack, worldState, floor);
  }
  return deriveWorldFromPack(pack, worldState);
}

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
// tomb geometry. PR4 extends the same placeholder with `enemies` — the
// derived spawn list an ENTERED_TOMB carries (design spec: "ENTERED_TOMB
// seeds run.enemies from the derived spawn list"); this literal MUST
// match tests/fixtures/synthetic-floor.mjs's own 's' token (deriveWorldFromPack(
// compileSyntheticFloorPack().pack, ...).enemySpawns === [{kind:"skeleton",
// pos:{x:3,y:3}}]) and content/entities.mjs's entity:enemy_skeleton's
// Health.max (4) — cross-checked by tests/combat.test.js so drift between
// this literal and the real derivation is caught, not silent.
const SYNTHETIC_TOMB_FLOOR_1 = {
  zone: "tomb",
  floorNum: 1,
  mapId: "map:tomb_floor_1_synthetic",
  spawn: { x: 1, y: 1 },
  enemies: [{ id: "e0", kind: "skeleton", pos: { x: 3, y: 3 }, hp: 4 }],
};

/** Builds the ENTERED_TOMB event. This is the S3 PR4 backward-compat
 *  hinge (design spec's "ENTERED_TOMB construction"): with NO seed
 *  (`seed == null` — every existing caller/test, none of which thread
 *  one through `ctx`), this returns EXACTLY what it always has —
 *  SYNTHETIC_TOMB_FLOOR_1 spread verbatim, byte-for-byte — so the 60
 *  ceremony-kernel tests (which supply their own tomb World directly,
 *  never re-deriving off this event's mapId — see rules/tests/ceremony-
 *  kernel/kernel-helpers.mjs's own header) are entirely unaffected.
 *
 *  WITH a seed, this builds a real "tomb:<topSeed>:<runs>:<floorNum>"
 *  mapId (`state.knowledge.runs` — the PRE-event run count, since
 *  `state` here is validate()'s pre-event state) and generates the
 *  matching floor via shared/floorgen.js's generateFloor (a pure
 *  function of (topSeed, floorNum) alone), so `spawn`/`enemies` land the
 *  player on and among the SAME generated geometry deriveWorld's own
 *  "tomb:" branch will independently reproduce the next time the world
 *  is re-derived (src/host.js, after this event commits) — no drift
 *  between the two, by construction (same pure inputs). Real multi-floor
 *  descent is not wired yet (S3 PR5+ territory) — every tomb entry, seed
 *  or not, still starts at floorNum 1, exactly as SYNTHETIC_TOMB_FLOOR_1
 *  always has.
 *
 *  `enemies` filters out any generated kind absent from `enemyTypes`
 *  (pack-scoped, buildEnemyTypes(contentPack)) — e.g. "cabinet", which
 *  floorgen.js places but the content pack does not author with an
 *  Actor stat bag (content/entities.mjs's own comment: "cabinet spawns
 *  floors 3+ and is excluded"). Those are decor, not live combatants;
 *  `world.enemySpawns` (deriveWorld's own "tomb:" branch) still lists
 *  them (raw floor.enemies, unfiltered) since that field is purely
 *  informational geometry, never fed into run.enemies directly. */
function enteredTombEvent(state, seed) {
  if (seed == null) {
    // Warden-boss resolution: floor 1 (SYNTHETIC_TOMB_FLOOR_1) is never a
    // warden floor, so this is always null — threaded anyway, for symmetry
    // with the seeded branch below (design spec's "spawn threading").
    return { t: "ENTERED_TOMB", ...SYNTHETIC_TOMB_FLOOR_1, boss: null };
  }
  const floorNum = SYNTHETIC_TOMB_FLOOR_1.floorNum;
  const mapId = `${TOMB_MAP_PREFIX}${seed}:${state.knowledge.runs}:${floorNum}`;
  const floor = generateFloor(seed, floorNum);
  const enemyTypes = buildEnemyTypes(contentPack);
  const enemies = [];
  for (const e of floor.enemies) {
    const type = enemyTypes[e.kind];
    if (!type) continue; // decor, e.g. "cabinet" — not a pack-authored combatant
    enemies.push({ id: `e${enemies.length}`, kind: e.kind, pos: { x: e.x, y: e.y }, hp: type.hp });
  }
  // Carry the generated floor's seal on the event (same "carried on the
  // event" convention as `enemies`) so reduce() can populate run.puzzle.
  // Without this, run.puzzle stayed null on every real (seeded) floor and
  // the RIDDLE_ASKED path was dead code outside the synthetic test fixture
  // — an adversarial-scoping find.
  const boss = floor.boss ? initBoss(floor.boss) : null;
  return { t: "ENTERED_TOMB", zone: "tomb", floorNum, mapId, spawn: floor.spawn, enemies, puzzle: floor.puzzle, boss };
}

/** Builds the `run.boss` slot from floorgen's `floor.boss` ({kind,x,y,
 *  stats:{hp,dmg,name,telegraph,maxhp}} — shared/floorgen.js's wardenStats/
 *  FINAL_BOSS_STATS) per the warden-boss-resolution design spec's "State
 *  model": `pos` from `x`/`y`; `state` starts `"sleep"`; `timer`/`dashDir`
 *  are inert until shared/tick.js's resolveTick wakes it; `dead` starts
 *  false. Pure — a fresh object every call, never aliasing `floorBoss`. */
export function initBoss(floorBoss) {
  const { kind, x, y, stats } = floorBoss;
  return {
    id: "boss",
    kind,
    pos: { x, y },
    hp: stats.hp,
    maxhp: stats.maxhp,
    dmg: stats.dmg,
    name: stats.name,
    telegraph: stats.telegraph,
    state: "sleep",
    timer: 0,
    dashDir: null,
    dead: false,
  };
}

function exitedTombEvent() {
  return { t: "EXITED_TOMB", zone: "ow", floorNum: 0, mapId: "map:guild_hall", spawn: guildHallSpawn() };
}

/** Builds the DESCENDED event — the riddle-seal resolution's floor-to-
 *  floor descent (docs/superpowers/specs/2026-07-07-riddle-seal-
 *  resolution-design.md's "Descend on solve"). Deliberately NOT a re-use
 *  of enteredTombEvent/ENTERED_TOMB: that event bumps knowledge.runs/day
 *  (one excursion = one accrued month of interest) and resets
 *  run.runStats fresh on every call — exactly right for "the first step
 *  into the tomb this run", exactly wrong for "one floor deeper on the
 *  SAME run" (would double-accrue interest and wipe kills/gold every
 *  floor — a determinism/scoring bug, not just cosmetic). This mirrors
 *  legacy's own descend() (zones.js:83-93), which does neither.
 *
 *  Only ever called for a "tomb:"-prefixed `world.mapId` (validate()'s
 *  own "move" case guards this — the synthetic test fixture's map:
 *  mapId has no floor 2 to generate). `runsSegment` is threaded through
 *  UNCHANGED from the current mapId so the run-count segment stays
 *  stable across floors — only `floorNum` advances. `spawn`/`enemies`/
 *  `puzzle` are built exactly like enteredTombEvent's own seeded branch
 *  (same enemyTypes filter, same id-assignment convention) — the two
 *  functions are intentionally parallel, not shared, since ENTERED_TOMB
 *  additionally needs the no-seed SYNTHETIC_TOMB_FLOOR_1 branch this one
 *  has no analog for. */
function descendedEvent(state, world) {
  void state; // present for signature parity with the design spec; every field this needs lives on `world.mapId`
  const { topSeed, runsSegment, floorNum } = parseTombMapId(world.mapId);
  const next = floorNum + 1;
  const mapId = `${TOMB_MAP_PREFIX}${topSeed}:${runsSegment}:${next}`;
  const floor = generateFloor(topSeed, next);
  const enemyTypes = buildEnemyTypes(contentPack);
  const enemies = [];
  for (const e of floor.enemies) {
    const type = enemyTypes[e.kind];
    if (!type) continue; // decor, e.g. "cabinet" — not a pack-authored combatant
    enemies.push({ id: `e${enemies.length}`, kind: e.kind, pos: { x: e.x, y: e.y }, hp: type.hp });
  }
  const boss = floor.boss ? initBoss(floor.boss) : null;
  return { t: "DESCENDED", zone: "tomb", floorNum: next, mapId, spawn: floor.spawn, enemies, puzzle: floor.puzzle, boss };
}

/** The riddle door's live `nextRiddle` recomputation, shared verbatim by
 *  validate()'s "answer" case and affordances()'s own extension (design
 *  spec: "recompute nextRiddle (same channel key)") — one source of
 *  truth for the rng key + gameLike shape so the two can never drift
 *  apart. rng is a NAMED @golem-engine/random channel keyed on
 *  `world.mapId` (always present, unlike a would-be `seed` ctx field —
 *  design spec's own rationale) + the puzzle's own `attempts` count (so
 *  a wrong answer's next recomputation draws fresh options, not the same
 *  ones already rejected). */
function riddleOptions(world, puzzle, runStats) {
  const rng = channel(world.mapId, "riddle", String(puzzle.attempts));
  const gameLike = { puzzle, floorNum: world.floorNum, runStats };
  return nextRiddle(gameLike, rng).options;
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

// Player melee damage from sword tier (legacy/src/systems/combat.js:13's
// swordDmg: `[1,2,3,4,6][player.swordLv] + ((player.lv-1)>>1)`). The
// `player.lv` term is DROPPED here — some-hero's five-tier State has no
// leveling/xp system yet (PR4 scope; design spec's "Scope boundaries" —
// no full inventory/progression), so this is the sword-tier table alone,
// a documented simplification, not a byte-port.
const SWORD_DAMAGE = [1, 2, 3, 4, 6];
function attackDamage(swordLv) {
  return SWORD_DAMAGE[swordLv] ?? SWORD_DAMAGE[0];
}

export function validate(ctx, cmd) {
  const { state, world, seed } = ctx;
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

      // Plates block-push (docs/superpowers/specs/2026-07-07-plates-seal-
      // resolution-design.md): a block on the target tile is pushed one tile
      // in the travel direction if the tile beyond it is clear; otherwise the
      // block is solid and the move is denied. run.puzzle is state (mutable
      // seal progress), never world — read state.run.puzzle, build a fresh
      // puzzle (never mutate state/sim). The player still advances onto the
      // block's OLD tile (the normal MOVED below), so this only adds a derived
      // BLOCK_PUSHED (like TRAP_TRIGGERED) — it does not replace MOVED.
      let blockPush = null;
      const pz = state.run.puzzle;
      if (pz && pz.type === "plates") {
        const bi = pz.blocks.findIndex((b) => b.x === nx && b.y === ny);
        if (bi >= 0) {
          // A block is a physical obstacle ALWAYS — legacy moveEnt treats
          // blocks as unconditionally solid, with no `solved` escape hatch
          // (adversarial-review find: gating solidity on `!solved` let the
          // player walk THROUGH resting blocks once the seal was satisfied,
          // since floorgen never records block tiles in world.walls). Once
          // solved the block is inert scenery but still blocks the tile.
          if (pz.solved) return { deny: "The block won't budge." };
          const bx = nx + dx, by = ny + dy;
          const blocked =
            !inBounds(world, bx, by) ||
            isWall(world, bx, by) ||
            pz.blocks.some((b, i) => i !== bi && b.x === bx && b.y === by);
          if (blocked) return { deny: "The block won't budge." };
          const blocks = pz.blocks.map((b, i) => (i === bi ? { x: bx, y: by } : b));
          const plates = pz.plates.map((p) => ({ ...p, on: blocks.some((b) => b.x === p.x && b.y === p.y) }));
          const done = plates.filter((p) => p.on).length;
          blockPush = { ...pz, blocks, plates, done, solved: done >= pz.need };
        }
      }

      const events = [{ t: "MOVED", x: nx, y: ny }];
      if (blockPush) events.push({ t: "BLOCK_PUSHED", puzzle: blockPush });
      // Every gate/seal/ascent check below is a sim-and-inspect DERIVED
      // event, exactly like topdown-puzzle's WIN/LOSE (shared/push.js):
      // compute the primary MOVED, fold it through a throwaway reduce,
      // inspect the result, append derived events (design spec, "Events
      // + reducer cases").
      const sim = foldThrough(state, world, events);

      // Tile-entry pickups (design spec's "Pickups / inventory"): landing
      // on a gold/potion tile appends COLLECTED, independent of
      // zone/gate/seal logic below. `world.pickupAt` is a Map<"x,y",
      // {kind,amount}> — empty for every real/derived World today (no
      // committed map authors pickup tokens yet), populated directly by
      // tests (tests/helpers/build-state.mjs's makeWorld) — see
      // deriveWorldFromPack's own header comment.
      const pickup = world.pickupAt && world.pickupAt.get(`${nx},${ny}`);
      // Consume-once: skip a pickup whose tile has already been taken this
      // floor (adversarial-review find — the pickup tile can't record
      // consumption in the seed-derived World, so `run.collectedTiles`
      // does, and the COLLECTED event carries `x,y` so the reducer can mark
      // it). Without this, stepping off and back on re-collected it.
      if (pickup && !(state.run.collectedTiles || []).includes(`${nx},${ny}`)) {
        events.push({ t: "COLLECTED", kind: pickup.kind, amount: pickup.amount, x: nx, y: ny });
      }

      // The traps-seal resolution (docs/superpowers/specs/2026-07-07-
      // traps-seal-resolution-design.md): landing on an un-hit trap tile
      // fires it — no damage (legacy: "the traps ran out of darts years
      // ago"), just the incident counter (`done`) ticking toward `need`.
      // Independent of the zone/gate/seal if-chain below (same posture as
      // the pickup check above): a fresh `newPuzzle` object is built here
      // (fresh `traps` array, fresh puzzle) — `sim`/`state` are never
      // mutated. Already-hit traps and non-traps/already-solved puzzles
      // are silently skipped.
      if (sim.run.puzzle && sim.run.puzzle.type === "traps" && !sim.run.puzzle.solved) {
        const trapIdx = sim.run.puzzle.traps.findIndex(
          (tr) => tr.x === sim.character.pos.x && tr.y === sim.character.pos.y && !tr.hit,
        );
        if (trapIdx >= 0) {
          const traps = sim.run.puzzle.traps.map((tr, i) => (i === trapIdx ? { ...tr, hit: true } : tr));
          const done = sim.run.puzzle.done + 1;
          const newPuzzle = { ...sim.run.puzzle, traps, done, solved: done >= sim.run.puzzle.need };
          events.push({ t: "TRAP_TRIGGERED", puzzle: newPuzzle });
        }
      }

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
          events.push(enteredTombEvent(state, seed));
        }
      } else if (
        world.zone === "tomb" &&
        atPoint(world.stairsAt, nx, ny) &&
        sim.run.puzzle &&
        sim.run.puzzle.type !== "final" &&
        stairsOpen({ puzzle: sim.run.puzzle, boss: sim.run.boss }) &&
        typeof world.mapId === "string" &&
        world.mapId.startsWith(TOMB_MAP_PREFIX)
      ) {
        // The seal-resolution descend trigger (docs/superpowers/specs/
        // 2026-07-07-riddle-seal-resolution-design.md, generalized by
        // 2026-07-07-traps-seal-resolution-design.md, generalized again
        // by 2026-07-07-key-seal-resolution-design.md, generalized again
        // by 2026-07-07-warden-boss-resolution-design.md's "Descend
        // un-exclusion"): the single source of truth is now rules/
        // puzzles.js's ported `stairsOpen` — riddle/traps/plates/torch
        // open on `.solved`, key opens on `.have`, warden opens on
        // `boss.dead` (WARDEN_SLAIN flips it — see the reducer's
        // WARDEN_SLAIN case). `final` is still explicitly excluded here
        // (stairsOpen's own final branch always returns false — there is
        // no down-stairs on the final floor at all; that ceremony is a
        // distinct follow-up, out of this PR's scope). Guarded to
        // "tomb:"-prefixed mapIds only: the synthetic test fixture (map:
        // tomb_floor_1_synthetic) has no floor 2 to generate. Mutually
        // exclusive with the unsolved riddle branch below via `.solved`.
        events.push(descendedEvent(state, world));
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
      return [enteredTombEvent(state, seed)];
    }
    case "answer": {
      // The riddle door's answer flow (design spec's "The answer flow" —
      // NEW verb "answer <index>", 0-based, NOT free-text). Gate is
      // POSITION-INDEPENDENT (matches legacy's decoupled modal — no tile
      // check, unlike the "move"-triggered RIDDLE_ASKED/DESCENDED
      // branches above).
      if (!(world.zone === "tomb" && state.run.puzzle?.type === "riddle" && !state.run.puzzle.solved)) {
        return { deny: "There is no riddle here to answer." };
      }
      const options = riddleOptions(world, state.run.puzzle, state.run.runStats);
      const idx = Number(rest[0]);
      if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
        return { deny: "That is not one of the door's offered answers." };
      }
      // Sim-and-inspect discipline: answerRiddle MUTATES its `game.puzzle`
      // argument, so it is only ever handed a throwaway CLONE — the real
      // state.run.puzzle is never touched here.
      const clone = { puzzle: { ...state.run.puzzle } };
      const result = answerRiddle(clone, options[idx], { sfx() {}, toast() {} });
      // The whole resulting puzzle is carried wholesale on the event
      // (design spec: "like ev.enemies") — reduce()'s RIDDLE_ANSWERED
      // case is a dumb copy of it.
      return [{ t: "RIDDLE_ANSWERED", result, puzzle: clone.puzzle }];
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
    case "attack": {
      // The player attack verb (design spec's "Combat (skeleton family
      // for the DoD)": "a new 'attack' verb"). Explicitly id-targeted
      // (`attack <id>`) — unambiguous and deterministic, unlike an
      // implicit "nearest enemy" resolution which would need its own
      // tie-break rule for no added value here (only one enemy family,
      // PR4 scope). Melee range: same tile or one of the four orthogonal
      // neighbors (Manhattan distance <= 1) — matches shared/tick.js's
      // own "on/adjacent-to" contact-damage rule.
      const id = rest[0];
      const enemy = state.run.enemies.find((e) => e.id === id);
      // Warden-seal boss resolution (docs/superpowers/specs/2026-07-07-
      // warden-boss-resolution-design.md's "attack — target the boss"):
      // resolves to the live boss only when `id` names it AND it isn't
      // already dead — a dead boss (or any non-warden floor, where
      // `run.boss` is null) falls through to the existing "nothing here
      // by that name" deny below, byte-identical. No enemy is ever
      // assigned the id "boss" (enemy ids are "e0","e1",...), so `enemy`
      // and `boss` never both resolve for the same `id`.
      const boss = state.run.boss && state.run.boss.id === id && !state.run.boss.dead ? state.run.boss : null;
      const { x, y } = state.character.pos;

      // Torch-seal lighting (docs/superpowers/specs/2026-07-07-torch-seal-
      // resolution-design.md): a swing lights any un-lit brazier within
      // Manhattan <= 1, faithful to legacy attack.js's igniteBraziers, which
      // fires on every tomb attack regardless of the enemy hit. Pure — a
      // fresh torches array / puzzle, never mutates state. Only engages on an
      // unsolved torch floor, so every non-torch attack is byte-unchanged.
      const pz = state.run.puzzle;
      let torchLit = null;
      if (pz && pz.type === "torch" && !pz.solved) {
        const hit = [];
        pz.torches.forEach((to, i) => {
          if (!to.lit && Math.abs(to.x - x) + Math.abs(to.y - y) <= 1) hit.push(i);
        });
        if (hit.length) {
          const torches = pz.torches.map((to, i) =>
            hit.includes(i) ? { ...to, lit: true, tm: pz.time } : to);
          torchLit = { ...pz, torches, solved: torches.every((to) => to.lit) };
        }
      }

      if (!enemy && !boss) {
        // A swing that only lights braziers is still a legal swing; otherwise
        // there is genuinely nothing to strike (unchanged deny).
        if (torchLit) return [{ t: "TORCH_LIT", puzzle: torchLit }];
        return { deny: "There is nothing here by that name to strike." };
      }

      if (boss && !enemy) {
        // "attack boss" is the strike (design spec's own closing line).
        // Same melee-range rule as the enemy path below (Manhattan <= 1).
        const dist = Math.abs(boss.pos.x - x) + Math.abs(boss.pos.y - y);
        if (dist > 1) {
          // The swing still happens even if the named target is out of
          // reach — a brazier in range lights (legacy: every tomb swing
          // lights braziers, independent of the enemy hit; adversarial-
          // review find: this deny previously discarded the computed
          // torchLit, so an in-range brazier stayed dark). Mirrors the
          // `!enemy && !boss` branch above.
          if (torchLit) return [{ t: "TORCH_LIT", puzzle: torchLit }];
          return { deny: "Too far to strike." };
        }
        const amount = attackDamage(state.character.swordLv);
        const hp = boss.hp - amount;
        // A hit WAKES a sleeping boss (legacy attack.js:52-58: a struck
        // boss goes sleep -> idle). Without this, an adversarial-review
        // find: a boss in its initBoss default "sleep" state could be
        // killed by repeated "attack boss" with zero retaliation — it
        // never creeps/telegraphs/dashes/deals contact damage unless an
        // independent tick first brings the player into aggro range.
        const woken = boss.state === "sleep" ? { state: "idle", timer: WARDEN.idleTicks } : {};
        const events = [{ t: "WARDEN_HURT", boss: { ...boss, hp, ...woken } }];
        if (hp <= 0) events.push({ t: "WARDEN_SLAIN" });
        if (torchLit) events.push({ t: "TORCH_LIT", puzzle: torchLit });
        return events;
      }

      const dist = Math.abs(enemy.pos.x - x) + Math.abs(enemy.pos.y - y);
      if (dist > 1) {
        // As in the boss branch above: a swing that can't reach its named
        // enemy still lights an in-range brazier (adversarial-review find).
        if (torchLit) return [{ t: "TORCH_LIT", puzzle: torchLit }];
        return { deny: "Too far to strike." };
      }
      const amount = attackDamage(state.character.swordLv);
      const events = [{ t: "ENEMY_HURT", id, amount }];
      const sim = foldThrough(state, world, events);
      const survivor = sim.run.enemies.find((e) => e.id === id);
      if (!survivor || survivor.hp <= 0) {
        events.push({ t: "ENEMY_KILLED", id, kind: enemy.kind });
      }
      if (torchLit) events.push({ t: "TORCH_LIT", puzzle: torchLit });
      return events;
    }
    case "resurrect": {
      // Consumes the resurrection half of the same pending slot.
      if (!state.pending || state.pending.kind !== "resurrection") {
        return { deny: "There is nothing to resurrect from." };
      }
      const ev = { t: "RESURRECTED", cause: state.pending.cause };
      // character.pos ALWAYS resets to the guild-hall spawn — you respawn
      // at the guild regardless of where you died (legacy respawnAtGuild
      // sets the village position unconditionally; the spec's RESURRECTED
      // field list states "character.pos = the ow map's derived
      // world.spawn" with no zone caveat — that caveat is only on the
      // `world` tier below). Previously ev.spawn was set only for a tomb
      // death, so dying while already in "ow" left the player standing
      // where they died — an adversarial-review find.
      ev.spawn = guildHallSpawn();
      if (state.world.zone === "tomb") {
        // Climbing out of the tomb also resets the world tier back to ow.
        ev.world = { zone: "ow", floorNum: 0, mapId: "map:guild_hall" };
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

/* ── S2c PR5: narrativeFacts — the golem's only allowed input (doctrine
   #4; @golem-engine/kernel's GameModule.narrativeFacts). RAW FACTS ONLY,
   NEVER prose — prose selection stays entirely in rules/ledger.js,
   consumed by src/ledger-render.js's renderLedger() (the twin-disabled
   template path; design spec's "The doctrine resolution"). Pure: no
   mutation of `state`, no Math.random/Date.now.

   `state` here is the PRE-event state — the same state hostCommit
   (src/host.js) is about to fold `event` through via reduce(), before
   S.st is reassigned to the post-reduce result. Both facts this PR
   emits need values computed FROM that pre-event state, not from what
   state.knowledge looks like after this event's own reduce() case runs:

     - DIED's reduce() case (shared/reducer.js) does NOT call
       recordDeath at all — that happens later, at RESURRECTED. So
       state.knowledge.deaths/repeatCause, read at DIED time (pre OR
       post that event's own reduce), still hold the PREVIOUS death's
       numbers. deathReport(meta, cause) needs meta AFTER this death
       (see ledger-text ceremony: recordDeath(m, cause) is always
       called before deathReport(m, cause)). So this hook computes the
       would-be post-recordDeath values on a throwaway knowledge clone,
       exactly the way legacy's own onPlayerDeath (legacy/src/main.js:
       107-115, "willBeDeaths"/inline repeatCause) does — without
       waiting for RESURRECTED to actually commit it.
     - EXITED_TOMB's reduce() case calls gradeRun(state.knowledge, ...)
       against the PRE-event knowledge — before this run's grade is
       pushed onto knowledge.grades and before recordDepth bumps
       bestDepth. Using POST-event knowledge here would silently break
       the personal-best comparison and produce the wrong grade, so
       this hook mirrors reduce()'s own call exactly: same inputs, same
       (pre-event) state. */
export function narrativeFacts(state, world, event) {
  switch (event.t) {
    case "DIED": {
      const knowledge = { ...state.knowledge };
      recordDeath(knowledge, event.cause);
      return { kind: "death", cause: event.cause, deaths: knowledge.deaths, repeatCause: knowledge.repeatCause };
    }
    case "EXITED_TOMB": {
      const runStats = state.run.runStats;
      const grade = gradeRun(state.knowledge, { ...runStats, died: false });
      return {
        kind: "grade",
        grade,
        depth: runStats.depth,
        kills: runStats.kills,
        killsByKind: runStats.killsByKind,
        died: runStats.died,
      };
    }
    default:
      return null;
  }
}

/* ── S4 PR1: observe() — the first real GameModule.observe in the
   monorepo (docs/superpowers/specs/2026-07-07-s4-pr1-observe-adapter-
   design.md's "observe() — the first real GameModule.observe"; kernel
   contract: packages/kernel/src/index.ts's `observe(state, world,
   viewer): Obs`, "state + world, as seen by one viewer → that viewer's
   observation. Perception (seen/lit, fog of war) is derived here, not
   stored.").

   some-hero has NO fog of war / no per-viewer visibility in the port
   (unlike golem-grid's client-local perceive.js, which computes a real
   seen/lit set from a room-shaped dungeon — but that's a CLIENT module,
   not this kernel hook; no game module's `observe` exists yet anywhere
   in the monorepo). So this is an honest FULL-VISIBILITY projection, not
   a fog computation: every field of `state` (character/run/knowledge)
   plus the derived `world` is handed back verbatim, structurally shared
   (no defensive copy — same "untouched tiers are the same reference"
   posture shared/reducer.js's own header documents; observe() never
   mutates state/world, so aliasing is safe).

   `viewer` is present ONLY for structural parity with the kernel
   contract's signature (future stealth/multiplayer, per the design
   spec) — it is NEVER read. Calling `observe(state, world, "anyone")`
   and `observe(state, world, "literally-anything-else")` returns the
   exact same object shape with the exact same tier references; this is
   asserted directly by tests/observe.test.js, not just claimed here, so
   a reviewer doesn't mistake the omission for a forgotten fog feature. */
export function observe(state, world, viewer) {
  void viewer; // structurally present, deliberately unused — see header
  return {
    zone: state.world.zone,
    floorNum: state.world.floorNum,
    character: state.character,
    run: state.run,
    knowledge: state.knowledge,
    world,
  };
}

/* ── A1 PR1: affordances() — the conformance proof for @golem-engine/
   kernel's `GameModule.affordances(observation, actor)` hook (docs/
   superpowers/specs/2026-07-07-a1-pr1-affordances-hook-design.md's
   "some-hero standalone affordances() (the conformance proof)"). A
   kernel hook only one game implements isn't proven as an API; this
   proves the canonical `Affordance` shape generalizes across some-hero's
   very different Obs shape from golem-grid's (deferred to A1 PR2).

   `observation` here is `{state, world}` — the SAME ctx shape validate()
   above already takes (not observe()'s flattened per-viewer projection,
   which structurally omits `pending` on purpose — pinned by tests/
   observe.test.js's exact-key-set assertion; extending observe() itself
   is out of PR1's scope, see the design doc's "Scope boundaries").
   `actor` is accepted for structural parity with the kernel's
   `affordances(observation, actor)` signature but never read — some-hero
   has exactly one embodiment (no NPC/multiplayer targeting yet), the
   same "present, deliberately unused" posture observe()'s own `viewer`
   param documents above.

   Pure: no mutation of `state`/`world`, no Math.random/Date.now/eval,
   reads only — reuses validate()'s own gate-check idiom
   (credentialFactLookup + @golem-engine/content's evaluate()) and
   rules/credentials.js's missingCredentials(), rather than
   re-implementing either. */
export function affordances(observation, actor) {
  void actor; // structurally present, deliberately unused — see header
  const { state, world } = observation;
  const out = [];

  // "proceed" — consumes the ceremony half of the unified two-step
  // pending slot (validate()'s own "proceed" case above). Always listed
  // (a stable menu entry), enabled only mid-ceremony; `reason` explains
  // why when it isn't — mirrors validate()'s own Denial text.
  const ceremonyPending = state.pending?.kind === "ceremony";
  out.push({
    verb: "proceed",
    target: "tomb",
    name: "the tomb",
    enabled: ceremonyPending,
    ...(ceremonyPending ? {} : { reason: "There is no ceremony to proceed from." }),
  });

  // "resurrect" — consumes the resurrection half of the same pending
  // slot (validate()'s own "resurrect" case above).
  const resurrectionPending = state.pending?.kind === "resurrection";
  out.push({
    verb: "resurrect",
    target: "self",
    name: "resurrection",
    enabled: resurrectionPending,
    ...(resurrectionPending ? {} : { reason: "There is nothing to resurrect from." }),
  });

  // "attack <enemyId>" — one per enemy within melee range (Manhattan
  // distance <= 1, the SAME range check validate()'s own "attack" case
  // uses above) of character.pos. run.enemies only ever holds live
  // enemies (ENEMY_KILLED removes them — shared/reducer.js), so every
  // listed affordance here is legal by construction; only in-range
  // enemies are listed at all (no disabled out-of-range entries).
  const { x, y } = state.character.pos;
  for (const enemy of state.run.enemies) {
    const dist = Math.abs(enemy.pos.x - x) + Math.abs(enemy.pos.y - y);
    if (dist > 1) continue;
    out.push({
      verb: "attack",
      target: enemy.id,
      name: enemy.kind,
      enabled: true,
    });
  }

  // "attack boss" — the warden (state.run.boss, NOT run.enemies, so the
  // per-enemy loop above never lists it) within melee range (Manhattan
  // <= 1, the SAME check validate()'s attack-boss path uses). Listed only
  // when a live boss is adjacent — parallel to the per-enemy loop; target
  // "boss" is the id validate() resolves the strike against (docs/
  // superpowers/specs/2026-07-07-seal-affordances-design.md).
  const boss = state.run.boss;
  if (boss && !boss.dead) {
    const bd = Math.abs(boss.pos.x - x) + Math.abs(boss.pos.y - y);
    if (bd <= 1) {
      out.push({ verb: "attack", target: "boss", name: boss.name, enabled: true });
    }
  }

  // "attack brazier" — lighting an adjacent un-lit brazier on an unsolved
  // torch floor (validate()'s #69 torch-lighting path: a swing lights any
  // un-lit brazier within Manhattan <= 1). One entry when >= 1 is in range
  // (a single swing lights all adjacent). target "brazier" is a non-enemy/
  // non-boss id, so validate() routes it to the torch-light path.
  if (world.zone === "tomb" && state.run.puzzle?.type === "torch" && !state.run.puzzle.solved) {
    const litable = state.run.puzzle.torches.some(
      (to) => !to.lit && Math.abs(to.x - x) + Math.abs(to.y - y) <= 1,
    );
    if (litable) {
      out.push({ verb: "attack", target: "brazier", name: "light the brazier", enabled: true });
    }
  }

  // "answer <index>" — the riddle door's live options (design spec's
  // "affordances() extension"). Recomputes nextRiddle with the exact
  // SAME channel key validate()'s own "answer" case uses (riddleOptions
  // above), so the menu always matches what "answer <index>" will
  // actually resolve against — same extensible per-item idiom as the
  // per-enemy "attack" entries above.
  if (world.zone === "tomb" && state.run.puzzle?.type === "riddle" && !state.run.puzzle.solved) {
    const options = riddleOptions(world, state.run.puzzle, state.run.runStats);
    options.forEach((option, i) => {
      out.push({ verb: "answer", target: String(i), name: option.label, enabled: true });
    });
  }

  // "descend"/gate — the Door Golem's gate at the guild-hall stairs
  // (validate()'s own "move" case gate check, mirrored here read-only:
  // this never simulates a move, only inspects the CURRENT state/world).
  // Only present when this World actually derives a gate (map:guild_hall
  // today; deriveWorldFromPack's findGate()). `requirements` carries the
  // raw unlockCondition (DELTA's opaque-condition idiom); `reason` is
  // the missing-credentials list (reuses missingCredentials(), the SAME
  // helper validate()'s GOLEM_DENIED branch builds its own `missing`
  // field from) when disabled.
  if (world.zone === "ow" && world.gate) {
    const passed = evaluate(world.gate.unlockCondition, credentialFactLookup(state));
    out.push({
      verb: "descend",
      target: "gate",
      name: "Door Golem",
      enabled: passed,
      requirements: world.gate.unlockCondition,
      ...(passed
        ? {}
        : { reason: `Missing credentials: ${missingCredentials(state.knowledge, state.character.swordLv).join(", ")}` }),
    });
  }

  return out;
}

/** A partial KernelCore — `{validate, reduce, narrativeFacts, observe}`,
 *  deliberately WITHOUT `deriveWorld` (see this file's header comment:
 *  deriveWorld's Node-side filesystem read lives in shared/pack-
 *  loader.js, which assembles the FULL `{deriveWorld,validate,reduce,
 *  narrativeFacts}` GameModule subset for Node consumers). Enough for
 *  @golem-engine/kernel's replay(), which only ever reads `.reduce` —
 *  same posture as topdown-puzzle/golem-grid's own `module` export.
 *  `observe` (S4 PR1) rides beside it now — the first game module in the
 *  monorepo to populate this kernel hook. `affordances` (A1 PR1) rides
 *  beside it too — the conformance proof that the kernel's affordances
 *  hook generalizes across a second, very different Obs shape. */
export const module = { validate, reduce, narrativeFacts, observe, affordances };
