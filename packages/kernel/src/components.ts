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

/** DELTA A1 (the affordances kernel API — see docs/superpowers/specs/
 *  2026-07-07-a1-pr1-affordances-hook-design.md): the canonical
 *  cross-game `Affordance` shape, i.e. the "legal-verb menu"
 *  `GameModule.affordances` returns (VISION.md: "powering text
 *  commands, context menus, NPC planning, tutorials, and twin
 *  grounding"). DELTA's own field list is `{verb, target, requirements,
 *  enabled, reason}`; this is the superset that also carries L1's
 *  `packages/language/src/ground.ts` interim shape's `name`/`aliases`
 *  (required for noun grounding) — one canonical type, not two
 *  incompatible ones. Non-grounding consumers ignore `name`/`aliases`;
 *  grounding ignores `requirements`/`reason`.
 *
 *  `requirements` is `unknown` — the SAME opaque-condition idiom as this
 *  file's own `Lock.unlockCondition`/`Interactable.enabledWhen` above:
 *  kernel never interprets it; only a game's own validate/affordances
 *  (via @golem-engine/content's evaluate()) does. */
export interface Affordance {
  /** Canonical verb this affordance responds to ("take"|"look"|
   *  "attack"|...). Open vocabulary. */
  verb: string;
  /** Opaque identifier the game hands back to itself once grounded/
   *  chosen — kernel never inspects this beyond returning it. */
  target: string;
  /** Primary grounding name, e.g. "lantern", "the keeper". */
  name: string;
  /** Extra synonyms grounding may also match. */
  aliases?: readonly string[];
  /** Default true — whether this affordance is currently legal. */
  enabled?: boolean;
  /** Opaque condition tree (DELTA field): games may put a
   *  @golem-engine/content `ConditionNode` here; kernel never reads it. */
  requirements?: unknown;
  /** Why this affordance is offered/disabled (tutorial-hint/twin/UI
   *  consumers, A1 PR3). */
  reason?: string;
}
