# `packages/kernel` components + golem-grid re-expression (C3) — Design

**Date:** 2026-07-06
**Status:** Draft — for orchestrator review before implementation begins
**Topic:** DELTA.md Phase 2, task C3 — entities + components in the kernel,
and re-expressing golem-grid's players/items/prize as entities+components
with no behavior change. This is a design document only; no code changes
are made by it. Stacked on C1 (`packages/content`, present on this branch).

## Scope

DELTA §C3, verbatim:

> Entities + components in kernel. Minimal component set (VISION list):
> Identity, GridPosition, RegionMembership, Actor, Health, Inventory,
> Portable, Portal, Lock, Credential, Interactable, Perception, Knowledge.
> Component data only; systems interpret.
> DoD: golem-grid's items/players/prize re-expressed as entities with no
> behavior change (frozen fixtures still pass).

C3 is two deliverables, in order of load-bearing-ness:

1. **The vocabulary.** Thirteen data-only TypeScript types in
   `packages/kernel`, one per VISION-listed component, plus the generic
   shape that says "an entity is `id → {componentName → data}`."
2. **The re-expression.** A pure, read-only projection over golem-grid's
   existing delta map (`st.D`) and world (`dun`) that produces entities
   built from that vocabulary — proven, not asserted, to leave
   `serializeState`'s bytes and all 25 fixture hashes untouched.

C3 does **not**:

