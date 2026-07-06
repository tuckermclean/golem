# Port topdown-puzzle onto the kernel (C4) — Design

**Date:** 2026-07-06
**Status:** Draft — for orchestrator review before implementation begins
**Topic:** DELTA.md Phase 2, task C4 (the largest Phase-2 task) — push
chains, directional movers, memory holes, diamonds, and enemies as
validate/reduce systems over the grid backend, plus the fixed-step tick
bridge, plus a thin non-Phaser client. This is a design document only; no
code changes are made by it. Stacked on C1 (`packages/content`), C2
(topdown-puzzle ASCII importer), and C3 (kernel entities/components),
all present on this branch (`feature/c4-topdown-port`).

## Scope

DELTA §C4, verbatim:

> Port topdown-puzzle onto the kernel. Push chains, directional movers,
> memory holes, diamonds, enemies — as validate/reduce systems over the
> grid backend, with a fixed-step tick (`TICK_ADVANCED` event; autonomous
> movers act on tick, seeded via named channels — this task builds the
> real-time/event bridge in its smallest form). Thin canvas or DOM
> client; Phaser is not imported.
> DoD: at least 5 legacy levels playable start-to-finish; one recorded
> solution log per level replays bit-identically (these become permanent
> fixtures); VISION acceptance line "one topdown-puzzle level runs on
> the same kernel build" exceeded.

C4 does **not** invent new mechanics or new levels — it is a faithful
port of `games/topdown-puzzle/legacy/src/scenes/KyeScene.js`'s existing
behavior onto `@golem-engine/kernel`'s `GameModule` shape, driven by the
six levels C2 already compiles. Where legacy behavior is a real-time
input/animation artifact (diagonal swipes, tween timing, per-frame
polling) rather than a *rule*, this design canonicalizes to the
kernel's synchronous, tick-driven model and says so explicitly — per the
task brief's own instruction that "replays bit-identically" means "in
spirit," and "the kernel port defines the canonical rules."

## Ground truth: what KyeScene.js actually does

(Line numbers below are to `games/topdown-puzzle/legacy/src/scenes/
KyeScene.js` on this branch. Citing the *code*, not the comments, where
they disagree — see "corrections to legacy comments" below.)

**Collision model.** Two independent occupancy layers, not one:
- `this.grid` (via `Grid.setEntity`/`getEntity`) holds walls, blocks,
  diamonds, and moving blocks — the "pushable/solid" layer.
- `this.baddies` is a plain array, **never** registered in `this.grid`
  (`addBaddie`, ~674-688, has no `grid.setEntity` call). Baddies are
  therefore invisible to `getGridEntity` and to `getPushChain`.
- `this.memoryHoles` is also **never** registered in `this.grid`
  ("Do NOT store in grid array" — the code's own comment at ~759 — and
  `isMemoryHole()` is consulted directly everywhere a hazard check is
  needed). A memory hole tile reads as *empty* to `getGridEntity`.

This split is exactly golem-grid's world/state split (`dun.grid` static
geometry vs. `st.D` dynamic occupancy) — see "State model" below.

**Push chains** (`getPushChain`, ~369-391; `pushBlocks`, ~445-509).
Walking from the target cell in the push direction, collect consecutive
`block`/`diamond`/`movingblock` entities; stop at the first cell with no
grid entity (which includes memory-hole cells, since they read as
empty). **Chains longer than 2 are illegal** — `if (chain.length > 2)
return null` — this is not a dead branch: a grep across the six shipped
levels for runs of `B`/`D` tokens finds runs of 2, 4, 4, 5, 5 tiles (see
Test plan); four of six levels have a 3+ run, so "you cannot push this
row, it's too long" is a real, encountered puzzle constraint, not an
edge case. `pushBlocks` applies the chain **farthest-to-nearest**
(`for (let i = chain.length - 1; i >= 0; i--)`), which is what makes the
naive-looking loop safe: each block's destination is either open ground
(the farthest block) or the cell the next-farther block just vacated
this same call (never a cell another chain member still occupies), so
there is no reachable partial-push state for a 2-length chain. The port
keeps this exact ordering and the length-2 cap as a named constant.

**Diamonds** are chain members (pushable) but are *never* the target of
a direct step-onto: `tryMove` special-cases `type === "diamond"` to
always collect, never push, when the player walks directly onto one
(~341-347). A diamond can still be shoved along by a *block* pushed
into it. Pushed into a memory hole, a diamond is destroyed (not
collected) but still leaves `this.diamonds` (`pushBlocks` ~464-466)
— i.e. it still counts toward "resolved" for the win check, which is
`this.diamonds.length === 0` (`checkDiamondPickup`, ~663), not "count
collected." The port mirrors this: `diamondsRemaining` decrements on
both COLLECT and hole-destruction of a diamond.

