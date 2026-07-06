# ARCHITECTURE.md — golem-engine

This is the map of the monorepo as it actually exists on this branch, not
the aspirational end state. VISION.md is the constitution (read that
first for *why*); CLAUDE.md holds working practices; DELTA.md is the
task-by-task build order this map reflects. This document restates
none of their doctrine — it points at packages, files, and design specs
so a reader can go from "what is this system" to "here is the file."

Doctrine is not restated here. If a claim below looks like it
contradicts VISION.md or CLAUDE.md, those two win; file an issue against
this document, not against the code.

## What this is

golem-engine is a deterministic, replayable game kernel plus a stack of
supporting packages, currently proven by two thin fixture games
(`golem-grid`, `topdown-puzzle`) and aimed at one flagship
(`some-hero`, still `legacy/`-only). The layering is strict and
one-directional:

```
packages/random  (the one RNG/hash primitive: h32, channel, pick, chance, rint)
      │
      ▼
packages/kernel   (pure types, GameModule contract, replay(), event log + hash chain)
      │
      ├──────────────┬──────────────┬───────────────┐
      ▼              ▼              ▼               ▼
packages/content  packages/net  packages/language  packages/clients
(pack compiler)   (wire proto)  (parser/classifier) (render/input/touch)
      │              │              │               │
      └──────────────┴──────┬───────┴───────────────┘
                             ▼
                          games/*
                (golem-grid, topdown-puzzle; some-hero legacy-only)
```

`packages/testkit` sits beside this stack (fixtures, conformance tests,
the conservation helper) rather than inside it — every layer's own
package depends on testkit for tests, not the other way around.
`packages/world` is a named slot in the layering with no implementation
behind it yet (see the package map).

Nothing above `packages/random` imports `Math.random`; nothing outside
`packages/kernel/src/log.ts` imports `node:crypto`; nothing under
`packages/**/src` or `packages/**/tools` imports `eval(`/`new Function` —
CI-enforced repo-wide by `tools/check-bans.mjs` (DELTA §0.3).
`packages/content` additionally bans `node:vm` in its own source, proven
by its own unit test (`tests/no-dynamic-code.test.js`), since content's
condition evaluator is the one place a naive implementation would be
tempted to reach for it.

## Package map

| Package | Purpose | Key exports (`src/index.*` unless noted) | Depends on | Status |
|---|---|---|---|---|
| `packages/random` | The one seeded-RNG/hash primitive engine-wide | `h32`, `channel`, `pick`, `chance`, `rint` | none | Built |
| `packages/kernel` | Pure types + the `GameModule` contract + `replay()`; `./log` subpath: hash-chained event log + checkpoints | `Event`, `Command`, `Denial`, `ValidateResult`, `isDenial`, `GameModule`, `KernelCore`, `replay()`; component vocabulary (`components.ts`); `./log`: `canonicalEvent`, `appendEvent`, `verifyChain`, `checkpoint`, `verifyCheckpoint`; `schemas/events.v1.json` | none | Built (K2/K3/C3/K6) |
| `packages/content` | Content-pack schema + safe condition compiler + hashing | `compile()`, `evaluate()` (the `all/any/not/fact/cmp` interpreter — never `eval`), `canonicalize()`, `hashPack()`, `RuntimePack`/`EntityDef`/`RuntimeTable`/`RuntimeMap` types; `schemas/pack.v1.json` | none (deliberately dependency-free of kernel) | Built (C1) |
| `packages/net` | The five-message wire protocol + transports | `Message`/`Hello`/`Snapshot`/`Cmd`/`EventMsg`/`Deny` + type guards, `Transport`, `createBroadcastTransport`, `createStorageTransport`, `createAutoTransport`, `makeDeduper` | none | Built (K4) |
| `packages/language` | The deterministic-parser and intent-classifier tiers | `parse()` (L1), `route()` (L1+L2 composition), `Affordance`/`Intent`/`ParseResult`/`ClassifyResult` types | `packages/random` (via classifier features) | L1 + L2 built; L3 is data-tooling in `tools/`, not this package; L4–L6 (twin) not built |
| `packages/clients` | Shared rendering/input/perception primitives, incl. the mobile touch layer | `createTouchControls()`, `isCoarsePointer()` (`src/touch.js`); pure gesture engine (`src/gesture.js`) | none (plain ES modules, no build step) | Built (mobile PR1/PR2); canvas-renderer adapter for some-hero is planned, not present |
| `packages/testkit` | Golden fixtures, replay-equality/conformance tests, the solver, the conservation helper | `verify:golem`, `verify:tdp` scripts; `tools/validate-events.mjs`; `tools/conservation.mjs`'s `checkGoldConservation` | `packages/kernel` | Built |
| `packages/world` | World generation, pinned rooms, regions, grid backend | *(none — no `src/`, no exports)* | — | **Stub.** Only `README.md` + `package.json` exist. Worldgen today lives in `games/golem-grid/shared/worldgen.js`; this package is the planned home for a shared/generalized version (DELTA S3, A2) and is not yet built |

