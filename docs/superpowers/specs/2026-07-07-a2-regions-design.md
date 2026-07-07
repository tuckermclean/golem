# A2 — Regions overlay (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 5 **A2** (Regions overlay). Single PR, 100%
headless. A semantic layer (region membership + portals-with-state) in
`packages/world`, over the S3-PR1 grid geometry. Dependency-free (no
kernel/content/random import — structural alignment only, the idiom
`packages/world` already uses). Builds on S3 PR1's `Room`/`PinnedRoom`.

## Scope discipline (C3's guardrail)

C3 explicitly deferred `RegionMembership`/`Portal` gameplay to A2/later
and warned against "inventing mechanics... would violate the flagship
rule." So A2 ships the **shape + a minimal pure API + tests**, NOT a real
game feature wired into a generator. The first REAL consumer is **A3
(adventure import)** — regions-per-room, portals-per-passage from YAML.
A2 is test-only (fixture data shaped like both games' real output), like
`observe`/`affordances` shipped standalone. Do NOT wire regions/portals
into golem-grid's or some-hero's golden-frozen generators (that's a
version-bump-class change, out of A2's one-line DoD).

## Region membership (`packages/world/src/regions.ts`)

```ts
export interface RegionMap {
  regionAt(x: number, y: number): string | null;
  regionNames(): readonly string[];
}

export function assignRegions<T extends { x:number; y:number; w:number; h:number; tag?:string }>(
  rooms: readonly T[],
): RegionMap;
```

- Groups rooms by `room.tag` (the field `PinnedRoom` already carries;
  its own doc comment promises "a future ECS consumer can adopt a pinned
  room's tag as a region without a rename" — A2 cashes that promise).
  **Keep the field name `tag`** in `packages/world` (structural alignment
  with kernel's `RegionMembership.region`, NOT a rename/import).
- **Untagged rooms + corridor cells → `regionAt` returns `null`**
  (deliberate — not every tile belongs to a named region, mirroring
  `RegionMembership` being an OPTIONAL component; no auto-generated
  `room:0` ids).
- `regionAt` scans the small room list (bbox test) captured in the
  closure — no materialized per-cell array (queryable-by-tile, not
  stored-per-cell; the "grid backend" is a separate future line, not
  built here). If tagged rooms overlap on a cell, document the
  resolution (e.g. first-match by input order).
- Pure, no RNG (a derivation over already-placed geometry, not a
  generator).

## Portals with state (the key resolution)

**`packages/world` owns only static portal TOPOLOGY + a pure state-
transition FSM. Live mutable portal state lives in a game's State, never
in `packages/world`** (which is outside the reducer pipeline / has no
kernel dependency — it can't hold live state; the house style is
state-as-derivation, e.g. some-hero's `gate` is `{unlockCondition}`
evaluated every tick, never a stored "locked" flag).

```ts
export type PortalStateName = "open" | "closed" | "locked";

export interface Portal {
  id: string;
  from: string;   // region name (a tag from assignRegions)
  to: string;      // region name
  at: { x: number; y: number };
  initialState?: PortalStateName;  // seed data only; default "open"
}

export function nextPortalState(
  current: PortalStateName,
  action: "open" | "close" | "lock" | "unlock",
): PortalStateName;
```

- `Portal.to`/`at` mirror kernel's `Portal {to, at}` structurally,
  widened to a symmetric two-region edge. NOT imported from kernel.
- `nextPortalState` is a small pure FSM (lookup table) — the MECHANICAL
  shape of "with state", NOT authorization (`locked→closed` only via
  `unlock`; `closed↔open` via `open`/`close`; `open→locked` illegal in
  one step — must close first; document the full table). Authorization
  (WHO may unlock) stays a game's `Lock.unlockCondition` + content's
  `evaluate()` — untouched by A2.
- A game's reducer owns `state.world.portals: Record<id, PortalStateName>`
  and calls `nextPortalState` on relevant commands — that's A3's/a game's
  job, not A2's.

## Exports + tests

- Re-export `assignRegions`/`RegionMap`/`Portal`/`PortalStateName`/
  `nextPortalState` from `packages/world/src/index.ts` (leave S3 PR1's
  existing exports untouched).
- `packages/world/tests/assign-regions.test.js` — tagged rooms → their
  region; untagged rooms + corridor cells → `null`; `regionAt` bbox
  correctness; `regionNames` = the distinct tags; overlap resolution
  documented + tested. Use inline fixture data shaped like BOTH games'
  real output (golem-grid `ROOM_KINDS`-tagged rooms; some-hero
  `PinnedRoom`s) — WITHOUT importing either game.
- `packages/world/tests/portal-state.test.js` — the full `nextPortalState`
  transition table (every current×action), incl. the illegal
  `open→locked` staying `open` (or however you define no-op), determinism.

## Gates

`npm run prepare --workspace @golem-engine/world` (tsc strict, zero
errors); `npm test --workspace @golem-engine/world` green; `npm test` all
workspaces fail 0; `freeze:verify` green (A2 touches only
`packages/world` — no game code); `check-bans` clean; `packages/world`
gains NO dependency (still dependency-free). No golden/fixture change (A2
is test-only — the generators are untouched).

## Scope boundaries

`packages/world` regions + portal topology + FSM + tests ONLY. NO wiring
into any game generator (golden-frozen — A3 is the first real consumer).
NO kernel/content/random dependency. NO live portal-state registry in
`packages/world`. NO grid-backend materialization. Note in the PR that A3
(adventure import) is the first real consumer that will stress this
shape.
