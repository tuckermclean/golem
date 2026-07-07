/* ── TICK — the fixed-step tick bridge (DELTA S2 PR2, mirroring C4's own
   shared/tick.js precedent — see docs/superpowers/specs/
   2026-07-07-s2b-state-tick-design.md's "The systems (PR2 scope)").

   `resolveTick(state, world, seed)` is a pure helper, same shape as
   topdown-puzzle's own resolveTick: it returns an Event[] (never a
   Denial — a tick is never illegal).

   Unlike topdown-puzzle's PR2 (which had six real levels' baddies/
   moving blocks to drive), the synthetic tomb-floor-1 fixture this PR
   introduces (tests/fixtures/synthetic-floor.mjs) has NO autonomous
   movers — floor generation (S3) and enemies/combat (S2c) are both
   explicitly out of this PR's scope. So resolveTick here is
   deliberately minimal: it still must be "a valid deterministic
   no-op-or-advance event so the bridge is proven" (design spec) — this
   is that proof. Extending it to actually move something is PR3/S2c's
   job, once there is something on a floor to move.

   `seed` is threaded through per the design spec's "movers/enemies act
   on tick, seeded via packages/random named channels — never
   Math.random" — the sanctioned nondeterminism path (`packages/random`'s
   `channel(seed, ...)`) for a FUTURE mover that needs one. Nothing here
   draws from it yet (reserved, not speculative — same posture as
   topdown-puzzle/shared/tick.js's own unused `seed` param). */
export function resolveTick(state, world, seed) {
  void world; // unused for now — no geometry-dependent tick logic yet (no movers to block-check against)
  void seed; // reserved for a future nondeterministic mover — see header.
  return [{ t: "TICK_ADVANCED", tick: state.tick + 1 }];
}
