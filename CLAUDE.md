# CLAUDE.md — golem-grid

Read VISION.md and DELTA.md; historical spec at
docs/SPEC-golem-v0.2.md. VISION.md is the constitution; this file holds
the working practices. When in doubt, the doctrine decides.

## Doctrine

1. The world is a pure function of the seed. Never stored, never sent.
   Any change to worldgen output is a MAJOR version bump — golden-seed
   tests exist to make this impossible to do by accident.
2. The delta map is the only mutable truth. Save = seed + event log.
3. One host sequences events; `applyEvent()` is deterministic and
   identity-blind; clients are bit-identical by construction.
4. The golem is a mouth. Control string in, prose out. It never decides,
   never remembers, never touches state, and cannot lie about the world.
   The only integration point is the ▶GOLEM-PLUG◀ seam.
5. Prose sampling is seeded by (seed, eventSeq): identical hallucination
   on every client; prose never crosses the wire.
6. Determinism for what the world knows; private host entropy for what it
   hides (traitor identity, when built).
7. All meaning is authored upstream (tables, grammar, corpus). The
   generator is a librarian, not a writer. Improve tables before
   improving the generator.
8. Hallucination is a failing test. Models are eval-gated build
   artifacts: immutable, content-addressed, pinned by manifest.

## Design tests for any new feature

- Oatmeal: does it create a decision, a consequence, or a retellable
  story? More world alone is rejected.
- Teachability: if one line of golem prose can't teach the rule, the rule
  is too complex.
- Gauge redundancy: resources must be felt in the world, not only shown
  in a meter.
- One key, one meaning: no context-sensitive controls. Arrows are feet,
  always, capture-phase.

## Working practices

- `make test` before and after everything. Golden files are exact-match;
  if a golden diff is intended, it is a versioning event — say so.
- Pure logic (rng, worldgen, reducer, solver) lives in shared modules
  imported by both the page and node tools/tests. No logic forked
  between browser and tooling.
- The reducer never reads local identity. The host validates; clients
  render. Perception (seen/lit) is client-local by design.
- Keep the wire protocol at five message kinds (HELLO, SNAPSHOT, CMD,
  EVENT, DENY). Transports are swappable behind send/onmsg.
- Control-token schema changes are corpus-breaking: version them, and
  update SPEC.md §5 in the same commit.
- Single-file HTML deliverable stays runnable from file:// with two tabs
  (BroadcastChannel + storage-event bridge). Do not break the demo path.
- Respect prefers-reduced-motion in every effect. No localStorage for
  game state (net shim only).
- Never overwrite a published weight artifact. Rollback = repoint
  manifest.

## Commands

