/* ── PUSH — push-chain math ported from KyeScene.js's getPushChain
   (~369-391) / pushBlocks (~445-509); see docs/superpowers/specs/
   2026-07-06-c4-topdown-port-design.md's "Ground truth" and
   "validate(ctx,cmd)" sections for the full citation. Farthest-to-
   nearest application, a length-2 cap (MAX_PUSH_CHAIN, the design's
   named constant for KyeScene's `if (chain.length > 2) return null`),
   memory-hole-reads-as-empty (memory holes are never grid entities —
   KyeScene's own "do NOT store in grid array" design), and diamond-
   always-collected-on-direct-step (this file only ever handles the
   PUSHED-diamond case; direct-step collection is resolveMove's own
   first branch, before push-chain resolution is even considered).

   Baddies are never chain members: KyeScene's own collision-model split
   means baddies are never registered in `this.grid`, so a baddie-
   occupied cell reads as empty to getPushChain exactly like a memory
   hole does. That makes a baddie-occupied landing cell ordinary open
   ground as far as THIS file is concerned; the perpendicular-shove
   interaction legacy layers on top of that (shoveBaddiePerpendicular)
   is PR2's tick.js concern (baddies do not exist as a validate-time
   collision concept until PR2), not modeled here. No shipped PR1 level
   or fixture exercises a baddie-occupied landing cell, so this is a
   documented deferral, not a silent gap. ─────────────────────────────── */
import { entityAt, player, reduce } from "./reducer.js";

export const MAX_PUSH_CHAIN = 2; // KyeScene's `if (chain.length > 2) return null`

const CHAIN_ACTOR_KINDS = new Set(["block", "diamond", "moving_block"]);

function key(x, y) {
  return `${x},${y}`;
}

function inBounds(world, x, y) {
  return x >= 0 && y >= 0 && x < world.cols && y < world.rows;
}

function isChainMember(entity) {
  const actor = entity && entity.components.Actor;
  return !!actor && CHAIN_ACTOR_KINDS.has(actor.kind);
}

/** Walk from (x, y) in direction (dx, dy), collecting consecutive
 *  block/diamond/moving_block entities (nearest first, farthest last).
 *  Returns `{ chain, landing: {x, y}, blocked, tooLong }`:
 *    - `landing` is the cell just past the last collected chain member
 *      — the farthest member's destination, if the push turns out legal.
 *    - `blocked` is true when that landing cell is a wall or out of
 *      bounds (a memory-hole landing is NOT blocked — pushing into one
 *      destroys the farthest member instead).
 *    - `tooLong` is true as soon as a 3rd consecutive chain member is
 *      found, mirroring KyeScene's own bail-during-the-walk behavior:
 *      the length check fires before the wall/bounds check ever runs on
 *      whatever lies past that 3rd member. */
export function getPushChain(state, world, x, y, dx, dy) {
  const chain = [];
  let cx = x;
  let cy = y;
  for (;;) {
    const occupant = entityAt(state, cx, cy);
    if (!isChainMember(occupant)) break;
    chain.push(occupant);
    if (chain.length > MAX_PUSH_CHAIN) {
      return { chain, landing: { x: cx, y: cy }, blocked: false, tooLong: true };
    }
    cx += dx;
    cy += dy;
  }
  const blocked = !inBounds(world, cx, cy) || world.walls.has(key(cx, cy));
  return { chain, landing: { x: cx, y: cy }, blocked, tooLong: false };
}

/** resolveMove(state, world, dx, dy) → Event[] | Denial — the full
 *  "move" resolution, per the design doc's numbered steps:
 *   1. wall/out-of-bounds denial
 *   2. direct diamond collection (always collects, never pushes)
 *   3. push-chain resolution (illegal-length / blocked-end denial, else
 *      one MOVED/DESTROYED per chain member, farthest first)
 *   4. otherwise plain movement
 *   5. static-world memory-hole LOSE check (the player's own final tile)
 *   6. dynamic-state diamond-count WIN check (sim-and-inspect — the
 *      same idiom games/golem-grid/shared/module.js's
 *      moveDerivedEvents already established: fold the primary events
 *      through a throwaway reduce and inspect the simulated result). */
export function resolveMove(state, world, dx, dy) {
  const p = player(state);
  if (!p) return [];
  const { x: px, y: py } = p.components.GridPosition;
  const nx = px + dx;
  const ny = py + dy;

  if (!inBounds(world, nx, ny) || world.walls.has(key(nx, ny))) {
    return { deny: "Stone does not negotiate." };
  }

  const target = entityAt(state, nx, ny);
  const events = [];

  if (target && target.components.Actor && target.components.Actor.kind === "diamond") {
    // tryMove's own rule: walking directly onto a diamond always
    // collects it, never pushes it (a diamond further down a chain,
    // shoved by a block, is a different code path — below).
    events.push({ t: "MOVED", id: "entity:player", x: nx, y: ny });
    events.push({ t: "COLLECTED", id: target.id });
  } else if (isChainMember(target)) {
    const { chain, landing, blocked, tooLong } = getPushChain(state, world, nx, ny, dx, dy);
    if (tooLong) return { deny: "That row will not budge — too many to push." };
    if (blocked) return { deny: "There is nowhere for it to go." };
    const intoHole = world.memoryHoles.has(key(landing.x, landing.y));
    for (let i = chain.length - 1; i >= 0; i--) {
      const member = chain[i];
      if (i === chain.length - 1) {
        if (intoHole) {
          events.push({ t: "DESTROYED", id: member.id });
        } else {
          events.push({ t: "MOVED", id: member.id, x: landing.x, y: landing.y });
        }
      } else {
        const nextPos = chain[i + 1].components.GridPosition;
        events.push({ t: "MOVED", id: member.id, x: nextPos.x, y: nextPos.y });
      }
    }
    events.push({ t: "MOVED", id: "entity:player", x: nx, y: ny });
  } else {
    events.push({ t: "MOVED", id: "entity:player", x: nx, y: ny });
  }

  if (world.memoryHoles.has(key(nx, ny))) {
    events.push({ t: "LOSE" });
  }

  // Dynamic-state derived WIN check: sim-and-inspect. The state discarded
  // here; only diamondsRemaining/over are read off it, exactly mirroring
  // what golem-grid's moveDerivedEvents reads off its own throwaway sim.
  let sim = state;
  let seq = state.seq;
  for (const ev of events) sim = reduce(sim, world, { ...ev, seq: ++seq });
  if (!sim.over && sim.diamondsRemaining === 0) {
    events.push({ t: "WIN" });
  }

  return events;
}