Every package under `packages/` is TypeScript-strict ESM except
`packages/clients` (plain ES modules, no build step, browser-safe) and
`packages/testkit` (JS test/tooling harness). `dist/` for the TS
packages is produced by each package's own `prepare` script (`tsc -p .`,
run automatically by root `npm ci`/`npm install`) — never build by
hand if `dist/` goes missing after a wipe.

## The kernel contract

`packages/kernel/src/index.ts` defines the full game-module surface
VISION.md specifies:

```ts
interface GameModule<World, State, Cmd, Obs, Facts> {
  deriveWorld(seed: string): World;                       // pure f(seed) -> World
  validate(ctx: unknown, cmd: Cmd): Event[] | Denial;     // legality check, no mutation
  reduce(state: State, world: World, event: Event): State; // pure fold, no mutation, identity-blind
  observe(state: State, world: World, viewer: string): Obs; // per-viewer perception
  affordances(observation: Obs, actor: string): unknown;    // legal-verb menu
  narrativeFacts(state: State, world: World, event: Event): Facts; // the golem's only allowed input
}
```

`KernelCore<World, State, Cmd>` is the `Pick<GameModule, "deriveWorld" |
"validate" | "reduce">` subset that actually exists and is tested today
— `observe`/`affordances`/`narrativeFacts` are defined in the type but
implemented per-game outside this package (e.g.
`games/golem-grid/src/perceive.js` for perception; the ▶GOLEM-PLUG◀
functions in `games/golem-grid/src/main.js` for narration).

`replay(core, world, log, initialState)` is the one pure fold every
conformance test drives: threads a committed event log through
`core.reduce` in order, never mutating what it's handed. This is what
makes two clients that received the same event log in the same order
*provably* identical — no client-side branch on "am I the host" is ever
legal inside `reduce`.

Doctrines this package is built to make impossible to violate by
accident:
- **Pure and synchronous.** No `async` anywhere in `validate`/`reduce`/
  `observe`/`affordances`. IO (host sequencing, transports, storage)
  lives in adapters outside the package (`games/*/src/host.js`,
  `games/*/src/client.js`).
- **Identity-blind.** `reduce` never reads "who is asking" — perception
  is derived per-viewer by `observe`, never baked into shared state.
- **Determinism.** `replay` of the same log always produces the same
  state; the 25 frozen golem-grid seed fixtures + topdown-puzzle
  solution logs are the regression proof (see Testing/CI below).
- **No eval.** Anything a `Lock`/`Interactable` component needs to
  evaluate (`unlockCondition`, `enabledWhen`) is typed `unknown` in
  `components.ts` on purpose — kernel never interprets it; only a game's
  `validate`/`affordances`, via `@golem-engine/content`'s `evaluate()`,
  ever does. Kernel and content are mutually dependency-free by design.
- **Seeded RNG only.** Any randomness a `reduce`/tick implementation
  needs goes through `packages/random`'s named channels
  (`channel(seed, ...)`), never `Math.random` — CI-banned under
  `packages/**`.

