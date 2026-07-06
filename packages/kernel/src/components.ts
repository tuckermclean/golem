/* ── COMPONENTS — the kernel's minimal component vocabulary (DELTA C3).
   Pure data-only TypeScript interfaces, one per VISION-listed component:
   Identity, GridPosition, RegionMembership, Actor, Health, Inventory,
   Portable, Portal, Lock, Credential, Interactable, Perception,
   Knowledge. No methods, no classes, no behavior — "component data
   only; systems interpret" (see this package's GameModule doc comment
   for the K2 analogue of this discipline). Zero runtime code, zero
   deps, no `node:` imports — matches src/index.ts's browser-safe
   discipline, hence no reason to isolate this file behind a subpath
   export the way src/log.ts is for its node:crypto use.

   `Lock.unlockCondition` / `Interactable.enabledWhen` are typed
   `unknown` rather than importing @golem-engine/content's
   ConditionNode: kernel stays dependency-free of content (the wrong
   architectural direction, and content is documented dependency-free
   of kernel too) — see docs/superpowers/specs/
   2026-07-06-c3-entities-components-design.md, "Kernel does not depend
   on content." A condition tree is opaque data to kernel; only a
   game's validate/affordances (via @golem-engine/content's evaluate())
   ever interprets it. ─────────────────────────────────────────────── */

export interface Identity {
  name: string;
  description?: string;
}

export interface GridPosition {
  x: number;
  y: number;
}

export interface RegionMembership {
  region: string;
}

/** Marker: this entity has agency (a player or an NPC), as opposed to
 *  scenery. `controlledBy` is optional so a future NPC doesn't force a
 *  schema migration (orchestrator decision #6) — golem-grid's overlay
 *  populates it with `"player"` for its one call site. */
export interface Actor {
  controlledBy?: "player" | "npc";
}

export interface Health {
  hp: number;
  max: number;
}

export interface Inventory {
  items: string[];
}

/** Marker: this entity can be picked up / can occupy an Inventory. */
export interface Portable {}

export interface Portal {
  to: string; // MapId, kept as a bare string here — kernel does
  at: GridPosition; // not depend on packages/content's MapId brand.
}

export interface Lock {
  /** Opaque condition tree — see this file's header comment.
   *  Interpreted only by a game module's validate/affordances via
   *  @golem-engine/content's evaluate(), never by kernel. */
  unlockCondition: unknown;
  key?: string; // EntityId, same bare-string reasoning as Portal.
}

export interface Credential {
  tier: number;
}

export interface Interactable {
  prompt: string;
  enabledWhen?: unknown;
}

/** Client-local by construction (doctrine #3/#4) — never populated by
 *  a reducer/validate system; only by a per-viewer observe()
 *  implementation. Defined here so its shape is agreed engine-wide
 *  before L1/A1 need it. */
export interface Perception {
  seen: GridPosition[];
  lit: GridPosition[];
}

/** NPC memory as component data (VISION's "adventure" bequest / L7). No
 *  transcript accumulation — a snapshot of what one NPC currently
 *  knows, not a log. */
export interface Knowledge {
  knows: string[];
}

/** The closed vocabulary — one name per interface above. Also the
 *  vocabulary a future component-name validator (deferred — see the
 *  design doc's orchestrator decision #5) would check a RuntimePack's
 *  `entities[].components` keys against. */
export type ComponentName =
  | "Identity"
  | "GridPosition"
  | "RegionMembership"
  | "Actor"
  | "Health"
  | "Inventory"
  | "Portable"
  | "Portal"
  | "Lock"
  | "Credential"
  | "Interactable"
  | "Perception"
  | "Knowledge";

/** name -> its data shape, for precise mapped-type use below. */
export interface ComponentDataMap {
  Identity: Identity;
  GridPosition: GridPosition;
  RegionMembership: RegionMembership;
  Actor: Actor;
  Health: Health;
  Inventory: Inventory;
  Portable: Portable;
  Portal: Portal;
  Lock: Lock;
  Credential: Credential;
  Interactable: Interactable;
  Perception: Perception;
  Knowledge: Knowledge;
}

/** An entity is `id -> {componentName -> data}` — a partial map over
 *  the closed vocabulary, precisely typed per key. No entity "class":
 *  this is the entire representation. `id` is a bare string here (not
 *  content's branded `EntityId`) so kernel stays dependency-free; games
 *  that also import content can widen it locally. */
export interface Entity<C extends ComponentName = ComponentName> {
  id: string;
  components: { [K in C]?: ComponentDataMap[K] };
}
