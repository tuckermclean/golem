# S3 PR5 — Fuzz + reachability solver + CI gate (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 4 **S3**, PR5 — the **S3 closer**. Adds the
pinned-room invariant fuzz (10K seeds) + a reachability/connectivity
solver + a `make solve-some-hero` CI gate. Closes S3's DoD: "golden-seed
tests (PR3); pinned-room invariants fuzz-tested across 10K seeds; solver
confirms route winnability." Operates on PR2's `generateFloor` output
directly (no `deriveWorld` needed).

## The solver = reachability/connectivity checker (locked scope)

Per the S3 decision, NOT a search-based solver — mirrors golem-grid's
tiny `shared/solver.js` (one BFS + a small check) in size/ambition.

`games/some-hero/shared/solver.js`:
- `bfs(floor, from) → dist grid` — 4-dir BFS over walkable tiles (a tile
  is walkable iff `!floor.walls.has("x,y")` and in bounds). Same shape as
  golem-grid's `bfs` (`games/golem-grid/shared/solver.js`).
- `solve(floor) → { winnable: boolean, reason?: string }`:
  1. **Connectivity**: BFS from `floor.spawn` reaches `floor.stairsAt`
     (the exit). Also reaches every room center + every pinned-room
     center (the "always connected" invariant).
  2. **No stairs in a pinned room**: `floor.stairsAt` is not inside any
     `floor.pinnedRooms[i]` bounding box (the "never contains stairs"
     invariant).
  3. **Seal-gate reachability** (reachability proxy, no combat sim): for
     the floor's `puzzle.type`, assert the gating tiles the floor exposes
     are reachable — key pickup / each plate+its block / each trap / each
     torch (whatever positions `generateFloor`'s output carries); for
     `warden`/`final`, the boss room/exit is reachable. If the floor
     doesn't expose exact gating positions, connectivity (spawn→exit) is
     the sound winnability proxy (the S3 brief's ruling) — do the
     strongest check the output supports, documented.
  `winnable=false` with a `reason` on any failure.

## Fuzz + in-suite sample

- **In-suite** (`games/some-hero/tests/fuzz.test.js` or folded into
  `worldgen.test.js`): a **fast sample** (e.g. 500 seeds × floors {1, 4})
  asserting `solve(generateFloor(seed,floor)).winnable` + connectivity +
  no-stairs-in-pinned-room + determinism. Keep it milliseconds (BFS on a
  34×34 grid is trivial). This runs in `npm test`.
- **10K CI gate** (`games/some-hero/tools/solve.js`, mirroring
  `games/golem-grid/tools/solve.js`): `--seeds 10000` over floors,
  reports the winnable count + the first unwinnable (seed,floor) with its
  `reason`, **exits non-zero on any unwinnable floor**. Wired as a
  `Makefile` target `solve-some-hero:` (mirror the existing `solve:`
  target). Run locally / in CI, NOT part of `npm test`'s latency budget
  (same split golem-grid uses — `make solve` is CI-only).

## Tests / gates

- `solver.test.js` — `solve` on a fixed seed returns winnable; a
  hand-crafted disconnected floor returns `winnable:false` with a reason
  (prove the checker actually catches failures, not vacuous).
- The in-suite fuzz sample passes.
- `make solve-some-hero` (10K) exits 0 — run it and paste the winnable
  count.
- `npm test --workspace @golem-engine/some-hero` green; `test:ceremony`
  62 / `test:ceremony-kernel` 60 unchanged; `npm test` all workspaces
  fail 0; `freeze:verify` green; `content/pack.json` + goldens
  byte-unchanged; `check-bans` clean; `shared/` imports nothing from
  `legacy/`.

## If some seeds are unwinnable

If the 10K sweep finds unwinnable floors, that's a real generator bug
(disconnected floor / stairs in a pinned room) — the fuzz gate exists to
catch exactly this. Fix the generator (PR2 code) so all 10K are winnable,
OR if it's a solver false-negative, fix the solver. Do NOT weaken the
gate to pass. Report the finding honestly with the offending seed.

## Scope boundaries (PR5)

Reachability/connectivity only — no combat/economy/credentials
simulation, no search. No generator output change unless the fuzz
uncovers a real connectivity bug. No `deriveWorld` change. No
`content/pack.json`/golden change. `shared/solver.js` pure, imports
nothing from `legacy/`.
