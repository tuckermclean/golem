# Riddle-seal resolution (some-hero tomb progressability) — design

Date: 2026-07-07
A deferred-from-S2c/S3 gameplay completion: make **riddle-sealed** tomb
floors progressable — answer the riddle → the stairs open → descend to
floor+1. Builds on the `run.puzzle`-population fix (#64). Headless.

**Honest scope**: seal type is a uniform 1-in-5 draw per non-warden floor
(`floorgen.js` `SEAL_TYPES`), including floor 1 — so this makes only
**riddle-sealed floors** progressable (~1/5 of seeds); the other seal
types (key/plates/traps/torch/warden/final) remain unresolved (a further
increment). Do NOT overclaim "the tomb is progressable" — say "riddle
floors."

## The answer flow

- **`RIDDLE_ASKED`'s shape is FROZEN** (`seal-stairs.kernel.test.js:167-170`
  `deepStrictEqual` `[{t:"MOVED",...},{t:"RIDDLE_ASKED"}]`) — do NOT add a
  payload. Recompute the question/options on demand instead.
- **New verb `"answer <index>"`** (0-based index into `nextRiddle`'s
  options; NOT free-text). Gate: `world.zone==="tomb" && state.run.puzzle?.
  type==="riddle" && !state.run.puzzle.solved` — **position-independent**
  (matches legacy's decoupled modal; no tile check). Out-of-range index →
  `Denial{deny}`.
- **RNG**: recompute `nextRiddle(gameLike, rng)` where `rng =
  channel(world.mapId, "riddle", String(state.run.puzzle.attempts))` (via
  `@golem-engine/random` — NOT `Math.random`; keyed on `world.mapId` which
  is always present). `gameLike = { puzzle, floorNum: world.floorNum,
  runStats: state.run.runStats }` (whatever `nextRiddle` reads).
- **Resolve**: index into the recomputed `options`; call `rules/riddle.js`'s
  `answerRiddle(clone, options[index], noopFx)` on a **throwaway clone**
  `{ puzzle: { ...state.run.puzzle } }` (answerRiddle MUTATES its arg —
  only ever touch a clone, sim-and-inspect discipline). `noopFx =
  { sfx(){}, toast(){} }` (pure UI hooks, no consumed return).
- **Event**: `{ t: "RIDDLE_ANSWERED", result, puzzle: clone.puzzle }`
  (result `'solved'|'shamed'|'wrong'` carried for narrativeFacts; the whole
  resulting `puzzle` carried wholesale, like `ev.enemies`). **Reducer
  `RIDDLE_ANSWERED`**: `run: { ...state.run, puzzle: { ...ev.puzzle } }` —
  a dumb copy.
- **`affordances()` extension** (NOT `observe()` — its key-set is pinned):
  when `world.zone==="tomb" && state.run.puzzle?.type==="riddle" &&
  !solved`, recompute `nextRiddle` (same channel key) and push one
  `{ verb:"answer", target:String(i), name:option.label, enabled:true }`
  per option (same extensible idiom as the per-enemy `attack` entries).

## Descend on solve — a NEW `DESCENDED` event (NOT reused ENTERED_TOMB)

Reusing `ENTERED_TOMB` would double-accrue `knowledge.runs`/`day`/interest
and wipe `runStats` every floor — a determinism bug. Mirror legacy's
`descend()` (`zones.js:83-93`), which does NONE of that.

- **`parseTombMapId`** (`module.js`): also return the `runsSegment` string
  (currently discarded) so the next mapId keeps the same `runs`.
- **Trigger**: in the `"move"` case, add a branch: `world.zone==="tomb" &&
  atPoint(world.stairsAt, nx, ny) && sim.run.puzzle?.type==="riddle" &&
  sim.run.puzzle.solved` → push `descendedEvent(state, world)` (instead of
  RIDDLE_ASKED). Only for `"tomb:"`-prefixed mapIds (the synthetic fixture
  has no floor 2 — guard).
- **`descendedEvent`**: parse `{topSeed, runsSegment, floorNum}` from
  `world.mapId`; `next = floorNum + 1`; `mapId =
  "tomb:"+topSeed+":"+runsSegment+":"+next`; `floor = generateFloor(topSeed,
  next)`; build `spawn`/`enemies`/`puzzle` exactly like `enteredTombEvent`'s
  seeded branch. Return `{ t:"DESCENDED", zone:"tomb", floorNum:next, mapId,
  spawn, enemies, puzzle }`.
- **Reducer `DESCENDED`**: `world:{zone:"tomb", floorNum:ev.floorNum,
  mapId:ev.mapId}`, `character.pos={...ev.spawn}`, `run:{ ...state.run,
  puzzle:ev.puzzle, enemies:(ev.enemies||[]).map(deepcopy), runStats:{
  ...state.run.runStats, depth: Math.max(state.run.runStats.depth||0,
  ev.floorNum) } }` — **runStats otherwise preserved** (kills/gold carry
  across floors), **knowledge untouched**. `pending` untouched (should be
  null here).
- **Also set floor-1 depth**: `ENTERED_TOMB`'s reducer should set
  `runStats.depth = Math.max(depth, ev.floorNum)` too (it's currently never
  set anywhere — a pre-existing gap; `gradeRun` reads depth). Small, fixes a
  real scoring bug. Verify no test pins `runStats.depth===0`.

## Tests (headless, none of the frozen ones move)

- `answer <correct>` → `RIDDLE_ANSWERED{result:"solved"}`, `run.puzzle.
  solved===true`; `answer <wrong>` → `attempts++`, not solved; bad index →
  Denial. Replay the answer-then-descend sequence twice → identical h32.
- solved + walk onto stairs → `DESCENDED` (not RIDDLE_ASKED), `world.
  floorNum` incremented, new `mapId`, `runStats.kills`/`goldGained`
  PRESERVED across the transition, `knowledge.runs`/`day` UNCHANGED.
- a non-riddle-seal floor: walking onto its sealed stairs still emits no
  descend event (unchanged silent no-op) — proves scope boundary.
- `seal-stairs` (62/60) + `full-route` replay + all workspaces stay green
  (full-route asserts self-relative hash, so populating puzzle/depth is
  safe).

## Scope boundaries

RIDDLE seal only. Non-riddle seals (key/plates/traps/torch/warden/final)
stay sealed (today's silent no-op) — do NOT invent per-type resolution or
a generic denial event (each is a separate larger increment). No
`observe()` change. No `content/pack.json`/golden change. `answer` gating
is position-independent (documented). rng via `packages/random` channels;
no `Math.random`/`Date.now`/`eval`. Pure validate/reduce.
