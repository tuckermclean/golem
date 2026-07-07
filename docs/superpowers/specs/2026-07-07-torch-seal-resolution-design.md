# Torch-seal resolution — design

Date: 2026-07-07
Fifth and final tomb-seal resolution (after riddle #65, traps #66, key
#67, plates #68): make **torch-sealed** floors progressable — light every
brazier so they all burn *at once* before any burns out → `run.puzzle.
solved` flips true → the stairs open → descend. This is the first seal
with **time pressure**: lit braziers burn down on each `tick`, so the
player must light them all within `time` ticks of the first. Headless.
Scope: TORCH seal only. With this PR **all five seal types
(riddle/traps/key/plates/torch) are progressable** — only warden/final
BOSS COMBAT remains held.

## Mechanic (legacy `updateTorches` + `igniteBraziers`, `legacy/src/systems/puzzles.js:73-112`)

A torch floor's `run.puzzle = { type:"torch", n, time, solved, torches:
[{x,y,lit,tm}] }` (already produced by `floorgen.js`; `n === torches.
length`, floor-1 `time === 13.4`). Two legacy behaviours to port:

1. **Lighting** — legacy lights braziers on the **sword strike**
   (`attack.js:40`: `if (game.zone==='tomb') igniteBraziers(...)` fires on
   EVERY tomb attack, independent of whether an enemy was hit; braziers
   within the strike radius light, `tm` set to `pz.time`, and the seal
   solves if `every(o=>o.lit)`). Canonicalized to the port's grid-cardinal
   `attack` verb: a swing lights any un-lit brazier within Manhattan
   distance ≤ 1 of the player (same "on/adjacent-to" range the port's
   attack/contact rules already use).
2. **Burn-down** — legacy `updateTorches` decrements each lit brazier's
   `tm` by `dt`; when `tm <= 0` it goes dark (`lit=false`). Canonicalized
   to one `tm -= 1` per `tick` in `resolveTick`.

**This does NOT touch the golem control-token schema** (that doctrine
governs the ▶GOLEM-PLUG◀ seam / SPEC.md §5 prose tokens, not some-hero's
own internal verbs). Reusing `attack` — rather than a new `light` verb —
is both faithful (legacy lights via the strike) and keeps "one key, one
meaning": `attack` is always "swing the sword," which damages enemies in
range AND lights braziers in range, exactly as legacy's single swing does.

## Changes

### `shared/module.js` — `"attack"` case (~764-791)

Add torch-lighting **additively**, so enemy combat stays byte-identical
whenever no unsolved torch seal is adjacent:

```js
case "attack": {
  const id = rest[0];
  const enemy = state.run.enemies.find((e) => e.id === id);
  const { x, y } = state.character.pos;

  // Torch-seal lighting (docs/superpowers/specs/2026-07-07-torch-seal-
  // resolution-design.md): a swing lights any un-lit brazier within
  // Manhattan <= 1, faithful to legacy attack.js's igniteBraziers, which
  // fires on every tomb attack regardless of the enemy hit. Pure — a
  // fresh torches array / puzzle, never mutates state. Only engages on an
  // unsolved torch floor, so every non-torch attack is byte-unchanged.
  const pz = state.run.puzzle;
  let torchLit = null;
  if (pz && pz.type === "torch" && !pz.solved) {
    const hit = [];
    pz.torches.forEach((to, i) => {
      if (!to.lit && Math.abs(to.x - x) + Math.abs(to.y - y) <= 1) hit.push(i);
    });
    if (hit.length) {
      const torches = pz.torches.map((to, i) =>
        hit.includes(i) ? { ...to, lit: true, tm: pz.time } : to);
      torchLit = { ...pz, torches, solved: torches.every((to) => to.lit) };
    }
  }

  if (!enemy) {
    // A swing that only lights braziers is still a legal swing; otherwise
    // there is genuinely nothing to strike (unchanged deny).
    if (torchLit) return [{ t: "TORCH_LIT", puzzle: torchLit }];
    return { deny: "There is nothing here by that name to strike." };
  }
  const dist = Math.abs(enemy.pos.x - x) + Math.abs(enemy.pos.y - y);
  if (dist > 1) {
    return { deny: "Too far to strike." };
  }
  const amount = attackDamage(state.character.swordLv);
  const events = [{ t: "ENEMY_HURT", id, amount }];
  const sim = foldThrough(state, world, events);
  const survivor = sim.run.enemies.find((e) => e.id === id);
  if (!survivor || survivor.hp <= 0) {
    events.push({ t: "ENEMY_KILLED", id, kind: enemy.kind });
  }
  if (torchLit) events.push({ t: "TORCH_LIT", puzzle: torchLit });
  return events;
}
```

Note: `attack` with no arg (`rest[0]` undefined) already falls through to
`enemy === undefined`; on a torch floor adjacent to an un-lit brazier it
now lights it instead of denying — the faithful "swing at the air near a
brazier." No descend-chain change (torch solves via `stairsOpen`'s default
`!!pz.solved`, already generalized; torch is neither warden nor final).

### `shared/tick.js` — `resolveTick` burn-down

After the enemy-stepping / contact-damage block (i.e. near the end, before
`return events`), append brazier burn-down against the post-movement
`sim.run.puzzle`:

```js
// Torch-seal burn-down (docs/superpowers/specs/2026-07-07-torch-seal-
// resolution-design.md): each tick, every lit brazier loses one tick of
// fuel; an expired one (tm <= 0) goes dark. The seal's time-pressure is
// exactly this — it only holds if all braziers are lit within `time`
// ticks of the first. Once solved, braziers stop burning (guarded). Pure:
// a fresh torches array; emitted as TORCHES_BURNED only when something
// actually changed (i.e. at least one brazier is lit).
const tpz = sim.run.puzzle;
if (tpz && tpz.type === "torch" && !tpz.solved && tpz.torches.some((to) => to.lit)) {
  const torches = tpz.torches.map((to) => {
    if (!to.lit) return to;
    const tm = to.tm - 1;
    return tm <= 0 ? { ...to, lit: false, tm: 0 } : { ...to, tm };
  });
  commit({ t: "TORCHES_BURNED", puzzle: { ...tpz, torches } });
}
```

Placed AFTER the existing contact-damage block so a DIED this tick is
unaffected. `commit` is the file's existing helper (pushes + folds through
`reduce`). Guard `tpz.torches.some(lit)` ensures no event is emitted on a
torch floor with nothing burning (an all-dark floor ticks cleanly).

### `shared/reducer.js` — two dumb-copy cases

Add next to `BLOCK_PUSHED` / `TRAP_TRIGGERED`, identical body:

```js
case "TORCH_LIT":
case "TORCHES_BURNED":
  return { ...state, run: { ...state.run, puzzle: { ...ev.puzzle } }, seq: ev.seq };
