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
 *  returns, assembled by hand for precise test scenarios. */
export function makeWorld({
  rows,
  cols,
  walls = [],
  spawn = { x: 0, y: 0 },
  stairsAt = null,
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
