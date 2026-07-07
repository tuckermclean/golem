# S2b — Ceremony Rules Port: state model + tick bridge (design)

Date: 2026-07-07
Roadmap: DELTA.md PHASE 4 **S2** (Rules port), **second of three specs**
(S2a done = pure helpers; **S2b = PR2 here**, the state model / tick
bridge / grid movement architectural slice; **PR3** = Door Golem gate +
ceremony state machine + zone transitions + resurrection-as-reduce, which
closes the wired ceremony tests). Builds on S1 (content) + S2a (rules).

## Why this is its own slice

Per the S2 scoping brief, PR2 **closes 0 new ceremony tests** — it's the
architectural-risk slice, landed cheap and first (mirrors C4 PR1's
rationale). It stands up the five-tier `State`, the `deriveWorld`/
`validate`/`reduce` `KernelCore`, the C4 tick bridge, and grid movement,
proven by determinism + movement + tick tests. The wired ceremony tests
(door-golem gate, seal-on-stairs, death-respawn real-zone) close in PR3,
which builds the gate/ceremony state machine on top of this foundation.

## The five-tier State (locked mapping)

The S2 brief flagged this mapping as needing a decision; here it is,
tested against every ceremony assertion in the brief's matrix. `State` is
the object the reducer folds — five delta namespaces:

- **`world`** — *which world-instance is active*, NOT the derived `World`
  (doctrine #1: the world is never stored). Shape: `{ zone: "ow"|"tomb",
  floorNum: number, mapId: string }`. The derived `World` comes from
  `deriveWorld(state.world)`, outside `State`.
- **`run`** — per-descent state, reset only by `NEW_RUN`/`ENTER_TOMB`,
  never by death: `runStats` (`depth,kills,killsByKind,died,glurpsDrunk,
  goldGained`) + current-floor puzzle/enemy mutable state.
- **`character`** — the current embodiment: `hp,maxhp,potions,inv,atkT,
  gold,swordLv,pos{x,y}`. The resurrection event mutates only the fields
  legacy's `respawnAtGuild` names; `swordLv` survives by omission (it is
  character-tier, read live — NOT knowledge; the credential-acquisition
  test pins this).
- **`knowledge`** — `meta`'s permanent facts as a **plain object** 1:1
  (`credentials{backstory,debt}`, `golemApproved`, `credit{...}`,
  `deaths,lastCause,repeatCause,grades,...`). **Do NOT** force through
  C3's `Knowledge{knows:string[]}` (reserved for L7). Persists across
  death→resurrection.
- **`profile`** — cross-session tier. No ceremony test or Ceremony
  sequence exercises it; define the empty slot (structural completeness),
  leave it inert (flagship rule, like C4's unexercised channel wiring).

## deriveWorld + the synthetic floor fixture

`deriveWorld(worldState) → World`: pure, from `{zone,floorNum,mapId}`.
For the Guild Hall (`zone:"ow"`), derive from S1's `map:guild_hall`. For
a tomb floor, S2b needs a floor to exercise movement/collision/stairs —
but **S3 (procedural floor gen) hasn't landed and `packages/world` is a
stub**. So S2b authors a **synthetic tomb-floor-1 fixture** (a small
hand-authored map, the C4 `synthetic-level.mjs` precedent), used by tests
and PR3's wired ceremony mirrors — **never committed into
`content/pack.json`** (the real generated floor is S3's job). Make this
dependency direction explicit so S3 isn't pulled forward.

## The systems (PR2 scope)

Reuse topdown-puzzle's `shared/{reducer,module,tick}.js` + `src/host.js`
structure near-verbatim (they are the "game as validate/reduce over a
content-derived world + C4 tick bridge" precedent):

- **`games/some-hero/shared/reducer.js`** — pure `reduce(state, world,
  event) → state`: fresh objects, copied on write, no mutation,
  identity-blind (topdown-puzzle `reducer.js` pattern). `createState()`,
  `serializeState()` (→ h32 for determinism tests).
- **`games/some-hero/shared/module.js`** — `deriveWorld`/`validate`/
  `reduce` (the `KernelCore`); `validate(ctx, cmd) → Event[] | Denial`.
- **`games/some-hero/shared/tick.js`** — `resolveTick`, deterministic,
  wall-clock-free (the C4 `TICK_ADVANCED` bridge; movers/enemies act on
  tick, seeded via `packages/random` named channels — never
  `Math.random`).
- **`games/some-hero/src/host.js`** — `createHost` (validate → seq-stamp
  → commit + the `setInterval(hostCmd(me,"tick"), TICK_MS)` clock), the
  topdown-puzzle `host.js` pattern.

### Movement canonicalization (locked, flagged divergence)

Legacy is continuous-pixel AABB (`world/tilemap.js` `moveEnt`/`boxFree`).
S2b **canonicalizes to grid-cardinal movement** exactly like
topdown-puzzle/golem-grid (`"move dx dy"` → `MOVED` | wall/bounds
`Denial`). This is a real, **uncharacterized** deviation from legacy
(no ceremony test pins pixel movement) — flagged as an explicit design
divergence, same category as C4 dropping diagonal movement. High
architecture value, zero fidelity risk.

## PR2 tests / gates

- `shared/reducer.test.js` / `module.test.js` — movement + wall/bounds
  collision (`MOVED`/`Denial`), tick advances movers deterministically.
- A **determinism test**: replay an event log through `replay()` →
  byte-identical `serializeState`/h32 (the kernel acceptance hook, like
  golem-grid/topdown-puzzle).
- `no-legacy-import` extended (or a new one) covering `shared/`.
- `check-bans` clean (rng via `packages/random` channels only).
- Wire `shared/` tests into the some-hero workspace `test`.
- **Everything green + unchanged**: legacy `test:ceremony` 62, S2a
  ceremony-kernel 54, S1 content 32, freeze:verify full chain. **PR2
  closes 0 new ceremony tests by design** — say so, don't pad.

## Scope boundaries (PR2)

No Door Golem gate logic, no ceremony two-step state machine, no zone
transitions, no resurrection events, no combat damage resolution, no
`narrativeFacts`, no pickups beyond what movement needs. Those are PR3
(gate/ceremony/zones/resurrection → closes the 6 wired ceremony tests +
the 2 death-respawn "same object → byte-identical serialized content"
tests) and S2c (combat/pickups/narrativeFacts/closure). No committed
`content/pack.json` change (synthetic floor stays a test fixture). No
frozen-fixture/golden/legacy/ceremony change.

## Deferred to PR3 / S2c

Door Golem `Lock.unlockCondition` via `evaluate()`+`FactLookup`; the
two-step "ceremony plays before descent" protocol (no existing kernel
precedent — its own mini design); zone `ow↔tomb` transitions;
resurrection-as-reduce (`DIED`/`RESURRECTED` over the five-tier
namespaces — the deepest novel surface); combat (skeleton family) +
contact damage on the tick bridge; `narrativeFacts` (facts-only, feeding
both the S2a template ledger and the future twin); the file-parity
hygiene test closing "every @ceremony test passes against the kernel."
