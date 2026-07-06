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

// Mirrors shared/module.js's deriveWorld PR2 addition: every player
// entity carries a Health component (design doc decision #8's canonical
// "3 HP, 1 damage per contact" numbers).
export const PLAYER_MAX_HP = 3;

export function makePlayer(x, y, { hp = PLAYER_MAX_HP, max = PLAYER_MAX_HP } = {}) {
  const entity = makeEntity("entity:player", "player", x, y, { controlledBy: "player" });
  entity.components.Health = { hp, max };
  return entity;
}

/** A baddie entity — mirrors shared/module.js's deriveWorld PR2 addition
 *  (per-instance `moveDir`, always seeded to 1, same as legacy's
 *  addBaddie). `axis` is `"horizontal"` or `"vertical"`. */
export function makeBaddie(id, x, y, axis, moveDir = 1, extra = {}) {
  return makeEntity(id, "baddie", x, y, { axis, moveDir, hostile: true, ...extra });
}

/** A directional moving-block entity — `facing` is one of "N"/"S"/"E"/"W"
 *  (mirrors shared/module.js's deriveWorld attaching legendEntry.facing
 *  to the shared moving_block template). */
export function makeMovingBlock(id, x, y, facing, extra = {}) {
  return makeEntity(id, "moving_block", x, y, { facing, moves: true, ...extra });
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
