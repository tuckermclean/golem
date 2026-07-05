# CEREMONY.md — behavior freeze coverage map (Task P0.3b)

This maps the six Ceremony-route behavior areas named in DELTA.md P0.3 to
(a) the legacy unit tests that already exercised them, and (b) the new
`@ceremony`-tagged characterization tests under `games/some-hero/ceremony/`
that pin them independently of `legacy/`.

**Why the deliberate duplication.** DELTA Phase 4 archives `games/some-hero/
legacy/` once the port lands. Legacy's own test suite (`tests/*.test.js`)
is excellent and these areas are already well covered there — but that
suite imports from `../src/...` relative to `legacy/tests/`, and it dies
with the legacy tree. The `ceremony/` suite re-asserts the same concrete,
observed values as new, standalone tests importing legacy's `src/`
directly, so the specification these tests constitute survives the
archival that made them necessary in the first place. Where a
`ceremony/` test's assertion is materially the same value as a legacy
test's assertion, that is intentional, not oversight.

**Standalone means no dependency on `legacy/tests/` either.** All six
`ceremony/*.ceremony.test.js` files import game/state fixtures
(`blankGame`, `seededGame`, `spyFx`) from `games/some-hero/ceremony/
helpers.js`, a file inlined into this suite — copied verbatim from
`legacy/tests/helpers.js` (legacy snapshot e3d17bb) with only its
`legacy/src/...` import paths adjusted for its new location and a header
explaining the copy. That file still imports from `legacy/src/` (the
part decision 4 explicitly allows and the part S2 actually ports); it no
longer imports anything from `legacy/tests/`, which dies wholesale with
the rest of `legacy/` at archival. `legacy/tests/helpers.js` itself is
untouched.

All values below were **observed** by running the tests against
`legacy/src` (not assumed from reading). Node 25 quirk: `node --test
<dir>/` throws `MODULE_NOT_FOUND` on this engine; `npm run test:ceremony`
therefore uses the explicit glob form `node --test games/some-hero/
ceremony/*.ceremony.test.js` (see root `package.json`).

## 1. Door Golem requirements

Lives in `legacy/src/systems/credentials.js` (`missingCredentials`,
`swordVerdict`), `legacy/src/systems/stairs.js` (`handleStairs`, the gate
itself), and `legacy/src/content/golem.js` (`entryLines`, `approvalLines`
— the denial/approval text).

- Legacy coverage: `legacy/tests/golem-riddle.test.js` (credentials
  section + "the golem gates the dungeon mouth" section).
- New test: `games/some-hero/ceremony/door-golem.ceremony.test.js` — 7
  tests pinning: the three requirements (sword tier ≥1, `meta.credentials
  .backstory`, `meta.credentials.debt`); `swordVerdict` text for tiers
  0–4; the exact `onGolemEntry(missing)` call and missing-list on denial
  with no zone transition and no run started; the exact denial line text
  (`CRED_LINES` + the closing `ENTRY: DENIED...` line); the one-time stamp
  ceremony (`onGolemApproval` fires exactly once, `meta.golemApproved`
  latches true, zone stays `'ow'` until the approval callback runs); the
  exact 3-ellipsis pause + `*stamp*` line in `approvalLines`; and a BITE
  test that the gate mutates nothing but `player.tk` on denial.

## 2. Credential acquisition

Lives in `legacy/src/systems/credentials.js` (`grantBackstory`,
`grantDebt`) and `legacy/src/systems/credit.js` (`borrow`, which sets
`meta.credentials.debt` as a side effect).

