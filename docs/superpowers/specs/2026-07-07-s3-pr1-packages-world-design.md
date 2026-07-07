# S3 PR1 — packages/world pinned-room contract (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 4 **S3** (Worldgen port), **first of ~5 PRs**. S3
ports some-hero's tomb floor generator onto named channels + builds the
pinned-room contract. **PR1 = the standalone `packages/world` pinned-room
contract** (no some-hero dependency yet — proven by its own unit tests).
Later PRs: the channel-based floor generator (PR2), golden-seed tests
(PR3), `deriveWorld` + seed-threading wiring (PR4), fuzz + reachability
solver + CI gate (PR5).

## S3 locked decisions (from the S3 brief, apply across all PRs)
- **Solver = reachability/connectivity checker** (BFS from spawn, seal-
  aware "is every gating tile reachable"), NOT a search solver. (PR5.)
- **Seed threading**: encode `topLevelSeed:runs:floorNum` into a generated
  floor's `mapId` (keep `state.world`'s 3-field shape locked); add an
  optional `seed` to `validate`'s ctx + host `S`. (PR4.)
- **Synthetic fixture kept**; generator added alongside via a `mapId`-
  prefix dispatcher (`map:` = authored pack map, `tomb:` = generator).
  (PR4.)
- **First some-hero floor golden is free** (nothing committed yet — not a
  MAJOR bump). (PR3.)
- **Full interactive puzzle mechanics are OUT of S3** (S3 generates the
  floor + puzzle DATA; interactive seal resolution is separate).
- Only port the TOMB floor gen (`legacy/src/world/floorgen.js`); the
  Guild Hall stays S1's authored `map:guild_hall` (NOT the noise
  overworld).

## PR1 scope: `packages/world`

`packages/world` is an empty stub (README + bare package.json, no src).
PR1 gives it its first feature: a **generic, dependency-free (TS strict,
like `packages/random`) grid-topology library** for room placement,
pinned rooms, and corridor connection — the reusable generalization of
the skeleton `games/golem-grid/shared/worldgen.js:11-40` and
`games/some-hero/legacy/src/world/floorgen.js:33-72` both hand-roll.

Build setup: mirror `packages/random` exactly — `tsconfig.json` (strict,
ES2022, NodeNext, `declaration`, `outDir: dist`, `rootDir: src`),
`package.json` gains `type:module`, `exports: {".":"./dist/index.js"}`,
`types`, `scripts: {prepare: "tsc -p .", test: "node --test"}`. No
runtime deps (dependency-free like `packages/random`).

### API (`packages/world/src/index.ts`)

Pure functions; caller supplies the rng (a `() => number` in [0,1), or a
`packages/random` channel — the lib never imports random, stays
dependency-free, mirroring how `ground.ts` takes caller-shaped inputs):

```ts
export interface Room { x:number; y:number; w:number; h:number; cx:number; cy:number; }
export interface PinnedRoom extends Room { tag: string; }
export interface PinnedSpec { w:number; h:number; tag:string; }

// Rejection-sample non-overlapping rooms (golem-grid worldgen.js:11-19 generalized).
export function placeRooms(
  rng: () => number,
  opts: { count:number; wRange:[number,number]; hRange:[number,number]; gridW:number; gridH:number; maxTries?:number },
): Room[];

// Place authored rooms avoiding overlap + a min center-separation from existing
// rooms (legacy floorgen.js:41-60's 80-try rejection, minSeparation default 10).
export function placePinnedRooms(
  rng: () => number,
  existing: Room[],
  specs: PinnedSpec[],
  opts: { gridW:number; gridH:number; minSeparation?:number; maxTries?:number },
): PinnedRoom[];

// Carve L-shaped corridors chaining room centers in order (golem-grid
// worldgen.js:31-40 / legacy floorgen.js:61-66) — PURE geometry, no rng.
// Returns the list of carved cells (caller writes them into its own grid).
export function chainCorridors(rooms: Room[]): Array<{x:number;y:number}>;

// The "never contains stairs / features" rule as a reusable filter:
// rooms eligible for stair/feature placement = untagged rooms only
// (legacy floorgen.js:72's `if (rooms[i].tag) continue`).
export function featureEligibleRooms<T extends { tag?: string }>(rooms: T[]): T[];
```

`tag` is a plain string; use the **same naming convention** as kernel's
`RegionMembership.region` so a future ECS consumer adopts it without a
rename — but do NOT depend on `@golem-engine/kernel` (keep world
dependency-free).

### Determinism
Same rng sequence → identical rooms/corridors (pure, no `Math.random`/
`Date.now`/global state). This is what makes the eventual named-channel
generator's golden tests possible.

## PR1 tests (`packages/world/tests/`)

- `placeRooms`: rejection sampling yields non-overlapping rooms within
  bounds; respects `count`/`maxTries`; deterministic per rng.
- `placePinnedRooms`: tagged rooms don't overlap existing/each-other,
  honor `minSeparation`; deterministic; degrades gracefully when it can't
  place all (returns what it could, documented).
- `chainCorridors`: connects all room centers (a BFS over
  rooms+corridors cells reaches every room from room 0); pure (no rng
  arg).
- `featureEligibleRooms`: excludes tagged rooms.
- A determinism test: fixed seeded rng → identical output twice.

## PR1 gates

- `npm test --workspace @golem-engine/world` green; `prepare` (tsc)
  builds `dist/` from clean.
- `npm test` all workspaces fail 0 (new package must not break the
  aggregate — may need a root `npm install` to register the workspace,
  like some-hero did).
- `freeze:verify` unchanged (PR1 touches only `packages/world` — no game
  code). `check-bans` clean.

## PR1 scope boundaries

`packages/world` is PURE grid geometry/topology — no some-hero import, no
floor generator yet (PR2), no content/NPC placement (that stays game-
side, by tag lookup), no kernel dependency, no `Math.random`. Do NOT
retrofit golem-grid to use it (flagship rule — generality is proven by
some-hero's use here, not pursued by refactoring golem-grid now). No game
code changes; no frozen-fixture/golden/ceremony change.
