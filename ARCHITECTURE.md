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
supporting packages, now proven by **three kernel-native games**
(`golem-grid`, `topdown-puzzle`, and the flagship `some-hero` — its
Ceremony route is ported headless-complete, DELTA Phase 4 S1–S5) plus
**one imported content pack** (`imported-content/adventure`, DELTA Phase
5 A3, playable through a terminal client). The layering is strict and
one-directional:

```
packages/random  (the one RNG/hash primitive: h32, channel, pick, chance, rint)
      │
      ▼
packages/kernel   (pure types, GameModule contract incl. canonical Affordance,
                    component vocabulary, replay(), event log + hash chain)
      │
      ├──────────────┬──────────────┬────────────────┬───────────────┐
      ▼              ▼              ▼                ▼               ▼
packages/content  packages/net  packages/language  packages/clients  packages/world
(pack compiler)   (wire proto)  (parser/classifier/  (render/input/    (room placement,
                                 L7 twin context)      touch/terminal)  pinned rooms,
      │              │              │                 │                regions/portals)
      └──────────────┴──────┬───────┴─────────────────┴────────┬───────┘
                             ▼                                  ▼
                          games/*                       imported-content/*
              (golem-grid, topdown-puzzle,                  (adventure —
               some-hero — all kernel-native)          content pack + terminal)
```

`packages/testkit` sits beside this stack (fixtures, conformance tests,
the conservation helper) rather than inside it — every layer's own
package depends on testkit for tests, not the other way around.
`packages/world` is **no longer a stub** (see the package map): DELTA
S3 PR1 landed a dependency-free grid-topology library (room placement,
pinned rooms, corridor chaining) and A2 added a regions/portals overlay
on top of it.

Nothing above `packages/random` imports `Math.random`; nothing outside
`packages/kernel/src/log.ts` imports `node:crypto`; nothing under
`packages/**/src` or `packages/**/tools` imports `eval(`/`new Function` —
CI-enforced repo-wide by `tools/check-bans.mjs` (DELTA §0.3).
`packages/content` additionally bans `node:vm` in its own source, proven
by its own unit test (`tests/no-dynamic-code.test.js`), since content's
condition evaluator is the one place a naive implementation would be
tempted to reach for it. `imported-content/adventure` (its own
`tests/no-dynamic-code.test.js`) carries the same discipline into its
imported content: every one of the legacy YAML's `func:`/`eval`/`exec`
occurrences was re-expressed as data or explicitly dropped (see
MIGRATION.md), never mechanically carried across.

## Package map

