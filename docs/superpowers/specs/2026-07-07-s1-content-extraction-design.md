# S1 — Ceremony Content Pack Extraction (design)

Date: 2026-07-07
Roadmap: DELTA.md PHASE 4 (SOME HERO: The Ceremony), step **S1**.
Targets: C1 (`packages/content` schema + compiler). Consumers: S2 (rules
port), S5 (the Ceremony acceptance gate).

## Charter (verbatim, DELTA.md S1)

> Ceremony-route content (Guild Hall map, Door Golem, credentials, one
> seal puzzle family, enemies for one floor, Ledger copy for the route)
> extracted from legacy into a `games/some-hero/content/` pack compiled
> by C1. Legacy code untouched. DoD: pack compiles; content review
> checklist (all strings present, hashes stable).

## What "the route" concretely is (resolved)

Traced through `legacy/src/systems/stairs.js`, `world/zones.js`,
`world/floorgen.js`, `entities/enemy.js`, `systems/{ledger,riddle,
puzzles,credentials}.js`, `content/golem.js`:

- **Guild Hall** = the village hub. In legacy it is *procedurally
  generated overworld terrain* (`world/overworld.js`, 72×72 noise) —
  there is **no authored map file**. → S1 **hand-authors a minimal
  `map:guild_hall`** (approach + the stairs-down tile the Door Golem
  gates). Porting the noise generator is S3/worldgen, explicitly out of
  scope (nothing about the desert terrain is needed for the Ceremony).
- **Door Golem** = pure narrative/logic in legacy (`content/golem.js` +
  `systems/credentials.js`); it has **no world entity**. → S1 authors
  `entity:door_golem` (`Identity`, `Interactable`, `Lock`) as the
  placement target S2 will wire the gate logic onto.
- **Seal puzzle family** = the **riddle door** (`systems/riddle.js`),
  fixed by `seal-stairs.ceremony.test.js` ("the seal used by the
  Ceremony route"). Not warden/plates/torch.
- **Enemy floor** = tomb floor 1: `skeleton`, `mailbat`, `consultant`
  (fightable) + `slime` ("the interns", passive). `cabinet` spawns
  floors 3+ — excluded.
- **Ledger copy** = `systems/ledger.js` (`HOUSE_STYLE`, `CAUSE_REPORTS`
  for the 4 reachable causes, `GRADES`/`gradeRemark`, `lootLine`,
  `union206Line`/`internLine`).

## Locked decisions (the brief's open questions, resolved)

1. **Guild Hall map**: minimal hand-authored ASCII-in-JS map, not the
   noise overworld. A stairs-down tile reachable from spawn is the bar;
   full walkable-hub is S5's concern if it ever needs it.
2. **Credential shape**: C3's `Credential{tier:number}` doesn't model
   three independent boolean gates. → **Three separate credential
   entities** (`credential_sword`, `credential_backstory`,
   `credential_debt`), each `Credential{tier:1}` as a presence marker.
   The Door Golem's `Lock.unlockCondition` is `all` of three `fact`
   checks. **No C3 change** — S1 is C3's first `Credential` consumer and
   informs (does not force) any future widening.
3. **Customs / suspicion-book copy** (`content/golem.js` customs beats):
   **excluded** — not in VISION's Ceremony sequence (descend → floor →
   seal → combat → death → resurrection → Ledger report). A later
   Ceremony-adjacent task's content.
4. **`lootLine` (sword/maxheart/amulet)**: **included** even though none
   drops on floor 1 — `ledger-text.ceremony.test.js` pins them as frozen
   behavior. Documented inline as authored-but-not-yet-reachable.
5. **Workspace**: `games/some-hero/` becomes an npm-workspace member for
   the first time — add `games/some-hero/package.json` in PR1 (the root
   `"games/*"` glob already covers it).
