# Warden-seal boss resolution — design

Date: 2026-07-07
Sixth and final tomb-**floor-seal** made progressable (after the five
puzzle seals riddle/traps/key/plates/torch #65-#69): the **warden seal** —
`stairsOpen` warden branch is `boss ? boss.dead : true`, and the seal
message is *"The seal holds — slay the Warden."* So a warden floor
(`floorNum % 4 === 0`) spawns a boss; killing it opens the stairs.

This ports the legacy dash-boss faithfully. Legacy `boss.js` is explicit:
*"The Reenactor (overworld) and floor Wardens share one shape and one
state machine"* — so the tomb warden is UNAMBIGUOUSLY the `mkBoss` /
`wardenStats` / `updateBoss` dash boss (`legacy/src/entities/boss.js` +
`legacy/src/systems/boss-ai.js`), a **separate** thing from the overworld
Door-Golem *credential* ceremony (the `GOLEM_DENIED`/`GOLEM_APPROVED` flow
in the "ow" zone). This PR is the tomb dash boss only.

Scope: the WARDEN seal only. The **final floor** (`type:"final"`, the
game-WIN) stays sealed/held — it needs a win/ending ceremony (a distinct
follow-up). The overworld Reenactor boss is also out of scope (ow zone).

## The legacy state machine (`boss-ai.js`, 40 lines)

`sleep → idle(creep) → tele(graph) → dash → idle...`, pixel/second-continuous:
- **sleep**: `dist < 170px` → idle, `timer=1s`, toast the telegraph line.
- **idle**: creep toward player at `34px/s`; after `1s` → tele, `timer=.55s`.
- **tele**: stand still `.55s` (the dodge window) → dash, `timer=.55s`,
  lock velocity `= dir * 430px/s`.
- **dash**: fly along the locked velocity for `.55s` → idle,
  `timer = 1.3 + rng()*.8 s`.
- Contact: `dist < (b.w+p.w)/2` px → `hurtPlayer(b.dmg)` (every overlapping
  frame).

## Canonicalization to the grid/tick kernel (TUNABLE — feel needs playtest)

Grid-cardinal, tick-discrete (same discipline as `shared/tick.js`'s
skeleton port: pixel radii → `round(px/T)`, `T=36`; per-tick cells; seeded
jitter via `@golem-engine/random` `channel`, never `Math.random`). **These
constants set game FEEL and CANNOT be verified headlessly — they are
proposed defaults the user should playtest-tune in the browser.** Put them
in one named `const WARDEN = {...}` block at the top of the boss module so
tuning is a one-line edit:

```js
const WARDEN = {
  aggroTiles: 5,   // round(170/36) — wake when player within Manhattan 5
  idleTicks: 3,    // creep steps before the telegraph
  creepCells: 1,   // cells/tick toward player during idle (skeleton-like)
  teleTicks: 2,    // telegraph window (boss stands still — the dodge beat)
  dashTicks: 3,    // dash duration
  dashCells: 2,    // cells/tick during dash (=> reach 6 in a straight line)
  cooldownBase: 4, // post-dash idle before re-aggro
  cooldownJitter: 3, // + channel-picked 0..(jitter-1), seeded
};
```

Rationale for `dashCells*dashTicks = 6`: legacy dash ≈ `430px/s * .55s /
36 ≈ 6.5` tiles — round to 6.

## State model

Add a **`run.boss`** slot (null on non-warden floors), a sibling of
`run.enemies`, carrying the runtime boss:
```
{ id: "boss", kind: "warden", pos:{x,y}, hp, maxhp, dmg, name, telegraph,
  state: "sleep", timer: 0, dashDir: null, dead: false }
```
`initBoss(floorBoss)` builds this from floorgen's
`{kind,x,y,stats:{hp,dmg,name,telegraph,maxhp}}` (pos from x/y; state
"sleep"; timer 0; dead false).

## Changes

### `shared/module.js`

1. **Spawn threading** — `enteredTombEvent`/`descendedEvent` already read
   the floorgen floor. Add `ev.boss = floor.boss ? initBoss(floor.boss) :
   null` to BOTH (floor 1 is never a warden, so ENTERED_TOMB's is always
   null — thread it anyway for symmetry). `initBoss` lives here (pure).
2. **Descend un-exclusion** (move case ~667-674): change the tomb-descend
   guard from
   `sim.run.puzzle.type !== "warden" && sim.run.puzzle.type !== "final" &&
    stairsOpen({ puzzle: sim.run.puzzle, boss: null })`
   to
   `sim.run.puzzle.type !== "final" && stairsOpen({ puzzle: sim.run.puzzle,
    boss: sim.run.boss })`.
   Now `stairsOpen`'s warden branch (`boss?boss.dead:true`) opens the
   stairs once the boss is dead; `final` stays excluded (still sealed);
   every non-warden puzzle passes `run.boss` (null) harmlessly (its own
   `type` branch decides). No `stairsOpen` change (already ported).
3. **`attack` — target the boss.** After the enemy lookup, also resolve the
   boss: `const boss = state.run.boss && state.run.boss.id === id && !state.
   run.boss.dead ? state.run.boss : null;`. If `boss` (and no enemy): melee
   range check (Manhattan ≤ 1, same as enemies) → deny "Too far to strike"
   if far; else `WARDEN_HURT{amount: attackDamage(swordLv)}` carrying a
   fresh boss with `hp -= amount`; if the new hp ≤ 0 append `WARDEN_SLAIN`.
   Keep the existing enemy path byte-identical (the boss path only engages
   for `id === "boss"` on a live boss — no enemy uses that id). Torch
   lighting (#69) is unaffected. So `attack boss` is the strike.

### `shared/tick.js` — `resolveTick` boss state machine

After the enemy loop + contact block and the torch burn-down, advance the
boss (if `sim.run.boss && !sim.run.boss.dead`), one state-step per tick,
using a fresh boss object (never mutate). `commit` each change as
`WARDEN_ADVANCED{boss}` (dumb-copy event), and reuse the existing
`HURT`/`DIED` for player contact damage (same "newly-established
adjacency" rule the skeleton uses — capture `wasBossContact` before the
boss moves). The machine (all constants from `WARDEN`):
- **sleep**: if `manhattan(player,boss) <= aggroTiles` → `state:"idle",
  timer: idleTicks` (this is the "PERFORMANCE REVIEW" wake — `state`
  carries it for narration; no separate toast needed headless).
- **idle**: `stepToward` player `creepCells` (1) cell (wall/enemy-blocked →
  skip that step); `timer-1`; at ≤0 → `state:"tele", timer: teleTicks`.
- **tele**: stand still; `timer-1`; at ≤0 → `state:"dash", timer:
  dashTicks, dashDir: stepToward(boss→player)` (lock a single cardinal dir
  NOW — the telegraph committed to it).
- **dash**: move up to `dashCells` cells along `dashDir`, stopping at the
  first wall/out-of-bounds (partial dash); `timer-1`; at ≤0 → `state:
  "idle", timer: cooldownBase + pick`, where `pick = rint(channel(seed,
  "warden", String(tick)), cooldownJitter)` — the ONLY nondeterministic
  draw, seeded (the header already reserves `seed` for exactly this; import
  `channel`,`rint` from `@golem-engine/random`).
- After the boss moves, contact: `nowBossContact = manhattan ≤ 1`; if
  `nowBossContact && !wasBossContact` → `HURT{amount: boss.dmg, cause:
  "warden"}`, and if `sim.character.hp <= 0` → `DIED{cause:"warden"}`
  (same derived-DIED bridge the enemy block uses).

Emit `WARDEN_ADVANCED` whenever the boss's state/pos/timer changed (i.e.
every tick it isn't dead-or-sleeping-and-out-of-range). A sleeping boss
with the player out of range produces no event (clean idle tick). Guard so
non-warden floors (`run.boss` null) are byte-identical.

### `shared/reducer.js`

- `WARDEN_ADVANCED`: `run: { ...run, boss: { ...ev.boss } }` (dumb copy,
  BLOCK_PUSHED sibling).
- `WARDEN_SLAIN`: `run: { ...run, boss: { ...state.run.boss, dead: true } }`.
- `ENTERED_TOMB` / `DESCENDED`: set `boss: ev.boss ? { ...ev.boss } : null`
  in the rebuilt `run` (mirror how `enemies` is seeded). Non-warden events
  carry `ev.boss` null → `run.boss` null. Everything else unchanged.

## Tests (`games/some-hero/tests/warden-seal.test.js`, new)

Derive a warden floor via `deriveTombWorld(seed, 4)` (floor 4 = the first
warden). Build a `wardenFloorState(world, pos, bossPos?)` helper (seal-test
idiom): fold FLOOR_ENTERED, set `run.puzzle` from `world.puzzle`, set
`run.boss = initBoss(generateFloor(seed,4).boss)` (or expose `world.boss` —
simplest: have the test import `generateFloor` for the boss, like it
already may for geometry), optionally override `boss.pos`/`character.pos`,
and set `run.enemies: []` to isolate the boss from skeleton noise. Cover:
1. **Slay + descend**: put the player adjacent to the boss; `attack boss`
   ⌈hp/attackDamage⌉ times → the last yields `[WARDEN_HURT, WARDEN_SLAIN]`,
   `run.boss.dead===true`; then move onto `stairsAt` → `[MOVED, DESCENDED]`
   (floorNum→5, mapId `tomb:<seed>:0:5`, runStats preserved). Before death,
   moving onto the stairs is a silent `[MOVED]` (sealed).
2. **Attack range / id**: `attack boss` from >1 away → deny "Too far to
   strike."; `attack boss` with no boss on the floor (a non-warden floor,
   or after death) → the existing "nothing by that name" deny (byte-identical
   enemy path).
3. **State machine** (deterministic transitions): from a `sleep` boss with
   the player just outside `aggroTiles`, a `tick` leaves it asleep (no
   WARDEN_ADVANCED). With the player inside range: `tick` → idle; assert the
   full `sleep→idle(creep, boss steps 1 toward player)→…→tele(stands
   still)→dash(moves along the locked dir, stops at a wall)→idle(cooldown)`
   sequence over N ticks, checking `run.boss.state`/`pos`/`timer` at each
   step against hand-computed values for the chosen seed geometry.
4. **Contact damage**: position boss adjacent post-dash → the tick's
   contact fires `HURT{cause:"warden"}` once (newly-established), not again
   until separation; enough contact → `DIED`.
5. **Dash wall-stop**: aim the boss's dash at a wall a couple tiles away →
   it stops at the wall (partial dash), never enters the wall.
6. **Determinism**: replay a scripted log (a few ticks through the state
   machine incl. one seeded cooldown draw + a slay + descend) twice →
   identical `h32(serializeState(...))`. This is the proof the seeded
   `channel` jitter is deterministic.

Pick the seed/geometry via a short offline scan (a warden floor-4 whose
boss has a walkable aggro approach, a wall within a couple tiles for the
dash-stop test, and a clear stairs approach), documented in the test
header exactly like the seal tests name their seed's coordinates.

## Gates

`npm test` all workspaces fail 0; `test:ceremony` 62 / `test:ceremony-
kernel` 60 unchanged; `freeze:verify` green; `content/pack.json` + floor
goldens byte-unchanged; `check-bans` clean (the seeded `channel`/`rint`
jitter is the sanctioned path — NO `Math.random`); `shared/` imports
nothing new from `legacy/` (`stairsOpen` already imported; `channel`/`rint`
from `@golem-engine/random`). CRITICAL regressions to re-run: the existing
combat/tick tests (`determinism.test.js`, ceremony-kernel combat) and all
five seal tests — the boss changes are guarded to `run.boss`/`id==="boss"`,
so every non-warden attack/tick/descend MUST be byte-identical.

## Honest limitation (state it in the PR)

The state-machine LOGIC (transitions, dash geometry, contact, determinism)
is fully headlessly proven. The **feel/balance constants** (`WARDEN` block:
telegraph dodge-ability, dash reach, aggro range, cooldown) CANNOT be
verified without a browser playtest — they ship as reasoned defaults for
the user to tune. This is a real deliverable (warden floors are now
slay-to-descend progressable with the same headless rigor as the seals),
with the numeric feel flagged for the user's playtest, NOT faked.

## Scope boundaries

WARDEN seal only. Do NOT implement the `final`-floor game-win ceremony or
the overworld Reenactor. No content/golden change (floorgen already
produces the boss; this only reads it). Pure validate/reduce/tick.
