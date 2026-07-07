/* ── RENDER ADAPTER: observation → legacy `game`-shaped view-model (DELTA
   S4 PR1 — docs/superpowers/specs/2026-07-07-s4-pr1-observe-adapter-
   design.md's "The adapter: observation → legacy game-shaped view-
   model"). The legacy renderer (games/some-hero/legacy/src/render/
   index.js's `render(ctx, game, screen)`, and the individual draw passes
   it composes — drawTiles/drawBlocks/drawTorches/drawTraps/drawPickups/
   drawEnemy/drawPlayer/...) reads a big mutable `game` aggregate built
   by the legacy engine's own createGame()/newRun(). This module builds
   an EQUIVALENT `game`-shaped object from shared/module.js's `observe()`
   projection, so the SAME legacy draw functions can render some-hero's
   kernel-ported State headlessly (proven in
   tests/render-adapter-drawable.test.js, a golden-hash gate) and,
   eventually (PR2, CI-only, real Chromium), on an actual canvas.

   Pure data/arithmetic only: no Canvas API, no Math.random/Date.now/
   eval. `adapt()` reads only its `observation` argument and returns a
   fresh object graph every call.

   TL (the tile-id enum) / T (tile size) / the per-kind enemy visual
   table are all defined INLINE below, cited to their legacy source line
   ranges, rather than imported from legacy/ — the shipped adapter must
   be legacy-free (tests/src-no-legacy-import.test.js enforces this;
   only TEST files are allowed to import legacy/, per the DELTA S4 PR1
   brief's hard constraint). */

// legacy/src/constants.js:3 — tile size in world px. some-hero's kernel
// port is grid-cardinal (shared/module.js's header: "Movement
// canonicalization"); this is the ONE constant that converts a grid cell
// back into the legacy renderer's continuous pixel space.
const T = 36;

// legacy/src/constants.js:10-18 — the TL tile-id enum. Only the ids
// some-hero's derived World can actually produce are listed: TF (tomb
// floor, the default), TW (wall), SD (stairs down / `world.stairsAt`),
// SU (stairs up / `world.upstairsAt`), PLATE (never emitted today — see
// buildTileMap's own comment). The overworld tile family (SAND/DUNE/
// ROCK/WATER/PALM/PAVE/RFLOOR/RWALL/WELL/ROAD, ids 0-9) has no analog:
// some-hero's kernel port has no `ow` tilemap derivation yet (deriveWorld
// only ever resolves `map:guild_hall`'s geometry-neutral walkable cells,
// never rasterizes an overworld tile grid) — out of scope for this PR.
const TL = { TF: 10, TW: 11, SD: 12, SU: 13, PLATE: 14 };

// legacy/src/entities/enemy.js:12-23 — the LIVE roster ONLY (the "Front
// Office"/"Greater Pflum" families some-hero's content pack actually
// authors — see shared/module.js's buildEnemyTypes, which is PACK-
// scoped). The retired desert roster (scarab/jackal/spirit/mummy,
// enemy.js:26-29 — "kept for later", explicitly not spawned by
// pickTombKind) is deliberately excluded, per the DELTA S4 PR1 brief's
// "LIVE roster only" constraint. Only the RENDERER-relevant visual
// fields (r = radius, col = fill color) are carried here — `run.enemies`
// (shared/reducer.js's `{id,kind,pos,hp}` shape) has no per-enemy
// col/r/maxhp of its own; the kernel's Actor stat bag (content/
// entities.mjs) never threads those through to run-scoped State, so the
// renderer needs its own lookup, exactly like legacy's own mkEnemy()
// resolves `ENEMY_TYPES[kind]` at spawn time.
const ENEMY_VISUALS = {
  skeleton: { r: 11, col: "#e8e2d0" },
  mailbat: { r: 12, col: "#5a5a6e" },
  consultant: { r: 12, col: "#9bb0c4" },
  cabinet: { r: 13, col: "#8a8f98" },
  slime: { r: 10, col: "#7fc95f" },
  pigeon: { r: 11, col: "#9aa0a8" },
  goose: { r: 12, col: "#f0ede2" },
  veteran: { r: 12, col: "#8ca3b8" },
};

