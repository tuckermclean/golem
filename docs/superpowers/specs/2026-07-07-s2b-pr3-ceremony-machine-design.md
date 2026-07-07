# S2b PR3 — The Ceremony State Machine (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 4 S2, **S2b PR3** (final S2b slice). Builds on S1
(content), S2a (rules, #41), S2b PR2 (state/tick, #42). Closes the **6
wired ceremony tests**; after this, all 62 ceremony tests are accounted
for (60 kernel-mirrored + 2 permanent scarab divergence). Combat/pickups/
`narrativeFacts` remain S2c.

## The real novelty: world-swap mid-session

some-hero's ceremony swaps worlds within one session (`ow` guild_hall ↔
`tomb` floor 1). No existing game does this — `packages/kernel`'s generic
`replay(core, world, log, initialState)` takes ONE `world` for a whole
log and would reduce post-transition events against the stale zone.

**Decision (locked):** a some-hero-**local** world-swap-aware fold — NOT
a `packages/kernel` change. `src/host.js`'s `hostCommit` re-derives
`world = deriveWorldFromPack(pack, state.world)` after any event that
changes `state.world`, before the next command. The determinism test
gets a local "segmented replay" helper (re-derive on world-change events,
else delegate to `core.reduce`). Keep the generic kernel untouched.

## The unified two-step slot (locked)

Both two-step protocols (ceremony-approval→descend, death→resurrection)
use ONE slot beside the five tiers, in the `seq`/`tick` "plumbing, not
game-domain" category:

```
state.pending: null | { kind: "ceremony" } | { kind: "resurrection", cause: string|null }
```

One event sets it; exactly one follow-up command verb consumes it and
performs the real transition. `"proceed"`/`"resurrect"` with no matching
pending → `Denial`. Consuming twice → no-op/deny (no second ceremony).

## Content-side: derive the gate

`deriveWorldFromPack` (PR2) currently treats the Door Golem token as
unmodeled geometry. PR3 extends it: scan legend entries whose resolved
components include `Lock` → attach `world.gate = { unlockCondition,
key }` to the derived World, independent of the golem's own (decorative)
tile — legacy's real check fires off the **stairs tile**, never the
golem's position (`legacy/src/systems/stairs.js:21-26`).

## Events + reducer cases (the design)

All gate/death checks are **sim-and-inspect derived events**, exactly
like topdown-puzzle's WIN/LOSE (`games/topdown-puzzle/shared/push.js`):
compute the primary event, fold through a throwaway `reduce`, inspect,
append derived events.

- **`move` onto `world.stairsAt`, `zone==="ow"`, `world.gate` present** →
  evaluate the gate via `evaluate(world.gate.unlockCondition, factLookup)`
  where `factLookup` reads `sim.character.swordLv>=1` /
  `sim.knowledge.credentials.backstory` / `...debt`:
  - **fail** → append `GOLEM_DENIED { missing: missingCredentials(sim.knowledge, sim.character.swordLv) }`. Reducer case is a **pure no-op** (the kernel-native "read-only on denial" / BITE). Reuse S2a's pinned `missingCredentials` for the list — `evaluate()` only decides pass/fail.
  - **pass & !`knowledge.golemApproved`** → append `GOLEM_APPROVED {}`. Reducer: `knowledge.golemApproved = true` + `state.pending = {kind:"ceremony"}`. Does NOT touch `world` (verdict must not reveal descent early).
  - **pass & already approved** → append `ENTERED_TOMB` directly (routine second entry).
- **`"proceed"`** — requires `state.pending?.kind==="ceremony"` (else `Denial`) → `[ENTERED_TOMB]` (clears pending).
- **`ENTERED_TOMB`** — `world={zone:"tomb",floorNum:1,mapId:<synthetic>}`, `run.runStats=newRunStats()`, `knowledge.runs++`/`day++`, `knowledge.credit` accrues interest, `character.pos=tombWorld.spawn`, clear pending. (Real generated floor is S3; synthetic fixture here.)
- **`EXITED_TOMB`** — voluntary ascent: `gradeRun`/`recordDepth` onto `knowledge`, `world` back to `{zone:"ow",floorNum:0,mapId:"map:guild_hall"}`, does NOT reset `run.runStats`. (Legacy `onGolemCustoms` gold-inspection branch cut → S2c heist.)
- **`move` onto tomb `stairsAt`, `zone==="tomb"`, `run.puzzle.type==="riddle"`, not solved** → append `RIDDLE_ASKED {}` (a legal event, NOT a `Denial`/toast, NOT a zone transition). Reuse S2a `nextRiddle`/`stairsOpen`/`sealMsg` untouched. Only the riddle branch; full puzzle system stays S2c. A minimal `run.puzzle={type,solved,attempts}` field is introduced just to drive this.
- **`"hurt <amount> [cause]"`** → `[HURT]`; sim-fold; if `character.hp<=0` append `DIED {cause}`. `DIED` reducer sets `state.pending={kind:"resurrection",cause}`. (Real damage sources are S2c; the 2 wired death tests set `hp:=0` directly.)
- **`"resurrect"`** — requires `state.pending?.kind==="resurrection"` → `[RESURRECTED]`.

