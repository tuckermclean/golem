/* ── GESTURE ENGINE (pure, no DOM) ───────────────────────────────────────
 * Consumes pointer samples {x, y, t, phase:"down"|"move"|"up"} for ONE
 * touch/pointer at a time and emits discrete intents:
 *   {kind:"step", dx, dy}  — one tile-step in a cardinal direction
 *   {kind:"tap",  x,  y}   — a tap (not a swipe/hold) at a point
 *
 * This is the "feel" of golem-grid's mobile input — a swipe + floating
 * hold-stick hybrid (design doc §3) — and it is the primary verifiable
 * unit: zero DOM, zero wall-clock reads (no Date.now/Math.random — both
 * banned repo-wide), every timestamp is a parameter the caller supplies
 * (performance.now()/rAF timestamp in the browser, a plain counter in
 * tests), so the whole thing replays byte-identically under test.
 *
 * How one touch resolves into (swipe | hold-stick | tap):
 *   - A step fires the FIRST time the touch's cumulative displacement
 *     from its start exceeds DEADZONE px while still down — snapped to
 *     whichever axis has the larger absolute delta (dominant cardinal;
 *     diagonals always resolve to one axis — "one key, one meaning").
 *     This single rule *is* the hold-stick's "once past the deadzone,
 *     snap and emit" behavior; if the touch is released again quickly
 *     (before the next REPEAT_MS boundary) it reads, correctly, as one
 *     step per swipe.
 *   - While the touch stays down and past the deadzone, tick(now) fires
 *     one more step every REPEAT_MS, re-reading the CURRENT direction
 *     each time (so the player can curve the walk without lifting).
 *   - SWIPE_MIN/SWIPE_MS are the release-time fallback: some pointer
 *     streams coalesce a fast flick into just a down+up pair with no
 *     intermediate move sample, so the deadzone-crossing rule above
 *     never gets a chance to run mid-gesture. If the touch releases
 *     having never crossed the deadzone, but travelled > SWIPE_MIN
 *     within SWIPE_MS, that release still counts as one step. A touch
 *     that already crossed the deadzone (and so already fired a step)
 *     never double-fires on release — releasing just ends the hold.
 *   - TAP_MAX/TAP_MS gate the "didn't really move" case: release with
 *     small travel within a short time is a tap, not a step.
 *
 * Constants are the tuning surface (per the mobile-ergonomics design
 * doc's orchestrator notes) — seeded from some-hero's floating-stick
 * numbers (games/some-hero/legacy/src/input/stick.js: 96px base radius,
 * 44px knob travel radius, 7px deadzone) where this module's discrete-
 * tile gestures share a concept with that continuous stick.
 */

export const STICK_BASE = 96; // px — floating stick base diameter (some-hero)
export const STICK_RADIUS = 44; // px — knob travel radius (some-hero)
export const DEADZONE = 7; // px — some-hero's stick deadzone; also this
// module's "has the hold-stick engaged" threshold.
export const SWIPE_MIN = 24; // px — minimum travel for a release-time swipe
export const SWIPE_MS = 300; // ms — release-time swipe must complete within this
export const REPEAT_MS = 150; // ms — hold-stick auto-repeat cadence
export const TAP_MAX = 10; // px — max travel to still count as a tap
export const TAP_MS = 250; // ms — max duration to still count as a tap

/** Snap (dx, dy) to the dominant cardinal: [-1|0|1, -1|0|1] with exactly
 * one axis nonzero. Ties (|dx| === |dy|, both nonzero) resolve to the
 * x-axis — an arbitrary but documented, deterministic choice. */
function dominant(dx, dy) {
  if (dx === 0 && dy === 0) return [0, 0];
  return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
}

/** Create a fresh, stateful gesture tracker for one touch/pointer at a
 * time (a new down after an up/tap/step-release starts a new gesture;
 * feeding samples from multiple concurrent pointers into one instance
 * is not supported — callers juggling multiple touches should create
 * one tracker per pointer id). */
export function createGesture() {
  let s = null; // in-flight touch state, or null between gestures

  function down(x, y, t) {
    s = {
      startX: x,
      startY: y,
      startT: t,
      curX: x,
      curY: y,
      pastDeadzone: false,
      lastStepT: t,
    };
    return [];
  }

  function move(x, y, t) {
    if (!s) return [];
    s.curX = x;
    s.curY = y;
    const events = [];
    if (!s.pastDeadzone) {
      const dx = x - s.startX;
      const dy = y - s.startY;
      if (Math.hypot(dx, dy) > DEADZONE) {
        s.pastDeadzone = true;
        const [sx, sy] = dominant(dx, dy);
        events.push({ kind: "step", dx: sx, dy: sy });
        s.lastStepT = t;
      }
    }
    return events;
  }

  function up(x, y, t) {
    if (!s) return [];
    const dx = x - s.startX;
    const dy = y - s.startY;
    const dist = Math.hypot(dx, dy);
    const dt = t - s.startT;
    const events = [];
    if (s.pastDeadzone) {
      // Already engaged (and already emitted at least the initial
      // step, possibly repeats too) — releasing just ends the hold.
    } else if (dist <= TAP_MAX && dt <= TAP_MS) {
      events.push({ kind: "tap", x, y });
    } else if (dist > SWIPE_MIN && dt <= SWIPE_MS) {
      const [sx, sy] = dominant(dx, dy);
      events.push({ kind: "step", dx: sx, dy: sy });
    }
    s = null;
    return events;
  }

  /** Feed one pointer sample; returns the (possibly empty) array of
   * intents it produced. */
  function feed({ x, y, t, phase }) {
    if (phase === "down") return down(x, y, t);
    if (phase === "move") return move(x, y, t);
    if (phase === "up") return up(x, y, t);
    return [];
  }

  /** Drive the hold-stick's auto-repeat. Call this periodically (e.g.
   * from requestAnimationFrame, passing its timestamp) while a pointer
   * may be down. Re-reads the CURRENT direction from the latest known
   * position every time it fires, so the walk can curve. No-ops when
   * no gesture is in flight or the touch hasn't crossed the deadzone. */
  function tick(now) {
    if (!s || !s.pastDeadzone) return [];
    const dx = s.curX - s.startX;
    const dy = s.curY - s.startY;
    if (Math.hypot(dx, dy) <= DEADZONE) return [];
    if (now - s.lastStepT < REPEAT_MS) return [];
    const [sx, sy] = dominant(dx, dy);
    s.lastStepT = now;
    return [{ kind: "step", dx: sx, dy: sy }];
  }

  /** True while a touch is currently down (mid-gesture). Useful for a
   * DOM layer deciding whether to keep its rAF loop alive. */
  function active() {
    return s !== null;
  }

  return { feed, tick, active };
}