The K3 event log (`packages/kernel/src/log.ts`, reached via the
`./log` subpath so `node:crypto` never leaks into the platform-neutral
main export) adds `canonicalEvent` (the sorted-key JSON wire format),
`appendEvent`/`verifyChain` (an append-only sha256 hash chain), and
`checkpoint`/`verifyCheckpoint` (ed25519-signed digests, dev keypair —
key management is explicitly out of scope). No live game currently
stamps `prev` on its wire events; that adoption is future work (noted
as deferred at K5 in CLAUDE.md's status log).

`packages/kernel/schemas/events.v1.json` (K6) is the versioned JSON
Schema for every event kind — reality-first, matched against the 25
frozen golem-grid fixtures plus the golden replay log, and it also
carries the *drawer's* vocabulary (oaths, economy, market, credit — see
MIGRATION.md's drawer section) as schema fields only, with zero
consumers. `packages/testkit/tools/validate-events.mjs` is the CI gate.

## The language tiers

VISION.md's latency-tiered pipeline: direct controls always win first;
everything below only runs when the tier above didn't resolve the
command.

| Tier | What it is | Where it lives | Status |
|---|---|---|---|
| Direct controls | Arrows/clicks/context menu — no parsing at all | `games/*/src/input.js` | Built |
| **L1** | Deterministic parser: verb/alias/direction grammar + noun grounding against an injected affordance set. Table-driven, synchronous, sub-millisecond. | `packages/language/src/{tables,tokenize,ground,parse}.ts`, public `parse()` | Built |
| **L2** | Intent classifier: hashed-n-gram logistic model over engine-generated synthetic utterances, with calibrated confidence and routing thresholds (≥0.90 execute; 0.65–0.90 execute iff exactly one grounded interpretation; <0.65 falls through). Composed with L1 via `route()`. | `packages/language/src/{features,classify,router}.ts`, committed weights under `src/weights/` | Built |
| **L3** | Model **data** tooling: harvest real worldgen into control strings, drive a teacher model (subagents-as-teacher in this sandbox) to generate paraphrase/task pairs for all six trained tasks, validate, report stats. This is tooling, not a runtime tier — it produces the corpus L4 trains on. | `tools/harvest.js`, `tools/generate.py`, `tools/validate.py`, `tools/stats.py`, `tools/lang/`, `tools/stub_teacher.js` (dev-time stand-in for the real teacher) | Built (data pipeline only; see L4 for the gap) |
| **L4 — training + smoke model** | nanoGPT-style trainer, corpus-built BPE tokenizer, a CPU smoke run proving corpus → checkpoint → sample loop | `train/` (referenced by `make train-local`, `.github/workflows/train.yml`) | **Not built.** No `train/` directory exists on disk yet — needs a real corpus batch from L3 first |
| **L5 — WASM twin runner** | int8 llama2.c-derived runner, emsdk build, worker wrapper, wired into golem-grid's ▶GOLEM-PLUG◀ | `wasm/runq.c` (referenced by `make wasm`, `.github/workflows/deploy.yml`) | **Not built.** No `wasm/` directory exists — blocked on emsdk + L4 producing a checkpoint |
| **L6 — real twin v1** | Full corpus, spot-GPU training run, eval-gated publish, quantized content-addressed artifact | `.github/workflows/train.yml`'s eval gate | **Not built** — infra-blocked (needs a GPU account, `train.yml`'s AWS variables, and a real corpus) |

The template/stub narrator (the ▶GOLEM-PLUG◀'s current implementation in
`games/golem-grid/src/main.js`) is what plays today with narration "on":
deterministic table-driven prose, not a model. This is also law 10's
documented fallback path once L5/L6 exist — the game must stay fully
playable with the twin disabled.

Per-tier design docs (read these instead of expecting this file to
duplicate them):
- `docs/superpowers/specs/2026-07-06-l1-language-parser-design.md`
- `docs/superpowers/specs/2026-07-06-l2-intent-classifier-design.md`
- `docs/superpowers/specs/2026-07-06-l3-data-tools-design.md`

## How a game is built on the kernel

### The reference consumer: golem-grid

`games/golem-grid/` is the worked example DELTA's K5 produced. It is a
thin client over the kernel packages, composed from small single-purpose
modules under `src/`:
- `shared/module.js` — the `KernelCore` implementation (`deriveWorld`,
  `validate`, `reduce`) that `packages/kernel`'s `replay()` drives.
- `src/host.js` — seq-stamping + derived-event ordering (LIGHT_WARN/
  WIN/LOSE), no DOM.
