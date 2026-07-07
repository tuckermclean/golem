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
   own host.js. */
import { reduce as shReduce } from "../shared/reducer.js";
import { validate } from "../shared/module.js";

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
    S.st = shReduce(S.st, S.world, ev);
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
