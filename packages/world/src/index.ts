/* ── @golem-engine/world — grid-topology library (S3 PR1).
   Generic, dependency-free (no @golem-engine/random, no
   @golem-engine/kernel, no Math.random/Date.now/eval) room-placement
   and corridor-chaining primitives. This is the reusable generalization
   of two hand-rolled floor generators:
     - games/golem-grid/shared/worldgen.js:11-40  (rejection-sampled
       non-overlapping rooms + sequential L-corridor chaining)
     - games/some-hero/legacy/src/world/floorgen.js:33-72 (the same,
       plus pinned-room placement with min-separation rejection at
       :41-60, and the tagged-room stair-exclusion rule at :72)
   Callers supply their own rng (`() => number` in [0,1), e.g. a
   @golem-engine/random `channel(...)`) — this package never imports
   or calls one, so it stays a pure, dependency-free library. ────── */

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** `tag` is a plain string, deliberately shaped like
 *  `@golem-engine/kernel`'s `RegionMembership.region: string`
 *  (packages/kernel/src/components.ts:32-34) — a future ECS consumer
 *  can adopt a pinned room's tag as a region without a rename. Not a
 *  dependency: this package does not import @golem-engine/kernel. */
export interface PinnedRoom extends Room {
  tag: string;
}

export interface PinnedSpec {
  w: number;
  h: number;
  tag: string;
}

/** rint(r, n) === (r() * n) | 0 — the shared convention every caller of
 *  this package's rng already uses (packages/random's `rint`). Kept as a
 *  private inline helper rather than an import so this package stays
 *  dependency-free. */
function rint(rng: () => number, n: number): number {
  return (rng() * n) | 0;
}

/** AABB overlap test with a 1-cell buffer — the same buffered-overlap
 *  shape golem-grid's worldgen.js:15 hand-rolls inline
 *  (`x<o.x+o.w+1&&o.x<x+w+1&&y<o.y+o.h+1&&o.y<y+h+1`). */
function overlapsBuffered(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  buffer = 1,
): boolean {
  return (
    a.x < b.x + b.w + buffer &&
    b.x < a.x + a.w + buffer &&
    a.y < b.y + b.h + buffer &&
    b.y < a.y + a.h + buffer
  );
}

/**
 * Rejection-sample non-overlapping rooms within a grid
 * (games/golem-grid/shared/worldgen.js:11-19 generalized: hard-coded
 * `4+rint(r,5)` / `3+rint(r,4)` room-size ranges, 200-try cap, and
 * GW/GH=48/30 grid become caller-supplied `wRange`/`hRange`/`maxTries`/
 * `gridW`/`gridH`). Degrades gracefully: if `maxTries` is exhausted
 * before `count` rooms are placed, returns however many were placed
 * (never throws, never spins forever).
 */
export function placeRooms(
  rng: () => number,
  opts: {
    count: number;
    wRange: [number, number];
    hRange: [number, number];
    gridW: number;
    gridH: number;
    maxTries?: number;
  },
): Room[] {
  const { count, wRange, hRange, gridW, gridH } = opts;
  const maxTries = opts.maxTries ?? 200;
  const rooms: Room[] = [];

  for (let tries = 0; tries < maxTries && rooms.length < count; tries++) {
    const w = wRange[0] + rint(rng, wRange[1] - wRange[0] + 1);
    const h = hRange[0] + rint(rng, hRange[1] - hRange[0] + 1);
    const xSpan = gridW - w - 2;
    const ySpan = gridH - h - 2;
    // defensive: the legacy code assumes xSpan/ySpan are always positive
    // (its grid is always much bigger than its rooms); a general library
    // has to guard the case a caller's config makes rooms not fit at all.
    if (xSpan <= 0 || ySpan <= 0) continue;
    const x = 1 + rint(rng, xSpan);
    const y = 1 + rint(rng, ySpan);

    if (rooms.some((o) => overlapsBuffered({ x, y, w, h }, o))) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }

  return rooms;
}

