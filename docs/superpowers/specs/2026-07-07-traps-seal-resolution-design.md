# Traps-seal resolution — design

Date: 2026-07-07
Next clean seal increment (after the riddle seal, #65): make **traps-sealed**
tomb floors progressable — step on every trap tile → the incident counter
fills → the stairs open → descend. Same shape/discipline as the riddle
seal. Headless. Scope: TRAPS seal only (key/plates/torch/warden/final
remain a further increment; boss combat is explicitly held).

## Mechanic (legacy `checkTraps`, `legacy/src/systems/puzzles.js:52-63`)

A traps floor's `run.puzzle = { type:"traps", need, done, solved, traps:
[{x,y,hit}] }` (already produced by `floorgen.js`). "The traps ran out of
darts years ago. Nobody told the counter. Step on them." — stepping onto
an un-hit trap tile marks it `hit`, `done++`; when `done >= need`,
`solved = true`. **No damage** (no darts). No client narration needed
(headless).

## Changes (`shared/module.js` + `shared/reducer.js`)

- **Generalize the DESCENDED trigger** (`module.js` ~623-634): change the
  move-onto-stairs descend condition from `sim.run.puzzle.type==="riddle"
  && sim.run.puzzle.solved` to just **`sim.run.puzzle && sim.run.puzzle.
  solved`** — this covers riddle AND traps (both set `solved`), and
  SAFELY excludes warden/final (no `solved` field) and key (`have`, not
  `solved`) so no unimplemented seal accidentally opens. The riddle-ask
  branch (`type==="riddle" && !solved` → `RIDDLE_ASKED`) stays exactly as
  is. Still guarded to `"tomb:"`-prefixed mapIds.
- **Add trap-step resolution** in the `"move"` case: after computing the
  `MOVED` event and sim-folding it, if `sim.run.puzzle?.type==="traps" &&
  !sim.run.puzzle.solved` and there is an un-hit trap at the NEW position
  (`sim.character.pos`), append `{ t:"TRAP_TRIGGERED", puzzle:
  <newPuzzle> }` where `newPuzzle` is a fresh copy of `sim.run.puzzle`
  with that trap's `hit=true`, `done` incremented, and `solved=true` iff
  `done>=need`. Pure (never mutate `state`/`sim` — build a fresh puzzle
  object). So stepping onto a trap tile yields `[MOVED, TRAP_TRIGGERED]`;
  the final trap sets `solved`, and a later move onto the stairs →
  `DESCENDED`.
- **Reducer `TRAP_TRIGGERED`**: `run: { ...state.run, puzzle: { ...ev.
  puzzle } }` — a dumb copy (same as `RIDDLE_ANSWERED`).
- Do NOT change `RIDDLE_ASKED`, `RIDDLE_ANSWERED`, `DESCENDED`'s event
  builder, or the reducer's other cases. No `observe()` change. Optionally
  extend `affordances()` to note the trap counter, but not required.

## Tests (`games/some-hero/tests/traps-seal.test.js`, new)

- Find a seed whose floor-1 puzzle is `type:"traps"` (iterate seeds via
  `generateFloor`). Assert: stepping onto each trap tile → `[MOVED,
  TRAP_TRIGGERED]`, `run.puzzle.done` increments, un-hit traps stay
  un-hit; after the LAST trap, `run.puzzle.solved===true`; then moving
  onto `stairsAt` → `[MOVED, DESCENDED]` (floorNum+1, mapId shift,
  runStats preserved, knowledge unchanged) — reuse the riddle-seal test's
  descend assertions. A partial (not-all-traps) state → move onto stairs
  → NO descend (silent). Stepping on the SAME trap twice → no double
  count (already hit). Determinism: replay the step-all-then-descend log
  twice → identical h32.
- Regression: the riddle seal still works (its descend path now goes
  through the generalized `solved` condition); `seal-stairs` 62/60
  unchanged; a non-traps/non-riddle seal (`key`) still silent no-op.

## Gates

`npm test` all workspaces fail 0; `test:ceremony` 62 / `test:ceremony-
kernel` 60 unchanged; `freeze:verify` green; `content/pack.json` + floor
goldens byte-unchanged; `check-bans` clean; `shared/` imports nothing from
`legacy/`; rng — none needed here (traps are placed by floorgen, resolution
is deterministic stepping); no `Math.random`/`Date.now`/`eval`.

## Scope boundaries

TRAPS seal only. No damage on trap-step (legacy: no darts). Do NOT touch
key/plates/torch resolution or warden/final boss combat (held for
greenlight). No content/golden change. Pure validate/reduce.