- change `games/golem-grid/shared/reducer.js`'s `reduce`/`applyEvent`/
  `serializeState`, or `shared/module.js`'s `validate` — their call graphs
  are the thing this design must leave provably untouched (see "The
  central decision" below);
- give components behavior: no component type has a method; interpreting
  a component (e.g. evaluating `Lock.unlockCondition`) is a *system's*
  job (a future `validate`/`reduce`/`affordances` implementation in a
  *game*, not kernel);
- port topdown-puzzle or some-hero onto components (C4/S1/S2's job) — it
  only has to make their future authors' vocabulary already exist and
  already agree with C1's sample pack;
- add gameplay for Lock/Credential/Interactable/Health/Portal/
  RegionMembership/Perception/Knowledge to golem-grid — golem-grid has no
  locks, combat, portals, regions, or NPCs today, and inventing mechanics
  for them would violate the flagship rule (VISION doctrine #12: "nothing
  enters the engine that SOME HERO's next milestone does not need").
  These eight are defined now (because C3's brief is "the minimal
  component set," not "the components golem-grid personally uses") but
  populated by nobody until a later task needs them — see "Used now vs.
  defined-for-later" below.

## The central decision — view/overlay, not a state-representation change

The task brief poses this as an explicit choice. Recapping the two options:

- **(a) Overlay/view.** Entities are a pure function *derived from* the
  existing delta map (`st.D`) and world (`dun`), computed on demand,
  never stored in `st`, never consulted by `reduce`/`validate`/
  `serializeState`. The state representation is byte-for-byte what it
  is today.
- **(b) Representation change.** `st.D` (or a new state field) actually
  *becomes* an entity/component store, and `serializeState` must be
  re-derived from that store while reproducing the exact same JSON
  bytes for all 25 fixtures.

**This design chooses (a).** Reasoning:

1. **(a) makes the DoD true by construction, not by a fragile
   re-derivation proof.** If the entity view is never in the call graph
   of `reduce`, `applyEvent`, `validate`, or `serializeState`, then no
   change to those functions has occurred, and "frozen fixtures still
   pass" is not a claim to verify against risk of drift — it is a
   structural fact checkable by grep (see "The byte-identity argument"
   below). Option (b) instead asks: "does this new representation,
   reserialized, produce the exact same sorted-JSON bytes as the old
   `Map` for all 25 seeds, forever, including every future event kind?"
   That is a much larger and more permanent surface to keep byte-perfect
   — every future event handler would have to maintain two synchronized
   representations (the entity store and whatever `serializeState`
   reads) instead of one.
2. **Doctrine #3 (identity-blind reducer) and doctrine #10
   (presentation-independent events) are easiest to keep under (a).**
   The overlay is *read-only* and *derived*; it cannot introduce a new
   place for the reducer to accidentally branch on "who is asking," and
   it cannot become a second source of truth that some code path forgets
   to update — because nothing ever writes to it. Under (b), the entity
   store *is* a second representation of state that the reducer must
   keep in lockstep with the map it replaces, which is exactly the kind
   of fork "no logic forked between browser and tooling" (CLAUDE.md) and
   "the reducer never reads local identity" (CLAUDE.md) are written to
   prevent.
3. **The flagship rule.** Nothing downstream needs entities to be the
   *storage* format yet — no system (`validate`, `affordances`, a
   renderer) consumes the entity view this task produces. C4 (push
   chains) and S1/S2 (Door Golem, credentials) are the first consumers,
   and by the time they land, C1's `RuntimePack` will already be
   producing entity-shaped data (`EntityDef { id, components }`) for
   *authored* content; golem-grid's *derived* (from world+state) entities
   using the same shape is the natural bridge, not a storage migration.
   Migrating `st.D`'s storage format now, before any system reads
   entities, is pure risk for zero behavior.
4. **Trade-off, named honestly.** (a) means golem-grid's authoritative
   state is still "stringly-keyed delta map," not "entities all the way
   down" — if a future task (C4, or A1's affordances) wants entities to
   *be* the state (so that adding a new entity is "add one entry," not
   "add one map key convention"), that migration still has to happen
   eventually, and this design does not do it. That is an accepted
   deferral, consistent with the flagship rule: pay for the
   representation change when a system actually needs entities to be
   canonical, not speculatively.

Given (a), `packages/content`'s `EntityDef { id: EntityId; components:
Record<string, JsonValue> }` (C1) is the natural output shape for the
overlay too — see "The golem-grid re-expression" below.

## The kernel component model

New file `packages/kernel/src/components.ts` (pure types, zero runtime
code, zero deps — matching `src/index.ts`'s existing discipline; no
`node:` imports, browser-safe, so no reason to isolate it behind a
subpath export the way `src/log.ts` is for its `node:crypto` use).
Re-exported from `src/index.ts` alongside `Event`/`Command`/`GameModule`.

Each component is a plain data interface — a labeled bag of JSON-shaped
fields, no methods, no class, nothing that could be construed as
behavior. `unlockCondition`/`enabledWhen` (Lock, Interactable) are typed
as `unknown` rather than importing `@golem-engine/content`'s
`ConditionNode` — see "Alignment with C1/C2" below for why kernel does
not take a dependency on content to get that type.

```ts
// packages/kernel/src/components.ts (illustrative — not final code)

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
 *  scenery. No fields required — presence of the component is the fact. */
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
  to: string;         // MapId, kept as a bare string here — kernel does
  at: GridPosition;    // not depend on packages/content's MapId brand.
}

export interface Lock {
  /** Opaque condition tree — see "Alignment with C1/C2." Interpreted
   *  only by a game module's validate/affordances via
   *  @golem-engine/content's evaluate(), never by kernel. */
  unlockCondition: unknown;
  key?: string;        // EntityId, same bare-string reasoning as Portal.
}

export interface Credential {
  tier: number;
}

export interface Interactable {
  prompt: string;
  enabledWhen?: unknown;
}

/** Client-local by construction (doctrine #3/#4) — see "Used now vs.
 *  defined-for-later." Never populated by a reducer/validate system;
 *  only by a per-viewer observe() implementation. Defined here so its
 *  shape is agreed engine-wide before L1/A1 need it. */
export interface Perception {
  seen: GridPosition[];
  lit: GridPosition[];
}

/** NPC memory as component data (VISION's "adventure" bequest / L7).
 *  No transcript accumulation — a snapshot of what one NPC currently
 *  knows, not a log. */
export interface Knowledge {
  knows: string[];
}

/** The closed vocabulary — one name per interface above. Also the
 *  vocabulary a future component-name validator (see "Alignment with
 *  C1/C2") checks a RuntimePack's `entities[].components` keys against. */
export type ComponentName =
  | "Identity" | "GridPosition" | "RegionMembership" | "Actor" | "Health"
  | "Inventory" | "Portable" | "Portal" | "Lock" | "Credential"
  | "Interactable" | "Perception" | "Knowledge";

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
```

**"Systems interpret" means:** nothing above ever runs. A game's
`validate(ctx, cmd)` reads `Lock.unlockCondition` off an entity and
hands it to `@golem-engine/content`'s `evaluate()`; a renderer reads
`GridPosition` to place a sprite; `affordances()` reads `Interactable` to
decide whether "approach the Door Golem" is currently offered. The
component itself never calls anything — it is inert data, exactly like
an `Event`'s fields already are in this package. This is the same
discipline `GameModule`'s doc comment already states for events
("Component data only; systems interpret" is C3's version of K2's "the
kernel does not constrain [a command] beyond 'some value' — each game
module defines its own... vocabulary").

**No runtime registry is introduced.** `ComponentName`/`ComponentDataMap`
are compile-time-only; there is nothing to register, construct, or
instantiate — a "registry," if ever needed, is the JSON-Schema half
described under "Alignment with C1/C2," and that is explicitly secondary.

### Used now vs. defined-for-later

| Component | golem-grid re-expression uses it? | First real consumer |
|---|---|---|
| Identity | Yes — player name, item/prize name | — |
| GridPosition | Yes — player/item/prize location | — |
| Inventory | Yes — player's carried item names | — |
| Portable | Yes — marks items/prize as pickup-able | — |
| Actor | Yes — marks players (vs. scenery) | — |
| RegionMembership | No | A2 (regions overlay) |
| Health | No — golem-grid's light pool is a shared party resource, not per-entity HP; it stays `st.D.get("light")`, not wrapped as a component (see Open Questions) | S2 (some-hero combat) |
| Portal | No — golem-grid's stairs are a *position match* tied to the win condition, not a multi-map transition | S3/C4 (topdown-puzzle doors, some-hero floor transitions) |
| Lock | No | S1/S2 (Door Golem — already informally shaped by C1's `sample-pack.json`) |
| Credential | No | S1/S2 (Ceremony Stamp — ditto) |
| Interactable | No | S1/S2 (Door Golem — ditto) |
| Perception | No — deliberately never populated by a reducer/state system (see below) | L1/A1 (`observe()`) |
| Knowledge | No | L7 (NPC context compiler) |

**Why Perception is defined but never populated by this task's overlay:**
golem-grid already has client-local perception (`src/perceive.js`,
seen/lit/LOS) that doctrine #3/#4 requires to stay client-local — it must
never be folded into `st.D` or any authoritative entity view, because
that would make perception replicated/shared state instead of a
per-viewer derivation. `Perception`'s shape is defined now so L1/A1's
future `observe(state, world, viewer) → Obs` has an agreed data shape to
return, but this task's `entitiesOf()` (below) takes no `viewer`
parameter and produces no `Perception` component — that omission is the
point, not a gap.

## The golem-grid re-expression

### Exact mapping

| Today's `st.D` key | Entity id | Components |
|---|---|---|
| `player:<id>` → `{id,name,x,y,inv}` | `entity:player:<id>` | `Identity{name}`, `GridPosition{x,y}`, `Inventory{items:inv}`, `Actor{}` |
| `dun.items.get("<x>,<y>")` (present, not `taken:<x>,<y>`) | `entity:item:<x>,<y>` | `Identity{name:<item string>}`, `GridPosition{x,y}`, `Portable{}` |
| `prize_by` (+ `dun.prize`) | `entity:prize` | `Identity{name:"prize"}`, `Portable{}`, `GridPosition{x,y}` — `{x,y}` = `dun.prize` if `prize_by` unset, else the *carrying player's* current `GridPosition` |
| `light` | *(not an entity)* | Stays a bare scalar read via `light(st)` — see Open Questions |
| `taken:<x>,<y>` | *(not an entity — it's what makes an item entity disappear)* | Absence of the corresponding `entity:item:<x>,<y>` |
| `gameover` | *(not an entity — game-level fact, not an entity property)* | — |

Note the prize is the interesting case: unlike a taken item (which
*stops existing* as an item entity once `taken:<x>,<y>` is set — TAKE
removes it from the floor into the taker's `inv`, which is not itself
re-modeled as an entity relationship in this task), the prize *keeps*
existing as one entity whose `GridPosition` is derived either from the
world (not yet taken) or from another entity's `GridPosition` (carried).
This is a real content-modeling asymmetry inherited from golem-grid's
existing mechanics, flagged in Open Questions rather than resolved here.

### The adapter

New file `games/golem-grid/shared/entities.js` (pure, no DOM, no
network — same discipline as `reducer.js`). One exported function:

```
entitiesOf(state, dungeon) -> Entity[]
```

`Entity` here matches the shape sketched above (`{id, components}`),
deliberately identical in structure to `@golem-engine/content`'s
`EntityDef` — golem-grid does not import `content` at runtime for this
(no schema validation needed to *read* state), but the shape agreement
means a future observation layer that merges C1-authored template
entities with derived, in-world entity instances does not need a
translation step between them.

`entitiesOf` reads `players(state)`, `dungeon.items` minus
`taken:<x>,<y>` keys, and `prizeCarrier(state)` — all functions
`reducer.js` already exports — and returns a fresh array built by plain
object literals. It calls nothing in `reduce`, `applyEvent`, `validate`,
or `serializeState`, and neither of those calls it. It is pure with
respect to its two arguments (same `(state, dungeon)` in ⇒ same entities
out), matching the reducer's own purity discipline, but it is not part
of the reducer: it is a read model, computed on demand by whatever
wants an entity view (a future renderer, a future `observe()`, or a
test), never stored in `st`.

### The byte-identity argument (not hand-wavy)

The claim is: adding `entities.js` cannot change `serializeState`'s
output or any of the 25 fixtures' `finalHash`. This follows from three
facts, each independently checkable:

1. `serializeState(st)` (reducer.js:54–59) reads exactly three fields of
   its argument: `st.D`, `st.seq`, `st.over`. It does not call
   `entitiesOf`, does not exist in a module that imports
   `shared/entities.js`, and this design adds no new field to the object
   `createState()`/`reduce()` construct — `reduce` still returns exactly
   `{D, log, seq, over}` as it does today (reducer.js:42).
2. `reduce`, `applyEvent`, and `module.js`'s `validate` are not edited by
   this task. A diff against `main` for those three functions is empty.
   (Enforceable at implementation time as a repo-hygiene test — see Test
   plan.)
3. `entities.js` is a new module with no existing importers. Its
   addition is purely additive to the dependency graph: no file that
   participates in producing `serializeState`'s bytes (`reducer.js`,
   `module.js`, `main.js`'s `hostCommit`) gains a new import.

Because (1)–(3) hold, the 25 frozen fixtures' `finalHash =
h32(serializeState(finalState) + "\n")` computation is running through
byte-identical code before and after this task — not "the same code by
coincidence," but the *literal same functions*, unreached by the new
module. This is what "the DoD is met by construction" (see "The central
decision") means concretely.

## Alignment with C1/C2

Names were cross-checked against `packages/content/tests/fixtures/
sample-pack.json` (C1's DoD fixture, already committed on this branch)
and the topdown-puzzle token vocabulary C1's design doc records
(`games/topdown-puzzle/legacy/src/scenes/KyeScene.js`: wall, block,
diamond, player-start, baddies, memory hole, movers):

- `Identity{name}` — matches `sample-pack.json`'s `Identity: {name:
  "Door Golem"}` / `{name: "wall"}` / `{name: "crate"}` exactly.
- `Portable{}` — matches `sample-pack.json`'s `Portable: {}` (crate,
  Ceremony Stamp) exactly; a bare marker, no fields, as designed here.
- `Interactable{prompt, enabledWhen}` — matches `sample-pack.json`'s
  `Interactable: {prompt, enabledWhen}` field-for-field.
- `Lock{unlockCondition, key}` — matches `sample-pack.json`'s
  `Lock: {unlockCondition, key}` field-for-field (the `key` value there
  is a `{ "$ref": "entity:credential_stamp" }`, resolved by C1's
  reference-resolution stage before it reaches a `Lock` component — this
  design's `key?: string` is the *post-resolution* shape, an `EntityId`
  string, consistent with `RuntimeMap`'s already-resolved `entity`
  field).
- `Credential{tier}` — matches `sample-pack.json`'s `Credential: {tier:
  1}` exactly.
- `GridPosition`/`Actor`/`Inventory`/etc. have no C1 fixture precedent
  yet (C1's sample pack only exercises Identity/Portable/Interactable/
  Lock/Credential) — no conflict is possible; this design is the first
  to fix their shape, so later content (S1/S2) authors against it.

No renames were needed in either direction — C1's opaque
`components: Record<string, JsonValue>` already used these exact
component names informally (per its own design doc: "DELTA C3 needs
`entities` to hold component bags keyed by the component names it will
define... C1 does not know these names; `components` is deliberately
opaque... so C3 can land its vocabulary without a C1 schema migration").
This task is that vocabulary landing; no C1 file changes.

### Kernel does not depend on content (the Condition-type question)

`Lock.unlockCondition` and `Interactable.enabledWhen` are typed
`unknown` rather than `@golem-engine/content`'s `ConditionNode`, on
purpose: `packages/kernel` is documented zero-deps and
`packages/content` is documented dependency-free of kernel (C1's own
Open Question #1 chose that direction deliberately, to keep content
usable/testable standalone). Kernel importing content would invert that
and also be the wrong direction architecturally (content is an
authoring-time compiler; kernel is a runtime primitive package other
runtime packages build on). Kernel therefore treats condition trees as
opaque data — which is in fact the correct "component data only, systems
interpret" reading: a condition AST is data, not code, and *evaluating*
it is `@golem-engine/content`'s `evaluate()`'s job, invoked by a game's
`validate`/`affordances`, never by kernel itself. This is flagged again
under Open Questions since it is a real (if small) type-safety trade-off
(a game could stuff garbage into `unlockCondition` and TypeScript
wouldn't catch it at the kernel layer — only `hydrateConditions()` at
content-compile time, or a runtime check in the consuming game, would).

### Secondary: a component-name validator over a RuntimePack

C1's orchestrator decision #4 anticipated this: "C3 validates components
over a compiled RuntimePack" (deferred from C1 because C3's vocabulary
didn't exist yet). This design sketches, but does not build, the
follow-on:

- `packages/kernel/schemas/components.v1.json` — a JSON-Schema
  `$defs` fragment per component name (Identity, GridPosition, ... all
  13), following `packages/kernel/schemas/events.v1.json`'s house style
  exactly (version in the filename, draft 2020-12).
- A testkit tool, `packages/testkit/tools/validate-components.mjs`,
  mirroring `validate-events.mjs`: given a compiled `RuntimePack`, for
  every `entities[].components` key, assert the key is one of the 13
  names and its value matches that component's schema fragment.
- A test, `packages/testkit/tests/component-schema.test.js`, running it
  against C1's `sample-pack.golden.json` (Identity/Portable/
  Interactable/Lock/Credential — all pass) plus at least one negative
  fixture (an unknown component name, e.g. `"Weapon": {}`) proving the
  validator rejects it.

This is marked **secondary** per the task brief and C1's own framing —
it validates *authored content*, not golem-grid's runtime state (which
this task's `entitiesOf()` never runs through a schema, since it is
derived from already-trusted engine code, not external pack data). It
does not block C3's DoD (golem-grid fixtures) and can reasonably ship in
the same PR or be split into a small follow-up — orchestrator's call
(see Open Questions).

## File / module layout

```
packages/kernel/
  src/
    components.ts        # NEW — 13 component interfaces, ComponentName,
                          #        ComponentDataMap, Entity<C>
    index.ts              # + re-export components.ts's public surface
  tests/
    components.check.ts   # NEW — compile-only check (types.check.ts
                           #        pattern: tsc-checked, not node:test-run)
  schemas/
    components.v1.json    # NEW, secondary — see above

games/golem-grid/
  shared/
    entities.js            # NEW — entitiesOf(state, dungeon) -> Entity[]
  tests/
    entities.test.js       # NEW — see Test plan

packages/testkit/
  tools/
    validate-components.mjs  # NEW, secondary
  tests/
    component-schema.test.js # NEW, secondary
```

No existing file changes required for the primary (non-secondary)
deliverable — `reducer.js`, `module.js`, `main.js`, `index.ts` (aside
from one new re-export line), and every fixture/golden/schema file stay
untouched.

## Test plan (DoD → concrete `node:test`)

| DoD / claim | Test |
|---|---|
| Component types compile under strict TS | `packages/kernel/tests/components.check.ts`, run by `tsc -p tsconfig.tests.json` (the existing `pretest` hook) — constructs at least one literal value per component interface, and one `Entity<C>` combining 3+ components, exactly as `types.check.ts` does for `GameModule`/`KernelCore` today |
| golem-grid's players/items/prize are reachable as entities/components | `games/golem-grid/tests/entities.test.js` — for each of the 25 fixtures (`packages/testkit/fixtures/golem/index.json`), replay to final state via the existing pure `reduce`, call `entitiesOf(finalState, dungeon)`, and assert: one `entity:player:<id>` per `player:<id>` key with matching Identity/GridPosition/Inventory/Actor; one `entity:item:<x>,<y>` per un-taken `dungeon.items` key; exactly one `entity:prize` whose `GridPosition` equals the carrying player's `GridPosition` (all 25 fixtures reach WIN, so `prize_by` is always set at *final* state — the test additionally replays a log **prefix** ending just before each fixture's `TAKE_PRIZE` event, to also exercise the not-yet-taken branch, where `entity:prize`'s `GridPosition` must equal `dungeon.prize`) |
| No behavior change / frozen fixtures still pass | (i) `packages/testkit/tools/verify-golem-fixtures.mjs` and `packages/testkit/tests/kernel-replay.test.js` re-run unmodified — still green, all 25 `finalHash`es unchanged; (ii) a repo-hygiene test (mirroring `packages/content/tests/no-dynamic-code.test.js`'s style) asserting the source text of `reducer.js` and `module.js` contains no reference to `entities.js`/`entitiesOf` — makes the "not in the call graph" claim regression-proof, not just true-today |
| Whole-suite regression | `make test`, `npm run freeze:verify` (25 golem fixtures + 62 `@ceremony` some-hero tests + 6 topdown-puzzle parse snapshots), `make solve` (band unchanged, max 354) all pass unmodified — recorded as PR evidence per CLAUDE.md's reporting contract |
| (Secondary) Component-name validator | `packages/testkit/tests/component-schema.test.js` — C1's `sample-pack.golden.json` validates clean; one added malformed fixture (unknown component name) fails with an actionable path+message, mirroring C1's own negative-fixture pattern |

## Open questions / risks (for the orchestrator)

1. **Prize entity asymmetry.** A taken *item* stops being an entity
   (it moves into `Inventory.items` as a bare string, with no residual
   `entity:item:<x>,<y>`); the *prize* stays one persistent entity whose
   `GridPosition` is derived from whoever holds it. Is a bare string in
   `Inventory.items` (today's `inv` array of item-name strings, verbatim)
   an acceptable "not really an entity relationship" for now, or should
   inventory contents eventually be entity references (`EntityId[]`)
   too? This task keeps the existing string-array shape (zero behavior
   change, per DoD) but the asymmetry is worth the orchestrator's eyes
   before C4/S2 build on it.
2. **The light pool has no component.** golem-grid's `light` value is a
   shared party resource, not per-entity HP — it does not become a
   `Health` component on anything (no entity to attach it to; `Health`
   is reserved for S2's combat). Confirm this is fine and not secretly
   asking for a 14th "shared resource" component — this design assumes
   yes (light stays exactly what it is, read via `light(st)`), consistent
   with the flagship rule.
3. **`unknown`-typed conditions (Lock/Interactable) vs. a shared type.**
   As detailed above, kernel avoids depending on content by typing
   condition fields `unknown`. This mirrors C1's own Open Question #1
   (canonicalization duplicated rather than shared) — a future tiny
   dependency-neutral package (vocabulary/schema-only, imported by both
   kernel and content) is a legitimate alternative if this duplication
   pattern recurs a third time. Flagging, not deciding, per C1's
   precedent.
4. **Secondary deliverable scope.** Is the `components.v1.json` schema +
   `validate-components.mjs` tool in-scope for *this* PR, or a follow-up
   task? It validates authored content (relevant once S1 writes Door
   Golem content against this vocabulary), not golem-grid's runtime
   state, so it does not block C3's actual DoD. Recommend: include the
   schema file (cheap, and it is the concrete artifact "the vocabulary
   is now agreed" produces) but treat the ajv tool + tests as
   deferrable to S1 if orchestrator wants a smaller C3 diff.
5. **`entities.js` return shape vs. `EntityId`/`JsonValue` branding.**
   This design keeps golem-grid's `entities.js` runtime-untyped (plain
   JS, no TS build step for this game today) even though its shape
   mirrors C1's `EntityDef`. If/when golem-grid grows a TS build step
   (not currently planned), tightening `entities.js`'s output to
   literally satisfy `@golem-engine/content`'s `EntityDef` type (import
   for type-checking only, still zero runtime dependency) would be a
   small, low-risk follow-up — noted, not proposed for this task.
6. **`Actor.controlledBy` is optional and unused by the one call site
   golem-grid has (always `"player"`).** Kept optional rather than
   required so a future NPC (C4/S2) doesn't force a schema migration;
   confirm this optionality doesn't quietly make `Actor` meaningless as
   a marker (i.e., is `Actor: {}` with no fields at all preferable?)
   — flagged as a naming/shape bikeshed, not a functional risk either way.

## Orchestrator decisions (locks this design for implementation)

Resolved 2026-07-06 by the orchestrating agent. Implementation follows
the design above with these bindings:

1. **Approach (a), the read-only overlay: ACCEPTED.** The DoD is met by
   construction (`entities.js` never in the `reduce`/`validate`/
   `serializeState` call graph), and the repo-hygiene test asserting
   `reducer.js`/`module.js` never reference `entities.js`/`entitiesOf` is
   REQUIRED — it is what makes "no behavior change" regression-proof.
2. **Prize/item asymmetry: accepted as-is.** The overlay faithfully
   mirrors today's mechanics (taken items → bare strings in
   `Inventory.items`; prize → one persistent entity with derived
   position). Zero behavior change wins. Revisit only if C4/S2 needs
   inventory contents to be `EntityId[]`.
3. **Light stays a bare scalar — confirmed.** No `Health` component, no
   14th "shared resource" component. `light(st)` is unchanged. YAGNI /
   flagship rule.
4. **`unknown`-typed condition fields (Lock/Interactable): accepted.**
   Kernel stays dependency-free of content. A shared condition-vocabulary
   package is deferred until the duplication recurs a third time (same
   posture as C1 Open Q#1).
5. **Secondary validator DEFERRED — NOT in this PR.** Do NOT build
   `packages/kernel/schemas/components.v1.json`,
   `validate-components.mjs`, or `component-schema.test.js` here. The
   kernel TypeScript types ARE the agreed vocabulary for now; a parallel
   JSON-Schema with no consumer is premature duplication. It validates
   *authored content*, which only S1 first produces — it lands then.
   Keeps C3's diff focused on its actual DoD (kernel types + golem-grid
   overlay).
6. **`Actor`: populate `controlledBy: "player"` for golem-grid players.**
   The overlay gives players a non-empty, accurate marker (they ARE
   player-controlled) rather than `Actor{}` — this also sidesteps the
   weak-empty-interface ergonomics. Field stays optional in the interface
   for future NPCs.
7. **`entities.js` stays plain ESM JS** (games/ may use plain JS per
   DELTA §0.3); no TS build step for golem-grid, no import of content at
   runtime. TS tightening against `EntityDef` is a deferred nicety.

Everything else in the design is accepted as written. This yields a tight
C3: one new kernel file (`components.ts`) + one re-export line, one new
golem-grid adapter (`entities.js`), and their tests — no edit to any
reducer/validate/fixture/schema file.