/** Unknown/unlisted kind: a readable fallback rather than a crash —
 *  mirrors legacy/src/render/actors.js's own drawFallback posture for an
 *  unknown draw function, applied here one layer earlier (the visual
 *  lookup, not the draw call). Should never fire in practice (every kind
 *  buildEnemyTypes can produce is LIVE-roster; see this file's own
 *  header), but a silent, sane default beats a thrown TypeError deep in
 *  a renderer this module doesn't control. */
function enemyVisual(kind) {
  return ENEMY_VISUALS[kind] || { r: 11, col: "#ffffff" };
}

/** Grid cell → legacy world-pixel center (design spec: "inverting the
 *  movement canonicalization... pos.x*T + T/2"). Every kernel-ported
 *  position (character.pos, an enemy's pos) is a grid cell; every legacy
 *  renderer field (game.player.x/y, an enemy's x/y) is a pixel at the
 *  center of that cell — matching legacy/src/entities/player.js's own
 *  createPlayer (x/y start at a tile center, never a tile corner). */
function gridToPixel(pos) {
  return { x: pos.x * T + T / 2, y: pos.y * T + T / 2 };
}

/** `world.walls`(Set of `"x,y"` keys) + `world.rows/cols` + `world.
 *  stairsAt`/`world.upstairsAt` → a `Uint8Array` of TL ids, exactly the
 *  shape legacy/src/world/tilemap.js's `tileAt(world, tx, ty)` reads
 *  (`world.map[ty * world.w + tx]`, so `w` = column count = `world.cols`
 *  here). Every non-wall, non-stairs cell defaults to TF (tomb floor);
 *  PLATE (pressure-plate puzzle geometry) is never emitted — some-hero's
 *  kernel port models no plate/block puzzle system yet (see `adapt`'s
 *  own `plates: []`/`blocks: []` — the same "documented empty" as every
 *  other unported field). */
function buildTileMap(world) {
  const { rows, cols, walls, stairsAt, upstairsAt } = world;
  const map = new Uint8Array(rows * cols).fill(TL.TF);
  for (const key of walls) {
    const [x, y] = key.split(",").map(Number);
    map[y * cols + x] = TL.TW;
  }
  if (stairsAt) map[stairsAt.y * cols + stairsAt.x] = TL.SD;
  if (upstairsAt) map[upstairsAt.y * cols + upstairsAt.x] = TL.SU;
  return map;
}

/** observation → a `game`-shaped view-model the legacy renderer can
 *  consume (pure; see this file's header for the full "what's threaded
 *  vs. what's a documented empty" account). `observation` is whatever
 *  shared/module.js's `observe(state, world, viewer)` returns:
 *  `{zone, floorNum, character, run, knowledge, world}`. */
