# S3 PR2 — Channel-based tomb floor generator (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 4 **S3**, PR2. Builds on S3 PR1 (`packages/world`
pinned-room contract, merged). Ports `games/some-hero/legacy/src/world/
floorgen.js` (`generateFloor`) onto named channels + `packages/world`.
**Isolated port — NOT wired into `shared/module.js` yet** (that's PR4);
testable standalone. Golden tests are PR3; fuzz/solver PR5.

## Where it lives

`games/some-hero/shared/floorgen.js` (pure ESM, alongside `module.js`/
`reducer.js`/`tick.js`), mirroring golem-grid's `shared/worldgen.js`
placement. Importable by browser + node; no `node:` imports, no
`Math.random`/`Date.now`.

## Named-channel decomposition (locked, from the S3 brief)

Each channel is a `packages/random` `channel(seed, name, ...)` substream,
so a change in one channel's draw count leaves the others byte-identical.
`channel()` returns an rng usable as `packages/world`'s caller-supplied
`() => number` (via the channel's float draw — reuse the same rng-adapter
convention `packages/random` already exposes; if `channel` yields a
stateful rng, pass its float method).

| Channel | Draws (legacy `floorgen.js` sites) |
|---|---|
| `layout` | room count/size/pos (`:33-38`) → `packages/world` `placeRooms`; pinned-room placement (`:41-60`) → `placePinnedRooms`; corridor chain (`:61-66`) → `chainCorridors` (pure). Spawn = first room; exit = farthest untagged room (`:68-72`, via `featureEligibleRooms`). |
| `puzzle` | seal-type selection (`:111`), trap/plate/torch counts+positions (`:117-164`). Warden/final boss stats are **rng-free** (pure fn of floor — `wardenStats`/`mkBoss`, `entities/boss.js`, zero rng). |
| `spawns` | `pickTombKind` per enemy (`:170-178`), gold loot (`:180-183`), cabinet runs (`:188-225`), slimes (`:228-232`). **Per-room draws use a per-room-indexed channel** `channel(seed,"spawns",String(roomIdx))` (golem-grid's `roomfill` precedent) so adding an enemy to one room doesn't reshuffle another's. |
| `decor` | pinned-room props (`:235-254`) — legacy uses **zero rng** here (fixed offsets); `decor` is a reserved/mostly-inert channel wired for forward-compat. State this plainly; don't invent randomness to justify it. |

## LIVE roster only (critical)

The generator must spawn ONLY the current tomb roster — `skeleton`,
`mailbat`, `consultant`, `slime`, `cabinet` (floors 3+). **Never** the
dead gen-1 desert kinds (`scarab`/`jackal`/`spirit`/`mummy`/`pigeon`/
`goose`/`veteran`) — any appearance is a regression (see the project's
scarab rule). If legacy's `pickTombKind` table includes dead kinds, the
port's table drops them.

## Output shape

Return a plain object the PR4 `deriveWorld` path will consume (do NOT
attach kernel entities or full enemy stat objects — just kind + position;
stats come from the content pack's `world.enemyTypes` at derive time):

```
{
  gridW, gridH,
  walls: Set<"x,y">              // or a rows[] grid; match what module.js's deriver wants
  spawn: {x,y},
  stairsAt: {x,y},              // exit (down); upstairsAt if legacy has SU
  rooms, pinnedRooms,           // packages/world Room[]/PinnedRoom[] (tags carried)
  enemies: [{kind, x, y}],      // LIVE kinds only
  pickups: [{kind:"gold"|..., x, y, amount?}],
  puzzle: {type, ...params},    // key/plates/traps/torch/riddle/warden/final — legacy shape
  boss: null | {kind, x, y, stats},  // rng-free stats
}
```

## Boss stats

`wardenStats(f)`/`mkBoss` are pure functions of floor number (zero rng).
Port their stat arithmetic verbatim (cite `entities/boss.js` lines).
`warden` every 4th floor, `final` on `FINAL_FLOOR`, else key/plates/
traps/torch/riddle (`floorgen.js`'s seal-type logic).

## Tests (`games/some-hero/tests/floorgen.test.js`)

- Generates a structurally valid floor for a fixed seed/floor: rooms
  placed & connected (BFS spawn→exit reachable), exit is an untagged
  room, no pinned room contains the stairs.
- Seal type matches the floor rule (warden on 4th, final on FINAL_FLOOR,
  else one of key/plates/traps/torch/riddle).
- All spawned enemy kinds are in the LIVE roster (assert none is a dead
  desert kind — an explicit guard).
- **Channel independence**: changing the `puzzle` draw (e.g. `forceSeal`)
  leaves `layout`'s rooms byte-identical (pin this).
- **Determinism**: same (seed, floor) → deep-equal output twice.

## Gates

`npm test --workspace @golem-engine/some-hero` green (new floorgen
tests); legacy `test:ceremony` 62 / `test:ceremony-kernel` 60 unchanged;
`npm test` all workspaces fail 0; `freeze:verify` green; `content/
pack.json` byte-unchanged; `check-bans` clean; `shared/` imports nothing
from `legacy/`.

## Scope boundaries (PR2)

Pure generator only. **NOT** wired into `module.js`/`deriveWorld` (PR4).
No golden fixtures (PR3). No fuzz/solver (PR5). No interactive puzzle
mechanics (out of S3). No `content/pack.json` change. No dead-roster
kinds. Uses `packages/world` (PR1) + `packages/random`; imports nothing
from `legacy/` (transcribe the logic with `file:line` citations, as S1/
S2 did).
