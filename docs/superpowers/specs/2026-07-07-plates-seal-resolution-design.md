# Plates-seal resolution — design

Date: 2026-07-07
Fourth tomb-seal resolution (after riddle #65, traps #66, key #67): make
**plates-sealed** tomb floors progressable — push every stone block onto
its glowing pressure plate → `run.puzzle.solved` flips true → the stairs
open → descend. Headless. Scope: PLATES seal only. This is the first seal
that introduces a genuinely new **movement** mechanic (block-push), so it
is the meatiest of the resolution set — but it is still a resolution
(sets `solved`, descends for free through the already-generalized
`stairsOpen` gate), NOT boss combat (warden/final remain held).

## Mechanic (legacy `checkPlates`, `legacy/src/systems/puzzles.js:30-45`)

A plates floor's `run.puzzle = { type:"plates", need, done, solved,
plates:[{x,y,on}], blocks:[{x,y}] }` (already produced by `floorgen.js`;
`need === plates.length`). Walking into a block pushes it one tile in the
travel direction **iff** the tile beyond the block is walkable and unoccupied
by another block; the player then advances onto the block's old tile.
Otherwise the block is solid and the move is **denied**. After any push,
recompute every plate's `on` (a plate is `on` iff some block sits on it),
set `done = count(on)`, and `solved = done >= need`. Blocks can be pushed
back OFF a plate (recompute handles it — a plate flips `on→off`). No
damage, no client narration needed (headless).

## Changes (`shared/module.js` "move" case + `shared/reducer.js`)

Insert the block-push logic in the `"move"` case **immediately after** the
existing wall/bounds check (`if (!inBounds || isWall) return {deny}`) and
**before** `const events = [{ t: "MOVED", ... }]`, because a failed push
must DENY the whole move (the player does not step forward):

```js
// Plates block-push (docs/superpowers/specs/2026-07-07-plates-seal-
// resolution-design.md): a block on the target tile is pushed one tile
// in the travel direction if the tile beyond it is clear; otherwise the
// block is solid and the move is denied. run.puzzle is state (mutable
// seal progress), never world — read state.run.puzzle, build a fresh
// puzzle (never mutate state/sim). The player still advances onto the
// block's OLD tile (the normal MOVED below), so this only adds a derived
// BLOCK_PUSHED (like TRAP_TRIGGERED) — it does not replace MOVED.
let blockPush = null;
const pz = state.run.puzzle;
if (pz && pz.type === "plates" && !pz.solved) {
  const bi = pz.blocks.findIndex((b) => b.x === nx && b.y === ny);
  if (bi >= 0) {
    const bx = nx + dx, by = ny + dy;
    const blocked =
      !inBounds(world, bx, by) ||
      isWall(world, bx, by) ||
      pz.blocks.some((b, i) => i !== bi && b.x === bx && b.y === by);
    if (blocked) return { deny: "The block won't budge." };
    const blocks = pz.blocks.map((b, i) => (i === bi ? { x: bx, y: by } : b));
    const plates = pz.plates.map((p) => ({ ...p, on: blocks.some((b) => b.x === p.x && b.y === p.y) }));
    const done = plates.filter((p) => p.on).length;
    blockPush = { ...pz, blocks, plates, done, solved: done >= pz.need };
  }
}