- `src/client.js` — applies `EVENT`s via the same `applyEvent` adapter
  the host uses (no fork), and folds a joining peer's log through
  `replay()` on `SNAPSHOT`.
- `src/perceive.js` — client-local seen/lit + line-of-sight. Never
  touches the network; perception is per-viewer by construction.
- `src/render.js` — canvas/feed/status-bar DOM primitives.
- `src/input.js` — capture-phase arrow keys + tap/click context menu.
- `src/language-adapter.js` — the L1/L2 glue turning `@golem-engine/
  language`'s game-agnostic `Intent` into golem-grid's actual wire
  commands (see the L1 design doc's "Output shape").
- `src/main.js` — the composition root; also still owns the render
  dispatcher and the ▶GOLEM-PLUG◀ prose functions (`golemLine`/
  `roomBeat`/`proseFor`/`lookAt`) by design (documented in CLAUDE.md's
  K5 entry as a deliberate non-split).
- `reference/golem-grid.html` — the original hand-written, pre-Vite
  single-file prototype, preserved byte-verbatim (sha256-pinned) as a
  golden fixture; never edited. See its own `PROVENANCE.md`.

`make html` builds the single-file Vite deliverable
(`games/golem-grid/dist/golem-grid.html`) that still opens from
`file://` with two tabs bridged by `@golem-engine/net`'s
BroadcastChannel-then-storage transport layering.

### The second consumer: topdown-puzzle

`games/topdown-puzzle/` is DELTA's C4 port: push chains, directional
movers, memory holes, diamonds, and enemies expressed as
`validate`/`reduce` systems over the same kernel, plus a fixed-step tick
bridge (`shared/tick.js`'s `resolveTick`, ported from the legacy
Phaser scene's `startMovingBlock`/`updateBaddie`/contact-poll logic,
canonicalized to small documented HP numbers rather than legacy's
inconsistent tuning). `shared/push.js` and `shared/reducer.js` round out
the `KernelCore`; `src/client.js`/`src/render.js`/`src/input.js` mirror
golem-grid's split. Six legacy ASCII levels compile and are playable;
two have a recorded solution log pinned as a permanent replay fixture.
Full design: `docs/superpowers/specs/2026-07-06-c4-topdown-port-design.md`.

### The content-pack pipeline (C1/C2)

`packages/content`'s `compile(source)` takes an already-parsed JS value
(no file/YAML IO in the package itself) through: JSON-Schema validation
(`schemas/pack.v1.json`, ajv draft 2020-12) → condition hydration → the
`all/any/not/fact/cmp` evaluator (`evaluate()` — a tiny interpreter, not
`eval`) → reference resolution → freeze → sha256 hash
(`canonicalize()`/`hashPack()`), producing an immutable `RuntimePack
{hash, entities, tables, maps}`.

`games/topdown-puzzle/content/` is the concrete pack: `entities.mjs`
defines the vocabulary the ASCII importer (C2) compiles topdown-puzzle's
token grammar (`# B D @ H V M E/W/N/S`) into; `build.mjs`/`build-pack.mjs`
run the compiler; `pack.json` is the frozen, hashed output actually
loaded by `shared/pack-loader.js`. Design:
`docs/superpowers/specs/2026-07-06-c1-content-pack-design.md`,
`docs/superpowers/specs/2026-07-06-c3-entities-components-design.md`.

`some-hero`'s content pack (DELTA S1) does not exist yet — Phase 4 has
not started (see MIGRATION.md).

## The client layer

`packages/clients` holds what's shared across games rather than
duplicated per-game:
- `src/gesture.js` — a pure gesture engine (no DOM, no
  `Math.random`/`Date.now`): pointer samples in, `{kind:"step"}` /
  `{kind:"tap"}` events out. Swipe + floating hold-stick hybrid, tuned
  from some-hero's original mobile numbers.
- `src/touch.js` — `createTouchControls()`, the DOM layer: a scoped
  touch-only overlay (viewport/safe-area/prefers-reduced-motion CSS),
  plus `isCoarsePointer()` so a game can share the same "is this a touch
  device" signal for its own decisions (e.g. golem-grid suppressing
  chat-input auto-focus on touch to avoid popping the soft keyboard).