**Baddies** (`addBaddie` ~674, `updateBaddie` ~691-748,
`shoveBaddiePerpendicular` ~394-442). Patrol a fixed axis
(horizontal/vertical), reversing `moveDir` when the next cell has a grid
entity — **but not when it's a diamond** (`if (!nextEntity ||
nextEntity.getData("type") === "diamond")` allows the move — baddies
walk straight through/over diamonds). A baddie can be shoved exactly one
tile *perpendicular* to its own axis by a push chain that lands on its
cell; shoving along its own axis is refused (the whole push then fails,
per the ordering argument above — since a baddie-blocked shove failure
can only occur on the *farthest* chain member, before any earlier
member has moved). A baddie shoved or walked into a memory hole is
destroyed.

**Correction to legacy comments:** `addBaddie`'s docstring and
`updateBaddie`'s own comment both claim baddies "reverse on hitting
wall/block/baddie/player," but the executed code only checks
`getGridEntity` — which, per the collision-model split above, contains
neither other baddies nor the player. The actual, executed behavior is:
baddies pass through/ignore other baddies and the player entirely for
patrol purposes; only walls/blocks/moving-blocks turn them around. This
design ports the *executed* behavior, per the task brief's instruction
to reproduce "the ACTUAL mechanics," not the comments.

**Contact damage** is not part of the grid-movement legality check at
all — it is a separate, continuous per-frame proximity poll in
`update()` (~291-317): if any baddie's grid distance to the player is
`< 0.5` and a 1000ms cooldown (`baddieHurtCooldown`) has elapsed,
`updateHealth(-10)` fires and the cooldown resets. The player is free to
walk *onto* a baddie's tile (grid collision never blocks it — the
baddie isn't in `this.grid`); the resulting damage is a same-tick
side-effect, not a movement denial.

**Moving blocks** (E/W/N/S, `addMovingBlock` ~898, `startMovingBlock`
~933-991). Continuously attempt one step per `MOVE_DURATION` (200ms) in
a *fixed* direction that never reverses (unlike baddies): blocked by a
grid entity, the player's current tile, or a not-yet-vacated destination
→ retry after another `MOVE_DURATION`, no state change. Reaching a
memory hole → destroyed. Pushed by the player (as an ordinary chain
member) → moves one tile, then resumes its own autonomous cycle from
the new tile. No check against baddies exists (same collision-model gap
as above) — a moving block can coexist on a baddie's tile; the port
keeps this rather than inventing a new collision rule with zero legacy
precedent.

**Win/lose.** Win: `this.diamonds.length === 0`
(`checkDiamondPickup`/`onAllDiamondsCollected`, ~608-640, ~652-671).
Lose: `this.health <= 0` (`updateHealth`/`playerDeath`, ~576-606) — from
either contact-damage accumulation or the player's own move landing on
a memory hole (`checkDiamondPickup`'s `isMemoryHole` branch, ~668-670).

## Two structural decisions this design makes explicit

### 1. `deriveWorld`'s "seed" is a level id, not an RNG seed

golem-grid's `deriveWorld(seed)` runs a procedural generator; doctrine
#1 ("the world is a pure function of the seed") is about *that*.
topdown-puzzle has no procedural generation — its "world" is one of six
*authored* ASCII levels, already compiled by C2 into a
`@golem-engine/content` `RuntimePack`. This design reads doctrine #1's
spirit as: **`deriveWorld(levelId)` must be a pure function of
`(committed content pack, levelId)`, with no other input** — same
non-negotiable determinism, different source of "the world's DNA" (an
authored map, not a hash-seeded RNG walk). `deriveWorld("001")` and
`deriveWorld("001")` again, on the same build, must produce byte-
identical worlds forever; that's the property golden-seed tests protect
for golem-grid, and it's exactly as protectable here. Flagged under Open
Questions for an explicit sign-off, since it's a real (if small)
reinterpretation of the doctrine's literal wording.

### 2. Entities become topdown-puzzle's actual state representation

C3's design chose, for golem-grid, a read-only entity **overlay** —
explicitly deferring "entities as the real storage format" with the
reasoning: *"no system (validate, affordances, a renderer) consumes the
entity view [yet] ... C4 ... [is] the first consumer[.]"* C4 is that
moment, but only for topdown-puzzle's **own** state — this design does
not touch golem-grid's `st.D`/`Map` representation or its overlay at
all. topdown-puzzle's mutable game objects (player, blocks, diamonds,
baddies, moving blocks) are numerous, individually mutable, and
naturally entity-shaped (each already has `Identity`/`GridPosition`/
`Actor`/`Portable` per C2's `entities.mjs` templates) — modeling state as
`Map<EntityId, Entity>` is simpler here than inventing a parallel
"stringly-keyed delta map" convention and then deriving entities from
it a second time. Walls and memory holes, which never change, stay out
of mutable state entirely (see below) — mirroring golem-grid's own
`dun.grid`/`st.D` split, just drawing the line at "does it ever change"
rather than "is it a game object."

## State model

**World** (immutable per level, from `deriveWorld(levelId)`):

```
World = {
  mapId: string,               // e.g. "map:tdp_001"
  rows: number, cols: number,
  walls: Set<string>,          // "x,y" — never in push chains, never destroyed
  memoryHoles: Set<string>,    // "x,y" — never registered as entities,
                                //         consulted directly (mirrors
                                //         KyeScene's own "do NOT store
                                //         in grid array" design)
  initialEntities: Entity[],   // player + blocks + diamonds + baddies +
                                //  moving blocks, each {id, components}
                                //  per @golem-engine/kernel's Entity<C>
  diamondTotal: number,        // initialEntities filtered to Actor.collectible
}
```

**State** (mutable, folded by `reduce`):

```
State = {
  entities: Map<EntityId, Entity>,  // id -> {id, components}
  diamondsRemaining: number,
  tick: number,
  seq: number,
  over: boolean,
  outcome: "WIN" | "LOSE" | null,
}
createState() = { entities: new Map(), diamondsRemaining: 0,
                   tick: 0, seq: 0, over: false, outcome: null }
