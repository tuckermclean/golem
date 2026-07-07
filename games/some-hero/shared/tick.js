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
import { channel, rint } from "@golem-engine/random";
import { reduce } from "./reducer.js";
import { T } from "../rules/constants.js";

/* ── Warden-seal boss resolution (docs/superpowers/specs/2026-07-07-
   warden-boss-resolution-design.md's "Canonicalization to the grid/tick
   kernel"): the legacy pixel/second-continuous dash-boss AI (legacy/src/
   systems/boss-ai.js, 40 lines) canonicalized to grid-cardinal, tick-
   discrete steps — same discipline as this file's own skeleton port
   above (pixel radii -> round(px/T), T=36; per-tick cells; seeded jitter
   via @golem-engine/random's channel(), never Math.random). These are
   FEEL constants (aggro range, telegraph dodge window, dash reach,
   cooldown) the design spec flags as playtest-tunable defaults, not
   headlessly verifiable — kept in one named block so tuning is a
   one-line edit. */
export const WARDEN = {
  aggroTiles: 5, // round(170/36) — wake when player within Manhattan 5
  idleTicks: 3, // creep steps before the telegraph
  creepCells: 1, // cells/tick toward player during idle (skeleton-like)
  teleTicks: 2, // telegraph window (boss stands still — the dodge beat)
  dashTicks: 3, // dash duration
  dashCells: 2, // cells/tick during dash (=> reach 6 in a straight line)
  cooldownBase: 4, // post-dash idle before re-aggro
  cooldownJitter: 3, // + channel-picked 0..(jitter-1), seeded
};

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

/** The set of non-passive enemy IDs currently touching the player
 *  (Manhattan <= 1). Contact damage is tracked PER ID (adversarial-review
 *  find): the old single-`playerTouchingHostile` "is anyone touching"
 *  before/after test masked a SECOND enemy's brand-new contact whenever a
 *  DIFFERENT enemy was already glued to the player — so once one enemy sat
 *  on the player, every other enemy's fresh contact dealt no damage. */
