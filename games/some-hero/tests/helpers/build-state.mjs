/* Test-only helpers for hand-building tiny Worlds/States directly (no
 * content-pack compilation needed) — used by reducer.test.js/
 * module.test.js/tick.test.js to exercise shared/reducer.js's reduce()/
 * shared/module.js's validate() against precise, minimal scenarios
 * without needing a whole ASCII floor. Mirrors games/topdown-puzzle/
 * tests/helpers/build-world.mjs's shape/rationale. */
import { createState, reduce } from "../../shared/reducer.js";

/** makeWorld({rows,cols,walls,spawn,stairsAt,...}) — walls is an array
 *  of [x,y] pairs (converted to the "x,y" Set keys shared/module.js's
 *  deriveWorldFromPack itself produces). Same shape deriveWorldFromPack
 *  returns, assembled by hand for precise test scenarios.
 *
 *  PR4 additions (docs/superpowers/specs/2026-07-07-s2c-pr4-combat-
 *  design.md), both optional and both matching deriveWorldFromPack's own
 *  field shapes exactly so combat/pickup unit tests can build precise,
 *  minimal Worlds without a whole compiled content pack:
 *   - `pickups`: an array of `[x, y, kind, amount]` tuples, converted to
 *     the same `Map<"x,y", {kind,amount}>` shape shared/module.js's
 *     "move" case reads (`world.pickupAt`).
 *   - `enemyTypes`: passed straight through as `kind -> stat bag`
 *     (deriveWorldFromPack's own `world.enemyTypes`) — hand-authored
 *     stat bags for tests, not derived from any pack. */
export function makeWorld({
  rows,
  cols,
  walls = [],
  spawn = { x: 0, y: 0 },
  stairsAt = null,
  pickups = [],
  enemyTypes = {},
  zone = "tomb",
  floorNum = 1,
  mapId = "map:test-world",
} = {}) {
  return {
    zone,
    floorNum,
    mapId,
    rows,
    cols,
    walls: new Set(walls.map(([x, y]) => `${x},${y}`)),
    spawn,
    stairsAt,
    pickupAt: new Map(pickups.map(([x, y, kind, amount]) => [`${x},${y}`, { kind, amount }])),
    enemyTypes,
  };
}

/** A freshly-entered state for `world` — folds one FLOOR_ENTERED event
 *  through the real reduce(), exactly as every fixture/host does
 *  (mirrors topdown-puzzle/tests/helpers/build-world.mjs's own
 *  loadedState()). */
export function floorEnteredState(world) {
  return reduce(createState(), world, {
    t: "FLOOR_ENTERED",
    zone: world.zone,
    floorNum: world.floorNum,
    mapId: world.mapId,
    seq: 1,
  });
}