Consumed today by golem-grid (movement, tap-context menu, chat toggle)
and topdown-puzzle (movement-only so far). Canvas-renderer adaptation of
some-hero's own skin (VISION's "clients: canvas ... behind an adapter")
is future work (DELTA S4), not present.

Both games ship as a single self-contained HTML file via Vite +
`vite-plugin-singlefile` (`npm run build -w @golem-engine/golem-grid` /
`-w @golem-engine/topdown-puzzle`). A green push to `main` publishes
golem-grid's build to GitHub Pages (`.github/workflows/ci.yml`'s
`deploy-pages` job, gated on every other CI job via `needs:` — a red
branch is never published). Design:
`docs/superpowers/specs/2026-07-06-playtest-pages-deploy-design.md`.

## Testing / CI shape

- **Golden/fixture tests.** `packages/testkit/fixtures/golem/` holds 25
  seed fixtures (world snapshot + recorded event log + final-state hash
  each); `games/topdown-puzzle/tests/solutions/` holds per-level replay
  logs; `games/some-hero/ceremony/*.ceremony.test.js` (6 files) pin the
  flagship's legacy behavior ahead of its kernel port. All are
  exact-match: a diff means the world function or reducer changed, which
  CLAUDE.md's doctrine treats as a versioning event, not a bugfix.
- **`npm run freeze:verify`** (a permanent CI job) replays the golem
  fixtures, runs the `@ceremony` suite, and verifies the topdown-puzzle
  parse snapshots, in that order, failing fast.
- **CI job graph** (`.github/workflows/ci.yml`): `determinism` (root
  `npm test` — every workspace's own test script in one pass),
  `solver` (10K-seed winnability/difficulty band), `validator` (Python
  grounding tests, including L3's task A–F validators driven through
  the real L1 parser), `build` (ban-check + single-file golem-grid
  build), `some-hero-legacy` (the flagship's own unit+E2E suite, run
  read-only from its vendored snapshot), `level-manifest` (topdown-puzzle
  level manifest drift check), `event-schema` (K6 schema validated
  against every fixture/golden + its own unit tests), `freeze-verify`,
  and `deploy-pages` (gated on all of the above). Separate workflows:
  `data.yml`/`train.yml`/`deploy.yml` are the model pipeline — manual
  `workflow_dispatch`/tag-triggered, not part of the PR-gating `ci.yml`
  graph, and not yet exercised for real (no corpus batch, no trained
  model, no deployed weights exist yet — see the L4–L6 status above).
- **Two-tab / visual smoke.** `make smoke-e2e` (golem-grid) and
  `make smoke-e2e-tdp` (topdown-puzzle) run real-Chromium Playwright
  smokes (cross-tab play, a genuine wire DENY round-trip, deterministic
  canvas-pixel pinning). Not wired into `npm test`/CI — run locally by
  design (flake budget).
- **Lint bans.** `tools/check-bans.mjs` (`make lint-bans`, and the
  `build` CI job) fails the build on `Math.random`/`eval`/`new Function`
  anywhere under `packages/`.

## Where to read more

Each per-feature design doc is the authoritative source for its feature
— this file only orients; it does not restate them:
- `docs/superpowers/specs/2026-07-03-roadmap-steps-1-3-design.md`
- `docs/superpowers/specs/2026-07-06-c1-content-pack-design.md`
- `docs/superpowers/specs/2026-07-06-c3-entities-components-design.md`
- `docs/superpowers/specs/2026-07-06-c4-topdown-port-design.md`
- `docs/superpowers/specs/2026-07-06-l1-language-parser-design.md`
- `docs/superpowers/specs/2026-07-06-l2-intent-classifier-design.md`
- `docs/superpowers/specs/2026-07-06-l3-data-tools-design.md`
- `docs/superpowers/specs/2026-07-06-mobile-ergonomics-design.md`
- `docs/superpowers/specs/2026-07-06-playtest-pages-deploy-design.md`

For doctrine and the four-bequest history, read VISION.md. For the
task-by-task build order and what's next, read DELTA.md. For working
practices (make targets, current status log), read CLAUDE.md.
