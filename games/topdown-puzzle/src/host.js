/* ── HOST: validate → sequence → commit. Mirrors games/golem-grid/src/
   host.js's createHost almost unchanged (validate → seq-stamp → commit),
   plus the one thing golem-grid's host doesn't need: a fixed-step clock
   (design doc's "The fixed-step tick bridge") — `setInterval(() =>
   hostCmd(me, "tick"), TICK_MS)`, driving moving blocks/baddies exactly
   the way any player command would, through this SAME hostCmd path (no
   special-casing — a "tick" commit is a normal committed event, sitting
   in the log next to every MOVED/COLLECTED/DESTROYED a player command
   produced). Single-player: no @golem-engine/net transport (topdown-
   puzzle's design doc: "No @golem-engine/net/multiplayer transport is
   needed"). No DOM: local render/feed side effects are the composition
   root's (src/main.js) job, reached here only through the `hooks`
   callbacks it supplies — same discipline as golem-grid's host.js. ──── */
import { reduce as tdpReduce } from "../shared/reducer.js";
import { validate } from "../shared/module.js";

// Legacy's own MOVE_DURATION (KyeScene.js), reused as the canonical tick
// cadence per the design doc — the constant both baddie-timer and
// moving-block-timer already ran at.
export const TICK_MS = 200;

export function createHost(S, hooks) {
  const { onCommit, onDenyLocal } = hooks;

  function hostCommit(ev) {
    ev.seq = S.st.seq + 1;
    S.st = tdpReduce(S.st, S.world, ev);
    onCommit(ev);
  }

  function hostDeny(reason) {
    onDenyLocal(reason);
  }

  function hostCmd(from, cmd) {
    const r = validate({ state: S.st, world: S.world, from }, cmd);
    if (!Array.isArray(r)) return hostDeny(r.deny);
    for (const ev of r) hostCommit(ev);
  }

  let timer = null;
  /** Start the fixed-step clock driving `hostCmd(me, "tick")` on a
   *  TICK_MS cadence — the host is the only clock (design doc); the
   *  tick's LOGIC stays entirely inside shared/tick.js's resolveTick,
   *  deterministic and wall-clock-free. This setInterval is the one
   *  legitimate real-time surface in the whole port. */
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