```

Do NOT change `MOVED`, `COLLECTED`, `ENEMY_HURT`, `ENEMY_KILLED`,
`TICK_ADVANCED`, `DESCENDED`, or `observe()`.

## Tests (`games/some-hero/tests/torch-seal.test.js`, new)

Use **seed "13"** floor 1 (found via an offline scan over `generateFloor`
filtered to a `torch` seal whose three braziers are each walkable-adjacent,
mutually non-adjacent — so one swing lights exactly one — with approach
tiles and the stairs-approach clear of pickups). Geometry: `n` 3, `time`
13.4, torches `(29,14)`/`(14,21)`/`(21,24)`, approaches `(30,14)`/`(15,21)`/
`(22,24)`, stairsAt `(12,28)`, stairs-approach `(13,28)`.

Mirror the traps/plates helpers → `torchFloorState(world, pos)` that folds
`FLOOR_ENTERED`, sets `run.puzzle` from `world.puzzle` **deep-copying the
`torches` array** (fresh objects), sets `character.pos`, and **sets
`run.enemies: []`** — the seal mechanic is deliberately isolated from
combat (which has its own tests) so `tick` yields only `TICK_ADVANCED`
(+ `TORCHES_BURNED`), never enemy moves/contact. Reuse the `commit()`
idiom. Tests:

1. **Lighting each brazier**: stand at each approach, `attack` (bare, no
   enemy) → `["TORCH_LIT"]`; the struck brazier's `lit===true` and `tm
   ===13.4`, others unchanged; `solved` false until the third, then true.
   Reposition `character.pos` between swings.
2. **Solve + descend**: after all three lit (`solved`), set interesting
   `runStats`, snapshot `knowledge`, move from stairs-approach onto the
   stairs → `["MOVED","DESCENDED"]`, `floorNum→2`, `mapId "tomb:13:0:2"`,
   runStats preserved, depth→2, knowledge unchanged (mirror the traps
   descend test).
3. **Burn-down**: light brazier 0, then issue `tick` commands. Assert the
   first tick → `["TICK_ADVANCED","TORCHES_BURNED"]` with `torches[0].tm
   ===12.4` still lit; after 13 ticks total the brazier is still lit
   (`tm` ≈ 0.4 > 0); the 14th tick → `torches[0].lit===false`, `tm===0`,
   `solved` false. (A bare torch floor with nothing lit: `tick` →
   `["TICK_ADVANCED"]` only, no `TORCHES_BURNED`.)
4. **Time-pressure failure**: light braziers 0 and 1, `tick` 14× (both burn
   out), then light brazier 2 → `solved` stays false (they were never all
   lit at once); assert `torches[0].lit===false && torches[2].lit===true`.
5. **Re-light**: after a brazier burns out, swinging adjacent again re-lights
   it (`tm` back to 13.4, `lit===true`).
6. **No-enemy / scope**: bare `attack` with NO adjacent brazier and no enemy
   → Denial `"There is nothing here by that name to strike."` (unchanged);
   and on a non-torch seal (key seed "1"), a bad `attack <id>` still Denies
   exactly as before (the torch path never engages).
7. **Determinism**: replay light-all-three-then-descend twice → identical
   `h32(serializeState(...))` and `deepEqual` state.

Sanity-assert `world.puzzle.type === "torch"` / `n === 3` / `time === 13.4`
at the top.

## Gates

`npm test` all workspaces fail 0; `test:ceremony` 62 / `test:ceremony-
kernel` 60 unchanged; `freeze:verify` green; `content/pack.json` + floor
goldens byte-unchanged; `check-bans` clean; `shared/` imports nothing new
from `legacy/`; no `Math.random`/`Date.now`/`eval`. Existing seal tests
(plates 6 / traps 6 / riddle 7 / key) AND the combat/tick tests
(`determinism.test.js`, any ceremony-kernel combat suite) still pass
unchanged — the attack change is additive (torch path guarded to
`type==="torch"`), and the resolveTick change is guarded to a lit torch
floor, so every non-torch tick/attack is byte-identical.

## Scope boundaries

TORCH seal only. No client/render change. Do NOT touch warden/final boss
combat (held). No content/golden change. Pure validate/reduce/tick. The
two new mechanics (attack-lights-brazier, tick-burns-brazier) stay confined
exactly to the `"attack"` case and `resolveTick`'s tail as specified.