/**
 * Place authored ("pinned") rooms avoiding overlap with `existing` rooms
 * and honoring a minimum center-to-center separation from other pinned
 * rooms already placed in this call
 * (games/some-hero/legacy/src/world/floorgen.js:41-60 generalized: the
 * 80-try rejection loop, `w-6`/`h-6` size clamps, and the `< 10`
 * hard-coded separation become caller-supplied `maxTries`/clamped
 * `spec.w/h` bounds/`minSeparation`).
 *
 * Legacy's rejection test only checked whether an *existing room's
 * center* fell inside the new pinned box (so a pinned room could never
 * swallow another room's stairs/feature center — floorgen.js:44-47's
 * comment). This generalizes that into a full buffered AABB overlap
 * test against every existing/previously-placed-pinned room (a strictly
 * stronger, still-safe condition — no overlap implies no swallowed
 * center either).
 *
 * Degrades gracefully: if a spec can't find a non-colliding, separated
 * slot within `maxTries` attempts, it is *skipped* (not force-placed
 * into a collision, unlike the legacy code which always emits a room
 * after 80 tries regardless) — the returned array may be shorter than
 * `specs`.
 */
export function placePinnedRooms(
  rng: () => number,
  existing: Room[],
  specs: PinnedSpec[],
  opts: { gridW: number; gridH: number; minSeparation?: number; maxTries?: number },
): PinnedRoom[] {
  const { gridW: w, gridH: h } = opts;
  const minSeparation = opts.minSeparation ?? 10;
  const maxTries = opts.maxTries ?? 80;

  const allRooms: Room[] = [...existing];
  const placed: PinnedRoom[] = [];

  for (const spec of specs) {
    const rw = Math.max(3, Math.min(spec.w || 5, w - 6));
    const rh = Math.max(3, Math.min(spec.h || 4, h - 6));
    const xSpan = w - rw - 4;
    const ySpan = h - rh - 4;

    let placedThisSpec: PinnedRoom | null = null;
    if (xSpan > 0 && ySpan > 0) {
      for (let t = 0; t < maxTries; t++) {
        const x = 2 + rint(rng, xSpan);
        const y = 2 + rint(rng, ySpan);
        const cx = x + (rw >> 1);
        const cy = y + (rh >> 1);
        const candidate = { x, y, w: rw, h: rh };

        if (allRooms.some((r) => overlapsBuffered(candidate, r))) continue;
        if (placed.some((r) => Math.hypot(r.cx - cx, r.cy - cy) < minSeparation)) continue;

        placedThisSpec = { x, y, w: rw, h: rh, cx, cy, tag: spec.tag };
        break;
      }
    }

    if (placedThisSpec) {
      allRooms.push(placedThisSpec);
      placed.push(placedThisSpec);
    }
    // else: this spec is skipped — graceful degradation, documented above.
  }

  return placed;
}

/**
 * Carve L-shaped corridors chaining room centers in sequence
 * (games/golem-grid/shared/worldgen.js:22-30's `carve` closure /
 * games/some-hero/legacy/src/world/floorgen.js:61-66 generalized: both
 * step one axis then the other via `Math.sign`, mutating a shared grid
 * in place — here it's pure and returns the carved cells instead so the
 * caller writes them into whatever grid representation it owns).
 *
 * PURE geometry: no rng parameter, no side effects. Connects
 * `rooms[i-1].{cx,cy}` to `rooms[i].{cx,cy}` for every consecutive pair,
 * so the full room list forms one connected chain (proven by a BFS test
 * over rooms+corridor cells in this package's tests).
 */
export function chainCorridors(rooms: Room[]): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];

  const carve = (x1: number, y1: number, x2: number, y2: number): void => {
    let x = x1;
    let y = y1;
    cells.push({ x, y });
    while (x !== x2) {
      x += Math.sign(x2 - x);
      cells.push({ x, y });
    }
    while (y !== y2) {
      y += Math.sign(y2 - y);
      cells.push({ x, y });
    }
  };

  for (let i = 1; i < rooms.length; i++) {
    carve(rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy);
  }

  return cells;
}

/**
 * The "never contains stairs / features" rule as a reusable filter:
 * rooms eligible for stair/feature placement are untagged rooms only
 * (games/some-hero/legacy/src/world/floorgen.js:72's
 * `if (rooms[i].tag) continue;`, generalized to any `{ tag?: string }`
 * room shape).
 */
export function featureEligibleRooms<T extends { tag?: string }>(rooms: T[]): T[] {
  return rooms.filter((r) => !r.tag);
}

/* ── A2: regions overlay (region membership + portal topology/FSM) —
   see regions.ts's header comment for the full design rationale. */
export type { RegionMap, Portal, PortalStateName } from "./regions.js";
export { assignRegions, nextPortalState } from "./regions.js";