| Package | Purpose | Key exports (`src/index.*` unless noted) | Depends on | Status |
|---|---|---|---|---|
| `packages/random` | The one seeded-RNG/hash primitive engine-wide | `h32`, `channel`, `pick`, `chance`, `rint` | none | Built |
| `packages/kernel` | Pure types + the `GameModule` contract + `replay()`; `./log` subpath: hash-chained event log + checkpoints | `Event`, `Command`, `Denial`, `ValidateResult`, `isDenial`, `GameModule`, `KernelCore`, `replay()`; component vocabulary + the canonical `Affordance` interface (`components.ts`, A1); `./log`: `canonicalEvent`, `appendEvent`, `verifyChain`, `checkpoint`, `verifyCheckpoint`; `schemas/events.v1.json` | none | Built (K2/K3/C3/K6/A1) |
| `packages/content` | Content-pack schema + safe condition compiler + hashing | `compile()`, `evaluate()` (the `all/any/not/fact/cmp` interpreter — never `eval`), `canonicalize()`, `hashPack()`, `RuntimePack`/`EntityDef`/`RuntimeTable`/`RuntimeMap` types; `schemas/pack.v1.json` | none (deliberately dependency-free of kernel) | Built (C1). Consumed by `games/topdown-puzzle`, `games/some-hero`, and `imported-content/adventure` |
| `packages/net` | The five-message wire protocol + transports | `Message`/`Hello`/`Snapshot`/`Cmd`/`EventMsg`/`Deny` + type guards, `Transport`, `createBroadcastTransport`, `createStorageTransport`, `createAutoTransport`, `makeDeduper` | none | Built (K4) |
| `packages/language` | The deterministic-parser and intent-classifier tiers, plus the NPC context compiler | `parse()` (L1), `route()` (L1+L2 composition), `compileEnvelope`/`envelopeToControlString`/`renderStubReply` (L7 — the truth-envelope compiler and stub twin reply), `nextHint`/`affordancesToFacts` (A1 PR3 affordance consumers), `Affordance`/`Intent`/`ParseResult`/`ClassifyResult`/`TruthEnvelope`/`WitnessedEvent` types | `packages/random` (via classifier features) | L1 + L2 + L7 built; L3 is data-tooling in `tools/`, not this package; L4–L6 (the trained twin) not built |
| `packages/clients` | Shared rendering/input/perception primitives, incl. the mobile touch layer and a headless terminal session | `createTouchControls()`, `isCoarsePointer()` (`src/touch.js`); pure gesture engine (`src/gesture.js`); `createTerminalSession()` (`src/terminal.js`, A3 PR2 — a pure, headless-testable text front end over any `{verb,noun}`-shaped `GameModule`) | `@golem-engine/language` (terminal session's twin-context glue) | Built (mobile PR1/PR2; terminal A3 PR2). A per-game canvas-renderer adapter exists for some-hero (`games/some-hero/src/render-adapter.js`, S4 PR1) but lives in the game, not yet generalized into this shared package |
| `packages/world` | Grid-topology library: room placement, pinned rooms, corridor chaining, and a regions/portals overlay | `Room`/`PinnedRoom`/`PinnedSpec`, `placeRooms`, `placePinnedRooms`, `chainCorridors`, `featureEligibleRooms` (S3 PR1); `RegionMap`, `Portal`, `PortalStateName`, `assignRegions`, `nextPortalState` (A2) | none (deliberately dependency-free — callers supply their own rng) | Built (S3 PR1, A2). First real consumer: `games/some-hero/shared/floorgen.js`'s tomb-floor generator. `games/golem-grid/shared/worldgen.js` stays hand-rolled and frozen by its golden fixtures — this package generalizes the pattern, it has not replaced every caller |
| `packages/testkit` | Golden fixtures, replay-equality/conformance tests, the solver, the conservation helper | `verify:golem`, `verify:tdp`, `verify:tdp-solutions` scripts; `tools/validate-events.mjs`; `tools/conservation.mjs`'s `checkGoldConservation` | `packages/kernel` | Built |

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
  affordances(observation: Obs, actor: string): readonly Affordance[]; // legal-verb menu (canonical shape, A1)
  narrativeFacts(state: State, world: World, event: Event): Facts; // the golem's only allowed input
}
```

`KernelCore<World, State, Cmd>` is the `Pick<GameModule, "deriveWorld" |
"validate" | "reduce">` subset every game implements at minimum. The
full six-hook surface is no longer aspirational:
- `games/some-hero/shared/module.js` and
  `imported-content/adventure/module/module.js` each **implement all
  six** hooks (`deriveWorld`/`validate`/`reduce`/`observe`/`affordances`/
  `narrativeFacts` are all exported functions in both files) — the first
  two full `GameModule` conformers in the monorepo (S4 PR1's `observe()`
  and A1 PR1's `affordances()` were the last two hooks to land).
  Adventure's own `module` object literal bundles all six together;
  some-hero's is split across two files for a Node-vs-browser reason
  (`shared/module.js`'s `deriveWorld` needs a filesystem read to load
  the content pack, so its own exported `module` const is `{validate,
  reduce, narrativeFacts, observe, affordances}` — deliberately without
  `deriveWorld` — while `shared/pack-loader.js` assembles the Node-side
  `{deriveWorld, validate, reduce, narrativeFacts}`; every hook exists
  and is tested, just not all six in one object literal).
- `games/golem-grid` implements four: `deriveWorld`/`validate`/`reduce`
  plus `affordances()` (`shared/affordances.js`, A1 PR2). Its perception
  (`src/perceive.js`) and narration (the ▶GOLEM-PLUG◀ functions in
  `src/main.js`) stay outside the formal `observe`/`narrativeFacts` hooks
  by design (documented in CLAUDE.md's K5 entry as a deliberate
  non-split, not a gap).
- `games/topdown-puzzle` implements the `KernelCore` three only
  (`deriveWorld`/`validate`/`reduce`) — no `affordances`/`observe`/
  `narrativeFacts` yet.

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
  solution logs + some-hero's headless full-route hash (S5) are the
  regression proof (see Testing/CI below).
- **No eval.** Anything a `Lock`/`Interactable` component needs to
  evaluate (`unlockCondition`, `enabledWhen`) is typed `unknown` in
  `components.ts` on purpose — kernel never interprets it; only a game's
  `validate`/`affordances`, via `@golem-engine/content`'s `evaluate()`,
  ever does (both `some-hero` and `adventure` use this). Kernel and
  content are mutually dependency-free by design.
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
Schema for every **golem-grid** event kind — reality-first, matched
against the 25 frozen golem-grid fixtures plus the golden replay log
(`packages/testkit/tools/validate-events.mjs` only ever globs
`packages/testkit/fixtures/golem/` and golem-grid's own golden replay
log — it has not been extended to validate some-hero's or adventure's
event kinds, which is honest future work, not a gap in what's claimed
here). The schema also carries the *drawer's* vocabulary (oaths,
economy, market, credit — see MIGRATION.md's drawer section) as schema
fields only, with zero consumers.

## The language tiers

VISION.md's latency-tiered pipeline: direct controls always win first;
everything below only runs when the tier above didn't resolve the
command.

| Tier | What it is | Where it lives | Status |
|---|---|---|---|
| Direct controls | Arrows/clicks/context menu — no parsing at all | `games/*/src/input.js` | Built |
| **L1** | Deterministic parser: verb/alias/direction grammar + noun grounding against an injected affordance set. Table-driven, synchronous, sub-millisecond. | `packages/language/src/{tables,tokenize,ground,parse}.ts`, public `parse()` | Built |
| **L2** | Intent classifier: hashed-n-gram logistic model over engine-generated synthetic utterances, with calibrated confidence and routing thresholds (≥0.90 execute; 0.65–0.90 execute iff exactly one grounded interpretation; <0.65 falls through). Composed with L1 via `route()`. | `packages/language/src/{features,classify,router}.ts`, committed weights under `src/weights/` | Built |
| **L3** | Model **data** tooling: harvest real worldgen into control strings, drive a teacher model (subagents-as-teacher in this sandbox) to generate paraphrase/task pairs for all six trained tasks, validate, report stats. This is tooling, not a runtime tier — it produces the corpus L4 trains on. | `tools/harvest.js`, `tools/generate.py`, `tools/validate.py`, `tools/stats.py`, `tools/lang/`, `tools/stub_teacher.js` (dev-time stand-in for the real teacher) | Built (data pipeline only; one real agents-as-teacher smoke batch at 95.7% pass; see L4 for the gap) |
| **L4 — training + smoke model** | nanoGPT-style trainer, corpus-built BPE tokenizer, a CPU smoke run proving corpus → checkpoint → sample loop | `train/` (referenced by `make train-local`, `.github/workflows/train.yml`) | **Not built.** No `train/` directory exists on disk yet — needs a real corpus batch from L3 first |
| **L5 — WASM twin runner** | int8 llama2.c-derived runner, emsdk build, worker wrapper, wired into golem-grid's ▶GOLEM-PLUG◀ | `wasm/runq.c` (referenced by `make wasm`, `.github/workflows/deploy.yml`) | **Not built.** No `wasm/` directory exists — blocked on emsdk + L4 producing a checkpoint |
| **L6 — real twin v1** | Full corpus, spot-GPU training run, eval-gated publish, quantized content-addressed artifact | `.github/workflows/train.yml`'s eval gate | **Not built** — infra-blocked (needs a GPU account, `train.yml`'s AWS variables, and a real corpus) |
| **L7 — NPC context compiler** | Deterministic engine-state → truth-envelope (KNOWS/DOES_NOT_KNOW/RELATIONSHIP/QUEST_STATE/recent witnessed events) → bounded-reply compiler; NPC memory as component data. No transcript accumulation, model stays stateless. | `packages/language/src/context.ts` (`compileEnvelope`, `envelopeToControlString`, `renderStubReply`); one demo NPC wired client-locally in `games/golem-grid/src/npc.js` (deliberately outside the reduce/validate callgraph — see `games/golem-grid/tests/npc-not-in-callgraph.test.js`) | Built. `renderStubReply` is the template stand-in for the still-not-built L4–L6 twin — the same "fully playable with the twin disabled" fallback as ▶GOLEM-PLUG◀ |

The template/stub narrator (the ▶GOLEM-PLUG◀'s current implementation in
`games/golem-grid/src/main.js`, and L7's `renderStubReply` for NPC
dialogue) is what plays today with narration "on": deterministic
table-driven prose, not a model. This is also law 10's documented
fallback path once L5/L6 exist — the game must stay fully playable with
the twin disabled.

Per-tier design docs (read these instead of expecting this file to
duplicate them):
- `docs/superpowers/specs/2026-07-06-l1-language-parser-design.md`
- `docs/superpowers/specs/2026-07-06-l2-intent-classifier-design.md`
- `docs/superpowers/specs/2026-07-06-l3-data-tools-design.md`
- `docs/superpowers/specs/2026-07-07-l7-context-compiler-design.md`
- `docs/superpowers/specs/2026-07-07-a1-pr1-affordances-hook-design.md`
- `docs/superpowers/specs/2026-07-07-a1-pr2-golem-grid-adopt-design.md`

## How a game is built on the kernel

### The reference consumer: golem-grid

`games/golem-grid/` is the worked example DELTA's K5 produced. It is a
thin client over the kernel packages, composed from small single-purpose
modules under `src/`:
- `shared/module.js` — the `KernelCore` implementation (`deriveWorld`,
  `validate`, `reduce`) plus `affordances()` (A1 PR2, `shared/
  affordances.js`) that `packages/kernel`'s `replay()` drives.
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
- `src/npc.js` — the L7 demo NPC: client-local only, zero reduce/
  validate/wire footprint.
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
golem-grid's split. All six legacy ASCII levels compile and are
playable; **five** now have a recorded solution log pinned as a
permanent replay fixture (`games/topdown-puzzle/tests/solutions/`, DELTA
C4 PR4, `freeze:verify`-gated). Full design:
`docs/superpowers/specs/2026-07-06-c4-topdown-port-design.md`.

### The flagship: some-hero (DELTA Phase 4 — headless-complete)

`games/some-hero/` is a full kernel game, not a legacy port-in-progress
— its Ceremony route (S1–S5) is done end to end for everything
verifiable without a browser:
- `content/` (S1) — a C1-compiled, hash-pinned pack
  (`content/pack.json`): the Guild Hall map, the Door Golem
  (`Lock.unlockCondition`), three credentials, the stamp, tomb-floor-1
  enemy entities, and 16 tables of Ledger/golem/riddle/seal copy, every
  string byte-identical to the legacy game (`content-review.test.js`).
- `rules/` (S2a) — pure helpers (puzzles/riddle/credentials/credit/
  ledger/meta), table-fed from the content pack; their kernel-mirrored
  characterization tests live in `rules/tests/ceremony-kernel/`
  (credential-acquisition, credit-apr, death-respawn-persistence,
  door-golem, ledger-text, seal-stairs — 60 kernel-mirrored `@ceremony`
  tests plus 2 documented scarab divergences, run by
  `test:ceremony-kernel`).
- `shared/{reducer,module,tick,floorgen,solver,pack-loader}.js` +
  `src/host.js` (S2b/S2c/S3) — the five-tier `State` (world/run/
  character/knowledge/profile + a `pending` two-step slot), the full
  `deriveWorld`/`validate`/`reduce`/`observe`/`affordances`/
  `narrativeFacts` `GameModule` (the first complete implementer in the
  monorepo), the C4 tick bridge, grid movement, the Door Golem gate +
  two-step ceremony, zone transitions, resurrection-as-reduce, a
  run-scoped enemy tier with skeleton combat + pickups, and
  `shared/floorgen.js`'s tomb-floor generator built on `packages/world`
  (S3 PR1) with a 10K-seed reachability/winnability solver gate
  (`make solve-some-hero`).
- `src/render-adapter.js` (S4 PR1) — `adapt(observation)` maps the
  kernel's `observe()` output to the legacy desert-skin's view-model
  shape, imports nothing from `legacy/`; a headless drawable-hash test
  proves it drives the real legacy draw functions without a browser.
  The interactive/visual half of S4 (Playwright smoke on both skins) is
  **browser-blocked** — deferred, not faked, in this sandbox.
- `tests/e2e-headless/full-route.test.js` (S5, check 1 of THE CEREMONY)
  scripts the whole route — Door Golem gate ceremony → seeded generated
  tomb → tick-driven skeleton contact → death → resurrect → ledger —
  and proves it replays **bit-identically** across a live run and two
  segmented replays. S5 checks 2 (`@ceremony`, 62 tests) and 5
  (golem-grid + topdown-puzzle on the same kernel build) already hold;
  checks 3–4 (fully playable / twin-narrated, interactive Playwright)
  and the `engine-v1.0` tag are the same browser-blocked remainder as
  S4's visual half — no git tag has been cut yet.
- `legacy/` stays exactly as imported (read-only); `ceremony/*.ceremony.test.js`
  (the 62-test legacy characterization suite) still runs verbatim
  against it, unchanged, as the port's living spec — see MIGRATION.md.

Design docs: `docs/superpowers/specs/2026-07-07-s1-content-extraction-design.md`,
`-s2a-rules-helpers-`, `-s2b-state-tick-`, `-s2b-pr3-ceremony-machine-`,
`-s2c-pr4-combat-`, `-s2c-pr5-narrativefacts-`, `-s3-pr1-packages-world-`,
`-s3-pr2-floorgen-`, `-s3-pr4-derive-wiring-`, `-s3-pr5-fuzz-solver-`,
`-s4-pr1-observe-adapter-`, and `-s5-headless-route-design.md`.

### Imported content: adventure (DELTA Phase 5 A3)

`imported-content/adventure/` imports the legacy `world.yaml` (33 rooms)
into a C1-compiled content pack via **hand-transcription**, not a YAML
parser — `content/entities.mjs` is transcribed from `world.yaml` +
`AUDIT.md`'s `func:`/`eval`/`exec` inventory + `DECISION-LOG.md` (every
audited occurrence's disposition: re-expressed as a component/condition,
or explicitly dropped — never mechanically carried across). `module/
module.js` implements the full six-hook `GameModule` (mirroring
some-hero's split), driven entirely by declarative components
(`Exits`/`Lock`/`Portable`/`Interactable`/`OnUse`/`Toggle`/`Spawns`/
`Knowledge`) evaluated through `@golem-engine/content`'s `evaluate()` —
no per-NPC/per-item bespoke code. `packages/clients`' `createTerminalSession`
(A3 PR2) is the headless-testable front end; `bin/play.mjs` is the one
untested, `node:readline`-only TTY surface wiring stdin/stdout to it.
`tests/e2e/sample-world.walkthrough.test.js` (A3 PR3) is a scripted,
bit-identical-replay E2E walkthrough of the sample world through the
terminal session — the DoD that closed both A3 and DELTA Phase 5. The
Python/Flask runtime, every `func:`/`eval`/`exec` mechanism, and
`AICharacter`'s `OpenAIClient.oneoff_prompt()` call are never ported —
see MIGRATION.md.

Design docs: `docs/superpowers/specs/2026-07-07-a3-pr1-adventure-import-design.md`,
`-a3-pr2-module-terminal-design.md`; `-a2-regions-design.md` for the
`packages/world` regions/portals overlay adventure's room graph is
structurally aligned with (not imported from — dependency-free by
design).

### The content-pack pipeline (C1/C2)

`packages/content`'s `compile(source)` takes an already-parsed JS value
(no file/YAML IO in the package itself) through: JSON-Schema validation
(`schemas/pack.v1.json`, ajv draft 2020-12) → condition hydration → the
`all/any/not/fact/cmp` evaluator (`evaluate()` — a tiny interpreter, not
`eval`) → reference resolution → freeze → sha256 hash
(`canonicalize()`/`hashPack()`), producing an immutable `RuntimePack
{hash, entities, tables, maps}`. Three content packs run through this
compiler today: `games/topdown-puzzle/content/` (C2, ASCII-importer
sourced), `games/some-hero/content/` (S1), and `imported-content/
adventure/content/` (A3 PR1).

`games/topdown-puzzle/content/` is the concrete pack: `entities.mjs`
defines the vocabulary the ASCII importer (C2) compiles topdown-puzzle's
token grammar (`# B D @ H V M E/W/N/S`) into; `build.mjs`/`build-pack.mjs`
run the compiler; `pack.json` is the frozen, hashed output actually
loaded by `shared/pack-loader.js`. Design:
`docs/superpowers/specs/2026-07-06-c1-content-pack-design.md`,
`docs/superpowers/specs/2026-07-06-c3-entities-components-design.md`.

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
- `src/terminal.js` — `createTerminalSession()` (A3 PR2), a pure,
  headless-testable text-adventure front end over any `GameModule` whose
  commands are `{verb, noun}`-shaped and whose `observe()`/`affordances()`
  follow the canonical shapes. No `process.stdin`/DOM — I/O stays at the
  edges (`imported-content/adventure/bin/play.mjs` is the one untested
  TTY wrapper around it).

Consumed today by golem-grid (movement, tap-context menu, chat toggle),
topdown-puzzle (movement-only so far), and adventure (the entire
terminal play loop). A canvas-renderer adaptation of some-hero's own
desert skin exists (`games/some-hero/src/render-adapter.js`, S4 PR1) but
lives in the game, not yet generalized into this shared package.

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
  each); `games/topdown-puzzle/tests/solutions/` holds 5 per-level
  replay logs (C4 PR4); `games/some-hero/ceremony/*.ceremony.test.js`
  (62 tests) pin the flagship's *legacy* behavior; `games/some-hero/
  rules/tests/ceremony-kernel/*.kernel.test.js` (60 tests, plus 2
  documented scarab divergences) prove the kernel port matches it; and
  `games/some-hero/tests/e2e-headless/full-route.test.js` pins a
  bit-identical replay hash for the whole Ceremony route (S5 check 1).
  All are exact-match: a diff means the world function or reducer
  changed, which CLAUDE.md's doctrine treats as a versioning event, not
  a bugfix.
- **`npm run freeze:verify`** (a permanent CI job) runs, in order:
  golem-grid fixture replay (`verify:golem`), the legacy `@ceremony`
  suite (`test:ceremony`), topdown-puzzle parse-snapshot verification
  (`verify:tdp`), topdown-puzzle solution-log replay (`verify:tdp-solutions`,
  C4 PR4), some-hero content-pack verification (`verify:some-hero-content`,
  S1), and the some-hero kernel `@ceremony`-mirror suite
  (`test:ceremony-kernel`, S2) — failing fast at the first red step.
- **CI job graph** (`.github/workflows/ci.yml` — see README.md for the
  full documented graph, DELTA O1): `determinism` (root `npm test` —
  every workspace's own test script in one pass, including some-hero's
  and adventure's), `solver` (10K-seed winnability/difficulty band),
  `validator` (Python grounding tests, including L3's task A–F
  validators driven through the real L1 parser), `build` (ban-check +
  single-file golem-grid build), `some-hero-legacy` (the flagship's own
  unit+E2E suite, run read-only from its vendored snapshot),
  `level-manifest` (topdown-puzzle level manifest drift check),
  `event-schema` (K6 schema validated against every golem-grid
  fixture/golden + its own unit tests), `freeze-verify`, and
  `deploy-pages` (gated on all of the above). Separate workflows:
  `data.yml`/`train.yml`/`deploy.yml` are the model pipeline — manual
  `workflow_dispatch`/tag-triggered, not part of the PR-gating `ci.yml`
  graph, and not yet exercised for real (no corpus batch, no trained
  model, no deployed weights exist yet — see the L4–L6 status above).
  There is no separate CI job named "ceremony": DELTA O1's ceremony gate
  is folded into `freeze-verify` (which runs `test:ceremony` and
  `test:ceremony-kernel` among its steps), not a standalone job.
- **Two-tab / visual smoke.** `make smoke-e2e` (golem-grid) and
  `make smoke-e2e-tdp` (topdown-puzzle) run real-Chromium Playwright
  smokes (cross-tab play, a genuine wire DENY round-trip, deterministic
  canvas-pixel pinning). Not wired into `npm test`/CI — run locally by
  design (flake budget). some-hero's own equivalent (S4 PR2's visual
  smoke on both skins, S5 checks 3–4's interactive Playwright) is
  **browser-blocked** and does not exist in this sandbox — deferred, not
  faked.
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
- `docs/superpowers/specs/2026-07-07-s1-content-extraction-design.md`
- `docs/superpowers/specs/2026-07-07-s2a-rules-helpers-design.md`
- `docs/superpowers/specs/2026-07-07-s2b-state-tick-design.md`
- `docs/superpowers/specs/2026-07-07-s2b-pr3-ceremony-machine-design.md`
- `docs/superpowers/specs/2026-07-07-s2c-pr4-combat-design.md`
- `docs/superpowers/specs/2026-07-07-s2c-pr5-narrativefacts-design.md`
- `docs/superpowers/specs/2026-07-07-s3-pr1-packages-world-design.md`
- `docs/superpowers/specs/2026-07-07-s3-pr2-floorgen-design.md`
- `docs/superpowers/specs/2026-07-07-s3-pr4-derive-wiring-design.md`
- `docs/superpowers/specs/2026-07-07-s3-pr5-fuzz-solver-design.md`
- `docs/superpowers/specs/2026-07-07-s4-pr1-observe-adapter-design.md`
- `docs/superpowers/specs/2026-07-07-s5-headless-route-design.md`
- `docs/superpowers/specs/2026-07-07-l7-context-compiler-design.md`
- `docs/superpowers/specs/2026-07-07-a1-pr1-affordances-hook-design.md`
- `docs/superpowers/specs/2026-07-07-a1-pr2-golem-grid-adopt-design.md`
- `docs/superpowers/specs/2026-07-07-a2-regions-design.md`
- `docs/superpowers/specs/2026-07-07-a3-pr1-adventure-import-design.md`
- `docs/superpowers/specs/2026-07-07-a3-pr2-module-terminal-design.md`

For doctrine and the four-bequest history, read VISION.md. For the
task-by-task build order and what's next, read DELTA.md. For working
practices (make targets, current status log), read CLAUDE.md.
