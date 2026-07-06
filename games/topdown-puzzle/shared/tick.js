/* ── TICK — the fixed-step tick bridge (DELTA C4 PR2, the task's novel
   deliverable). Ported from KyeScene.js's autonomous-movement code —
   startMovingBlock's tryMoveBlock loop (~933-991) for moving blocks,
   updateBaddie (~691-748) for baddies, and update()'s per-frame contact
   poll (~291-317) for damage — see docs/superpowers/specs/
   2026-07-06-c4-topdown-port-design.md's "Ground truth" and "The
   fixed-step tick bridge (the novel part)" sections for the full
   citation and the canonicalization this port makes explicit.

   `resolveTick(state, world, seed)` is a pure helper, same shape as
   push.js's `resolveMove`: it returns an Event[] (never a Denial — a
   tick is never illegal) built by threading a throwaway `sim` state
   through the real `reduce()` as each sub-step is resolved (the same
   sim-and-inspect idiom golem-grid's module.js / this package's push.js
   already use), so each subsequent step sees the effects of the steps
   before it within the SAME tick (this is what makes "not-yet-vacated
   cell" and "newly-established contact" well-defined without any
   wall-clock or mutable timer state — see the contact-damage section
   below).

   `seed` is threaded through per the design's orchestrator decision #4
   ("Named channels: ship deterministic") — the sanctioned nondeterminism
   path (`packages/random`'s `channel(seed, ...)`) for a FUTURE mover that
   needs a coin flip. None of the six shipped levels' movers/baddies are
   actually nondeterministic (every one is a pure function of its own
   position/axis/direction and the deterministic world/state around it),
   so `seed` is accepted and otherwise unused here — reserved, not
   speculative (C3's "defined-for-later" precedent; nothing is drawn from
   it, and no random mover is invented to exercise it). */
import { reduce, entityAt, player } from "./reducer.js";

// Legacy's own startMovingBlock/updateBaddie direction deltas
// (up=dy:-1, down=dy:1, left=dx:-1, right=dx:1).
const FACING_DELTA = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

// Contact damage: the design's decision #8 canonical HP numbers ("3 HP,
// 1 damage per contact... 3 hits ⇒ LOSE") — small, legible values,
// documented as a canonicalization of legacy's inconsistent 20/100/10
// tuning, not a byte-port of it.
export const DAMAGE_PER_CONTACT = 1;

function key(x, y) {
  return `${x},${y}`;
}

function inBounds(world, x, y) {
  return x >= 0 && y >= 0 && x < world.cols && y < world.rows;
}

function actorKind(entity) {
  return entity && entity.components.Actor && entity.components.Actor.kind;
}

// Moving blocks: blocked by a wall, another chain-member entity (block/
// diamond/moving_block — same CHAIN_ACTOR_KINDS push.js's push-chain
// math recognizes), or the player's own tile. NOT blocked by a baddie —
// "No check against baddies exists (same collision-model gap as
// above) — a moving block can coexist on a baddie's tile" (ground
// truth). Memory holes are never registered as entities, so they never
// appear here; they're checked separately, below.
const MOVER_BLOCKING_KINDS = new Set(["block", "diamond", "moving_block"]);

// Baddies: blocked by a wall, a block, or a moving block ONLY — NOT
// other baddies, NOT the player, per the corrected-comment finding
// (updateBaddie's own comment claims "wall/block/baddie/player", but the
// executed code only ever consults getGridEntity, which contains
// neither baddies nor the player). Diamonds are explicitly passable too
// (nextEntity.getData('type') === 'diamond' allows the move) — so
// diamonds are deliberately absent from this set as well.
const BADDIE_BLOCKING_KINDS = new Set(["block", "moving_block"]);

function isMoverBlocked(sim, world, id, x, y, p) {
  if (!inBounds(world, x, y) || world.walls.has(key(x, y))) return true;
  if (p && p.components.GridPosition.x === x && p.components.GridPosition.y === y) return true;
  const occupant = entityAt(sim, x, y);
  return !!occupant && occupant.id !== id && MOVER_BLOCKING_KINDS.has(actorKind(occupant));
}

function isBaddieBlocked(sim, world, id, x, y) {
  if (!inBounds(world, x, y) || world.walls.has(key(x, y))) return true;
  const occupant = entityAt(sim, x, y);
  return !!occupant && occupant.id !== id && BADDIE_BLOCKING_KINDS.has(actorKind(occupant));
}

/** Any surviving baddie occupying the player's own tile, in `s`. Used
 *  both before this tick's movers act (state going into the tick — "was
 *  already in contact") and after (sim going out of it — "is in contact
 *  now"); comparing the two is what makes "newly-established contact"
 *  fully derivable from committed state, never wall-clock (see the
 *  contact-damage step below). */
