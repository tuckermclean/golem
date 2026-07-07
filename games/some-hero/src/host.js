/* ── HOST: validate → sequence → commit. Mirrors games/topdown-puzzle/
   src/host.js's createHost almost unchanged (validate → seq-stamp →
   commit) plus the fixed-step clock (design spec's "the C4 tick
   bridge"): `setInterval(() => hostCmd(me, "tick"), TICK_MS)`, driving
   whatever the floor's tick eventually needs (PR2: nothing yet — see
   shared/tick.js) through this SAME hostCmd path — no special-casing, a
   "tick" commit is a normal committed event sitting in the log next to
   every MOVED a player command produced.

   Single-player, no DOM: local render/feed side effects are a future
   composition root's job, reached here only through the `hooks`
   callbacks it supplies — same discipline as topdown-puzzle/golem-grid's
   own host.js.

   PR3 (docs/superpowers/specs/2026-07-07-s2b-pr3-ceremony-machine-
   design.md's "The real novelty: world-swap mid-session") makes `S.world`
   MUTABLE: some-hero's ceremony swaps worlds mid-session (`ow` guild_hall
   ↔ `tomb` floor 1), and @golem-engine/kernel's generic replay() takes
   ONE world for a whole log — reducing post-transition events against
   the STALE zone. The locked fix is some-hero-LOCAL (not a kernel
   change): after every commit whose reduce() call actually changed
   `state.world` (reference inequality — every reducer case that leaves
   `world` untouched returns the SAME object reference, per shared/
   reducer.js's own copy-on-write discipline, so this check is cheap and
   exact, no deep-equal needed), re-derive `S.world` from the pack BEFORE
   the next thing gets committed. `S.pack` is a new required field on the
   `S` container this file's `createHost(S, hooks)` expects (previously
   just `{st, world}`) — the compiled RuntimePack `deriveWorldFromPack`
   needs to resolve `state.world`'s `{zone,floorNum,mapId}` triple into
   the actual World. */
import { reduce as shReduce } from "../shared/reducer.js";
import { validate, deriveWorldFromPack } from "../shared/module.js";

// No legacy fixed-tick constant exists for some-hero (it runs continuous
// pixel physics — legacy/src/core/update.js's per-frame loop, not a
// discrete tick); unlike topdown-puzzle (which reused legacy's own
// MOVE_DURATION), this is an authored placeholder cadence. Real tuning
// is deferred along with the movers themselves (PR3/S2c) — see shared/
// tick.js's header.
export const TICK_MS = 200;

export function createHost(S, hooks) {
  const { onCommit, onDenyLocal, onCmd } = hooks;

  function hostCommit(ev) {
    ev.seq = S.st.seq + 1;
    const prevWorldTier = S.st.world;
    S.st = shReduce(S.st, S.world, ev);
    if (S.st.world !== prevWorldTier) {
      // A world-swap event (ENTERED_TOMB/EXITED_TOMB/RESURRECTED-out-of-
      // the-tomb) just committed — re-derive S.world for whatever gets
      // committed next, world-swap-aware fold (see this file's header).
      S.world = deriveWorldFromPack(S.pack, S.st.world);
    }
    onCommit(ev);
  }

  function hostDeny(reason) {
    onDenyLocal(reason);
  }

  function hostCmd(from, cmd) {
    const r = validate({ state: S.st, world: S.world, from }, cmd);
    if (!Array.isArray(r)) return hostDeny(r.deny);
    // Record the LEGAL command stream in order (moves + the clock's ticks
    // alike, since both flow through here) BEFORE it commits — a denied
    // move produced no events and is a deterministic no-op on replay, so
    // it is skipped, and the recorded command list replays bit-identically
    // by construction (same discipline as topdown-puzzle's host.js).
    if (onCmd) onCmd(cmd);
    for (const ev of r) hostCommit(ev);
  }

  let timer = null;
  /** Start the fixed-step clock driving `hostCmd(me, "tick")` on a
   *  TICK_MS cadence — the host is the only clock; the tick's LOGIC
   *  stays entirely inside shared/tick.js's resolveTick, deterministic
   *  and wall-clock-free. This setInterval is the one legitimate
   *  real-time surface in the whole port. */
  function startClock(me) {
    stopClock();
    timer = setInterval(() => hostCmd(me, "tick"), TICK_MS);
  }
  function stopClock() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  return { hostCommit, hostCmd, startClock, stopClock };
}
