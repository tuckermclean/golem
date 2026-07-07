# S2a — Ceremony Rules Port: pure helpers layer (design)

Date: 2026-07-07
Roadmap: DELTA.md PHASE 4 **S2** (Rules port), **first of three specs**
(S2a = PR1 here; S2b = state model / tick bridge / ceremony state
machine; S2c = combat / narrativeFacts / closure). Builds on S1 (content
pack). Targets C1 tables + the `@ceremony` characterization suite.

## The load-bearing finding (why this split)

Of the **62 `@ceremony` tests**, ~49 are **pure-function tests**: they
build a plain `game`/`meta` object via `helpers.js`'s `blankGame`/
`createMeta` and call a legacy helper directly — never touching movement,
collision, an enemy, a pickup, or a zone transition. So a pure `rules/`
layer alone turns the large majority of the DoD green with **zero
kernel-integration risk**. S2a is exactly that layer. The wired
state-machine tests (~13) are S2b/S2c.

## S2a scope (PR1)

Move the pure Ceremony logic to `games/some-hero/rules/`, table-fed from
S1's `content/pack.json`, and prove it against a **new kernel-mirror
test suite** that reproduces the ceremony assertions importing from
`rules/` instead of `legacy/`.

### Helpers to port (pure, in this order)

Per DELTA's "pure helpers first" + the ceremony-test matrix:
- `systems/puzzles.js` → `rules/puzzles.js`: `stairsOpen`, `sealMsg`
- `systems/riddle.js` → `rules/riddle.js`: `nextRiddle`, `answerRiddle`,
  `doorSigh`, `tombQuestLine` (rng injected as a parameter, as legacy
  already does: `nextRiddle(game, rng = game.rng)`)
- `systems/credentials.js` → `rules/credentials.js`: `missingCredentials`,
  `swordVerdict`, `grantBackstory`, `grantDebt`, `entryLines`,
  `approvalLines` (the last two consume `table:door_golem_*`)
- `systems/credit.js` → `rules/credit.js`: all exports (`aprFor`,
  `tierName`, `creditLimit`, `canBorrow`, `borrow`, `accrueInterest`,
  `minPayment`, `makeDeathPayment`, `payDown`, `truthInLending`,
  `SCORE_*`)
- `systems/ledger.js` → `rules/ledger.js`: `deathReport`, `gradeRun`,
  `gradeRemark`, `lootLine`, `ledgerize`, `union206Line`, `internLine`
  (consume `table:ledger_*`)
- `core/meta.js` pure setters → `rules/meta.js`: `createMeta`,
  `recordDeath`, and the other pure state setters the tests exercise

### The table-consumption seam

S1 already extracted every string these functions branch on into
`content/pack.json` tables (`table:seal_messages`, `table:riddle_*`,
`table:ledger_*`, `table:door_golem_*`). **`rules/` is the first repo
consumer of `pack.tables`.** Each helper looks up `pack.tables[id].rows`
instead of a hardcoded array/object, reconstructing interpolated strings
from `tables.mjs`'s `parts` arrays exactly the way legacy's own
concatenation did (e.g. `sealMsg({type:"plates",done,need})` =
`parts[0] + done + parts[1] + need + parts[2]`). The pack is loaded once
(module-level) via the some-hero content `index.mjs`/`compileContentPack`
— no per-call recompile.

### Purity / doctrine

- Pure, synchronous, no DOM, no `Math.random`/`Date.now` (rng injected).
- Importable by both a browser bundle and node tests ("no logic forked").
- `rules/` imports **nothing** from `legacy/` (enforced, see tests).
- `swordLv` is **character-tier**, read live — NOT persisted, NOT
  "knowledge" (the credential-acquisition test pins this explicitly).
- `meta`'s permanent facts are a plain `knowledge`-shaped object — do
  **NOT** force them through C3's `Knowledge{knows:string[]}` component
  (reserved for L7's NPC memory). The `Lock.unlockCondition` from S1 is
  satisfied later (S2b) by a `FactLookup` closure, no component conflict.

## The kernel-mirror test mechanism (decided)

Do **NOT** edit `games/some-hero/ceremony/*.ceremony.test.js` — they are
the frozen spec and `freeze:verify`'s `test:ceremony` must keep running
them against `legacy/` unchanged until S5 archival.

Instead add a **new, parallel mirror suite**:
`games/some-hero/rules/tests/ceremony-kernel/<area>.kernel.test.js`, one
file per ceremony area, each assertion transcribed with a
`ceremony/<file>.ceremony.test.js:<line>` citation, importing from
`rules/` instead of `legacy/`. Wire a new **additive** script
`test:ceremony-kernel` into `freeze:verify` (never replacing
`test:ceremony`). This makes "every `@ceremony` test passes against the
kernel implementation" machine-checkable while the legacy characterization
gate stays intact. (A file-parity hygiene test — one mirror per ceremony
file — lands in S2c/PR6 once all areas are covered.)

## PR1 DoD (which ceremony tests go green via the mirror)

PR1 closes, in the mirror suite:
- **`credit-apr`** — fully (the one `respawnAtGuild`-on-`blankGame` test
  runs on a plain object, no real zone — safe here).
- **`credential-acquisition`** — fully (7/7 pure).
- **`ledger-text`** — fully (all pure, table-fed).
- **`seal-stairs`** — the ~14/15 pure helper tests (the 1 real
  `handleStairs`-on-a-tomb-floor test defers to S2b).
- **`door-golem`** — the ~4/7 pure tests (`missingCredentials`/
  `swordVerdict`/`entryLines`/`approvalLines`); the 3 gate/zone tests
  defer to S2b.
- **`death-respawn-persistence`** — the ~8/10 pure-object tests
  (`respawnAtGuild`/`hurtPlayer`/`recordDeath` on plain objects); the 2
  real-zone tests defer to S2b.

Every mirror assertion must be **byte-identical** in expectation to the
legacy ceremony assertion it cites (the whole point — the port is
correct iff it produces the same values legacy does).

## Tests & gates (S2a)

- `rules/tests/*.test.js` — direct unit tests of the ported helpers
  (can double as / be folded into the mirror suite where the ceremony
  test IS the unit test).
- `rules/tests/ceremony-kernel/*.kernel.test.js` — the mirror suite.
- `rules/tests/no-legacy-import.test.js` — grep gate: `rules/*.js`
  imports nothing from `legacy/` (mirror S1's
  `games/some-hero/tests/no-legacy-import.test.js`, same quoted-specifier
  regex so prose citations don't false-trip).
- `test:ceremony-kernel` wired additively into root `freeze:verify`.
- `test:ceremony` (legacy) unchanged and still green.

## Scope boundaries (S2a = pure helpers only)

No `validate`/`reduce`, no state model, no tick bridge, no movement/
collision, no combat, no zone transitions, no `narrativeFacts`, no
`packages/world`. If a ceremony test needs a real `handleStairs`/
`enterTomb`/zone, it is **out of scope for S2a** and named in the
deferred list above. No frozen-fixture/golden/legacy change.

## Deferred to S2b/S2c (not this PR)

Five-tier persistence mapping (world/run/character/knowledge/profile),
grid movement canonicalization, the two-step Door Golem ceremony state
machine, resurrection-as-reduce, combat (skeleton family), pickups,
`narrativeFacts` shape, the synthetic tomb-floor-1 fixture. These need
their own S2b/S2c specs and their own sign-offs (five-tier mapping,
movement canonicalization, enemy-family choice).
