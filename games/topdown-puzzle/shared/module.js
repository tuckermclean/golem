/* ── MODULE: topdown-puzzle's KernelCore (deriveWorld/validate/reduce) —
   see @golem-engine/kernel's GameModule shape and docs/superpowers/specs/
   2026-07-06-c4-topdown-port-design.md. PR1 scope only: the "move" verb
   (wall/bounds denial, diamond collection, push chains, the static
   memory-hole LOSE check, the diamond-count WIN check). No baddie/
   moving-block simulation and no "tick" verb yet — those are PR2's
   shared/tick.js + resolveTick.

   deriveWorld's "seed" is a level id, not an RNG seed (design doc's
   "structural decision #1": topdown-puzzle is authored content, not
   procedural — deriveWorld is a pure function of (committed content
   pack, levelId), same non-negotiable determinism, different world-DNA
   source). It is SYNCHRONOUS per the kernel's own discipline
   (packages/kernel/src/index.ts: "no async in validate/reduce/observe/
   affordances" extends to every GameModule): the compiled pack is
   loaded once, at module scope, via a plain synchronous readFileSync —
   deriveWorld itself never touches the filesystem. (PR3's browser
   client has no node:fs; it will need its own synchronous JSON-loading
   path — e.g. a bundler JSON import — which is out of PR1's scope.) ── */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { reduce } from "./reducer.js";
import { resolveMove } from "./push.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_PATH = join(HERE, "..", "content", "pack.json");

// Loaded once, synchronously, at module scope — see header comment.
const PACK = JSON.parse(readFileSync(PACK_PATH, "utf8"));

/** Resolve a map legend entry to a fresh (shallow-cloned) component bag:
 *  either an authored template entity's components (legendEntry.entity,
 *  the only form C2's TOKEN_LEGEND actually uses) or an inline component
 *  bag (legendEntry.components — schema-legal but unused by any of the
 *  six shipped levels). Grounded in the design doc's "the derivation
 *  itself" section. */
function resolveComponents(pack, legendEntry) {
  const template = legendEntry.entity ? pack.entities[legendEntry.entity] : undefined;
  const source = template ? template.components : legendEntry.components || {};
  const components = {};
  for (const [name, data] of Object.entries(source)) {
    components[name] = data && typeof data === "object" ? { ...data } : data;
  }
  return components;
}

/** Pure: given an already-loaded RuntimePack and a level id, derive the
 *  immutable World — walls/memoryHoles as Sets (geometry, never part of
 *  mutable state, mirroring golem-grid's dun.grid), initialEntities with
 *  deterministic ids + a fresh GridPosition, and diamondTotal. Factored
 *  out of deriveWorld() so callers with their OWN already-compiled pack
 *  can derive a world too — the PR1 mechanism-proof synthetic level
 *  (games/topdown-puzzle/tests/fixtures/synthetic-level.mjs) is never
 *  part of the committed content/pack.json, so its fixture toolchain
 *  (packages/testkit/tools/gen-tdp-solution-fixtures.mjs /
 *  verify-tdp-solution-fixtures.mjs) calls this directly instead of the
 *  production deriveWorld(levelId) below. */
export function deriveWorldFromPack(pack, levelId) {
  const mapId = `map:tdp_${levelId}`;
  const map = pack.maps[mapId];
  if (!map) {
    throw new Error(`deriveWorld: no such level "${levelId}" (expected map id "${mapId}")`);
  }

  const walls = new Set();
  const memoryHoles = new Set();
  const initialEntities = [];
  let diamondTotal = 0;

  for (let y = 0; y < map.cells.length; y++) {
    const row = map.cells[y];
    for (let x = 0; x < row.length; x++) {
      const token = row[x];
      if (token === map.floor) continue;
      const legendEntry = map.legend[token];
      if (!legendEntry) {
        throw new Error(`deriveWorld: level "${levelId}" cell (${x},${y}) uses unmapped token '${token}'`);
      }
      const components = resolveComponents(pack, legendEntry);
      const actor = components.Actor || {};
      const posKey = `${x},${y}`;

      // Walls/memory holes are static geometry — never entities, never
      // part of mutable state (mirrors dun.grid's static wall chars).
      if (actor.kind === "wall") {
        walls.add(posKey);
        continue;
      }
      if (actor.kind === "memory_hole") {
        memoryHoles.add(posKey);
        continue;
      }

      components.GridPosition = { x, y };
      if (legendEntry.facing) {
        components.Actor = { ...actor, facing: legendEntry.facing };
      }

      if (actor.kind === "player_start") {
        // Exactly one per level; the map marker becomes the ongoing
        // "player" kind (not the transient "player_start" spawn marker).
        components.Actor = { ...components.Actor, kind: "player", controlledBy: "player" };
        initialEntities.push({ id: "entity:player", components });
        continue;
      }

      if (actor.kind === "diamond") diamondTotal++;
      initialEntities.push({ id: `entity:${actor.kind}@${x},${y}`, components });
    }
  }

  if (!initialEntities.some((e) => e.id === "entity:player")) {
    throw new Error(`deriveWorld: level "${levelId}" has no player_start ('@') token`);
  }

  return { mapId, rows: map.rows, cols: map.cols, walls, memoryHoles, initialEntities, diamondTotal };
}

export function deriveWorld(levelId) {
  return deriveWorldFromPack(PACK, levelId);
}

export { reduce };

export function validate(ctx, cmd) {
  const { state, world } = ctx;
  if (state.over) {
    return { deny: "The puzzle is over. Reload the level." };
  }
  const [verb, ...rest] = String(cmd).trim().split(/\s+/);
  switch (verb) {
    case "move": {
      const dx = +rest[0];
      const dy = +rest[1];
      if (Math.abs(dx) + Math.abs(dy) !== 1) return []; // garbage deltas silently ignored (golem-grid's own move convention)
      return resolveMove(state, world, dx, dy);
    }
    default:
      return { deny: `The world does not know the verb "${verb}".` };
  }
}

/** Satisfies @golem-engine/kernel's KernelCore<World, State, Cmd> shape
 *  (deriveWorld/validate/reduce) structurally — no runtime dependency on
 *  the kernel package, same posture as games/golem-grid/shared/module.js. */
export const module = { deriveWorld, validate, reduce };
