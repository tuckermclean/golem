# S4 PR1 — observe() + legacy view-model adapter (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 4 **S4** (Legacy renderer adapter). **PR1 = the
pure, locally-verifiable core** (~90% of S4's value): the kernel
`observe()` hook + the observation→legacy-view-model adapter + a headless
renderer-compatibility test. **PR2 (separate, flagged CI-ONLY) = the
"visual smoke E2E on both skins"** — Playwright/Chromium, cannot run in
this sandbox (no browser); written + reviewed here, but its passing is
demonstrated only in CI. Do NOT claim S4's visual DoD is met locally.

## observe() — the first real GameModule.observe in the monorepo

No game implements the kernel `observe(state, world, viewer): Obs` hook
yet (golem-grid's `perceive.js` is client-side, not the hook). some-hero
has **no fog of war / no per-viewer visibility** in the port, so S4's
`observe` is an honest **full-visibility projection** — NOT a fog
computation:

```
observe(state, world, viewer) → {
  zone: state.world.zone, floorNum: state.world.floorNum,
  character: state.character, run: state.run, knowledge: state.knowledge,
  world,   // the derived World (walls/stairsAt/enemyTypes/...)
}
```

The `viewer` param exists structurally (future stealth/multiplayer) but
is **unused** — document this explicitly so a reviewer doesn't think fog
was forgotten. Pure, no I/O. Add it to `shared/module.js`'s exported
`module` object beside `deriveWorld`/`validate`/`reduce`/`narrativeFacts`.
Unit-testable: feed a State/World fixture, assert the Obs shape.

## The adapter: observation → legacy `game`-shaped view-model

Legacy `render(ctx, game, screen)` (`legacy/src/render/index.js`) reads a
big mutable `game` aggregate. The adapter (`games/some-hero/src/
render-adapter.js`, a new module) produces a `game`-shaped object from an
`observation`. Pure data/arithmetic — no Canvas API, no `Math.random`.

Field mappings (all pure; cite legacy `file:line` in comments):
- `world.walls`(Set) + `world.rows/cols` → `game.world = {map:Uint8Array,
  w, h, h2}` where map cells use the legacy **TL enum** (`legacy/src/
  constants.js:10-17`: `TF:10` floor, `TW:11` wall, `SD:12` stairs-down at
  `world.stairsAt`, `SU:13` at `world.upstairsAt`, `PLATE:14`). Define
  these TL constants **inline** in the adapter (cite legacy) — do NOT
  import from `legacy/` (keep the shipped adapter legacy-free; the TEST
  may import legacy).
- `state.character.pos`(grid) → `game.player.{x,y}` in **world pixels**
  (`pos.x*T + T/2`), inverting the movement canonicalization (kernel is
  grid-cardinal, legacy renderer is pixel-space — the adapter's core job,
  pure arithmetic; `T` from legacy constants, defined inline).
- `state.character.{hp,maxhp,potions,gold,swordLv}` → `game.player.*`
  (near-identical names).
- `state.run.enemies`(`[{id,kind,pos,hp}]`) → `game.enemies`
  (`[{x,y(pixel),hp,col,r,...}]`, per-kind visuals looked up from a small
  inline table matching `enemy.js`'s `ENEMY_TYPES` — LIVE roster only, no
  scarab/dead kinds).
- **Unported fields emit stable empties**: `game.npcs=[]`, `game.boss=
  null`, `game.parts=[]`, plus `game.cam`/`game.skin`/`game.zone`/
  `game.puzzle`/`game.plates` from what the observation carries or sane
  defaults. Document each "empty for now" field so the CI visual smoke
  (PR2) reviewer knows what's intentionally blank vs threaded.

## Tests (locally verifiable — no browser)

- `observe.test.js` — `observe` returns the projection shape; is pure;
  `viewer` is unused (same result for any viewer).
- `render-adapter.test.js` — assert the adapter's field mappings
  **directly** against a State/World fixture: grid→pixel player pos,
  walls→`Uint8Array` TL ids (spot-check a wall cell = `TW`, floor = `TF`,
  stairs = `SD`), enemies→pixel objects with correct `col`, empties for
  npcs/boss/parts. This pins the grid→pixel mapping (the S2-flagged
  canonicalization inversion) with its own assertions.
- `render-adapter-drawable.test.js` — the **headless renderer-
  compatibility gate**: import the legacy draw fns (`drawTiles`/
  `drawBlocks`/… from `legacy/src/render/`) + the `recordingCtx` op-log
  SHA technique from `legacy/tests/skin-snapshot.test.js`, feed the
  ADAPTER's output through them, and assert it produces a **committed
  golden hash** (a NEW golden for adapter output — proves the adapter
  emits a drawable, renderer-faithful `game`). This is the headless,
  in-sandbox proof that the adapter drives the real desert renderer. (A
  test importing legacy is fine — characterization tests already do.)
- **The existing `legacy/tests/skin-snapshot.test.js` (blankGame-based,
  desert hashes) stays UNTOUCHED and still passes** — S4 does not modify
  any `legacy/` render/skin code (the DoD's "skin snapshot hash test
  still passes for the pinned desert renderer" clause = don't break it).

## Gates

`npm test --workspace @golem-engine/some-hero` green (+ new observe/
adapter tests); `npm test --prefix games/some-hero/legacy` (the desert
skin-snapshot hash) still passes unchanged; `test:ceremony` 62 /
`test:ceremony-kernel` 60 unchanged; `npm test` all workspaces fail 0;
`freeze:verify` green; `content/pack.json` + floor goldens byte-unchanged;
`check-bans` clean; the shipped adapter imports nothing from `legacy/`.

## Scope boundaries (PR1)

Pure `observe` + adapter + headless drawable-hash test only. **NO browser
visual smoke E2E** (PR2, CI-only). No some-hero `<canvas>`/DOM client
(optional PR4). No `legacy/` edits. No `content/pack.json`/golden change.
`viewer`/fog unused (documented). Adapter emits documented empties for
unported fields (npcs/boss/particles). LIVE roster only.

## PR2 (separate, CI-only — flag honestly)

`games/some-hero/tests/e2e/visual.smoke.mjs` (Playwright, mirroring
golem-grid's), added to the `smoke-e2e` Make target family, **documented
as requiring real Chromium — NOT runnable in this sandbox, NOT in npm
test**. Its diff is authored/reviewed here; its green is a CI artifact.
Needs a minimal some-hero client (`src/main.js` + `<canvas>`) to be
meaningfully executable — that client wiring is PR2's or a PR3's concern.
S4 is not "done" until PR2's visual smoke actually runs green in a real
browser (CI) — do not tag S4/S5 complete on PR1 alone.