6. **Enemy stats**: no C3 combat component exists. → each enemy entity
   carries `Health{hp,max}` + an **opaque `Actor{...}` stat bag**
   (spd/dmg/xp/aggro/flags, verbatim from `entities/enemy.js`). C1 does
   not validate component shape (its orchestrator decision #4), so this
   is legal and mirrors C2's opaque-`Actor` precedent for topdown-puzzle.

Gray area noted for S2: the riddle's `numberOptions` is **logic** (S2),
even though the riddle *questions* are content (S1) — don't port half a
function.

## Inventory → C1 `{entities, tables, maps}`

Per the brief's inventory table (Door Golem, 3 credentials, stamp, 4
enemy kinds → `entities`; every Ledger/Door-Golem/riddle/seal string
list → `tables`, one id per legacy array/const; one hand-authored
`map:guild_hall`). Component names are exactly C3's vocabulary
(`Identity`/`Interactable`/`Lock`/`Credential`/`Portable`/`Health`/
opaque `Actor`). `Lock.unlockCondition` uses only the safe condition
language (`all`/`fact`/`cmp`). Table `rows` are plain `JsonValue[]`.

Every extracted string/number is **transcribed with a `file:line`
citation comment** to its legacy source (exactly as
`games/topdown-puzzle/content/entities.mjs` cites KyeScene.js) and must
be **byte-identical** to the legacy value.

## "Legacy code untouched" — mechanism

Hand-authored content sources under `games/some-hero/content/`,
transcribed by a human reading `legacy/src/**` — **not** a build-time
reader of legacy. `games/some-hero/content/*` must contain **no import
from `games/some-hero/legacy/`** — enforced by a grep-based
`no-legacy-import.test.js` (C3's repo-hygiene precedent), so the
guarantee is regression-proof, not just true-at-merge. (Tests *may*
import legacy constants for characterization — that's how the
content-review checklist proves byte-identity.)

## File layout (mirrors games/topdown-puzzle/content/)

```
games/some-hero/
  package.json                 # NEW — @golem-engine/some-hero workspace member
  content/
    entities.mjs               # EntityDef[] — Door Golem, 3 credentials, stamp, 4 enemies
    tables.mjs                 # table sources — Ledger/golem/riddle/seal copy (cited)
    guild-hall-map.mjs         # the one hand-authored MapSource
    build-pack.mjs             # assembles {name,version,entities,tables,maps}
    build.mjs                  # writes content/pack.json (frozen artifact, C4 pattern)
    index.mjs                  # re-exports compile helpers for tests
    pack.json                  # committed frozen RuntimePack — the DoD artifact
  tests/
    content-pack.test.js       # compiles clean; entity/table/map counts; no unused legend token
    content-review.test.js     # DoD checklist: every table === live legacy constant
    hash-stability.test.js     # C1's 3-property proof + C4 regen-is-a-no-op + golden hash
    no-legacy-import.test.js    # grep: content/* imports nothing from legacy/
```

## PR decomposition (sequential off main — NOT stacked)

Land structural risk first, mechanical transcription second, CI-gate
last. Each branches off the latest `main` after the prior merges.

- **PR1 — entities + Guild Hall map + workspace.** `entities.mjs`,
  `guild-hall-map.mjs`, `build-pack.mjs`/`build.mjs`/`index.mjs`,
  `package.json`, `content-pack.test.js` (structural), and the
  committed `pack.json` (tables may be `[]` this PR — schema-legal).
  DoD: `compile()` succeeds with zero errors; counts + no-unused-legend
  assertions pass. **This PR proves the Door-Golem/Credential/Lock/enemy
  content actually fits C1's schema** before the transcription labor.
- **PR2 — tables (the copy).** `tables.mjs` (all Ledger/golem/riddle/
  seal strings, cited) + `content-review.test.js` (each table asserted
  === the live legacy constant). DoD: all "strings present" assertions
  green.
- **PR3 — hash-stability + freeze:verify wiring.** golden hash constant,
  `hash-stability.test.js`, `no-legacy-import.test.js`, and the root
  `freeze:verify` script wired to run some-hero content verification.
  DoD (closes S1 verbatim): pack compiles; content review checklist;
  hashes stable.

This spec covers all three PRs; each PR implements its slice.

## Scope boundaries (S1 = content only)

No functions ported (S2), no floor generation (S3), no renderer (S4), no
`validate`/`reduce`/kernel wiring. Litmus for the implementer: **if it's
a `function` in legacy, it's S2's; if it's a string/number/const object/
array, it's S1's.** No frozen-fixture/golden/ceremony changes.
