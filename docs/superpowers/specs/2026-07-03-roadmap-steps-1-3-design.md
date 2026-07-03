# Design: SPEC.md §8 roadmap steps 1–3 (repo-ify, tests green, solver in CI)

*2026-07-03 — approved in brainstorming session*

## Goal

Execute roadmap steps 1–3 exactly as SPEC.md orders them, with the
prototype playable at every step and zero change to worldgen output
(golden tests are built around the world function as it exists today;
any output diff is a MAJOR versioning event and out of scope).

Scope was explicitly capped at steps 1–3. Steps 4+ (data tools, smoke
model, WASM, real model, traitor layer) are future sessions.

## The module-strategy decision

Two CLAUDE.md constraints interact: pure logic must live in shared
modules imported by both the page and node tooling (no forked logic),
and the single-file HTML deliverable must stay runnable from `file://`
with two tabs — where browsers refuse cross-file ES-module imports.

**Chosen: ESM everywhere + Vite single-file build.**

- All logic is real ES modules. Pure logic (`shared/`) is imported by
  the page, the node tests, and the tools — one source of truth.
- The page becomes a small Vite app: `index.html` + `src/` (DOM,
  rendering, net shim, perception — the impure half).
- `vite build` with `vite-plugin-singlefile` emits
  `dist/golem-grid.html`: everything inlined, runnable from `file://`
  with two tabs. That artifact is the deliverable; it is **built, not
  committed** (`dist/` is gitignored). CI builds it on every push and
  uploads it as a workflow artifact.
- Dev loop: `vite dev` for hacking; `make html` for the shippable
  single file.
- The original `golem-grid.html` is kept only until the Vite build
  demonstrably reproduces its behavior, then deleted in the same
  commit that lands the port. `golem-world.html` stays as v0.1
  reference.

Rejected: committing a built single-file page (generated artifacts in
git, drift policing); scraping logic out of the HTML at test time
(fragile, backwards); multi-file classic scripts (breaks the
single-file deliverable).

## Step 1 — Repo-ify

- `git init`, baseline commit of the scaffold as-is (done at design
  time), `.gitignore` covering `node_modules/`, `dist/`, `work/`.
- `package.json` (private) with `vite` + `vite-plugin-singlefile` as
  devDependencies; `vite.config.js` targeting a single inlined output.
- Extract from `golem-grid.html` into pure shared modules:
  - `shared/rng.js` — `h32`, `channel`, `pick`, `chance`, `rint`.
  - `shared/themes.js` — `THEMES`, `TONE_LINE`, `TONES`, `ROOM_KINDS`.
  - `shared/worldgen.js` — `GW`, `GH`, `genDungeon(seed)`.
  - `shared/reducer.js` — `START_LIGHT`, `LIGHT_TIERS`,
    `applyEvent(state, ev)` plus the pure delta-map queries
    (`players`, `getP`, `light`, `itemAt`, `prizeCarrier`, `radius`)
    refactored to take state/dungeon as arguments. Identity-blind,
    DOM-free, no module-level mutable state.
- Port the impure remainder (render, perception, chat/commands, net
  shim, golem stub at ▶GOLEM-PLUG◀) into `src/` importing `shared/`.
  Behavior must match the original page exactly; then the original
  root `golem-grid.html` is removed.

## Step 2 — Tests green

- `tests/worldgen.test.js`
  - Golden-file exact match (`tests/golden/worldgen-<seed>.json`) for
    a handful of named seeds. `plagueis` is the canary: SPEC.md §9
    records it as salt_counting_house, 12 rooms, prize depth 34,
    already verified. If extraction changes any of that, extraction
    broke worldgen — fix the extraction, never the golden.
  - 500-seed harness: generate each world twice, hash-compare
    (determinism), and assert solver-winnability (see step 3).
- `tests/replay.test.js`
  - A recorded event-log fixture replayed through `applyEvent`;
    serialized final delta map must be byte-identical to a committed
    golden snapshot.
  - Dedup case: deliver every event twice through the same
    `_id`-dedup logic the transport uses; final state must equal the
    single-delivery state (double-delivery must not double-apply).
- `tools/test_validate.py`
  - pytest unit tests for every violation class in
    `tools/validate.py`, including adversarial phrasings: direction
    words in body text vs the exits line, item nouns matched on last
    word, creature hints under `MOB:none`, missing mob, banned
    register, sentence budget, exits-line format/mismatch, and clean
    pairs passing.
- `make test` passes; ci.yml passes (same jobs, plus a build job that
  runs `vite build` and uploads `dist/golem-grid.html`).

## Step 3 — Solver in CI

- `shared/solver.js`: BFS over the generated grid.
  `solve(dungeon)` returns `{winnable, depth, budget}` where
  `budget = depth×1 (walk in) + depth×2 (carry out)` — the worst-case
  single-traveler light cost of entrance→prize→entrance.
- `tools/solve.js`: run 10K seeds (`--seeds N`), fail if any seed is
  unwinnable (prize unreachable or `budget > START_LIGHT`), and fail
  on difficulty-band drift: budget-distribution percentiles must stay
  inside a recorded band (committed constants, chosen from the
  observed distribution at implementation time).
- `make solve` target; new CI job running it. The 500-seed test in
  step 2 reuses `shared/solver.js` for winnability.

## Testing / verification

- `make test` green locally (node --test + pytest).
- `make solve` green over 10K seeds.
- `make html` produces `dist/golem-grid.html`; manual demo-path
  check: open it from `file://`, two tabs, host + joiner, move/take/
  read/win work, prose identical across tabs, reduced-motion path
  renders.

## Non-goals

No change to worldgen output, prose stub output, wire protocol, event
types, or `golem-world.html`. No new gameplay. No steps 4+.
