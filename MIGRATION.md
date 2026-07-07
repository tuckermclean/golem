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
| `games/some-hero/legacy/` (the flagship) | `games/some-hero/legacy/` (read-only snapshot) + `games/some-hero/ceremony/` (legacy characterization tests) + `games/some-hero/{content,rules,shared,src}` (the live kernel port) | All writing/content/art/audio/quests/puzzles/bosses/credentials/credit satire/Ledger personality (S1 content pack, every string byte-identical), pinned-room worldgen contract (S3, generalized into `packages/world`), meta-progression distinction, pure rule helpers (S2a) — all landed in the port, not just recorded as its spec | Mutable single-aggregate game state → the five-tier `State` (world/run/character/knowledge/profile + a `pending` two-step slot) driven by a pure `deriveWorld`/`validate`/`reduce`/`observe`/`affordances`/`narrativeFacts` `GameModule` (S2b/S2c); ambient `Math.random` worldgen → `packages/world`'s named-channel tomb-floor generator (S3); fx-coupled systems → the C4 tick bridge + reducer cases; `hostCmd`-style dispatch → `validate()` | Nothing at the mechanics/content level — the port is a faithful re-expression, not a redesign. `legacy/` itself is untouched: this row's "kept" column describes what the *port* kept, not a rewrite of the legacy tree | **Headless-complete (S1–S5).** All 62 legacy `@ceremony` tests still pass verbatim against `legacy/`; a 60-test kernel-mirrored suite (`rules/tests/ceremony-kernel/`, plus 2 documented scarab divergences) proves the port matches; a scripted whole-route E2E (`tests/e2e-headless/full-route.test.js`) replays bit-identically. The interactive/visual remainder (S4 PR2's two-skin Playwright smoke, S5 checks 3–4, the `engine-v1.0` tag) is **browser-blocked** in this sandbox — deferred, not faked, not skipped by choice |
| `games/topdown-puzzle/legacy/` (Phaser) | `games/topdown-puzzle/legacy/` (read-only snapshot) + `games/topdown-puzzle/` (live kernel port) + `games/topdown-puzzle/levels/*.txt` (ASCII levels, also vendored flat) | ASCII level notation (kept as a supported importer), all 6 authored levels as regression/replay fixtures, push-chain mechanics as the kernel's second consumer, edit→serialize→playtest workflow | Phaser scene code (`KyeScene.js`'s `startMovingBlock`/`updateBaddie`/contact-poll) → `games/topdown-puzzle/shared/tick.js`'s pure `resolveTick`, canonicalized to small documented HP numbers instead of legacy's inconsistent 20/100/10 tuning; sprites → kernel entities (`packages/kernel`'s component vocabulary via C3); ad hoc level parsing → `packages/content`'s compiler (C1/C2) | Phaser runtime itself — not imported anywhere in the live port | **Live and current.** C4 (Phase 2) is done: 6 legacy levels compile and play; 5 have pinned solution-log fixtures (`games/topdown-puzzle/tests/solutions/`, C4 PR4) |
| `imported-content/adventure/legacy/` (Python/YAML/eval) | `imported-content/adventure/legacy/` (read-only snapshot) + `imported-content/adventure/AUDIT.md` (compile-target inventory) + `imported-content/adventure/{content,module,bin}` (the live import) | The semantic world model (regions, portals, containers, characters, conditions) as a real C1-compiled content pack (`content/entities.mjs`, hand-transcribed per `DECISION-LOG.md`), the affordance-query shape now a REAL hook (`module/module.js`'s `affordances(observation, actor) → readonly Affordance[]`, not just recorded vocabulary), room descriptions transcribed byte-identical | Every `func:` YAML block and the one live `condition:` → a content-pack component (`OnUse`/`Spawns`/`Portable`/`Interactable`) or a `content`-compiler `ConditionNode` (`all/any/not/fact/cmp`), per `DECISION-LOG.md`'s disposition table; the Flask CLI/HTTP loop → `packages/clients`' `createTerminalSession` (headless, pure) + `bin/play.mjs` (the one untested `node:readline` TTY wrapper around it) | The entire Python/Flask runtime; every `func:`/`eval`/`exec` mechanism; the `subprocess` book and the `Computer`/`InteractiveConsole` hazard (dropped entirely, not even inert); `AICharacter`'s live `OpenAIClient.oneoff_prompt()` call (an AI actor with narrative authority) — none of this is ever ported, only re-expressed as data or explicitly dropped | **Imported and playable (A3 done).** Content pack (A3 PR1), full six-hook `GameModule` + terminal client (A3 PR2), and a scripted, bit-identical-replay sample-world walkthrough E2E (A3 PR3) — the DoD that closed A3 and DELTA Phase 5 |

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

## some-hero → games/some-hero (kernel port, DELTA Phase 4, S1–S5)

`games/some-hero/legacy/` stays exactly as vendored (read-only,
untouched); the live game is now built alongside it at `games/some-hero/
{content,rules,shared,src}`, with `games/some-hero/ceremony/*.ceremony.test.js`
(62 legacy characterization tests) still running against `legacy/`
verbatim as the port's regression spec:

- **Content (S1)**: the Ceremony-route content — Guild Hall map, Door
  Golem, three credentials, the stamp, tomb-floor-1 enemies, 16 tables of
  Ledger/golem/riddle/seal copy — extracted into `games/some-hero/content/`,
  a C1-compiled, hash-pinned pack whose every string is asserted
  byte-identical to `legacy/` (`content-review.test.js`).
- **Rules (S2a)**: `legacy/`'s pure helpers (stairsOpen, sealMsg,
  credential queries, the credit/APR satire) ported verbatim to
  `games/some-hero/rules/`, table-fed from S1's content pack rather than
  hardcoded strings.
- **State + systems (S2b/S2c)**: the mutable single-aggregate legacy game
  state → the five-tier `State` (world/run/character/knowledge/profile +
  a `pending` two-step slot) folded by a pure `deriveWorld`/`validate`/
  `reduce`/`observe`/`affordances`/`narrativeFacts` `GameModule` — the
  first complete six-hook implementer in the monorepo. Movement,
  collision, pickups, one enemy family's combat, the Door Golem gate +
  two-step ceremony, death→resurrection with knowledge persistence, and
  Ledger fact emission (`narrativeFacts`, feeding the template-only
  `src/ledger-render.js` — doctrine #4's "golem is a mouth" still holds:
  it emits facts, never prose logic) are all reducer/tick cases now,
  not legacy's fx-coupled systems.
- **Worldgen (S3)**: `legacy/`'s ambient-`Math.random` floor generator →
  `games/some-hero/shared/floorgen.js` on named channels
  (layout/puzzle/spawns/decor) plus `packages/world`'s new pinned-room
  contract (S3 PR1, generalized from this exact legacy generator); a
  10K-seed reachability/winnability solver gate replaces "seemed fine in
  playtesting."
- **Renderer adapter (S4)**: `legacy/`'s Canvas desert skin is driven by
  a new `observe()`→view-model adapter (`src/render-adapter.js`) instead
  of reading mutable game state directly; a headless drawable-hash test
  proves the skin's own draw functions are unchanged. The Playwright
  half (visual smoke on both skins) is browser-blocked, not done.
- **THE CEREMONY (S5)**: the acceptance gate's headless checks (full-route
  bit-identical replay, the `@ceremony`/`ceremony-kernel` suites, both
  other games sharing the kernel build) all pass; the interactive
  checks and the `engine-v1.0` tag remain browser-blocked.