export function adapt(observation) {
  const { character, run, world } = observation;
  const playerPx = gridToPixel(character.pos);

  return {
    zone: observation.zone,

    // legacy/src/render/skins/index.js:10-12 — DEFAULT_SKIN. some-hero
    // has no cheat-menu/skin-selection ported yet; "pflum" (the game's
    // real, non-legacy setting) is the sane default rather than the
    // "desert" characterization-test skin.
    skin: "pflum",

    // Animation clock (drives torch flicker, water shimmer, the '!'
    // NPC-prompt bob, ...): no per-frame clock ported yet — documented
    // empty, fixed at 0. Every desert/pflum tileDeco fn that reads
    // `game.t` degrades gracefully at t=0 (a fixed phase, not a crash);
    // some-hero's tomb tiles (TF/TW/SD/SU) only consult `game.t` in the
    // SD "sealed" branch, which is a cosmetic pulse, not a correctness
    // concern for this PR's headless drawable proof.
    t: 0,

    // Camera/scroll offset: no viewport/windowing ported yet (a PR2/
    // client concern — screen-space follow-cam math never lived in the
    // kernel). Fixed at the origin; drawTiles's own culling loop
    // (legacy/src/render/tiles.js) still runs correctly against a
    // world-space-anchored camera, just always showing the top-left.
    cam: { x: 0, y: 0 },

    world: {
      map: buildTileMap(world),
      w: world.cols,
      h: world.rows,
      // Deterministic constant stand-in for legacy's per-cell decoration
      // hash (legacy/src/core/rng.js's makeHash2 — a PURE hash of (x,y),
      // never Math.random, but not something some-hero's kernel derives
      // or carries on `world` either). A fixed 0.5 only ever affects
      // COSMETIC tile decoration variance (dust flecks, coffee rings) —
      // never geometry/collision — so this is a documented simplification,
      // not a fidelity gap in anything gameplay-visible.
      h2: () => 0.5,
    },

    player: {
      x: playerPx.x,
      y: playerPx.y,
      hp: character.hp,
      maxhp: character.maxhp,
      potions: character.potions,
      gold: character.gold,
      swordLv: character.swordLv,
      // Facing direction: no facing state ported yet (some-hero's
      // five-tier State has no fx/fy field — see shared/reducer.js's
      // header, "legacy's pixel x/y/w/h/vx/vy/fx/fy/... fields are
      // dropped"). Fixed "facing south" (fx:0, fy:1), documented empty —
      // drawPlayer/drawNpc read it only for cosmetic eye/'!' placement.
      fx: 0,
      fy: 1,
      // Hit-flicker / attack-swing timers: no combat animation ported
      // yet (documented empty — `attack`/`ENEMY_HURT` exist in the
      // kernel, but no per-frame animation clock threads through them).
      inv: 0,
      atkT: 0,
    },

    // `run.enemies` (shared/reducer.js: `[{id,kind,pos,hp}]`) → pixel-
    // space renderer objects. `maxhp` is set to the CURRENT `hp` (the
    // kernel's run-scoped enemy shape carries no separate max — see this
    // file's own ENEMY_VISUALS comment) — a documented simplification:
    // health-bar rendering (legacy/src/render/actors.js's drawEnemy)
    // would show a full bar for any enemy that hasn't yet been struck,
    // which is correct for a freshly-spawned enemy and merely
    // un-threaded (not wrong) for one already damaged before this
    // observation was taken.
    enemies: run.enemies.map((e) => {
      const { r, col } = enemyVisual(e.kind);
      const p = gridToPixel(e.pos);
      return { id: e.id, kind: e.kind, x: p.x, y: p.y, hp: e.hp, maxhp: e.hp, col, r, w: r * 2, h: r * 2, flash: 0 };
    }),

    // ── Documented empties: unported fields (design spec: "Unported
    // fields emit stable empties"). Each is a stable, typed empty so the
    // shared legacy draw passes iterate zero elements rather than crash
    // on `undefined`.
    npcs: [], // no NPC entity tier ported yet
    boss: null, // no boss encounter ported yet
    parts: [], // no particle system ported yet
    blocks: [], // no pushable-block puzzle geometry ported yet
    torches: [], // no torch puzzle geometry ported yet
    traps: [], // no trap geometry ported yet
    pickups: [], // no on-floor pickup SPRITE rendering ported yet (world.pickupAt drives tile-entry COLLECTED events, not visible sprites)
    plates: [], // no pressure-plate puzzle geometry ported yet

    // The one puzzle field that IS threaded: `run.puzzle` (shared/
    // reducer.js's minimal `{type,solved,attempts}` shape, or `null`)
    // passed straight through. legacy/src/systems/puzzles.js's
    // `stairsOpen(game)` reads `game.puzzle.solved` for the one type
    // some-hero's port models ("riddle") and treats `null` as "always
    // open" — both cases some-hero's real State can be in.
    puzzle: run.puzzle,
  };
}
