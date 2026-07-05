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
passes unchanged. The golem is still the stub at ▶GOLEM-PLUG◀. Next:
K2 (`packages/kernel` — types and pure reducer).