Nothing here was redesigned — every rule, number, and string is asserted
against the legacy behavior it replaces (that is what the `@ceremony` /
`ceremony-kernel` reconciliation proves). `legacy/`'s scarab enemy is the
one deliberate exception: it is dead gen-1 holdover content excluded from
the live roster by design (2 documented divergences), not a missed spot.

## imported-content/adventure (A3, DELTA Phase 5)

Unlike the other two legacy imports, adventure's disposition needed
per-item human judgment before any code could be written: `AUDIT.md`
(P0.2) inventoried every `func:`/`eval`/`exec` occurrence in the legacy
YAML/Python, and `imported-content/adventure/DECISION-LOG.md` records,
for each one, whether it became a content-pack component, a condition,
or was explicitly dropped — never mechanically carried across (DELTA's
"zero dynamic code" discipline, proven by the pack's own
`no-dynamic-code.test.js`).

- **Content (A3 PR1)**: `world.yaml`'s 33 rooms hand-transcribed (not
  YAML-parsed) into `imported-content/adventure/content/entities.mjs`,
  compiled by C1 into a hash-pinned pack. Room/item descriptions are
  byte-identical authored content; every `func:` became a declarative
  component (`OnUse`/`Spawns`/`Portable`/`Interactable`/`Toggle`) or a
  `ConditionNode`; commented-out YAML (the `payphone`, the `subprocess`
  book) was not ported at all.
- **GameModule + terminal client (A3 PR2)**: `imported-content/adventure/
  module/module.js` implements all six `GameModule` hooks, entirely by
  evaluating declarative components through `@golem-engine/content`'s
  `evaluate()` — no per-NPC/per-item bespoke code, unlike the legacy
  Python's per-character `func:` bodies. The Flask/CLI loop is replaced
  by `packages/clients`' pure, headless-testable `createTerminalSession`;
  the one untested surface is `bin/play.mjs`, a thin `node:readline`
  wrapper (mirroring some-hero's own "I/O at the edges" split).
- **Sample-world walkthrough (A3 PR3)**: a scripted E2E
  (`tests/e2e/sample-world.walkthrough.test.js`) proves the whole import
  is bit-identically replayable end to end — the DoD that closed both A3
  and DELTA Phase 5.

What never crossed over, by design: the Python/Flask HTTP+CLI runtime;
every `func:`/`eval`/`exec` mechanism itself (only their *effects*
survive, re-expressed as data); the dormant `Computer`/
`code.InteractiveConsole` eval-equivalent hazard (dropped entirely, not
even inertly present); and `AICharacter`'s live `OpenAIClient.
oneoff_prompt()` call — an AI actor with narrative authority, which
VISION.md's "golem is a mouth, never an actor" law rules out on
principle, not just on porting cost.

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
  hook itself (`imported-content/adventure/AUDIT.md`'s full inventory,
  reconciled row-by-row in `DECISION-LOG.md`) — content and the
  affordance-query shape ARE imported (A3, done), but the Python
  runtime, the raw `eval`/`exec` mechanism, and the `AICharacter`
  AI-with-authority pattern are never ported, only re-expressed as
  data or explicitly dropped.
- `topdown-puzzle`'s Phaser engine — not imported into the live port;
  only ASCII levels + rules survive (as `packages/content`-compiled
  data + `shared/tick.js`'s canonicalized movement/contact logic).
- `some-hero`'s legacy mutable single-aggregate game state, fx-coupled
  systems, ambient `Math.random`, and localStorage saves — these remain
  exactly as they are inside the frozen `legacy/` snapshot (never
  edited in place); the *live port* (Phase 4, S1–S5, headless-complete)
  replaces every one of them with kernel equivalents, but `legacy/`
  itself is not rewritten, only superseded as the thing that actually
  plays.
- `golem`'s single-file HTML layout — demoted to a reference fixture,
  not deleted; the mechanics it encoded (light pool, extraction,
  traitor plans) are golem-grid content now, not engine law.