### `RESURRECTED` reducer — the exact field list (locked)

Touches ONLY (mirrors `rules/meta.js` `respawnAtGuild` ← `legacy/respawn.js:21-58`):
- `knowledge`: `recordDeath(knowledge, cause)` (deaths++, lastCause, repeatCause streak). Nothing else in knowledge.
- `knowledge.credit`: `makeDeathPayment` garnishment in legacy order (deductible `ceil(gold/2)` FIRST, then min-payment+fee from the remainder). Order pinned by the BITE test.
- `character`: `gold -= deductible+garnish`, `potions=min(potions,1)`, `hp=maxhp`, `inv=0`, `atkT=0`. **`swordLv` untouched** (survives — character-tier equipment).
- `character.pos` = the `ow` map's derived **`world.spawn`** — NOT the legacy `VIL` pixel constant (meaningless against S1's 6×7 `map:guild_hall`). This is a necessary divergence from `rules/meta.js`'s pure `respawnAtGuild` (which keeps `VIL` for its own legacy-shaped mirror); the two are parallel, not shared. Document, don't copy VIL into the reducer.
- `run.runStats.died = true` — **spread-merge, do NOT replace** `runStats` (the "runStats only resets on new run, not death" invariant).
- `world`: if `zone==="tomb"` → `{zone:"ow",floorNum:0,mapId:"map:guild_hall"}`; if already `ow`, leave.
- clear `state.pending`.
- **Died runs are never graded** (legacy grades only in voluntary `exitTomb`, never in `respawnAtGuild`'s climb-out). Preserve 1:1; comment so no one "fixes" it.

## Test → event matrix (the 6 wired tests)

Per the brief's §8 matrix:
| Wired test | Commands | Events | Asserts |
|---|---|---|---|
| door-golem denial | move→stairs (incomplete) | `[MOVED,GOLEM_DENIED{missing}]` | missing list; no state change |
| door-golem two-step | move→stairs (approved), `proceed`, (exit), move again | `[MOVED,GOLEM_APPROVED]`,`[ENTERED_TOMB]`,`[EXITED_TOMB]`,`[ENTERED_TOMB]` | approved hidden until proceed; no 2nd ceremony |
| door-golem BITE | move→stairs (incomplete) | `[MOVED,GOLEM_DENIED]` | gold/deaths/zone unchanged |
| seal-stairs riddle-ask | enter tomb, set run.puzzle, move→stairs | `[MOVED,RIDDLE_ASKED]` | puzzle unchanged, no zone change |
| death same-world | enter tomb, hp:=0, resurrect | `[RESURRECTED]` | world back to ow (structural + serialized-snapshot equality); character per field list |
| death runStats-not-reset | enter tomb, runStats.kills:=7, hp:=0, resurrect | `[RESURRECTED]` | runStats.died=true, kills still 7 |

## "Same object" → byte-identical-serialized (locked)

- `game.world===owWorld` → `state.world` deep-equals the ow triple + snapshot `deriveWorldFromPack` serialized-form byte-identical before-tomb vs after-climb-out.
- `game.npcs===owNpcs` → **intentionally not mirrored** (no NPC/entity tier in some-hero's State yet); one-line doc citing future work, not silently dropped.
- `game.owSave===null` → vacuously satisfied (doctrine #1: World never stored); note, don't test-what-can't-fail.
- `game.puzzle===null` → falls out of `run`-scoped puzzle state being recreated on next `ENTERED_TOMB`.

## Fixture extension

`tests/fixtures/synthetic-floor.mjs` gains a `<` (Stairs Up) legend token
at spawn, derived as `world.upstairsAt` (mirroring `stairsAt`), to drive
the voluntary-ascent step. Test-fixture-only; never touches
`content/pack.json`.

## Cross-check test (locked in scope)

A property test asserting `evaluate(gate.unlockCondition, factLookup) ===
(missingCredentials(knowledge, swordLv).length === 0)` across the 2³
credential-boolean matrix — guards drift between the content-authored
`Lock.unlockCondition` and the hand-written `missingCredentials`.

## Mirror-test plan

Fill in the 3 deferred mirror files (`door-golem` 4→7, `seal-stairs`
14→15, `death-respawn-persistence` 8→10), importing `validate`/`reduce`/
`deriveWorldFromPack` from `shared/` + helpers from `rules/`. Mark the
`npcs`/`owSave` assertions "intentionally not mirrored" (not omitted).
Result: 60 real mirrors + 2 scarab divergence = all 62 accounted for.
Write the file-parity hygiene test asserting exactly this split.

## Gates

`freeze:verify` full chain green (legacy ceremony 62 unchanged, ceremony-
kernel 54→60). All workspaces fail 0. `content/pack.json` byte-unchanged
(hash golden intact). `check-bans` clean; `shared/` imports nothing from
`legacy/`. No frozen-fixture/golden/legacy change.

## Scope boundaries

No combat damage sources (S2c — `HURT`/`DIED` is the bridge, driven only
by direct `hp:=0` in tests), no pickups, no `narrativeFacts`, no full
puzzle system (only the riddle-ask branch + minimal `run.puzzle`), no real
floor generation (synthetic fixture; S3), no `onGolemCustoms` gold branch.
