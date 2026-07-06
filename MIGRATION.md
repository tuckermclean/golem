# MIGRATION.md — where every legacy system went

Four repositories (`golem`, `some-hero`, `topdown-puzzle`, `adventure`)
were unified into this monorepo per VISION.md's "four bequests, four
deaths" and imported by DELTA.md's Phase 0 (P0.1/P0.2/P0.3). This
document tracks, per legacy system: what was kept, what was rewritten,
what was explicitly dropped, and current status. It complements
ARCHITECTURE.md (which describes the engine as it stands today) rather
than repeating it.

## Summary table

| Legacy system | Landed at | Kept | Rewritten/replaced | Explicitly dropped | Status |
|---|---|---|---|---|---|
| `golem` (golem-grid.html) | `games/golem-grid/reference/golem-grid.html` (pinned fixture) + `games/golem-grid/` (live Vite app) | Worldgen (h32/channel), THEMES, dungeon generation, reducer logic, game mechanics (light pool, extraction, prize) — all as content of golem-grid, not engine law | Single-file layout → Vite build over `packages/{random,kernel,net,clients,language}`; `applyEvent` → pure `reduce()`; inline NET → `@golem-engine/net`; inline dedup → `@golem-engine/net`'s `makeDeduper` | Nothing at the mechanics level — "dies" per VISION.md means *demotion* (constitution → this game's content), not deletion | **Live and current.** This is the reference kernel game; K1–K6 (Phase 1) are done |
| `games/some-hero/legacy/` (the flagship) | `games/some-hero/legacy/` (read-only snapshot) + `games/some-hero/ceremony/` (characterization tests) | All writing/content/art/audio/quests/puzzles/bosses/credentials/credit satire/Ledger personality, pinned-room worldgen contract, meta-progression distinction, pure rule helpers — as the future port's spec | Nothing yet — the kernel port (Phase 4, tasks S1–S5) has not started | Mutable game-state aggregate, fx-coupled systems, ambient `Math.random`, localStorage saves (to be replaced by Phase 1/4 equivalents when ported) | **Frozen, not yet ported.** 6 `@ceremony` characterization test files exist and pass in CI (`freeze-verify` job); this is the pre-port spec, not new implementation |
| `games/topdown-puzzle/legacy/` (Phaser) | `games/topdown-puzzle/legacy/` (read-only snapshot) + `games/topdown-puzzle/` (live kernel port) + `games/topdown-puzzle/levels/*.txt` (ASCII levels, also vendored flat) | ASCII level notation (kept as a supported importer), all 6 authored levels as regression/replay fixtures, push-chain mechanics as the kernel's second consumer, edit→serialize→playtest workflow | Phaser scene code (`KyeScene.js`'s `startMovingBlock`/`updateBaddie`/contact-poll) → `games/topdown-puzzle/shared/tick.js`'s pure `resolveTick`, canonicalized to small documented HP numbers instead of legacy's inconsistent 20/100/10 tuning; sprites → kernel entities (`packages/kernel`'s component vocabulary via C3); ad hoc level parsing → `packages/content`'s compiler (C1/C2) | Phaser runtime itself — not imported anywhere in the live port | **Live and current.** C4 (Phase 2) is done: 6 legacy levels compile and play; 2 have pinned solution-log fixtures |
| `imported-content/adventure/legacy/` (Python/YAML/eval) | `imported-content/adventure/legacy/` (read-only snapshot) + `imported-content/adventure/AUDIT.md` (compile-target inventory) | Vocabulary only: the semantic world model (regions, portals, containers, characters, conditions), the affordance-query shape (`affordances(observation, actor) → [{verb, target, enabled, reason}]`) | Not yet — A3 (Phase 5, "Adventure import") has not started. The audit inventories every compile target: 15 live `func:` YAML blocks + 1 dead, 3 `eval(`/`exec(` sites in `adventure.py`, plus a dormant `code.InteractiveConsole` eval-equivalent hazard (`items.py`'s `Computer.use()`), all pinned to the imported SHA (`e720d388f`) | The entire Python/Flask runtime; every `func:`/`eval`/`exec` mechanism; `AICharacter`'s live `OpenAIClient.oneoff_prompt()` call (an AI actor with narrative authority) — none of this is ever ported, only re-expressed as data | **Snapshot + audit only, not ported.** A3 is Phase 5 work; today this tree is inert content the compiler has not touched |

Each `legacy/` tree carries its own `PROVENANCE.md` (source repo,
pinned commit SHA, snapshot date, `git archive` method) and is
documented read-only: later phases port *from* it, never edit it in
place. `games/golem-grid/reference/golem-grid.html` is the one
exception to the "vendored from a sibling repo" pattern — it was
extracted from this repo's own git history (the commit immediately
before the Vite rewrite), not a snapshot import, and is sha256-pinned
by `games/golem-grid/tests/reference.test.js`.

## golem → golem-grid (kernel-native, no legacy/ tree)

Unlike the other three, `golem` was never vendored into a `legacy/`
subdirectory — it *was* this repo, restructured in place (DELTA P0.1
chose "prefer in place to preserve history" over a fresh import). Its
single committed HTML file is preserved byte-verbatim at
`games/golem-grid/reference/golem-grid.html` (see that file's own
`PROVENANCE.md` for the exact extraction commit trail: the parent of
the "golem-grid.html => src/main.js" rename), and the live app at
`games/golem-grid/src/`+`shared/` is what actually plays today, rebuilt
across K1–K6:

- Worldgen (`shared/worldgen.js`), the reducer (`shared/reducer.js`),
  and the RNG (`shared/rng.js`, now a re-export of
  `@golem-engine/random`) are unchanged in behavior — proven by the 25
  frozen seed fixtures replaying byte-identically pre- and post-restructure.
- `hostCmd` → `validate()`; the old mutable `S`-global `applyEvent` →
  the pure `reduce(state, world, event) → state` fold that
  `@golem-engine/kernel`'s `replay()` drives.
- The inline `NET` IIFE (BroadcastChannel + storage-bridge layering,
  dedup) → `@golem-engine/net`'s `createAutoTransport` + `makeDeduper`,
  byte-identical labels and behavior (contract-tested against fakes,
  and against real two-tab Chromium via `make smoke-e2e`).
- Game mechanics (light pool, extraction loop, traitor plans) demote
  from "the engine's law" to "golem-grid's content" — nothing about
  them moved into a `packages/*` engine package; they stay exactly
  where they were, in `games/golem-grid/shared/`.

## The drawer (`drawer/*.md`)

VISION.md and DELTA §0.4 record several future systems deliberately
**not built**: their only sanctioned artifact today is the event
*vocabulary* that escaped into `packages/kernel/schemas/events.v1.json`
(K6) — schema fields with zero consumers, because "schema is free and
societies are not." Reading `drawer/README.md`'s own framing: each item
below only influences event-vocabulary design until its pull-condition
fires.

| Drawer item | File | What escaped into K6's schema | Pull-condition |
|---|---|---|---|
| d20 resolution | (none yet — recorded in `drawer/README.md` only) | nothing yet | SOME HERO authors its first genuinely uncertain check |
| Alignment / moral episodes | (none yet — recorded in `drawer/README.md` only) | nothing yet | Knowledge model + event vocabulary stable AND a playtest wants NPCs reacting to reputation |
| Oath/ledger society layer | `drawer/OATH_AND_LEDGER.md` | Oath vocabulary: `OATH_SWORN`, `OATHBROTHER_ATTACKED`, `POSSE_MEMBER_KILLED`, `OATH_BETRAYED`, `SOLE_CLAIM_CREATED`; attribution fields (`actor`, `beneficiary`, `attacker`, `preventedDamage`, `proximity`); milestone events with `contributors[] {player, kind, weight}` | Contribution/oath/economy *systems* stay in the drawer per DELTA §0.4 — only vocabulary is in scope |
| Prediction markets | `drawer/MARKET.md` | `MARKET_OPENED` / `POSITION_TAKEN` / `MARKET_SETTLED` | Deeper in the drawer than the society layer it depends on |
| Credit unions / lending | `drawer/CREDIT.md` | `LOAN_ISSUED` / `LOAN_REPAID` / `LOAN_DEFAULTED` / `LIEN_ATTACHED` / `GARNISHMENT_APPLIED`, plus a documentation-only `debt:` delta-namespace note | Same stratum as MARKET.md — depends on the society layer |
| Economy (mint/burn/transfer) | (vocabulary only, recorded via K6, no standalone drawer file) | `GOLD_MINTED` / `GOLD_BURNED` / `GOLD_TRANSFERRED` / `PURSE_DISTRIBUTED`, with a conservation-invariant test helper in testkit (`packages/testkit/tools/conservation.mjs`) already built and unit-tested | Economy *systems* (not just the invariant helper) stay in the drawer |
| Day/night, exchange, federation | `drawer/DAY.md`, `drawer/EXCHANGE.md`, `drawer/FEDERATION.md` | Not yet reflected in `events.v1.json` — these are recorded designs, not schema-escaped vocabulary | Per each file's own pull-condition |
| 3D client, then physics | (none yet — recorded in `drawer/README.md` only) | nothing | A second 2D client proves the observation seam first; physics enters the kernel boundary last, if ever |
| Editor rebuild | (none yet — recorded in `drawer/README.md` only) | nothing | Content-authoring throughput, not architecture, becomes the bottleneck |
| Dedicated server / host migration | (none yet — recorded in `drawer/README.md` only) | nothing | Real-network play matters; the protocol (`packages/net`) already permits it |

No gameplay system consumes any drawer vocabulary yet — `events.v1.json`
carries these fields/kinds purely so a future system doesn't force a
breaking schema migration when its pull-condition fires.

## What's explicitly NOT migrated (by design, per DELTA's deletions list)

- The `adventure` Python/Flask runtime and every `func:`/`eval`/`exec`
  hook (`imported-content/adventure/AUDIT.md`'s full inventory) — never
  ported, content-only via a future A3.
- `topdown-puzzle`'s Phaser engine — not imported into the live port;
  only ASCII levels + rules survive (as `packages/content`-compiled
  data + `shared/tick.js`'s canonicalized movement/contact logic).
- `some-hero`'s mutable single-aggregate game state, fx-coupled systems,
  ambient `Math.random`, and localStorage saves — these remain exactly
  as they are inside the frozen `legacy/` snapshot until Phase 4 (S2)
  replaces them; nothing has been rewritten yet.
- `golem`'s single-file HTML layout — demoted to a reference fixture,
  not deleted; the mechanics it encoded (light pool, extraction,
  traitor plans) are golem-grid content now, not engine law.