function touchingHostileIds(s, enemyTypes) {
  const p = s.character.pos;
  const ids = new Set();
  for (const e of s.run.enemies) {
    if ((enemyTypes[e.kind] || {}).passive) continue;
    if (Math.abs(e.pos.x - p.x) + Math.abs(e.pos.y - p.y) <= 1) ids.add(e.id);
  }
  return ids;
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
  // `seed` (world.mapId, threaded by shared/module.js's "tick" case) is
  // now consumed below by the warden boss's post-dash cooldown jitter —
  // the series' first seeded nondeterminism. It stays reserved/unused for
  // every other mover (the skeleton family's greedy step needs no RNG at
  // all — see this file's own header).

  const events = [];
  let sim = state;
  let seq = state.seq;
  const commit = (ev) => {
    events.push(ev);
    sim = reduce(sim, world, { ...ev, seq: ++seq });
  };

  commit({ t: "TICK_ADVANCED", tick: state.tick + 1 });

  const enemyTypes = world.enemyTypes || {};

  // Contact state going INTO this tick's own movement resolution, tracked
  // per enemy id (see touchingHostileIds — a single before/after flag
  // masked other enemies' new contact).
  const wasTouchingIds = touchingHostileIds(state, enemyTypes);

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
  // Fire for the FIRST enemy (fixed array order) that is NEWLY touching —
  // i.e. touching now but not at the tick's start — regardless of whether
  // some OTHER enemy was already in contact (that masking was the bug).
  // One hit per tick is preserved (the port's contact model); it just
  // isn't suppressed by an unrelated already-touching enemy anymore.
  const p = sim.character.pos;
  const newlyTouching = sim.run.enemies.find((e) => {
    if ((enemyTypes[e.kind] || {}).passive) return false;
    const d = Math.abs(e.pos.x - p.x) + Math.abs(e.pos.y - p.y);
    return d <= 1 && !wasTouchingIds.has(e.id);
  });
  if (newlyTouching) {
    const dmg = (enemyTypes[newlyTouching.kind] || {}).dmg || 0;
    commit({ t: "HURT", amount: dmg, cause: newlyTouching.kind });
    // Derived DIED: sim-and-inspect, same bridge shared/module.js's own
    // "hurt" verb uses.
    if (sim.character.hp <= 0) {
      commit({ t: "DIED", cause: newlyTouching.kind });
    }
  }

  // Torch-seal burn-down (docs/superpowers/specs/2026-07-07-torch-seal-
  // resolution-design.md): each tick, every lit brazier loses one tick of
  // fuel; an expired one (tm <= 0) goes dark. The seal's time-pressure is
  // exactly this — it only holds if all braziers are lit within `time`
  // ticks of the first. Once solved, braziers stop burning (guarded). Pure:
  // a fresh torches array; emitted as TORCHES_BURNED only when something
  // actually changed (i.e. at least one brazier is lit).
  const tpz = sim.run.puzzle;
  if (tpz && tpz.type === "torch" && !tpz.solved && tpz.torches.some((to) => to.lit)) {
    const torches = tpz.torches.map((to) => {
      if (!to.lit) return to;
      const tm = to.tm - 1;
      return tm <= 0 ? { ...to, lit: false, tm: 0 } : { ...to, tm };
    });
    commit({ t: "TORCHES_BURNED", puzzle: { ...tpz, torches } });
  }

  // Warden-seal boss resolution (docs/superpowers/specs/2026-07-07-
  // warden-boss-resolution-design.md's "shared/tick.js — resolveTick
  // boss state machine"): advances the boss one state-step per tick,
  // guarded to `sim.run.boss && !sim.run.boss.dead` — every non-warden
  // floor (`run.boss` null) and every already-slain boss leave this
  // block a pure no-op, so no existing tick is affected. Never mutates
  // `sim.run.boss` — each branch below builds a fresh `next` boss object
  // (or leaves it `null`, meaning "no change this tick": a sleeping boss
  // with the player out of aggro range).
  if (sim.run.boss && !sim.run.boss.dead) {
    const boss = sim.run.boss;
    const player = sim.character.pos;
    // Contact state going INTO this tick's own boss action — captured
    // before the boss moves, same "newly-established adjacency" idiom
    // touchingHostileIds/wasTouchingIds use for the skeleton family above.
    const wasBossContact = Math.abs(boss.pos.x - player.x) + Math.abs(boss.pos.y - player.y) <= 1;

    let next = null; // null = no state/pos/timer change this tick (asleep, out of range)
    // Whether the boss's dash PATH grazed adjacent to the player mid-move
    // (adversarial-review find: a >1-cell dash could pass through a tile
    // adjacent to the player yet end far away, so a start/end-only contact
    // check missed it — legacy checks contact continuously along the move).
    let dashGrazed = false;

    if (boss.state === "sleep") {
      const dist = Math.abs(boss.pos.x - player.x) + Math.abs(boss.pos.y - player.y);
      if (dist <= WARDEN.aggroTiles) {
        // The "PERFORMANCE REVIEW" wake — `state` alone carries it for
        // narration; no separate toast needed headless (design spec).
        next = { ...boss, state: "idle", timer: WARDEN.idleTicks };
      }
    } else if (boss.state === "idle") {
      // Creep one cell toward the player (wall/enemy-blocked -> skip
      // this step, same silent-retry idiom the skeleton loop above
      // uses) — this ALSO drives the post-dash cooldown wait, which is
      // just "idle" with a longer starting timer (see the dash branch).
      const { dx, dy } = stepToward(boss.pos.x, boss.pos.y, player.x, player.y);
      let pos = boss.pos;
      if (dx !== 0 || dy !== 0) {
        const nx = boss.pos.x + dx;
        const ny = boss.pos.y + dy;
        const blocked =
          !inBounds(world, nx, ny) ||
          isWall(world, nx, ny) ||
          sim.run.enemies.some((e) => e.pos.x === nx && e.pos.y === ny);
        if (!blocked) pos = { x: nx, y: ny };
      }
      const timer = boss.timer - 1;
      next =
        timer <= 0
          ? { ...boss, pos, state: "tele", timer: WARDEN.teleTicks }
          : { ...boss, pos, timer };
    } else if (boss.state === "tele") {
      // Stand still — the dodge window. Never moves, even on the tick
      // that transitions into "dash".
      const timer = boss.timer - 1;
      next =
        timer <= 0
          ? {
              ...boss,
              state: "dash",
              timer: WARDEN.dashTicks,
              // Lock a single cardinal direction NOW — the telegraph
              // committed to it (design spec: "stepToward(boss->player)").
              dashDir: stepToward(boss.pos.x, boss.pos.y, player.x, player.y),
            }
          : { ...boss, timer };
    } else if (boss.state === "dash") {
      // Fly up to dashCells cells along the locked dashDir, stopping at
      // the first wall/out-of-bounds (a partial dash) — never checks
      // enemy occupancy (unlike idle's creep), matching the design
      // spec's own wording.
      let pos = boss.pos;
      for (let i = 0; i < WARDEN.dashCells; i++) {
        const nx = pos.x + boss.dashDir.dx;
        const ny = pos.y + boss.dashDir.dy;
        if (!inBounds(world, nx, ny) || isWall(world, nx, ny)) break;
        pos = { x: nx, y: ny };
        // Register a graze at EVERY cell the dash passes through — a fast
        // boss shouldn't slip past an adjacent player uncounted.
        if (Math.abs(pos.x - player.x) + Math.abs(pos.y - player.y) <= 1) dashGrazed = true;
      }
      const timer = boss.timer - 1;
      if (timer <= 0) {
        // The ONE seeded, nondeterministic draw in the whole state
        // machine (design spec's "DETERMINISM" section) — everything
        // else here is a pure function of position/timer. `seed` is
        // resolveTick's own param (world.mapId, per shared/module.js's
        // "tick" case); `sim.tick` is the just-advanced tick number
        // (this tick's own TICK_ADVANCED, committed at the top).
        const rng = channel(seed, "warden", String(sim.tick));
        const pick = rint(rng, WARDEN.cooldownJitter);
        next = { ...boss, pos, state: "idle", timer: WARDEN.cooldownBase + pick, dashDir: null };
      } else {
        next = { ...boss, pos, timer };
      }
    }

    if (next) {
      commit({ t: "WARDEN_ADVANCED", boss: next });
    }

    // Contact damage: after the boss's own action above (or none, if it
    // stayed asleep). "Newly established" = not touching at the start of
    // this tick AND touching now — same re-arms-on-separation rule the
    // skeleton contact block uses (see this file's header/that block's
    // own comment); reuses HURT/DIED, the same derived-DIED bridge.
    const movedBoss = sim.run.boss;
    const nowBossContact =
      dashGrazed || Math.abs(movedBoss.pos.x - player.x) + Math.abs(movedBoss.pos.y - player.y) <= 1;
    // `sim.character.hp > 0` guard (adversarial-review find): a skeleton's
    // own contact block, earlier in THIS same tick, may have already driven
    // the player to hp <= 0 and emitted HURT/DIED — the boss must not fire a
    // SECOND HURT/DIED pair (double death, clobbered pending.cause).
    if (nowBossContact && !wasBossContact && sim.character.hp > 0) {
      commit({ t: "HURT", amount: movedBoss.dmg, cause: "warden" });
      if (sim.character.hp <= 0) {
        commit({ t: "DIED", cause: "warden" });
      }
    }
  }

  return events;
}
