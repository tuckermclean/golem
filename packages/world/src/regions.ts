/* ── @golem-engine/world — regions overlay (A2).
   A semantic layer over the S3-PR1 grid geometry (index.ts's
   Room/PinnedRoom): region membership (tagged-room grouping) + portal
   TOPOLOGY and a pure state-transition FSM. Dependency-free (no
   @golem-engine/kernel/content/random import, no Math.random/Date.now/
   eval) — structural alignment only with kernel's
   RegionMembership{region}/Portal{to,at} (packages/kernel/src/
   components.ts:32-34,56-59), never an import.

   Scope discipline (see docs/superpowers/specs/
   2026-07-07-a2-regions-design.md): this is the SHAPE + a minimal pure
   API + tests, not a game feature. Nothing here is wired into any
   game's generator — golem-grid's/some-hero's golden-frozen output is
   untouched. A3 (adventure import) is the first real consumer. ────── */

/** Read-only query surface over a set of tagged rooms. `regionAt` scans
 *  the room list captured in the closure (a bbox test per lookup) —
 *  deliberately NOT a materialized per-cell array; a grid-backend
 *  per-cell overlay is a separate, not-yet-built line (see spec). */
export interface RegionMap {
  /** Returns the tag of the first (by input order) tagged room whose
   *  bbox contains (x,y), or `null` if no tagged room covers this cell
   *  (untagged rooms and corridor/outside cells are always `null` —
   *  not every tile belongs to a named region, mirroring
   *  `RegionMembership` being an OPTIONAL kernel component; no
   *  auto-generated `room:0` ids are invented here). */
  regionAt(x: number, y: number): string | null;
  /** Distinct tags across the input rooms, in first-seen order. */
  regionNames(): readonly string[];
}

/**
 * Derive a `RegionMap` from a room list by grouping on `room.tag` (the
 * field `PinnedRoom` already carries — see index.ts's doc comment
 * promising a future ECS consumer can adopt it as a region without a
 * rename; A2 cashes that promise). Untagged rooms contribute no region
 * membership at all (their cells are only ever covered by *other*
 * tagged rooms, if any, or fall through to `null`).
 *
 * Overlap resolution: if two tagged rooms' bboxes both cover the same
 * cell, `regionAt` returns the FIRST match by input order (the room
 * earlier in the `rooms` array wins) — documented and tested below, not
 * a config option.
 *
 * Pure: no RNG, no I/O. A derivation over already-placed geometry, not
 * a generator.
 */
export function assignRegions<
  T extends { x: number; y: number; w: number; h: number; tag?: string },
>(rooms: readonly T[]): RegionMap {
  const tagged = rooms.filter((r): r is T & { tag: string } => !!r.tag);

  const names: string[] = [];
  for (const r of tagged) {
    if (!names.includes(r.tag)) names.push(r.tag);
  }

  return {
    regionAt(x: number, y: number): string | null {
      for (const r of tagged) {
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
          return r.tag;
        }
      }
      return null;
    },
    regionNames(): readonly string[] {
      return names;
    },
  };
}

/* ── Portals with state ──────────────────────────────────────────── */

/** The mechanical states a portal can be in. `packages/world` owns only
 *  this static shape + the pure transition FSM below — live mutable
 *  state ("this door is currently locked") lives in a game's State
 *  (e.g. `state.world.portals: Record<id, PortalStateName>`), never
 *  here (this package is outside the reducer pipeline and has no
 *  kernel dependency, so it structurally cannot hold live state). */
export type PortalStateName = "open" | "closed" | "locked";

/**
 * Static portal topology: a symmetric edge between two named regions
 * (the region names `assignRegions` produces). `to`/`at` mirror
 * kernel's `Portal { to, at }` structurally (components.ts:56-59),
 * widened here to a two-region edge with an `id` and a `from` side —
 * NOT imported from kernel.
 */
export interface Portal {
  id: string;
  from: string;
  to: string;
  at: { x: number; y: number };
  /** Seed data only — the state a fresh game starts this portal in.
   *  Defaults to "open" (a caller reads `initialState ?? "open"`; this
   *  module itself never invents state, live or otherwise). */
  initialState?: PortalStateName;
}

const PORTAL_TRANSITIONS: Record<
  PortalStateName,
  Record<"open" | "close" | "lock" | "unlock", PortalStateName>
> = {
  // A closed door can be opened or locked; "close" and "unlock" are
  // no-ops (already in — or reachable only via — the relevant state).
  closed: { open: "open", close: "closed", lock: "locked", unlock: "closed" },
  // An open door can be closed. It CANNOT be locked directly in one
  // step (must close first) — "open -> lock" is documented as an
  // illegal transition and is a no-op (stays "open"), per spec.
  // "unlock" on an already-open door is also a no-op.
  open: { open: "open", close: "closed", lock: "open", unlock: "open" },
  // A locked door can only become closed via "unlock" — "open"/"close"
  // on a locked door are no-ops (locked implies closed; you cannot
  // open a locked door without unlocking it first).
  locked: { open: "locked", close: "locked", lock: "locked", unlock: "closed" },
};

/**
 * Pure lookup-table FSM for the MECHANICAL shape of "portal with
 * state" — NOT authorization. Whether an actor is ALLOWED to perform
 * `action` (e.g. does it hold the right key/credential) stays a game's
 * `Lock.unlockCondition` + `packages/content`'s `evaluate()`, untouched
 * by A2; this function only answers "given this action is permitted,
 * what state results."
 *
 * Full transition table (current x action -> next):
 *   closed x open   -> open      closed x close  -> closed (no-op)
 *   closed x lock   -> locked    closed x unlock -> closed (no-op)
 *   open   x open   -> open (no-op)   open x close  -> closed
 *   open   x lock   -> open (no-op, ILLEGAL: must close first)
 *   open   x unlock -> open (no-op)
 *   locked x open   -> locked (no-op, illegal: must unlock first)
 *   locked x close  -> locked (no-op)
 *   locked x lock   -> locked (no-op)
 *   locked x unlock -> closed
 *
 * Deterministic: same (current, action) always yields the same result.
 */
export function nextPortalState(
  current: PortalStateName,
  action: "open" | "close" | "lock" | "unlock",
): PortalStateName {
  return PORTAL_TRANSITIONS[current][action];
}