```

Every level-start log begins with one `LEVEL_LOADED` event (payload-
free — `reduce` seeds `entities`/`diamondsRemaining` from the `world`
argument it already has, not from the event, so the log never carries a
redundant copy of the level layout). This is the same pattern golem-
grid's `JOIN` events use to bootstrap `st.D` from nothing — `replay()`
from `createState()` always works, uniformly, for every fixture and every
joining client.

Entity ids are deterministic strings derived from the compiled map's own
scan order at `deriveWorld` time — `entity:block@3,4`,
`entity:baddie@2,7`, `entity:player` (exactly one, fixed id) — so two
calls to `deriveWorld(levelId)` produce byte-identical ids, satisfying
the same "pure function of input" requirement `serializeState`-style
byte comparisons need.

`serializeState(state)` mirrors golem-grid's `reducer.js` exactly:
canonical JSON of `{ entities: [...entries()].sort by id,
diamondsRemaining, tick, seq, over, outcome }` — sorted-key stability is
what makes `h32(serializeState(...))` a stable fixture hash, per
`packages/testkit/fixtures/golem/`'s existing convention (this repo's
one hashing primitive; nothing new invented here).

## `deriveWorld(seed)` — and the sync-vs-async problem

`GameModule.deriveWorld(seed: string): World` is **synchronous**
(`packages/kernel/src/index.ts`'s "kernel is synchronous and pure...
no async in validate/reduce/observe/affordances" discipline extends to
every `GameModule` implementation, golem-grid's included). C2's
`compileContentPack()` is **not** synchronous — it does real file IO
(`readFile`/`readdir`) to assemble the source pack before calling
`compile()`. This is a genuine friction point this design must resolve,
made sharper by the thin **browser** client (PR3, below), which cannot
do Node file IO at all.

**Resolution: a committed, frozen compiled-pack artifact.** Add one new
file, `games/topdown-puzzle/content/pack.json` — the JSON output of
`compileContentPack()`, written by a new `games/topdown-puzzle/content/
build.mjs` script that imports C2's *existing, unmodified*
`compileContentPack()` and writes its `pack` field to disk (no changes
to `build-pack.mjs`/`entities.mjs`/`index.mjs`). `shared/module.js` then
does a plain synchronous `import pack from "../content/pack.json" with
{ type: "json" }` (or `readFileSync` + `JSON.parse` at module top-level,
whichever the repo's Node/Vite version combination handles more
uniformly — a small implementation-time call) — `deriveWorld(seed)`
itself never touches the filesystem, it only indexes into the already-
loaded `pack`.

This mirrors the project's existing "frozen, content-addressed build
artifact" discipline (doctrine #8's "eval-gated build artifacts...
pinned by manifest" for models; C1's own `RuntimePack.hash`) rather than
inventing a new one. A regen script + a "regenerating is a no-op"
test (`git diff --exit-code` clean after rerun) mirrors
`gen-golem-fixtures.mjs`'s own documented discipline exactly. This is
flagged under Open Questions since it's a new artifact/build step not
literally named in C2's original design, but it is the necessary bridge
for (a) a synchronous `deriveWorld` and (b) a browser client with no
`fs` — both hard requirements of this task, not optional conveniences.

**The derivation itself**, given the loaded `pack` and `seed` (a level
id like `"001"`): look up `pack.maps["map:tdp_" + seed]`, walk its
`cells`/`legend` (exactly as `build-pack.mjs` already documents the
token vocabulary), and for every non-floor cell resolve the legend
entry to its template `EntityDef` (or inline `components`), clone its
`components`, attach a fresh `GridPosition{x,y}`, and assign the
deterministic id described above. Wall and memory-hole cells are
bucketed into `world.walls`/`world.memoryHoles` (`Set<string>`) instead
of `world.initialEntities` — they are geometry, never mutated, exactly
paralleling `dun.grid`'s static wall characters in golem-grid. Baddie
axis comes straight off the already-distinct `entity:baddie_horizontal`/
`entity:baddie_vertical` templates (C2's `entities.mjs`); moving-block
direction comes off the legend entry's `facing` field (C1's
`MapLegendEntry.facing: "N"|"S"|"E"|"W"`, already populated by
`build-pack.mjs`'s `TOKEN_LEGEND`).

## `validate(ctx, cmd)`

`ctx = { state, world, from }` (mirrors golem-grid's `{st, dun, from}`
exactly; `from` is currently always the single player, kept for
signature symmetry and because nothing in the kernel or this design
special-cases single- vs. multi-player). Two verbs:

**`"move" <dx> <dy>`** — cardinal only (`Math.abs(dx)+Math.abs(dy) ===
1`; garbage deltas are silently ignored, exactly like golem-grid's
`move`). Legacy's diagonal movement is a Phaser-input-timing artifact
(`keyPressTimes`/`diagonalThreshold`, a **client-side gesture
disambiguation heuristic**, not a rule `getPushChain`/baddie logic was
even designed to support cleanly) — canonicalized away. See Open
Questions #1.

Resolution (a pure helper, `resolveMove`):
1. Out of bounds or `world.walls.has(target)` → `{deny: "..."}`
   (matches golem-grid's `"Stone does not negotiate."` flavor/shape —
   exact strings are an implementation-time bikeshed, not a design
   commitment).
2. Target has a diamond entity → **always** collect: emit
   `MOVED{id:"entity:player",x,y}`, `COLLECTED{id:<diamond>}`.
3. Target has a block/moving-block entity → compute the push chain
   (ported `getPushChain`/`pushBlocks` algorithm, farthest-to-nearest,
   length-2 cap, memory-hole-reads-as-empty, baddie-in-the-way triggers
   a perpendicular-shove sub-resolution) — if the chain is illegal
   (too long / blocked end), deny; else emit one `MOVED`/`DESTROYED`
   event per affected chain member (farthest first, matching legacy's
   iteration order) followed by `MOVED{id:"entity:player",...}`.
4. Otherwise (empty target, not a memory hole) → `MOVED{player}` only.
5. **Static-world hazard check** (no simulation needed — memory holes
   are `world` data, not derived state): if the player's *own* final
   tile is in `world.memoryHoles`, append `LOSE` directly after its
   `MOVED` event.
6. **Dynamic-state derived checks** (diamond count, HP) reuse the exact
   idiom golem-grid's `module.js`'s `moveDerivedEvents` already
   established: run the primary events through a throwaway `reduce`
   call, inspect the *simulated* resulting state, and append `WIN` if
   `sim.diamondsRemaining === 0` and not already over. (There is no live
   HP-derived death path from `move` itself in legacy — only from tick's
   contact-damage resolution, below — so `move`'s only dynamic-derived
   check is `WIN`.)

**`"tick"`** — the fixed-step beat (see next section). Delegated to a
pure helper, `resolveTick`.

Both helpers return `Event[]` or a `Denial`, exactly the
`ValidateResult` shape `packages/kernel/src/index.ts` defines; `validate`
itself is the one-line switch dispatching to whichever helper, same
shape as golem-grid's `module.js`.

## The fixed-step tick bridge (the novel part)

**Why a tick at all.** Moving blocks and baddies act *without* a player
command — the "real-time" part of a game that is otherwise entirely
command-driven. DELTA's ask is the smallest correct bridge between
"the world only changes in response to a validated command" (true of
every other system in this repo so far) and "some entities act on their
own." The bridge chosen here: **the host is the only clock.** It calls
`validate(ctx, "tick")` on a fixed cadence (a constant, e.g.
`TICK_MS = 200` — legacy's own `MOVE_DURATION`, reused as the canonical
cadence since it's what baddie-timer and moving-block-timer both already
ran at) exactly the way it calls `validate` for any player-typed
command — through the *same* `hostCommit` seq-stamping loop golem-grid's
`host.js` already established. `TICK_ADVANCED` is therefore a normal
committed event, sitting in the log next to every `MOVE`d/`COLLECTED`/
`DESTROYED` event a player command produced — replay doesn't need to
know anything special about it; `replay()` just folds it like any other
event. This is what makes "the tick events are in the log" and
"recorded solution log replays bit-identically" the same claim: a
recorded solution is simply an ordered list of `"move ..."` and `"tick"`
commands, and replaying it means calling `validate` then `reduce` for
each command in order — no wall-clock, no timers, in a test.

**`resolveTick(state, world)`** (a pure helper, K2/K5 discipline: all
derivation lives here, not re-derived by the host):

1. Emit `TICK_ADVANCED{tick: state.tick + 1}` first (always, exactly
   once per tick — this is the "a fixed-step beat occurred" marker
   DELTA names explicitly).
2. **Moving blocks**, in `world.initialEntities`' original scan order
   (deterministic — top-to-bottom, left-to-right, fixed at
   `deriveWorld` time, never reordered by state): compute the next cell
   in the entity's fixed facing. Blocked (wall/other-block/player's
   current tile/undestinated-yet-vacated cell) → no event, nothing
   changes (matches legacy's silent retry-next-cycle — and note the
   fixed cadence *is* the retry: there's no separate "wait" state to
   track). Memory hole → `DESTROYED{id}`. Otherwise → `MOVED{id,x,y}`.
3. **Baddies**, same fixed scan order: compute next cell along axis
   (diamonds are passable, matching the "ground truth" section above).
   Blocked (wall/block/moving-block only — **not** other baddies, **not**
   the player, per the corrected-comment finding above) → `moveDir`
   flips; **always** emit `MOVED{id,x,y,moveDir}` for a baddie each tick
   (even when `x,y` are unchanged — the `moveDir` flip is itself a real
   state transition that must be captured by an event, per doctrine #3's
   pure-fold discipline: nothing changes in `state` that wasn't recorded
   by an event). Memory hole → `DESTROYED{id}`.
4. **Contact damage**: after all movers have stepped, if the player's
   tile coincides with any surviving baddie's tile *and* the cooldown
   condition is clear, emit `HURT{id:"entity:player", hp: <resulting
   hp>}`. See Open Questions #2 for the cooldown-model simplification
   this design recommends over legacy's literal 1000ms/`Δtime` timer.
5. **Dynamic-state derived check** (same sim-and-inspect idiom as
   `move`'s step 6): if resulting `hp <= 0`, append `LOSE`.

**Named-channel randomness.** `packages/random`'s `channel(seed, ...)`
is the engine's only sanctioned nondeterminism source (`Math.random` is
banned repo-wide, enforced by `tools/check-bans.mjs`). Per the Ground
Truth section, **no KyeScene mechanic this design ports is actually
nondeterministic** — moving blocks and baddies are pure functions of
their own position/axis/direction and the (deterministic) world/state
around them. `resolveTick` is therefore given `world.mapId` (or the
`seed`/levelId, threaded through from `deriveWorld` alongside `world`)
purely so a **future** mover variant that does need a coin flip (e.g. a
hypothetical "wanderer" baddie choosing a direction at a junction) can
call `channel(seed, "tick", String(state.tick), entityId)` without a
signature change — but this design does not invent such a mover, since
none exists in the ported game (flagship rule: nothing enters the engine
that the current port doesn't need). This is flagged prominently under
Open Questions, since it means the channel-wiring DELTA calls for is
present but genuinely unexercised by any of the six shipped levels — see
Open Questions #4 for the two ways to resolve that honestly.

**Interleaving with player commands.** Nothing about `"move"` waits for
a `"tick"` or vice versa — they are just two verbs `validate` accepts,
committed through the same host loop in whatever order they're issued.
The *client's* host driver (PR3) is what actually paces real ticks at
`TICK_MS` via `setInterval`, exactly mirroring how golem-grid's `NET`/
`hostCommit` layering keeps game logic (`validate`/`reduce`) ignorant of
wall-clock time entirely — replay tests below issue `"tick"` commands
programmatically, with no timers at all, which is the whole point.

## `reduce(state, world, event)`

One case per event kind, each a pure fold (fresh `Map`, no mutation of
`state`/`world` — same discipline as golem-grid's `reducer.js`):

| Event | Effect |
|---|---|
| `LEVEL_LOADED` | `entities` ← copy of `world.initialEntities`; `diamondsRemaining` ← `world.diamondTotal` |
| `MOVED{id,x,y,moveDir?}` | that entity's `GridPosition` ← `{x,y}`; if `moveDir` present, that entity's `Actor.moveDir` ← `moveDir` |
| `COLLECTED{id}` | remove entity; `diamondsRemaining` −= 1 |
| `DESTROYED{id}` | remove entity; if it had `Actor.collectible`, `diamondsRemaining` −= 1 |
| `HURT{id,hp}` | that entity's `Health.hp` ← `hp` |
| `TICK_ADVANCED{tick}` | `tick` ← event's `tick` |
| `WIN` / `LOSE` | `over` ← true; `outcome` ← `"WIN"`/`"LOSE"` |

Every event carries its **resulting** fields (`x,y`, not `dx,dy`; `hp`,
not `-amount`), matching golem-grid's own `MOVE{x,y}` convention — this
is what keeps `reduce` a pure "copy these fields onto that entity" fold
with no branch on event *history*, and it is why a single `MOVED` event
shape can serve player movement, pushed chain members, autonomous
movers, and shoved baddies alike: they all reduce to "this entity's
position (and optionally facing) is now this."

## Win/lose — summary

- **Win:** `diamondsRemaining === 0` (derived after any `COLLECTED` or
  diamond-`DESTROYED` event, via the sim-and-inspect idiom).
- **Lose:** player `Health.hp <= 0`, from either (a) the player's own
  move landing directly on a memory hole (a static-world check, no
  simulation needed), or (b) tick-resolved contact damage (a dynamic-
  state check, sim-and-inspect).

Both are derived, never player-declarable commands — same posture as
golem-grid's `WIN`/`LOSE`, which are never something a client "sends,"
only something `validate`/`reduce` conclude.

## Thin client

Canvas 2D (`<canvas>` + `2d` context; **no Phaser import** anywhere in
`games/topdown-puzzle/src/`, checkable the same way
`tools/check-bans.mjs` checks other bans). Per-frame render reads
`state.entities` directly (no tweening, no interpolation) and draws each
entity as a flat-colored rect/glyph keyed off `Actor.kind`, plus a small
facing arrow for moving blocks/baddies, plus HP and
`diamondsRemaining`/`tick` as text — this trivially satisfies the
`prefers-reduced-motion` doctrine bullet, since there is no motion to
reduce (entities snap to grid cells; this is deliberate, not a
placeholder for future animation). Input: capture-phase arrow keys →
`"move dx dy"` (mirrors golem-grid's `input.js` "arrows are feet,
always" bullet verbatim). A `host.js` (ported from golem-grid's
`createHost` pattern almost unchanged: `validate` → seq-stamp → commit)
adds one thing golem-grid's host doesn't need: a `setInterval(() =>
hostCmd(me, "tick"), TICK_MS)` driving the fixed-step clock. No
`@golem-engine/net`/multiplayer transport is needed (topdown-puzzle is
single-player) — the log is still appended exactly as golem-grid's is,
since the same log is what a solution fixture *is*.

## The DoD mechanism: recorded solution logs as permanent fixtures

Mirrors `packages/testkit/tools/gen-golem-fixtures.mjs` /
`verify-golem-fixtures.mjs` closely, with one necessary difference:
golem-grid can *compute* a winning route with its existing solver
(`shortestPath`); topdown-puzzle has no such solver (multi-block Sokoban-
style search with moving obstacles is a materially harder search
problem, and DELTA does not ask for one — no `make solve`-equivalent
gate is named for C4). Solutions are therefore **hand-authored**: for
each level, someone plays it (via the PR3 thin client) to a win and
records the exact command sequence (`"move n 0 -1"`/`"tick"`/... —
tick commands included explicitly wherever the recorded playthrough
needs the fixed clock to advance, so there is no implicit timing
assumption anywhere in the fixture).

- `games/topdown-puzzle/tests/solutions/<level>.moves.json` — the
  authored input: a flat ordered array of command strings.
- `packages/testkit/tools/gen-tdp-solution-fixtures.mjs` — for each
  level: `deriveWorld(level)` + `createState()` + commit `LEVEL_LOADED`,
  then commit every command from the `.moves.json` file through the
  *real* `validate`+`reduce` (no reimplementation), asserting the final
  `outcome === "WIN"`; writes `packages/testkit/fixtures/
  topdown-puzzle-solutions/<level>.log.json` + an `index.json` entry
  `{level, log, finalHash}` (`finalHash = h32(serializeState(final) +
  "\n")`) — same shape as `packages/testkit/fixtures/golem/index.json`.
- `packages/testkit/tools/verify-tdp-solution-fixtures.mjs` — replays
  each committed log against a **freshly derived** world, re-asserts
  `WIN` and `finalHash` match — the literal "replays bit-identically"
  proof, exits non-zero on any mismatch, wired into `npm run
  freeze:verify` (a new `verify:tdp-solutions` script joining the
  existing `verify:golem`/`test:ceremony`/`verify:tdp` triad) so it
  becomes a permanent CI gate, per the DoD's "these become permanent
  fixtures" instruction.
- `packages/testkit/tests/tdp-solution-replay.test.js` — a `node:test`
  wrapper asserting the verifier's pass/fail programmatically (mirrors
  `kernel-replay.test.js`'s relationship to the golem fixtures).

## File / module layout

```
games/topdown-puzzle/
  content/
    build.mjs            # NEW — writes pack.json from the EXISTING,
                          #       unmodified compileContentPack()
    pack.json             # NEW — committed frozen RuntimePack artifact
  shared/                 # NEW — mirrors games/golem-grid/shared/
    module.js              # deriveWorld / validate / reduce (KernelCore)
    reducer.js              # pure reduce + createState + accessors
                            # (entityAt, players, diamondsRemaining, ...)
    push.js                 # getPushChain / resolveMove (push-chain math)
    tick.js                 # resolveTick (movers + baddies + contact +
                            #  derived win/lose) — isolated because it
                            #  is the single largest, most novel piece
  src/
    host.js                 # hostCommit/hostCmd + TICK_MS setInterval
    client.js                # applyRemoteEvent + replay()-based snapshot
                             #  (same @golem-engine/kernel import as
                             #  golem-grid's client.js)
    render.js                # canvas thin renderer, no Phaser
    input.js                 # arrow keys -> sendCmd("move ...")
    main.js                  # composition root
  tests/
    module.test.js            # validate/reduce unit tests
    push.test.js               # push-chain unit tests (1/2-length,
                               #  blocked, into-baddie-shove, into-hole)
    tick.test.js                # mover/baddie/contact-damage unit tests
    solutions/
      001.moves.json ... 006.moves.json   # hand-authored solutions

