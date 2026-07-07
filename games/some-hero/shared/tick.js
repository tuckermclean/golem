/* ── TICK — the fixed-step tick bridge (DELTA S2 PR2, mirroring C4's own
   shared/tick.js precedent — see docs/superpowers/specs/
   2026-07-07-s2b-state-tick-design.md's "The systems (PR2 scope)").

   `resolveTick(state, world, seed)` is a pure helper, same shape as
   topdown-puzzle's own resolveTick: it returns an Event[] (never a
   Denial — a tick is never illegal).

   PR2/PR3 left this deliberately minimal (a no-op-or-advance counter):
   the synthetic tomb-floor-1 fixture had no autonomous movers yet. PR4
   (docs/superpowers/specs/2026-07-07-s2c-pr4-combat-design.md) is that
   extension: the skeleton family now steps toward the player and deals
   contact damage, following games/topdown-puzzle/shared/tick.js's own
   discipline almost exactly — sub-steps folded through a throwaway
   `reduce()` so each enemy sees the moves committed before it within the
   SAME tick, contact damage fires only on NEWLY-established contact
   (re-arms on separation, no ms/tick cooldown timer to model), and
   nothing here ever reads wall-clock time or unseeded randomness (only
   the fixed scan order + a fixed axis tie-break — no RNG needed at all,
   see `stepToward` below).

   `seed` is threaded through per the design spec's "movers/enemies act
   on tick, seeded via packages/random named channels — never
   Math.random" — the sanctioned nondeterminism path (`packages/random`'s
   `channel(seed, ...)`) for a FUTURE mover that needs one. The skeleton
   family's greedy step is fully deterministic from its own position and
   the player's (ties broken by a fixed axis order), so nothing draws
   from `seed` yet — reserved, not speculative, same posture as PR2/PR3's
   own unused param. */
import { reduce } from "./reducer.js";
import { T } from "../rules/constants.js";

function key(x, y) {
  return `${x},${y}`;
}
function inBounds(world, x, y) {
  return x >= 0 && y >= 0 && x < world.cols && y < world.rows;
}
function isWall(world, x, y) {
  return world.walls.has(key(x, y));
}

/* Canonicalization: legacy's `aggro` (content/entities.mjs's Actor bag,
   transcribed verbatim from legacy/src/entities/enemy.js's ENEMY_TYPES)
   is a continuous-PIXEL radius (e.g. skeleton: 150). Grid-cardinal
   movement (shared/module.js's own flagged divergence, "Movement
   canonicalization") has no pixel radius, so aggro is converted to a
   grid Manhattan-distance range via `Math.round(aggro / T)` — T=36 is
   legacy's OWN tile-size constant (legacy/src/constants.js:3, already
   ported byte-for-byte to rules/constants.js), so this is a real,
   documented canonicalization (not an invented conversion factor), same
   category as topdown-puzzle/shared/tick.js's own DAMAGE_PER_CONTACT. */
function aggroRangeTiles(actorType) {
  return Math.round((actorType.aggro || 0) / T);
}

/** Any hostile (non-passive) enemy in `s.run.enemies` within Manhattan
 *  distance 1 of the player ("on/adjacent-to", the design spec's own
 *  contact-damage wording) — first match in `s.run.enemies`' own fixed
 *  array order wins (deterministic; PR4 only ever has one enemy on the
 *  synthetic floor, so this never actually has to arbitrate a tie). Used
 *  both before this tick's enemies act ("was already in contact") and
 *  after ("is in contact now") — comparing the two is what makes
 *  "newly-established contact" fully state-derived, never wall-clock
 *  (mirrors games/topdown-puzzle/shared/tick.js's playerTouchingBaddie
 *  exactly, adjacency instead of exact-tile-match per this port's own
 *  wider contact rule). */
function playerTouchingHostile(s, enemyTypes) {
  const p = s.character.pos;
  for (const e of s.run.enemies) {
    const actorType = enemyTypes[e.kind] || {};
    if (actorType.passive) continue;
    const dist = Math.abs(e.pos.x - p.x) + Math.abs(e.pos.y - p.y);
    if (dist <= 1) return e;
  }
  return null;
}

/** Greedy one-cell step toward (tx,ty): move along whichever axis has
 *  the larger remaining distance; a tie (equal absolute distance, both
 *  nonzero) is broken by a FIXED axis order (x before y) — deterministic,
 *  no RNG needed (design spec: "ties by fixed axis order... — no
 *  Math.random"). Returns {dx,dy}, both 0 if already at (tx,ty). */
function stepToward(fromX, fromY, tx, ty) {
  const dx = tx - fromX;
  const dy = ty - fromY;
  if (dx === 0 && dy === 0) return { dx: 0, dy: 0 };
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return { dx: Math.sign(dx), dy: 0 };
  return { dx: 0, dy: Math.sign(dy) };
}

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

  const enemyTypes = world.enemyTypes || {};

  // Contact state going INTO this tick's own movement resolution — see
  // playerTouchingHostile's own header for why this is captured before
  // any enemy steps.
  const wasContact = playerTouchingHostile(state, enemyTypes);

  // Enemies step, in `state.run.enemies`' own fixed scan order (assigned
  // once at ENTERED_TOMB spawn time — "e0","e1",... — never reordered by
  // state; iterating the PRE-tick list, not `sim`'s, so an enemy killed
  // by something else this same tick is simply skipped below, same
  // "already destroyed earlier this tick" idiom topdown-puzzle's own
  // resolveTick uses for its moving-block/baddie loops).
  for (const initial of state.run.enemies) {
    const id = initial.id;
    const entity = sim.run.enemies.find((e) => e.id === id);
    if (!entity) continue; // killed earlier this same tick/log

    const actorType = enemyTypes[entity.kind] || {};
    if (actorType.passive) continue; // slime etc — never chases (design spec's "Scope boundaries")

    const player = sim.character.pos;
    const dist = Math.abs(player.x - entity.pos.x) + Math.abs(player.y - entity.pos.y);
    if (dist > aggroRangeTiles(actorType)) continue; // out of aggro range — no move this tick

    const { dx, dy } = stepToward(entity.pos.x, entity.pos.y, player.x, player.y);
    if (dx === 0 && dy === 0) continue; // already sharing the player's own tile

    const nx = entity.pos.x + dx;
    const ny = entity.pos.y + dy;
    const blockedByWall = !inBounds(world, nx, ny) || isWall(world, nx, ny);
    const blockedByEnemy = sim.run.enemies.some((e) => e.id !== id && e.pos.x === nx && e.pos.y === ny);
    if (blockedByWall || blockedByEnemy) continue; // silent retry next tick

    commit({ t: "ENEMY_MOVED", id, x: nx, y: ny });
  }

  // Contact damage: after all enemies have stepped. "Newly established"
  // = not touching at the start of this tick AND touching now — re-arms
  // once the two part ways (mirrors topdown-puzzle/shared/tick.js's own
  // wasInContact/isInContactNow discipline exactly; see this file's
  // header for why the wider "adjacent-to" rule is used here instead of
  // topdown-puzzle's exact-tile match).
  const nowContact = playerTouchingHostile(sim, enemyTypes);
  if (nowContact && !wasContact) {
    const dmg = (enemyTypes[nowContact.kind] || {}).dmg || 0;
    commit({ t: "HURT", amount: dmg, cause: nowContact.kind });
    // Derived DIED: sim-and-inspect, same bridge shared/module.js's own
    // "hurt" verb uses.
    if (sim.character.hp <= 0) {
      commit({ t: "DIED", cause: nowContact.kind });
    }
  }

  return events;
}
