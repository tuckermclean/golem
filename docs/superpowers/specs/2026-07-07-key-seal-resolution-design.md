# Key-seal resolution — design

Date: 2026-07-07
Third tomb-seal resolution (after riddle #65, traps #66): make **key-sealed**
floors progressable — pick up the floor's bronze key → `have=true` → the
stairs open → descend. Headless. Scope: KEY seal only.

## Mechanic

A key floor's `run.puzzle = {type:"key", have:false}` (floorgen), and
floorgen already places a `{kind:"key", x, y, amount:1}` pickup on that
floor. Legacy (`pickups.js:39-42`): collecting the key sets
`game.puzzle.have = true` ("The bronze key! The stairs will yield.").
`stairsOpen`: `type==="key" → pz.have`.

The kernel already fires `COLLECTED{kind:"key"}` when the player moves
onto the key pickup tile (the seeded floor's pickups go into
`world.pickupAt`; the `"move"` case's pickup check emits COLLECTED) — but
the reducer's COLLECTED case currently routes any non-gold/non-potion kind
to the generic `inv` count, never touching `run.puzzle`. So the wiring is:
make COLLECTED-of-a-key flip the seal.

## Changes

- **Generalize the DESCENDED trigger to the ported `stairsOpen`**
  (`module.js` move-case): replace the current `sim.run.puzzle &&
  sim.run.puzzle.solved` descend condition with
  `sim.run.puzzle && sim.run.puzzle.type !== "warden" &&
   sim.run.puzzle.type !== "final" && stairsOpen({ puzzle: sim.run.puzzle,
   boss: null })`
  (import `stairsOpen` from `rules/puzzles.js`). This is the single-
  source-of-truth gate: `key→have`, `riddle/traps/plates/torch→solved`.
  **Exclude `warden`/`final`** — `stairsOpen`'s warden branch returns
  `true` when no boss is modeled (and none is — boss combat is held), and
  final has no down-stairs; excluding them keeps those floors sealed. Once
  plates/torch resolution lands (setting `solved`), they descend for free
  through `stairsOpen`. Riddle + traps keep working (both set `solved`).
- **Key resolution** in the reducer's `COLLECTED` case: when
  `ev.kind === "key"` and `state.run.puzzle?.type === "key"`, set
  `run.puzzle = { ...state.run.puzzle, have: true }` (a fresh copy). Do
  NOT route the key onto `inv` (it's a seal-opener, not inventory —
  legacy doesn't add it to inventory either). For any non-key COLLECTED,
  behavior is byte-unchanged. (Confirm: the `"move"` case already emits
  `COLLECTED{kind:"key"}` for the key pickup tile — if not, wire it, but
  it should via the existing `pickupAt` check.)
- No `RIDDLE_ASKED`/`RIDDLE_ANSWERED`/`TRAP_TRIGGERED`/`DESCENDED`-builder
  change. No `observe()` change.

## Tests (`games/some-hero/tests/key-seal.test.js`, new)

- Find a seed whose floor-1 puzzle is `type:"key"` (iterate `generateFloor`;
  pick one whose key-pickup tile doesn't coincide with a gold/potion tile,
  like the traps-seal test did, for clean event lists). Assert: before
  collecting the key, `run.puzzle.have===false` and moving onto `stairsAt`
  → silent `[MOVED]` (no descend); moving onto the key pickup tile →
  `COLLECTED{kind:"key"}` and `run.puzzle.have===true`; THEN moving onto
  `stairsAt` → `[MOVED, DESCENDED]` (floorNum+1, mapId shift, runStats
  preserved, knowledge unchanged — mirror traps/riddle-seal tests). The
  key does NOT increment `character.inv`. Determinism: replay the collect-
  then-descend log twice → identical h32.
- Regression: riddle-seal (7) + traps-seal (6) tests still pass (their
  descend now flows through `stairsOpen`); a `plates`/`torch` floor stays
  silently sealed (solved never set); `seal-stairs` 62/60 unchanged.

## Gates

`npm test` all workspaces fail 0; `test:ceremony` 62 / `test:ceremony-
kernel` 60 unchanged; `freeze:verify` green; `content/pack.json` + floor
goldens byte-unchanged; `check-bans` clean; `shared/` imports nothing from
`legacy/` (importing `stairsOpen` from `rules/` is fine — rules/ is the
pure helper layer, not legacy/); no `Math.random`/`Date.now`/`eval`.

## Scope boundaries

KEY seal only. Do NOT implement plates/torch resolution or warden/final
boss combat (held for greenlight — the descend generalization already
leaves them correctly sealed). No content/golden change. Pure validate/
reduce.