packages/testkit/
  fixtures/topdown-puzzle-solutions/
    001.log.json ... 00N.log.json, index.json   # NEW, permanent
  tools/
    gen-tdp-solution-fixtures.mjs    # NEW
    verify-tdp-solution-fixtures.mjs  # NEW
  tests/
    tdp-solution-replay.test.js       # NEW
```

No changes to `packages/kernel`, `packages/content`, `packages/random`,
`games/golem-grid`, or C2's `build-pack.mjs`/`entities.mjs`/`index.mjs` —
C4 is additive-only, same posture C3 held for golem-grid.

## Proposed implementation decomposition (4 sub-PRs)

C4 is the largest Phase-2 task; splitting it lets each PR prove one
architectural bet before the next depends on it.

**PR1 — Foundation: sync world + player movement + push chains +
diamonds + win, on 1–2 levels.**
`content/build.mjs` + committed `pack.json` (+ regen-is-a-no-op test);
`shared/module.js`'s `deriveWorld`; `shared/push.js`'s push-chain
resolution; `"move"` validate/reduce covering wall/out-of-bounds denial,
empty-space movement, diamond collection, push chains (length 1 and 2,
illegal-length denial, blocked-end denial), the static-world memory-hole
LOSE check, and diamond-count WIN. **No baddies, no moving blocks, no
tick yet.** Pick the 1–2 levels with the fewest baddie/mover tokens for
the first solution-log fixture, proving the whole fixture mechanism
(authored `.moves.json` → generated log → `finalHash` → verifier) on
the smallest surface, before scaling up. This is the highest-risk PR
(the sync-`deriveWorld`-from-frozen-artifact bridge, the entity-as-state
representation, the fixture toolchain) — land it first and cheaply.

**PR2 — Autonomous systems: the tick bridge.**
`TICK_ADVANCED` + `shared/tick.js`'s `resolveTick`: moving blocks (E/W/N/
S autonomous stepping, blocked-retry, hole-destruction), baddies
(H/V patrol, wall/block-only reversal — the corrected-comment
behavior — hole-destruction, perpendicular shove-on-push), contact
damage + cooldown + HP-derived LOSE. Extends `validate` with the
`"tick"` verb. Extends the solution-log fixtures to the levels that
actually exercise movers/baddies. This is the task's novel, DELTA-named
deliverable — isolated into its own PR once PR1's foundation is proven,
so review can focus entirely on the new real-time/event bridge.

**PR3 — Thin client.**
`src/host.js` (adds the `TICK_MS` `setInterval` on top of the ported
`hostCommit` pattern), `src/render.js`, `src/input.js`, `src/client.js`,
`src/main.js`. Playable in a real browser, no Phaser. This PR is also
what makes hand-authoring the remaining solution logs (PR4) practically
possible — recommend landing it before or alongside the start of PR4's
authoring work, even though its code has no dependency on PR4.

**PR4 — Closure: full fixture coverage + CI wiring.**
Author and record solution logs for the remaining levels (≥5 total,
ideally all 6); `gen-tdp-solution-fixtures.mjs`/
`verify-tdp-solution-fixtures.mjs`/`tdp-solution-replay.test.js`;
`freeze:verify` wiring; CLAUDE.md "current status" update recording C4
DONE.

**Recommended order: PR1 → PR2 → PR3 → PR4**, matching this repo's own
precedent (K1→K6, C1→C3 each landed the riskiest/most foundational slice
first) — PR1 retires the sync-deriveWorld/entities-as-state/fixture-
toolchain risk before PR2 adds the genuinely new tick bridge; PR3 is
comparatively mechanical once `validate`/`reduce` are proven; PR4 is
"repeat the (real, non-trivial) authoring labor" once the mechanism is
trusted.

## Test plan (DoD → concrete tests)

| DoD / claim | Test |
|---|---|
| Compiled pack is a frozen, reproducible artifact | A "regen is a no-op" test: rerun `content/build.mjs`, `git diff --exit-code pack.json` clean (mirrors `gen-golem-fixtures.mjs`'s documented discipline) |
| Player movement / walls / bounds | `module.test.js` — empty-space move, wall denial, out-of-bounds denial |
| Push chains | `push.test.js` — length-1, length-2, length>2 denial (grounded in the six levels' actual 4/5-run arrangements), blocked-end denial, push-into-diamond (diamond shoved along), push-into-baddie (perpendicular shove succeeds / along-axis shove denies the whole push), push-into-memory-hole (block/diamond/moving-block each destroyed, diamond still decrements `diamondsRemaining`) |
| Diamonds / win | `module.test.js` — direct walk-on-diamond always collects (never pushes); `diamondsRemaining` reaches 0 → `WIN` |
| Memory holes / lose (static) | `module.test.js` — player's own move onto a memory hole → `MOVED` then `LOSE`, no simulation needed |
| Moving blocks | `tick.test.js` — one autonomous step per tick in fixed facing; blocked → no event, retried next tick; memory hole → `DESTROYED`; pushed → resumes autonomous cycle from new tile |
| Baddies | `tick.test.js` — patrol + reflect off wall/block/moving-block only (not other baddies, not player — the corrected-comment behavior); passes over diamonds; memory hole → `DESTROYED`; perpendicular shove via a push; along-axis shove denies the push |
| Contact damage / lose (dynamic) | `tick.test.js` — coincident player/baddie tiles → `HURT`; `hp <= 0` → `LOSE`, via the sim-and-inspect idiom |
| Determinism / no banned nondeterminism | A repo-hygiene test (mirrors `packages/content`'s `no-dynamic-code.test.js`) grepping `shared/*.js` for `Math.random`/`Date.now()` — must find none; already covered repo-wide by `tools/check-bans.mjs`, this is a local, redundant-by-design belt-and-suspenders check for the new files specifically |
| **"≥5 legacy levels playable start-to-finish"** | One authored `.moves.json` solution per level (≥5 of 6) that a human actually cleared via the PR3 client |
| **"recorded solution log replays bit-identically"** | `verify-tdp-solution-fixtures.mjs` (finalHash match against a freshly re-derived world) + `tdp-solution-replay.test.js`, wired into `npm run freeze:verify` permanently |
| VISION acceptance line exceeded | Same fixtures, plus the thin client itself as a demoable artifact — the acceptance line asks for one level; this task's DoD already asks for five |
| No regression elsewhere | `make test`, `npm run freeze:verify` (golem fixtures, `@ceremony`, topdown-puzzle parse snapshots — none of which this task touches), unchanged and green |

## Open questions / risks (for the orchestrator)

1. **Diagonal movement dropped.** Legacy's diagonal input is a client-
   side gesture-timing heuristic (`keyPressTimes`/`diagonalThreshold`),
   not a rule the push/baddie systems were designed around cleanly.
   This design canonicalizes to 4-directional-only movement, matching
   golem-grid's own convention and the "one key, one meaning" design
   test. Confirm, or require diagonal support (a materially larger
   push-chain/shove state space with no clean legacy precedent to port
   from).
2. **Contact-damage cooldown model.** Legacy's 1000ms real-time cooldown
   existed to stop multiple hits within a handful of 60fps frames — that
   problem doesn't exist at a ~200ms tick cadence. This design
   recommends simplifying to "damage once per newly-established contact,
   no repeat damage while contact persists, re-arms on separation"
   instead of porting a tick-counted cooldown timer — simpler to specify
   and test, and arguably closer to the *intent* than a literal
   millisecond port. Recommend accepting the simplification; flag if a
   literal cooldown-in-ticks is preferred instead.
3. **`deriveWorld`'s "seed" is a level id, not an RNG seed** (see
   "Two structural decisions" above) — confirm this reading of doctrine
   #1 is acceptable for an authored-content game, as opposed to requiring
   this task to also invent procedural generation for topdown-puzzle
   (which DELTA does not ask for).
4. **Named-channel randomness is wired but unexercised.** No shipped
   level's mechanics are actually nondeterministic, so `channel(seed,
   "tick", ...)` has a call site reserved (a `seed` parameter threaded
   through to `resolveTick`) but nothing in the six levels ever calls
   it. Two honest ways to resolve this: (a) ship it unexercised,
   documented as reserved-for-a-future-mover (C3's "defined-for-later"
   precedent), or (b) add a unit test that exercises `channel()` via a
   synthetic hypothetical entity/scenario even though no shipped level
   needs it, so the wiring has at least one real test, not just a
   reserved parameter. Recommend (a) per the flagship rule (nothing
   speculative), but flagging since it means "seeded via named channels"
   is architecturally present but not provably exercised by this task's
   own deliverable.
5. **The `content/pack.json` frozen artifact is a new build-step
   surface** not literally named in C2's original design. Confirm it's
   in scope for C4 (it's required for both sync `deriveWorld` and the
   browser client) rather than being read as retroactively expanding
   C2's brief.
6. **Push-chain length-2 cap verified only by grep, not exhaustive
   play.** The six levels' `B`/`D` token runs (2, 4, 4, 5, 5, 2 tiles
   longest-run per level) confirm the cap is load-bearing, but PR1
   should still spot-check that no level's *intended* solution requires
   pushing a 3+ run (which would make that level unsolvable under a
   faithful port and force a design reconsideration, not just a bug fix).
7. **Solution-log authoring is real manual labor**, not automatable the
   way golem-grid's solver-derived fixtures are (multi-block puzzle
   search with moving obstacles is a much harder search problem, and
   DELTA does not ask for a solver here). PR4's fixture count depends on
   a human actually clearing each level via the PR3 client first —
   flagged as a sequencing dependency (see "Recommended order") and a
   real time/effort risk against "≥5 levels," not just a checkbox.
8. **Legacy's own HP numbers are internally inconsistent** (`this.health
   = 20` at spawn vs. `Phaser.Math.Clamp(..., 0, 100)`'s max) and the
   damage/cooldown constants (10 dmg, 1000ms) are arbitrary Phaser-era
   tuning, not balance decisions worth preserving byte-for-byte. This
   design recommends picking small, legible canonical numbers (teachability
   doctrine favors e.g. "3 hits" over "20/100 HP, 10 damage" arithmetic)
   rather than porting the inconsistency verbatim — flagging for
   orchestrator sign-off since it's a visible, if minor, departure from
   "faithful port."

## Orchestrator decisions (locks this design for implementation)

Resolved 2026-07-06 by the orchestrating agent. Implementation follows
the design + the 4-PR decomposition (PR1→PR4), with these bindings:

1. **Diagonal movement dropped → 4-directional canonical: ACCEPTED.**
   Legacy diagonal was a client input-timing heuristic, not a rule;
   4-directional matches golem-grid + the "one key, one meaning" design
   test. Solution logs are authored against the canonical port rules.
2. **Contact-damage cooldown: ACCEPTED simplification** — "damage once
   per newly-established contact, no repeat while contact persists,
   re-arms on separation." No millisecond/tick-counted timer.
3. **`deriveWorld(levelId)`: ACCEPTED.** topdown-puzzle is authored
   content, not procedural; `deriveWorld` is a pure function of
   `(committed pack, levelId)` — doctrine #1 satisfied, different
   world-DNA source. Not inventing procedural generation.
4. **Named channels: ship deterministic (option a).** Thread the `seed`
   through to `resolveTick` as the sanctioned nondeterminism path
   (`Math.random` stays banned); the ported movers are deterministic and
   draw nothing, documented as the reserved path for any future
   nondeterministic mover (C3 "defined-for-later" precedent). Do NOT add
   a speculative random mover. Add a `resolveTick` determinism test (same
   `(state, world)` in ⇒ same events out) so the bridge's determinism is
   proven. DELTA's "seeded via named channels" is honored as the
   how-movers-get-randomness constraint, not a mandate that a mover be
   random.
5. **`content/pack.json` frozen artifact: ACCEPTED, in scope for C4**
   (required for a synchronous `deriveWorld` AND a browser client with no
   `fs`). Include the regen-is-a-no-op test. C2's `build-pack.mjs`/
   `entities.mjs`/`index.mjs` stay unmodified.
6. **Push-chain length-2 cap: PR1 must confirm solvability.** Before
   committing a level's solution fixture, verify that level's intended
   solution never requires pushing a 3+ run; if one does, STOP and
   surface it (it would mean the faithful port makes a level unsolvable —
   a design escalation, not a bug to paper over).
7. **Solution-log authoring: a dev-time search helper is PERMITTED**
   (not a shipped solver gate). PR1 targets the 1–2 simplest **mover-free**
   levels, whose state space (player move + push chains only) is a
   tractable BFS — a throwaway search script may generate/verify the
   winning move sequence. The fixture is still the recorded log replayed
   bit-identically; how the moves were found is immaterial. Movers/baddie
   levels (PR2/PR4) may hand-author or bounded-search as feasible.
8. **HP numbers: pick clean canonical values** (teachability doctrine) —
   e.g. 3 HP, 1 damage per contact (3 hits ⇒ LOSE) — documented as a
   canonicalization, not a byte-port of legacy's inconsistent 20/100/10
   tuning. (Affects PR2.)

**Implementation starts with PR1** (foundation: sync world + movement +
push chains + diamonds + win on 1–2 mover-free levels + the full fixture
toolchain). It is additive-only (no edits to kernel/content/random/
golem-grid/C2 sources), verified by: the existing `freeze:verify` triad
staying byte-identical, plus PR1's own level's solution log replaying to
a matching `finalHash`.
