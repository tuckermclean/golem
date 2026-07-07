# Seal/boss action affordances — design

Date: 2026-07-07
An A1-completion follow-up to the seal-resolution arc (#65-#70). The five
puzzle seals + warden boss all shipped as validate/reduce ONLY — none of
their in-range ACTIONS were surfaced in `affordances()`. The hook already
lists per-enemy `attack` and per-option riddle `answer`, so it's currently
INCONSISTENT: it advertises some in-range actions but not the two new ones.
This closes that gap. Pure, additive, read-only — mirrors the existing
per-enemy `attack` loop exactly.

## The gap (precise)

`affordances({state,world})` (shared/module.js ~1023) lists: proceed,
resurrect, one `attack` per adjacent enemy, riddle `answer` options, the
gate. It does NOT list:
1. **The warden strike** — the boss lives in `state.run.boss`, NOT
   `state.run.enemies`, so the per-enemy loop never lists `attack boss`
   even when the player is adjacent to a live Warden. A real
   action-discovery omission.
2. **Brazier lighting** — on an unsolved torch floor, a swing lights an
   adjacent un-lit brazier (validate's #69 torch path), but no affordance
   advertises it.

The other three seals (plates/traps/key) act through plain `move` onto a
tile — `move` is not surfaced as an affordance for ANY tile (there is no
per-tile move affordance anywhere in the hook), so they correctly need no
new entry. Riddle already has its `answer` affordances. So the complete
gap is exactly these two action types.

## Changes — `shared/module.js` `affordances()` only

Add two blocks after the existing per-enemy `attack` loop (~1068),
mirroring its shape and its "only list in-range, enabled-by-construction"
posture:

```js
// "attack boss" — the warden (state.run.boss, NOT run.enemies) within
// melee range (Manhattan <= 1, the SAME check validate()'s attack-boss
// path uses). Listed only when a live boss is adjacent — parallel to the
// per-enemy loop above; target "boss" is the id validate() resolves the
// strike against.
const boss = state.run.boss;
if (boss && !boss.dead) {
  const bd = Math.abs(boss.pos.x - x) + Math.abs(boss.pos.y - y);
  if (bd <= 1) {
    out.push({ verb: "attack", target: "boss", name: boss.name, enabled: true });
  }
}

// "attack brazier" — lighting an adjacent un-lit brazier on an unsolved
// torch floor (validate()'s #69 torch-lighting path: a swing lights any
// un-lit brazier within Manhattan <= 1). One entry when >=1 is in range
// (a single swing lights all adjacent). target "brazier" is a non-enemy/
// non-boss id, so validate() routes it to the torch-light path.
if (world.zone === "tomb" && state.run.puzzle?.type === "torch" && !state.run.puzzle.solved) {
  const litable = state.run.puzzle.torches.some(
    (to) => !to.lit && Math.abs(to.x - x) + Math.abs(to.y - y) <= 1,
  );
  if (litable) {
    out.push({ verb: "attack", target: "brazier", name: "light the brazier", enabled: true });
  }
}
```

`x`/`y` are `state.character.pos`, already destructured above the enemy
loop. No other function changes. No `observe`/`narrativeFacts`/`validate`/
`reduce` change (twin narration of seal PROGRESS via narrativeFacts is a
separate, doctrine-sensitive, consumer-less follow-up — out of scope).

## Tests (`games/some-hero/tests/affordances.test.js`, extend)

Add tests mirroring the existing per-enemy `attack` test:
- A warden floor state with the boss adjacent → affordances includes
  `{verb:"attack", target:"boss", name:<boss.name>, enabled:true}`; boss
  NOT adjacent → absent; boss dead → absent. (Build via the warden-seal
  test's own `run.boss` setup idiom, or a minimal hand-set `run.boss`.)
- A torch floor state with an un-lit brazier adjacent → includes
  `{verb:"attack", target:"brazier", ...}`; none adjacent / solved →
  absent.
- The canonical-shape + purity tests already iterate ALL affordances, so
  they cover the new entries' shape for free (both have non-empty
  verb/target/name — "boss"/"brazier" satisfy `target.length > 0`).
- Round-trip sanity: the `target` each new affordance advertises, fed back
  as `attack <target>`, is accepted by `validate()` (an `attack boss`
  strikes; an `attack brazier` lights) — proves the menu entry actually
  resolves.

## Gates

`npm test` all fail 0; `test:ceremony` 62 / `test:ceremony-kernel` 60
unchanged; `freeze:verify` green; `check-bans` clean; no content/golden
change; `shared/` imports nothing new. The change is purely additive to
`affordances()` output — every existing affordances assertion (which pins
specific entries, not an exhaustive set) still holds.

## Scope boundaries

`affordances()` only. No narrativeFacts/observe change. No new verb (reuses
`attack`). No content change. Warden + torch action entries only (plates/
traps/key act via `move`, which is not an affordance).
