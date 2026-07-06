/* Test-only helpers for hand-building tiny Worlds/entities directly (no
 * content-pack compilation needed) — used by module.test.js/push.test.js
 * to exercise shared/module.js's validate()/shared/push.js's
 * resolveMove()/getPushChain() against precise, minimal scenarios
 * (walls, a single push chain, a memory hole) without needing a whole
 * ASCII level. Mirrors the shape shared/module.js's deriveWorldFromPack
 * produces — same World/Entity fields, just assembled by hand. */
import { createState, reduce } from "../../shared/reducer.js";

export function makeEntity(id, kind, x, y, extra = {}) {
  return {
    id,
    components: {
      Identity: { name: kind },
      GridPosition: { x, y },
      Actor: { kind, ...extra },
    },
  };
}

export function makePlayer(x, y) {
  return makeEntity("entity:player", "player", x, y, { controlledBy: "player" });
}

/** makeWorld(rows, cols, {walls, memoryHoles, entities}) — walls/
 *  memoryHoles are arrays of [x,y] pairs (converted to the "x,y" Set
 *  keys shared/module.js's deriveWorld itself produces). diamondTotal
 *  is derived from `entities` the same way deriveWorld counts it. */
export function makeWorld(rows, cols, { walls = [], memoryHoles = [], entities = [] } = {}) {
  const diamondTotal = entities.filter((e) => e.components.Actor?.kind === "diamond").length;
  return {
    mapId: "map:tdp_test",
    rows,
    cols,
    walls: new Set(walls.map(([x, y]) => `${x},${y}`)),
    memoryHoles: new Set(memoryHoles.map(([x, y]) => `${x},${y}`)),
    initialEntities: entities,
    diamondTotal,
  };
}

/** A freshly-loaded state for `world` — folds one LEVEL_LOADED event
 *  through the real reduce(), exactly as every fixture/host does. */
export function loadedState(world) {
  return reduce(createState(), world, { t: "LEVEL_LOADED", seq: 1 });
}
