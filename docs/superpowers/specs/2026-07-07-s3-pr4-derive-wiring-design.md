# S3 PR4 — deriveWorld dispatcher + seed threading (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 4 **S3**, PR4. Wires the PR2 generator into the live
`deriveWorld` path + threads a top-level seed. **This is the S3 PR that
touches previously-shipped S2 code** (`shared/module.js`'s `validate`/
`deriveWorldFromPack`, `src/host.js`) — so **backward-compat is the
hard constraint**: all 184 some-hero + 60 ceremony-kernel + 62 legacy
ceremony tests MUST stay green. PR5 = fuzz + reachability solver.

## Why it's safe (the key finding)

The wired ceremony-kernel tests enter the tomb by supplying the tomb
World OBJECT explicitly (`kernel-helpers.mjs`'s `tombWorld()`, passed to
`commit(state, tomb, cmd)`), NOT by re-deriving it from `state.world.
mapId`. So adding a `tomb:` branch to `deriveWorld` is **additive** — it
only affects the production re-derivation path (`src/host.js`), which the
tests don't exercise for tomb commits. The one derivation the tests DO
assert (`death-respawn`'s "same world" snapshot) derives the **ow**
guild-hall (`map:` prefix, unchanged path).

## The dispatcher (additive)

`deriveWorld(pack, worldState, seed?)` branches on `mapId` prefix:
- **`map:...`** → the existing `pack.maps[mapId]` token-grid path,
  **unchanged**. Covers `map:guild_hall` AND the synthetic fixture
  (`map:tomb_floor_1_synthetic`) — both keep working exactly as today.
- **`tomb:...`** → NEW generator path: parse `tomb:<topSeed>:<runs>:
  <floorNum>` from the mapId, call `generateFloor(topSeed, floorNum)`
  (PR2), and build the same derived-World shape the reducer/tick already
  consume: `walls`(Set), `spawn`, `stairsAt`, `upstairsAt`,
  `gate:null` (tomb floors have no Door Golem), `enemySpawns` (from the
  floor's `enemies:[{kind,x,y}]`), `enemyTypes` (pack-scoped, UNCHANGED —
  `buildEnemyTypes(pack)`), `pickupAt` (from the floor's `pickups`), plus
  the new `puzzle` and `pinnedRooms` fields the generated floor carries.

The generated floor's enemy *kinds* map to `world.enemyTypes[kind]` for
stats (the content pack, from S1/PR4-of-S2c) — so combat/tick consume
generated enemies identically to the synthetic fixture's.

## Seed threading (state.world shape stays LOCKED)

- `state.world` keeps its 3-field shape `{zone, floorNum, mapId}` — do
  NOT reopen the S2b locked five-tier mapping. The generation key lives
  ENTIRELY inside the `mapId` string (`tomb:<topSeed>:<runs>:<floorNum>`).
  Purity holds: `mapId` alone determines the floor; replay stays
  bit-identical.
- Add a **top-level `seed`** to the host container `S` (mirroring
  golem-grid's `S.seed`, chosen once at game start, held beside `S.st`,
  never inside reducer State) and pass it as an optional field on
  `validate`'s ctx (`{state, world, from, seed}`).
- **`ENTERED_TOMB` construction** (in `validate`): if `ctx.seed` is
  present → `mapId = "tomb:" + ctx.seed + ":" + state.knowledge.runs +
  ":" + floorNum`. **If absent (all existing tests) → keep the CURRENT
  mapId behavior byte-for-byte** (the synthetic/default it uses today).
  This backward-compat fallback is what keeps the 60 ceremony-kernel
  tests unchanged.
- `src/host.js` re-derives `S.world = deriveWorld(S.pack, S.st.world,
  S.seed)` after every world-changing event (it already re-derives on
  world change — just thread `S.seed` in).

## Tests

- A NEW production-flow test: construct a host/state with a `seed`, run
  the full gate→proceed→ENTERED_TOMB flow, assert the resulting
  `state.world.mapId` is `tomb:<seed>:<runs>:1` and that
  `deriveWorld(pack, state.world, seed)` yields a GENERATED floor
  (walls/spawn/stairsAt/enemies present, matching `generateFloor(seed,1)`),
  and that the player can move / an enemy exists (the tomb is a live
  generated space).
- A dispatcher unit test: `deriveWorld` with a `map:` mapId → pack path;
  with a `tomb:a:0:1` mapId → generated floor equal to `generateFloor(
  "a",1)`-derived.
- **Regression**: all 184 some-hero + 60 ceremony-kernel + 62 legacy
  ceremony tests stay green (the whole point).

## Gates

`npm test --workspace @golem-engine/some-hero` green; `test:ceremony` 62
/ `test:ceremony-kernel` 60 UNCHANGED; `npm test` all workspaces fail 0;
`freeze:verify` green; `content/pack.json` byte-unchanged; goldens
(PR3) unchanged; `check-bans` clean; `shared/` imports nothing from
`legacy/`.

## Scope boundaries (PR4)

Additive dispatcher + seed threading only. No fuzz/solver (PR5). No new
generator output (uses PR2's). No interactive puzzle mechanics. No
`content/pack.json` change. The synthetic fixture and its `map:` path are
untouched (kept as the tests' tomb source). Do NOT change `state.world`'s
3-field shape or the reducer's five-tier mapping.
