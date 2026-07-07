# S2c PR4 — Combat + pickups + enemy entity tier (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 4 S2, **S2c PR4** (first S2c slice). Builds on S1
(content), S2a (rules), S2b (state machine + tick bridge). **Closes 0
ceremony tests** — combat/pickups are not characterization-tested (the
ceremony suite never spawns an enemy or a pickup). This is a
design-freedom / playability slice, proven by its own unit + determinism
tests, mirroring topdown-puzzle's baddie/contact precedent
(`games/topdown-puzzle/shared/tick.js`). `narrativeFacts` is PR5; S2
closure is PR6.

## The new design surface: an entity tier

some-hero's five-tier `State` has no entity/NPC list. Combat needs enemy
instances. **Decision (locked):** enemies live as a `run`-scoped list
(they're per-descent, wiped on `ENTERED_TOMB`, gone on exit/death):

```
run.enemies: [ { id: string, kind: "skeleton"|..., pos: {x,y}, hp: number } ]
```

- **Deterministic serialization**: `serializeState` must emit
  `run.enemies` in a stable order (sorted by `id`) so h32 is
  reproducible. `id` is assigned deterministically at spawn (e.g.
  `"e"+index` from the floor's enemy tokens, or channel-derived — never
  `Math.random`).
- Enemy stats (hp/spd/dmg/aggro/flags) come from the **content pack's
  enemy entities** (`content/entities.mjs` `enemy_skeleton` etc., the
  opaque `Actor` bag) via `deriveWorldFromPack` — `world.enemyTypes[kind]`
  — so the reducer reads stats from `world`, not hardcoded.
- Spawns: the synthetic floor fixture gains enemy tokens (test-fixture
  only, never `content/pack.json`); `ENTERED_TOMB` seeds `run.enemies`
  from the derived world's spawn list.

## Combat (skeleton family for the DoD)

Only the **skeleton** family is built (the DoD's "one enemy family";
`content/entities.mjs`'s skeleton has no ghost/passive/retaliate flags —
the simplest). The other three kinds' stats exist in content but their
special behaviors defer past PR4 (documented).

- **Enemy stepping on `TICK_ADVANCED`** (`shared/tick.js`'s `resolveTick`,
  the C4 bridge): each enemy, if the player is within its `aggro` range,
  steps one grid cell toward the player (Manhattan/greedy, deterministic;
  ties broken by a fixed axis order, or seeded via
  `channel(seed,"enemy",id,tick)` — no `Math.random`). Blocked by walls/
  other enemies → no move. Sub-steps fold through `reduce` so each enemy
  sees prior enemies' moves (topdown-puzzle's exact discipline).
- **Contact damage**: after stepping, any enemy on/adjacent-to the player
  (match legacy's contact rule) → append a `HURT { amount: enemyDmg,
  cause: kind }` (reuse S2b's `HURT`/`DIED` bridge — contact is now a
  real damage *source*). Player hp≤0 → `DIED` (existing path).
- **Player attack**: a new `"attack"` verb (or attack-on-move-into-enemy)
  → `ENEMY_HURT { id, amount }`; enemy hp≤0 → `ENEMY_KILLED { id, kind }`
  whose reducer removes it from `run.enemies` and does
  `run.runStats.kills++`, `run.runStats.killsByKind[kind] = (…||0)+1`
  (feeds the riddle's kills-by-kind question + the Ledger). Reuse S2a's
  logic where it exists.

## Pickups / inventory

Gold/potion tokens on the floor → collected on tile-entry (the `MOVED`
event's sim-and-inspect, like the gate check): landing on a pickup tile
appends `COLLECTED { kind, amount }` → `character.gold += …` /
`character.potions += …` / `character.inv += …`. Minimal — only what a
playable Ceremony floor needs; consumption/use of potions can defer.

## Doctrine / discipline

- Reducer pure/identity-blind/copied-on-write; `run.enemies` deep-copied
  on any enemy mutation. No mutation of input state.
- All enemy RNG via `packages/random` `channel()` — `Math.random`/
  `Date.now` banned. Determinism: a scripted session with enemies
  stepping + combat replays byte-identically through `replay()`
  (segmented-replay if it crosses zones).
- `shared/` imports nothing from `legacy/`. `content/pack.json`
  byte-unchanged (enemies-on-floor is the synthetic test fixture; the
  enemy *types* are already in the committed pack from S1).

## Tests

- `combat.test.js`: enemy steps toward player deterministically; blocked
  by walls; contact damage → `HURT`; attack → `ENEMY_HURT`/`ENEMY_KILLED`
  + `killsByKind`.
- `pickups.test.js`: tile-entry collection → `character` deltas.
- Extend the determinism test: a session with enemy stepping + a kill +
  a pickup → byte-identical replay hash.
- `serializeState` stable-orders `run.enemies` (a test pinning order-
  independence).
- **Gates unchanged**: legacy `test:ceremony` 62, `test:ceremony-kernel`
  60, `freeze:verify` full chain green, `content/pack.json`
  byte-unchanged. **0 new ceremony tests closed — say so.**

## Scope boundaries

Only the skeleton family (other kinds' special flags defer). No
`narrativeFacts` (PR5). No potion *use*, no full inventory UI, no ranged/
special attacks, no real floor generation (synthetic fixture; S3). No
renderer (S4). The enemy tier is the minimum to make the tomb floor a
live combat space for S4/S5 playability.