- `make test` — determinism + validator tests
- `make solve` — 10K-seed winnability + difficulty band
- `make html` — build games/golem-grid/dist/golem-grid.html (file:// demo)
- `make dev` — Vite dev server
- `make data-batch` — one generation batch through the validator
- `make train-local` — 256K-param CPU smoke model (minutes)
- `make wasm` — build the WASM runner
- `make infra-plan` / `infra-apply` — Terraform (see infra/)
- `npm run freeze:verify` — behavior-freeze gate (golem fixture replay +
  some-hero @ceremony tests + topdown-puzzle parse snapshots)

## Current status

Roadmap steps 1–3 are DONE: shared modules (now under
games/golem-grid/shared/), Vite single-file build (make html), tests
green (make test), solver gate (make solve). Phase 0 of DELTA.md is now
complete: P0.1 monorepo restructure (this repo is the golem-engine
monorepo: games/golem-grid/, packages/*, drawer/, docs/), P0.2 legacy
imports (some-hero, topdown-puzzle under games/*/legacy/), and P0.3
behavior freeze (25 golem-grid seed fixtures, some-hero `@ceremony`
characterization tests, topdown-puzzle initial-grid parse snapshots —
all wired into `npm run freeze:verify`, a permanent CI job). VISION.md
and DELTA.md now govern — DELTA.md on sequencing, VISION.md on
principle. Phase 1 K1 (`packages/random`) is DONE: h32/channel/pick/
chance/rint live in packages/random as TypeScript, built via `prepare`
(tsc), with vector + cross-check tests; games/golem-grid/shared/rng.js
is now a re-export and every frozen fixture/golden/ceremony test still
passes unchanged. K2 (`packages/kernel` — types and pure reducer) is now
DONE: packages/kernel exports Event/Command/Denial/ValidateResult/
isDenial/GameModule/KernelCore and the pure `replay()` fold (TS strict,
zero runtime deps); games/golem-grid/shared/reducer.js gained a pure
`reduce(state, dungeon, event) → state` (fresh Map, copied player
objects, no mutation), with `applyEvent` now a thin in-place adapter
over it; shared/module.js ports src/main.js's old `hostCmd` to
`validate(ctx, cmd) → Event[] | Denial` with byte-exact parity
(including derived LIGHT_WARN/WIN/LOSE event ordering); main.js's
`hostCmd` is now a 3-line adapter over `validate`. All 25 frozen P0.3
fixtures replay byte-identically through the new pure `reduce` (the K2
DoD), and every existing test/fixture/golden still passes unchanged.
The golem is still the stub at ▶GOLEM-PLUG◀. K3 (`packages/kernel`
event log + hash chain) is now DONE: a new `"./log"` subpath export
(`packages/kernel/src/log.ts`, node:crypto confined to this entry only —
`src/index.ts` stays platform-neutral) provides `canonicalEvent`
(sorted-key JSON bytes, the versioned wire format for everything
below), `appendEvent`/`verifyChain` (append-only sha256 hash chain,
genesis `prev` = 64 zeros), and `checkpoint`/`verifyCheckpoint`
(ed25519-signed digest over the chain's tip, via `makeDevKeypair` — dev
key, key management out of scope). Tamper detection is proven both at
the chain's tip and mid-chain (with the documented one-link-forward
surfacing behavior for payload-only tampering), and checkpoint
verification is proven to survive an actual process restart (a
committed child script under `packages/kernel/tests/`, spawned fresh,
exits non-zero on a byte-flipped stored file). `packages/testkit/tests/
log-chain.test.js` chains one frozen P0.3 fixture log through the new
API and confirms tamper detection on a real (non-toy) event stream —
fixtures remain untouched; golem-grid's live wire/fixtures still carry
no `prev` field (that adoption is K5's call). Every existing test/
fixture/golden/ceremony/freeze-verify still passes unchanged. K4
(`packages/net`) is now DONE: the five-message wire protocol (HELLO/
SNAPSHOT/CMD/EVENT/DENY, discriminated union + per-kind type guards),
the `Transport {ok,label,send,onmsg}` interface, `createBroadcastTransport`/
`createStorageTransport`/`createAutoTransport` (BroadcastChannel-then-
storage-then-`ok:false` layering, labels byte-identical to the old
inline NET: "BroadcastChannel + storage bridge" / "BroadcastChannel" /
"storage bridge" / "none (solo)"), and `makeDeduper` (ported verbatim,
including the >600-eviction branch that was an open gap since the P0
freeze) all now live in packages/net (TS strict, browser-safe — no
node: imports; the old Math.random() id-nonce, banned under
packages/**/src, is now Web Crypto's getRandomValues). games/golem-grid/
shared/dedup.js is a one-line re-export (rng.js/K1 pattern); main.js's
inline NET IIFE is now `createAutoTransport("golem-grid-1",
"golem-grid-net")`. Transport contract tests use fakes (fake
BroadcastChannel pair, fake cross-tab storage world), not Node's
ambient BroadcastChannel/localStorage, per the K4 brief. The required
two-tab Playwright smoke (`games/golem-grid/tests/e2e/
two-tab.smoke.mjs`, `make smoke-e2e`, using the Playwright already
installed under games/some-hero/legacy/node_modules — not a root/
golem-grid dependency) passes against the real single-file build in
real Chromium: cross-tab movement rendering and a genuine wire DENY
round-trip (peer's illegal move denied by the host, delivered back over
the net package) are both exercised. Not wired into npm test/CI
(flake budget is O1's call — run it locally). Every existing test/
fixture/golden/ceremony/freeze-verify still passes unchanged; `make html`
still produces a single file with zero external references. K5
(re-host golem-grid on K1–K4) is now DONE: golem-grid is a thin client
over the kernel packages; the original hand-written single-file layout
is demoted to a reference fixture only. `games/golem-grid/reference/
golem-grid.html` is the pre-Vite v0.2 prototype recovered byte-verbatim
from git history (parent of the "golem-grid.html => src/main.js" rename
commit), sha256-pinned by `tests/reference.test.js`, documented in
`reference/PROVENANCE.md` — never edited, opens straight from `file://`.
`src/main.js` shrank from ~340 lines mixing state/host/snapshot/
perception/render/input into a composition root wiring five focused
modules: `src/host.js` (hostCommit seq-stamping + the derived LIGHT_WARN/
WIN/LOSE recursion, no DOM), `src/client.js` (applies EVENTs via the same
`applyEvent` adapter the host uses — no fork — and applies SNAPSHOTs by
folding the joining peer's log through @golem-engine/kernel's pure
`replay()` driving shared/module.js's KernelCore, the K5 acceptance
hook), `src/perceive.js` (client-local seen/lit + LOS, no network),
`src/render.js` (canvas/feed/status-bar DOM primitives), and `src/
input.js` (capture-phase arrow keys + click context menu). The `render(ev)`
dispatcher and the ▶GOLEM-PLUG◀ prose functions (`golemLine`/`roomBeat`/
`proseFor`/`lookAt`) stay in main.js by design — splitting them further
would have scattered a single dispatch/narration decision across modules
for no behavioral gain (documented, not an oversight). No wire changes:
still five message kinds, no `prev` stamping live (kernel log adoption
remains deferred infrastructure). Visual pinning: `tests/e2e/
visual.smoke.mjs` (new, run by `make smoke-e2e` alongside the two-tab
smoke) captures the canvas's own `toDataURL()` output at 3 light tiers
under a fixed seed/scripted moves/`prefers-reduced-motion:reduce`
emulation (which the app's `instant` flag already uses to disable
drawGrid's only two Math.random() calls) — the pixel gate held
byte-identically pre- vs post-restructure on every checkpoint (DOM/
feed/status/lightfill-inline-style fallback captured too and also
matched). All frozen fixtures (25/25), ceremony (62/62), topdown-puzzle
snapshots (6/6), solver band (max 354, unchanged), and `make
smoke-e2e` (two-tab + visual) pass against the restructured client;
`make html` still produces a single file with zero external references.
The "Single-file HTML deliverable" working-practices bullet still holds
as written — the built dist demo path is unchanged; `reference/` is an
addition, not a replacement. K6 (event schema v1 — the drawer's free
part) is now DONE, and with it **PHASE 1 IS COMPLETE (K1–K6)**:
`packages/kernel/schemas/events.v1.json` (JSON-Schema draft 2020-12,
version in the filename) defines every golem-grid event kind
reality-first — matched to the 25 frozen `packages/testkit/fixtures/
golem/*.log.json` logs + `games/golem-grid/tests/golden/replay-log.json`
byte-for-byte (JOIN/MOVE/TAKE/TAKE_PRIZE/WIN/SAY census'd directly, 2,496
+ 75 = 2,571 events; LOSE/WHISPER/EMOTE/READ/LIGHT_WARN derived from
`shared/module.js` + the pinned `validate.test.js`/`reducer.test.js`
characterization since no fixture happens to lose/whisper/emote/read) —
plus the full drawer vocabulary (schema fields only, zero consumers,
per DELTA.md §0.4): `audience` (optional on every kind, default "all" is
semantic/not injected), reusable `AttributionFields`/`MilestoneContributor`
property groups, `MILESTONE`, the five oath kinds, the four economy
kinds, MARKET.md's three kinds, and CREDIT.md's five kinds + a
documentation-only `debt:` namespace note. `packages/testkit/tools/
validate-events.mjs` (ajv, draft-2020 build, default code-gen mode —
now a root exact-pinned devDependency) is the CI-runnable gate; the new
`event-schema` CI job runs it plus `packages/testkit/tests/
event-schema.test.js` (fixture conformance + 7 negative cases, one per
failure mode, including drawer kinds) and `packages/testkit/tests/
conservation.test.js` (the gold-conservation helper,
`packages/testkit/tools/conservation.mjs`'s `checkGoldConservation`,
TDD'd RED-first — pure, folds GOLD_MINTED/BURNED/TRANSFERRED/
PURSE_DISTRIBUTED over balances, checks sum(balances) == minted − burned
after every event, localizes the first violating seq; per-account
non-negativity is explicitly out of scope, documented inline). No
reducer/validate/wire file changed; every existing test/fixture/golden/
ceremony/freeze-verify/solver-band/smoke-e2e still passes unchanged.
Phase 1 (K1–K6) needs a whole-phase review before Phase 2 (C1 —
`packages/content`: schema + compiler) begins.

### Update — 2026-07-06 (Phase 1 review → Phase 3 L3; see ARCHITECTURE.md / MIGRATION.md)

The narrative above ends at K6 (end of Phase 1). Since then, `main` has
advanced substantially — for the authoritative map of the current
codebase read the new **ARCHITECTURE.md** (package map, kernel contract,
language tiers) and **MIGRATION.md** (legacy disposition + drawer index).
Concise status:

- **Phase 1 whole-phase review: DONE.** An adversarial review found and
  fixed a real shipped **blocker** (`games/golem-grid/src/host.js`
  double-emitted derived `LIGHT_WARN/WIN/LOSE` — no test exercised the
  live `hostCmd`→`hostCommit` path) plus two MAJORs (`canonicalEvent`
  `__proto__`/NaN hash-injectivity; missing `client.js`/`perceive.js`
  unit coverage) and schema nits. All fixed and merged.
- **Phase 2: DONE.** C1 `packages/content` (schema + safe `all/any/not/
  fact/cmp` compiler + hashing); C2 topdown-puzzle ASCII importer; C3
  kernel components (`packages/kernel/src/components.ts`) + a read-only
  golem-grid entity overlay (byte-identical by construction); C4
  topdown-puzzle kernel port — foundation + the fixed-step `TICK_ADVANCED`
  bridge (movers/baddies/contact damage) + a Canvas-2D client (no Phaser).
  **C4 PR4 (≥5 real-level solution-log fixtures) remains** — needs
  playtesting or a solver.
- **Mobile ergonomics: DONE + live.** `packages/clients` shared touch
  layer (pure gesture engine + `createTouchControls`); golem-grid is now
  playable on a phone with the soft-keyboard fix (text input opt-in behind
  a chat toggle); topdown-puzzle wired too.
- **Deploy: fixed.** GitHub Pages enabled; green `main` auto-publishes the
  single-file golem-grid to `https://tuckermclean.github.io/golem/`.
- **Phase 3 (language) tiers 1–3: DONE.** L1 deterministic parser + L2
  intent classifier (both in `packages/language`; `route()` composes
  them); L3 model-data tooling (`tools/harvest.js`/`generate.py`/
  `validate.py`/`stats.py`) with one real agents-as-teacher smoke batch
  (95.7% pass). **L4–L6 (the twin: nanoGPT training, WASM runner, real
  GPU corpus) are NOT built** — they need training/GPU/emsdk
  infrastructure. `packages/world` is still a stub.

Doctrine (VISION.md) and sequencing (DELTA.md) are unchanged and still
govern.

### Update — 2026-07-07 (Phase 4: the some-hero Ceremony — headless arc COMPLETE)

DELTA Phase 4 (SOME HERO: The Ceremony) — **its entire headless-verifiable
arc is DONE: S1, S2, S3, S4's pure core, and S5's headless acceptance
checks. The only remainder is browser-blocked (S4 visual smoke, S5
interactive checks, the `engine-v1.0` tag) — deferred, not faked.** Also
cleared: **C4 PR4** (5 real topdown-puzzle solution-log fixtures,
`freeze:verify`-gated) and **Phase 3 L7** (the NPC context compiler +
`renderStubReply`, in `packages/language`).

- **S1 (content) DONE**: `games/some-hero/content/` — a C1-compiled,
  hash-pinned (`content/pack.json`) Ceremony-route pack: minimal
  `map:guild_hall`, the Door Golem (`Lock.unlockCondition`), three
  credentials, the stamp, tomb-floor-1 enemy entities, and 16 tables of
  Ledger/golem/riddle/seal copy — every string byte-identical to legacy,
  proven by `content-review.test.js`. `verify:some-hero-content` is a
  `freeze:verify` gate. Legacy untouched (grep-enforced).
- **S2 (rules port) DONE**: `games/some-hero/{rules,shared,src}/`.
  - `rules/` — pure helpers (puzzles/riddle/credentials/credit/ledger/
    meta), table-fed from S1.
  - `shared/{reducer,module,tick}.js` + `src/host.js` — the five-tier
    `State` (world/run/character/knowledge/profile + a `pending` two-step
    slot), `deriveWorld`/`validate`/`reduce`/`narrativeFacts` KernelCore,
    the C4 tick bridge, grid movement, the Door Golem gate + two-step
    ceremony, zone transitions, resurrection-as-reduce, and a
    run-scoped enemy tier with skeleton combat + pickups. A world-swap-
    aware fold handles the ow↔tomb zone change (kernel `replay()` can't
    cross worlds); determinism proven by segmented-replay hash tests.
  - `src/ledger-render.js` — the twin-disabled template path;
    `narrativeFacts` stays facts-only (VISION law 5).
  - **DoD MET**: all 62 `@ceremony` tests pass against the kernel — 60
    kernel-mirrored (`rules/tests/ceremony-kernel/`, run by
    `test:ceremony-kernel`, a `freeze:verify` gate) + 2 intentional
    scarab divergences (scarab is dead gen-1 holdover content — NEVER
    re-add it). `ceremony-parity.test.js` machine-checks this
    reconciliation. Legacy `test:ceremony` (62) still runs verbatim
    against `legacy/`, untouched.
- **S3 (worldgen) DONE**: `packages/world`'s first feature (the
  dependency-free pinned-room contract: `placeRooms`/`placePinnedRooms`/
  `chainCorridors`/`featureEligibleRooms`) + `games/some-hero/shared/
  floorgen.js` (legacy `generateFloor` ported onto `layout`/`puzzle`/
  `spawns`/`decor` named channels + `packages/world`). Wired into the
  live `deriveWorld` via an additive `mapId`-prefix dispatcher
  (`map:`=authored pack map; `tomb:<seed>:<runs>:<floor>`=generated) +
  seed threading (`state.world`'s 3-field shape stays locked; generation
  key lives in the mapId). Golden-seed tests (`tests/golden/`, regen a
  no-op) + a reachability/connectivity solver (`shared/solver.js`) with a
  `make solve-some-hero` 10K-seed gate — **120K floors all winnable**.
  LIVE roster only throughout (scarab/pigeon/goose/veteran and the rest
  of the dead gen-1 roster excluded — any appearance is a regression).
- **S4 (renderer adapter) — pure core DONE, visual smoke BROWSER-BLOCKED**:
  `observe(state,world,viewer)` (the first `GameModule.observe` in the
  monorepo — full-visibility, no fog; `viewer` structural/unused) +
  `src/render-adapter.js` (`adapt(observation)→` a legacy `game`-shaped
  view-model — grid→pixel, walls→`Uint8Array` TL enum, LIVE-roster enemy
  visuals; imports nothing from `legacy/`). A HEADLESS drawable-hash test
  feeds the adapter through the real legacy draw fns (`recordingCtx`→SHA)
  and pins a golden — proving it drives the desert renderer without a
  browser. The legacy desert `skin-snapshot` hashes stay byte-unchanged.
  **S4 PR2 (the DoD's "visual smoke E2E on both skins") is Playwright/
  Chromium — deferred: no browser in this sandbox, and `make smoke-e2e`
  is NOT wired into CI either, so it can't be verified anywhere here. Do
  NOT write+merge it blind (false green).**
- **S5 (THE CEREMONY acceptance gate) — headless checks DONE, interactive
  BROWSER-BLOCKED**: check 1 (`tests/e2e-headless/full-route.test.js`, a
  `freeze:verify` gate) scripts the WHOLE route (Door Golem gate ceremony
  → seeded generated tomb → tick-driven skeleton contact `HURT`→`DIED` →
  `resurrect` → ledger) and proves it **replays bit-identically** (hash
  `645255351`) across live + 2 segmented replays. Checks 2 (@ceremony 62)
  + 5 (golem-grid + topdown-puzzle on the same kernel) already hold.
  **Checks 3–4 (fully playable / twin-narrated interactive Playwright) +
  the `engine-v1.0` tag are browser-blocked — deferred, not faked.** The
  entire HEADLESS-verifiable arc of Phase 4 is complete; the remainder
  needs a real browser env (the user's machine, or someone wiring
  `smoke-e2e` into CI).
- **Honest gaps** (documented, not blocking): no `GRANT_*` credential
  event (the full-route arranges credentials on the start state, like
  every existing credentialed-entry test); `cabinet` (floors 3+) has no
  content `Actor` stats so `deriveWorld` filters it (floor 1 / the
  Ceremony route unaffected); interactive seal-puzzle resolution (riddle-
  answer/plates/traps) was deferred from S2c/S3 (the death-ending route
  doesn't need it).
- **Next verifiable**: Phase 5 A1 (affordances as a kernel API, consuming
  the new `observe()` hook) + A2 (regions overlay) + A3 (adventure
  import) — all pure/headless. Phase 6 (pipeline/ops) mostly likewise.

### Update — 2026-07-07 (Phase 5+6 done; some-hero tomb: FULL seal arc + warden boss + affordances + a 9-bug review campaign)

The section above ends at Phase 4's headless arc and lists Phase 5 as
"next"; both Phase 5 and Phase 6's verifiable work then landed, and the
some-hero tomb — whose "interactive seal-puzzle resolution" the update
above explicitly listed as a deferred honest-gap — is now fully
progressable. Concise status:

- **Phase 5 (A1/A2/A3) DONE**: A1 affordances as a kernel API
  (`Affordance {verb,target,name,aliases?,enabled?,requirements?,reason?}`;
  per-game `affordances()` in each `shared/`), A2 regions/portals overlay
  (`packages/world/src/regions.ts` — `assignRegions`/`Portal`/pure
  `nextPortalState` FSM), A3 adventure import (`imported-content/
  adventure/` YAML worlds → C1 pack + a `packages/clients` terminal client,
  zero dynamic code). **Phase 6 O1/O3 DONE** (CI workflow graph documented;
  ARCHITECTURE.md/MIGRATION.md/README brought current). O2 (Terraform) and
  the model twin L4-L6 remain infra-blocked.

- **some-hero tomb — the FULL seal arc is now progressable** (the S2c/S3
  deferral is closed). All five puzzle seals + the boss, each resolving
  through the single ported `stairsOpen` descend gate (`rules/puzzles.js`):
  - `riddle` (#65 — `answer <i>` → RIDDLE_ANSWERED → solved),
  - `traps` (#66 — step every un-hit trap → done==need → solved),
  - `key` (#67 — COLLECTED{kind:"key"} → have=true),
  - `plates` (#68 — block-PUSH movement onto pressure plates → all on →
    solved),
  - `torch` (#69 — a swing lights adjacent braziers additively; `resolveTick`
    burns them down 1 tm/tick; all-lit-at-once → solved; time-pressured),
  - `warden` boss (#70 — the legacy dash boss
    `sleep→idle→telegraph→dash→idle` canonicalized to grid/tick in
    `resolveTick`; `run.boss` slot; `attack boss`→WARDEN_HURT/WARDEN_SLAIN;
    the series' first seeded nondeterminism = post-dash cooldown jitter via
    `channel(seed,"warden",tick)`+`rint`. The `WARDEN {...}` FEEL constants
    are playtest-tunable defaults — flagged not headlessly verifiable; the
    state-machine LOGIC is fully proven).
  - #71 surfaced the two new in-range ACTIONS (`attack boss`, `attack
    brazier`) in `affordances()`.

- **Adversarial review campaign — 9 real bugs found+fixed** (all missed by
  passing tests; #72–#75): plates solved-block walk-through + torch
  range-deny lighting-drop (#72); warden sleeping-boss zero-retaliation +
  boss/enemy leak into the ow zone + same-tick double-DIED + dash-graze
  uncounted (#73); infinite intra-floor pickup re-collection (#74 —
  `run.collectedTiles` now tracks consumption, mirroring the traps `hit`
  flag); multi-enemy contact MASKING (a glued enemy made the player immune
  to every other enemy's contact) + no dead-player guard (a corpse could
  move/attack/loot and ticks re-fired HURT/DIED) → a **master dead-gate in
  `validate()`: only `resurrect` is legal while `pending.kind==="resurrection"`,
  `tick` no-ops** (#75). The **economy/credit** review came back CLEAN
  (death-payment bounds, interest, grading, `narrativeFacts`, purity all
  verified). Cross-game check: topdown-puzzle (exact-tile contact + a
  `state.over` guard) and golem-grid (`st.over` guard) are BOTH clean on
  the two portable bugs — some-hero was the sole diverger, now fixed.

- **Two decisions HELD for the user** (documented, not guessed):
  1. **Inter-visit gold re-farming** (flagged in PR #75's body): floor-1
     regenerates byte-identical gold each tomb re-entry (`runsSegment` isn't
     threaded into `generateFloor` — the parseTombMapId comment states
     generation intentionally needs only seed+floor) and `collectedTiles`
     resets per visit, so gold is farmable via die→resurrect→re-enter
     (bounded ~8g; economy currently dormant since `borrow()` is unwired).
     Fix is either **(a)** thread `runsSegment` → genuinely per-run floors
     (roguelike-faithful, but touches worldgen output) or **(b)** persist
     collected tiles in `knowledge` → one-time gold (no worldgen change).
     A real design/versioning call.
  2. **The final-floor endgame** (`FINAL_FLOOR=12`): NOT a clean "kill
     boss → win" — legacy opens the **Cancellation Desk**, an UNPORTED
     heist-token subsystem (`meta.heist`: skull/gregory/signature) + two
     endings (`applyCancel` cancel-the-apocalypse / `applyTransfer`
     become-the-account-holder → New-Game+). The final BOSS reuses the #70
     warden machinery (it's live-but-winless today — a documented LOW gap);
     the endgame CEREMONY around it is the design-heavy held piece.

- Everything else remaining is infra/browser/cloud-blocked (L4-L6 twin,
  O2 Terraform, S4-PR2 visual smoke, S5 checks 3–4, the `engine-v1.0` tag).

Git-auth note: SSH breaks on pod eviction — recover with
`gh auth setup-git` + an HTTPS `origin` remote (gh's token is valid).