- Legacy coverage: `legacy/tests/golem-riddle.test.js` ("credentials"
  section), `legacy/tests/credit.test.js` ("borrow adds principal and the
  debt credential is forever").
- New test: `games/some-hero/ceremony/credential-acquisition.ceremony
  .test.js` — 7 tests pinning: `createMeta().credentials` starts as
  `{ backstory: false, debt: false }` (no sword slot — the sword is not
  knowledge); `grantBackstory` sets exactly one field; the debt
  credential is acquired indirectly as a side effect of `borrow()`, not
  only via the direct `grantDebt` setter (both paths pinned); debt
  survives `payDown(meta, balance)` to zero (knowledge is permanent);
  the sword credential is read live off `game.player.swordLv` on every
  gate check and is **not** persisted in `meta` anywhere (equip/un-equip
  changes the verdict instantly); a BITE test distinguishing distinct
  `meta` instances.

## 3. Credit/APR numbers

Lives entirely in `legacy/src/systems/credit.js`.

- Legacy coverage: `legacy/tests/credit.test.js` (the whole file — APR
  tiers, limits, `canBorrow`, `borrow`, `accrueInterest`, `minPayment`,
  `makeDeathPayment`, `payDown`, `truthInLending`, and the respawn
  garnishment integration).
- New test: `games/some-hero/ceremony/credit-apr.ceremony.test.js` — 12
  tests re-asserting the exact constants and formulas: `SCORE_MIN=300`,
  `SCORE_MAX=850`, `SCORE_START=650`; APR tiers `.0999/.2499/.3999/.9999`
  at score breakpoints 750/650/550; tier names `PREFERRED ADVENTURER` /
  `STANDARD ADVENTURER` / `SUBPRIME ADVENTURER` / `ADVENTUROUS`;
  `creditLimit` = `floor(income * 4 * mult)` with `mult` 1.5/1/.5/.25 by
  score band; `canBorrow` decline reasons `'no income'|'limit'|'score'|
  'delinquent'` in that priority; `accrueInterest` = `ceil(balance * apr
  / 12)` (60g @ 24.99% → 2g); `minPayment` = `ceil(balance/8)+2`, full
  balance due at ≤8g; the death-payment ladder (on-time score +10, short
  score −60 and `missed++`, clearing the balance score +25 and
  `missed=0`), score clamped to [300, 850]; the respawn garnishment order
  (deductible, then minimum payment + 1g convenience fee, itemized); and
  the full 8-line `truthInLending` disclosure text including the
  ledgerized (misspelled) notarization line. Includes a real bite
  (documented below) plus an in-file BITE assertion.

## 4. Seal/stairsOpen logic

Lives in `legacy/src/systems/puzzles.js` (`stairsOpen`, `sealMsg`) and,
for the seal actually used on the Ceremony route, `legacy/src/systems/
riddle.js` (`nextRiddle`, `answerRiddle`, `doorSigh`).

- Legacy coverage: `legacy/tests/puzzles.test.js` (full truth table for
  `warden`/`key`/`plates`/`traps`/`torch`), `legacy/tests/golem-riddle
  .test.js` (the riddle door section).
- New test: `games/some-hero/ceremony/seal-stairs.ceremony.test.js` — 15
  tests pinning the complete `stairsOpen(game)` truth table: `null` →
  always open; `'warden'` → open iff `boss.dead`, or open if `boss` is
  null; `'final'` → **always closed** (no down-stairs on the final
  floor, confirmed even with `puzzle.bossDead = true` — the exit there is
  the desk, not the stairs); `'key'` → open iff `pz.have`; `'plates'`/
  `'traps'`/`'torch'`/`'riddle'` → all fall through to the default
  `!!pz.solved` branch. Also pins every `sealMsg` string per type, and
  the riddle door's full behavior: question selection by `attempts`
  (0 = a real per-run stat, 1 = Glurps drunk, 2 = the floor number, 3+ =
  the shame path where every option is `correct`), `answerRiddle`'s three
  return values (`'wrong'|'solved'|'shamed'`), and `doorSigh`'s three
  escalating lines (capped at index 2 for `attempts >= 4`).

## 5. Death/respawn/meta-persistence

Lives in `legacy/src/systems/respawn.js` (`respawnAtGuild`) and
`legacy/src/core/meta.js` (`recordDeath`, and the shape of `meta` itself
— the permanent half). `legacy/src/world/zones.js` (`enterTomb`,
`restoreSurface`) shows the boundary between what death alone resets and
what only a new run (`newRun` in `legacy/src/core/game.js`) additionally
regenerates.

- Legacy coverage: `legacy/tests/some-hero.test.js` ("the resurrection
  deductible" section), `legacy/tests/credit.test.js` (the garnishment
  test), `legacy/tests/golem-riddle.test.js` ("death by the boss while
  uncredentialed" test, for the gate's read-only guarantee).
- New test: `games/some-hero/ceremony/death-respawn-persistence.ceremony
  .test.js` — 10 tests pinning: the resurrection deductible `ceil(gold/2)`;
  hp restored to `maxhp`; position reset to the Guild Hall; **resets on
  death** — potions capped to 1 (never gifted), `player.inv`/`atkT`/
  `input.atkBuf` zeroed; **persists through death** — sword tier
  (equipment, not a consumable); dying inside the Downstairs restores the
  *exact same* `world`/`npcs` object references on climbing out (no
  regeneration — the surface persists as left); **meta (knowledge)
  survives death** untouched except `deaths`/`lastCause`/`repeatCause` —
  `credentials`, `credit`, `menace`, and `heist` tokens are unaffected by
  `respawnAtGuild`; `recordDeath` tracks `repeatCause` as a streak counter
  keyed on consecutive identical causes, reset by any different cause;
  `hurtPlayer` → `ST.DEAD` + `lastHitBy` is the source `respawnAtGuild`
  reads as `cause`; and the distinction that death sets `runStats.died`
  but does **not** reset `runStats` itself — only starting a fresh run
  (`enterTomb` → `newRunStats()`) does that. This is the current, actual
  three-tier split legacy implements (run-scoped `runStats` / knowledge
  `meta` / transient equipment+position on `player`); it is *not* the
  five-tier world/run/character/knowledge/profile model DELTA §S2 names
  for the kernel port — S2 decides that mapping later, against this pin.

## 6. Ledger text selection

Lives in `legacy/src/systems/ledger.js` (`ledgerize`, `deathReport`,
`gradeRun`, `gradeRemark`, `lootLine`, `newRunStats`).

- Legacy coverage: `legacy/tests/some-hero.test.js` (the "the Ledger"
  section — `ledgerize`, `deathReport`, `gradeRun`, `gradeRemark`,
  `lootLine`), `legacy/tests/golem-riddle.test.js` ("the Ledger grades
  survived runs on surfacing").
- New test: `games/some-hero/ceremony/ledger-text.ceremony.test.js` — 11
  tests pinning: `ledgerize`'s four house-style substitutions
  (case-preserving); **`deathReport` selection is fully deterministic**,
  not random — `pool[(meta.deaths - 1) % pool.length]` keyed by cause,
  confirmed by exact string at `deaths` 1/2/3/4 (pool wraps at 3 entries)
  for the `scarab` cause; the repeat-cause suffix appended once
  `meta.repeatCause` reaches 1 then 2 (a second, independent selection
  axis from `deaths`); fallback to the `unknown` pool for unlisted or
  `null` causes; the hard override to `'Yeah.'` once `meta.deaths >= 50`;
  `gradeRun`'s full point rubric (base C=2, +1 per 3 depth, +1 personal
  best, +1 for 10+ kills, −1 for a slime/intern kill, −1 for dying, an
  additional −1 for `repeatCause >= 1`, clamped to `[F, S]`); every
  `gradeRemark` string per letter grade; `lootLine` per loot kind
  (`sword`/`maxheart`/`amulet`, empty string for unknown kinds); and the
  fresh `newRunStats()` shape.

## Bite evidence (decision 9)

Command:
```
node --test games/some-hero/ceremony/credit-apr.ceremony.test.js
```
Ran with the "APR tiers are exact" test's `aprFor(650)` expectation
deliberately changed from `.2499` to the rounder-but-wrong `.25`. Result
(1 failing, 11 passing):
```
✖ @ceremony APR tiers are exact: .0999 / .2499 / .3999 / .9999, tier names PREFERRED/STANDARD/SUBPRIME/ADVENTUROUS (0.703947ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  0.2499 !== 0.25

      at TestContext.<anonymous> (file:///.../games/some-hero/ceremony/credit-apr.ceremony.test.js:27:10)
  ...
  actual: 0.2499,
  expected: 0.25,
```
Reverted the expected value to the observed `.2499`; rerun: 12/12 passing.
Full command transcripts are in `.superpowers/sdd/p0.3b-report.md`.

## Areas not requiring a browser/DOM E2E carve-out

All six areas above were exercisable headless through the same
`node:test` + `helpers.js` (`blankGame`/`seededGame`/`spyFx`) patterns
legacy's own unit tests already use. No area needed new E2E
infrastructure or a DOM beyond what `legacy/tests/helpers.js` already
provides; `legacy/tests/e2e/game.e2e.mjs` (Playwright) remains the
reference for anything genuinely visual, unchanged and untouched by this
task.