const events = [{ t: "MOVED", x: nx, y: ny }];
if (blockPush) events.push({ t: "BLOCK_PUSHED", puzzle: blockPush });
const sim = foldThrough(state, world, events);
```

`BLOCK_PUSHED` is appended before `foldThrough` so `sim.run.puzzle`
reflects the pushed state — but note solving a plate and landing on the
stairs are always DIFFERENT moves (pushing a block lands the player on the
block's old tile, never the stairs), so the descend branch below never
fires on the same move as the final push. The existing descend branch
(`sim.run.puzzle.type !== "warden" && !== "final" && stairsOpen(...)`)
already covers plates: `stairsOpen`'s `else` branch returns `!!pz.solved`,
and plates is neither warden nor final — **so NO change to the descend
if-chain is needed.** The pickup and traps checks stay exactly as they are
(plates never matches `type === "traps"`; a block's old tile is not a
pickup tile on the chosen test seed).

- **Reducer `BLOCK_PUSHED`**: `run: { ...state.run, puzzle: { ...ev.puzzle } }`
  — a dumb copy, identical shape to the `TRAP_TRIGGERED` / `RIDDLE_ANSWERED`
  cases. Do NOT deep-freeze or re-derive; the validate side already built
  the fresh puzzle.
- Do NOT change `MOVED`, `COLLECTED`, `TRAP_TRIGGERED`, `RIDDLE_ASKED`,
  `RIDDLE_ANSWERED`, `DESCENDED`, or `observe()`. No `affordances()` change
  required (legacy shows a status line; headless doesn't need it).

## Tests (`games/some-hero/tests/plates-seal.test.js`, new)

Use **seed "57"** floor 1 (found via an offline scan over
`generateFloor("<seed>",1)` filtered to a `plates` seal whose two blocks
are each axis-aligned, distance-2 from their plate with a fully-walkable
push lane, and whose lanes / landing tiles / stairs-approach are clear of
`floor.pickups` — so every push yields a clean `[MOVED, BLOCK_PUSHED]`
event list, exactly the discipline `tests/traps-seal.test.js` used for
seed "15"). Mirror `trapsFloorState` → a `platesFloorState(world, pos)`
that folds `FLOOR_ENTERED` then sets `run.puzzle` from `world.puzzle`
**deep-copying `plates` and `blocks`** (fresh arrays of fresh objects, so
tests never share references) and sets `character.pos`. Reuse the same
`commit()` idiom (validate → assert legal → fold each event through
reduce). Concrete geometry for seed "57":

- Pair A: block `(24,7)` → plate `(26,7)`, dir `+1 0`. Push from `(23,7)`:
  push1 player`(23,7)`→`(24,7)` block→`(25,7)`; push2 player`(24,7)`→
  `(25,7)` block→`(26,7)` (plate covered).
- Pair B: block `(26,4)` → plate `(24,4)`, dir `-1 0`. Push from `(27,4)`:
  push1 player`(27,4)`→`(26,4)` block→`(25,4)`; push2 player`(26,4)`→
  `(25,4)` block→`(24,4)` (plate covered — `solved` now true).
- stairsAt `(29,18)`, approach `(30,18)` → `move -1 0` lands on stairs.

Assertions:
1. **Each push** → `result.map(e=>e.t)` deepEquals `["MOVED","BLOCK_PUSHED"]`;
   `state.run.puzzle.blocks` shows the pushed block's new position and the
   other block unmoved; `done` reflects covered plates (0 after pair-A
   push1, 1 after pair-A push2, 1 after pair-B push1, 2 after pair-B push2);
   `solved` false until the very last push, then true. Reposition
   `character.pos` between pushes exactly as `trapsFloorState`-based tests
   do (position-independent mechanic).
2. **Solve + descend**: after both plates covered (`solved===true`), set an
   interesting `runStats` (kills/goldGained), snapshot `knowledge`, move
   from approach `(30,18)` onto stairs → `["MOVED","DESCENDED"]`,
   `floorNum→2`, `mapId "tomb:57:0:2"`, `runStats` preserved, `depth→2`,
   `knowledge` deep-equal unchanged (mirror the traps-seal descend test).
3. **Deny — the block won't budge** (real geometry): fresh state; push
   block `(26,4)` LEFT three times — push1→`(25,4)`, push2→`(24,4)` (plate,
   `done` transiently 1), push3→`(23,4)` (`done` back to 0, plate uncovered)
   — then a 4th `move -1 0` from `(24,4)` targets the block at `(23,4)`
   whose beyond `(22,4)` is a wall: assert the result is a **Denial**
   (`Array.isArray` false, `.deny === "The block won't budge."`), the block
   stayed at `(23,4)`, and the player did not move. (This also proves a
   plate flips `on→off` when its block is pushed away.)
4. **Partial + stairs silent**: cover only one plate, move onto the stairs
   → `["MOVED"]` only, `floorNum` still 1 (an unsolved plates seal stays
   silently closed).
5. **Scope regression**: a `key` seal (seed "1") onto its stairs is still a
   silent `["MOVED"]` no-op after the plates change (blocks logic never
   engages for a non-plates puzzle).
6. **Determinism**: replay the full solve-both-plates-then-descend command
   log twice → identical `h32(serializeState(...))` and structurally
   `deepEqual` state.

Also assert `world.puzzle.type === "plates"` / `need === 2` as sanity at
the top, exactly like the traps test.

## Gates

`npm test` all workspaces fail 0; `test:ceremony` 62 / `test:ceremony-
kernel` 60 unchanged; `freeze:verify` green; `content/pack.json` + floor
goldens byte-unchanged; `check-bans` clean; `shared/` imports nothing new
from `legacy/` (the block-push logic is self-contained; `stairsOpen` is
already imported from `rules/puzzles.js`); no `Math.random`/`Date.now`/
`eval`. Existing riddle-seal (7) / traps-seal (6) / key-seal tests still
pass unchanged (their descend still flows through the same `stairsOpen`
gate; none touches `type:"plates"`).

## Scope boundaries

PLATES seal only. No damage. No client/render change. Do NOT touch torch
resolution or warden/final boss combat (held for greenlight — the descend
gate already leaves them correctly sealed). No content/golden change. Pure
validate/reduce. The block-push is the ONE new mechanic; keep it confined
to the `"move"` case exactly as specified (a failed push denies before
MOVED; a successful push appends BLOCK_PUSHED after MOVED).