function playerTouchingBaddie(s) {
  const p = player(s);
  if (!p) return false;
  const { x, y } = p.components.GridPosition;
  for (const e of s.entities.values()) {
    if (actorKind(e) === "baddie" && e.components.GridPosition.x === x && e.components.GridPosition.y === y) {
      return true;
    }
  }
  return false;
}

/** resolveTick(state, world, seed) → Event[] — always legal, per the
 *  design's numbered steps:
 *   1. TICK_ADVANCED{tick: state.tick+1}, first, always, exactly once.
 *   2. Moving blocks, in world.initialEntities' fixed scan order: one
 *      step in the entity's fixed facing; blocked → no event (silent
 *      retry next tick — the fixed cadence IS the retry, no separate
 *      "wait" state to track); memory hole → DESTROYED; else MOVED.
 *   3. Baddies, same fixed scan order: one step along the entity's
 *      axis; blocked → moveDir flips, MOVED always emitted (even when
 *      x,y are unchanged — the flip is itself a real state transition);
 *      memory hole → DESTROYED; else MOVED with the (unchanged) moveDir.
 *   4. Contact damage: once per newly-established player/baddie contact
 *      (decision #2's accepted simplification — no ms/tick cooldown
 *      timer; re-arms on separation).
 *   5. Derived LOSE: sim-and-inspect — resulting hp<=0 → LOSE. */
export function resolveTick(state, world, seed) {
  void seed; // reserved for a future nondeterministic mover — see header.

  const events = [];
  let sim = state;
  let seq = state.seq;
  const commit = (ev) => {
    events.push(ev);
    sim = reduce(sim, world, { ...ev, seq: ++seq });
  };

  commit({ t: "TICK_ADVANCED", tick: state.tick + 1 });

  // Contact state going INTO this tick's own movement resolution — the
  // "last tick" half of "newly-established (not already in contact last
  // tick)". Captured before any mover/baddie steps so it reflects
  // whatever committed state (prior ticks' movement, or an intervening
  // player move landing directly on a baddie's tile) already produced —
  // fully state-derived, no separate flag, no timer.
  const wasInContact = playerTouchingBaddie(state);

  // Moving blocks, fixed scan order (world.initialEntities is set once
  // at deriveWorld time and never reordered by state).
  for (const initial of world.initialEntities) {
    if (actorKind(initial) !== "moving_block") continue;
    const id = initial.id;
    const entity = sim.entities.get(id);
    if (!entity) continue; // already destroyed earlier this same tick/log
    const [dx, dy] = FACING_DELTA[entity.components.Actor.facing];
    const { x, y } = entity.components.GridPosition;
    const nx = x + dx;
    const ny = y + dy;
    const p = player(sim);

    if (isMoverBlocked(sim, world, id, nx, ny, p)) continue; // silent retry next tick

    if (world.memoryHoles.has(key(nx, ny))) {
      commit({ t: "DESTROYED", id });
    } else {
      commit({ t: "MOVED", id, x: nx, y: ny });
    }
  }

  // Baddies, same fixed scan order.
  for (const initial of world.initialEntities) {
    if (actorKind(initial) !== "baddie") continue;
    const id = initial.id;
    const entity = sim.entities.get(id);
    if (!entity) continue;
    const actor = entity.components.Actor;
    const axis = actor.axis;
    const moveDir = actor.moveDir;
    const dx = axis === "horizontal" ? moveDir : 0;
    const dy = axis === "vertical" ? moveDir : 0;
    const { x, y } = entity.components.GridPosition;
    const nx = x + dx;
    const ny = y + dy;

    if (isBaddieBlocked(sim, world, id, nx, ny)) {
      // Reflect: moveDir flips, position unchanged — but a MOVED event
      // is emitted regardless (the flip is a real, committed state
      // transition; nothing changes in `state` that wasn't recorded by
      // an event, per doctrine #3).
      commit({ t: "MOVED", id, x, y, moveDir: -moveDir });
      continue;
    }

    if (world.memoryHoles.has(key(nx, ny))) {
      commit({ t: "DESTROYED", id });
    } else {
      commit({ t: "MOVED", id, x: nx, y: ny, moveDir });
    }
  }

  // Contact damage: after all movers/baddies have stepped. "Newly
  // established" = NOT touching at the start of this tick (above) AND
  // touching now, after this tick's own movement resolution — re-arms
  // on separation (once the two part ways, `wasInContact` at the start
  // of a LATER tick will read false again, so contact can re-fire).
  const isInContactNow = playerTouchingBaddie(sim);
  if (isInContactNow && !wasInContact) {
    const p = player(sim);
    const hp = Math.max(0, p.components.Health.hp - DAMAGE_PER_CONTACT);
    commit({ t: "HURT", id: "entity:player", hp });
  }

  // Derived LOSE: sim-and-inspect (the same idiom push.js's resolveMove
  // uses for its own derived WIN check).
  const finalPlayer = player(sim);
  if (!sim.over && finalPlayer && finalPlayer.components.Health.hp <= 0) {
    commit({ t: "LOSE" });
  }

  return events;
}
