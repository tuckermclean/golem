# A1 PR2 — golem-grid adopts affordances() (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 5 **A1**, PR2 of 3. Headless. golem-grid's context
menu (take/look/read subset) + tier-1 parser both consume a real
`GameModule.affordances()`, replacing the interim `computeAffordances`.
Builds on A1 PR1 (the canonical `Affordance` + kernel hook). PR3 =
tutorial-hint + twin-grounding consumer tests.

## Where golem-grid's affordances() lives (the ban-test subtlety)

`games/golem-grid/tests/entities-not-in-callgraph.test.js` bans
`entitiesOf`/`entities.js` from `shared/reducer.js` + `shared/module.js`
— the guarantee that the **determinism-critical** path (reduce/validate/
deriveWorld) never depends on the C3 entity overlay.

So: put `affordances()` in a **new `games/golem-grid/shared/
affordances.js`** that imports `entitiesOf` (the C3 overlay's **first
real consumer** — today it's proven only by tests). `shared/module.js`'s
exported `module` object gains `affordances` by importing it FROM
`affordances.js` — `module.js` itself never references `entitiesOf`/
`entities.js`, so the ban test stays green **unchanged**, and the real
guarantee holds (reduce/validate/deriveWorld never call `affordances` or
`entitiesOf`; only the client's menu/parser do). Optionally extend the
ban test to also assert `affordances.js` is NOT referenced by reducer.js/
the determinism path (belt-and-suspenders), but do not add `entities.js`
to a banned list for `affordances.js` (it legitimately consumes it).

## golem-grid's Obs + affordances()

- **`Obs`** = a narrow, caller-assembled bundle (NOT a stateful fog
  `observe()` redesign): `{ entities: Entity[], me: {x,y}, seenT:
  ReadonlySet<string>, litT: ReadonlySet<string> }` — exactly what
  `computeAffordances(S, x, y)` receives today, reshaped. golem-grid does
  NOT get a full `observe()` in this PR.
- **`affordances(observation, actor) → Affordance[]`** in `affordances.js`
  — lift `computeAffordances`'s proven take/look/read logic, sourcing
  entities via `entitiesOf` where it maps cleanly (take/look on items/
  prize), reading lore directly for `read` (lore isn't an `entitiesOf`
  entity). Output must be **byte-identical** to `computeAffordances` for
  take/look/read (the menu-parity test enforces this).

## Context-menu scope (locked narrowing)

Only **take / look / read** move to `affordances()`. `handleTap`'s
**"walk here"** (pathfind to any walkable tile) and **per-occupant
"whisper"** stay hand-rolled UI actions — they aren't `verb`/`target`
affordances in the interim source and backing them would need new
`walk`/`whisper` verbs (scope expansion beyond A1). Document this in
`input.js`. The take/look/read menu items must stay byte-identical
(label + order + click behavior).

## Adoption

- **Parser** (zero behavior risk): `src/input.js`'s chat branch currently
  calls `computeAffordances(S, me.x, me.y)` → `route(...)`. Swap to
  `module.affordances(<obs bundle>, me.id)`. Since the `Affordance` shape
  is a superset of what grounding needs, `route`/`groundNoun` are
  unchanged.
- **Context menu**: `handleTap` builds its take/look/read items from
  `module.affordances(...)` instead of inline/`computeAffordances`.
- **`computeAffordances`** (`language-adapter.js`) becomes a thin
  call-through to `module.affordances`, or is deleted with callers
  repointed — your call; keep `dispatchIntent` if it's still used.

## Tests

- **Menu-parity regression test** (NEW, headless) — BEFORE swapping: for
  a fixed seed + a set of tiles (item tile, prize tile, lore-adjacent
  tile, empty tile), assert `module.affordances(obs, me)` yields the SAME
  take/look/read affordances (verb + target + name + order) that
  `computeAffordances` did. This locks the swap — golem-grid has NO
  existing test of menu contents, so this is the guardrail.
- Existing `language-adapter.test.js` + `packages/language` ground/route
  tests stay green against the new source.
- `entities-not-in-callgraph.test.js` stays green (module.js/reducer.js
  still `entitiesOf`-free).
- The two Playwright smokes (`visual.smoke.mjs`/`two-tab.smoke.mjs`)
  don't touch the menu — no browser needed; but note they're CI/local
  only (not run here).

## Gates

`npm test` all workspaces fail 0; golem-grid tests green (incl. the new
menu-parity + unchanged callgraph ban); `packages/language` green;
`freeze:verify` green (golem-grid frozen fixtures are `reduce`/`validate`/
`serializeState`-keyed — menu construction is client-only, never touches
them, so they're unaffected); golem-grid worldgen/replay goldens
byte-unchanged; `check-bans` clean. `make html` still a single file
(the client swap must not add external refs — verify the build).

## Scope boundaries (PR2)

golem-grid adoption of take/look/read affordances + parser only. NO new
`walk`/`whisper` verbs. NO tutorial-hint/twin-grounding (PR3). NO
`observe()` redesign. NO some-hero change. NO reduce/validate/wire change
(menu/parser are client-only). No frozen-fixture/golden change.
