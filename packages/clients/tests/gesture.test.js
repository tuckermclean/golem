import test from "node:test";
import assert from "node:assert/strict";
import {
  createGesture,
  DEADZONE,
  SWIPE_MIN,
  SWIPE_MS,
  REPEAT_MS,
  TAP_MAX,
  TAP_MS,
} from "../src/gesture.js";

// No Date.now/performance.now anywhere below — every timestamp is a plain
// counter the test supplies, so this suite is fully deterministic.

test("swipe: a quick down->up flick with no intermediate move sample emits one step, all 4 cardinals", () => {
  const cases = [
    { dx: SWIPE_MIN + 10, dy: 0, want: { dx: 1, dy: 0 } }, // right
    { dx: -(SWIPE_MIN + 10), dy: 0, want: { dx: -1, dy: 0 } }, // left
    { dx: 0, dy: SWIPE_MIN + 10, want: { dx: 0, dy: 1 } }, // down
    { dx: 0, dy: -(SWIPE_MIN + 10), want: { dx: 0, dy: -1 } }, // up
  ];
  for (const c of cases) {
    const g = createGesture();
    let events = g.feed({ x: 100, y: 100, t: 0, phase: "down" });
    assert.deepEqual(events, []);
    events = g.feed({
      x: 100 + c.dx,
      y: 100 + c.dy,
      t: SWIPE_MS - 10,
      phase: "up",
    });
    assert.deepEqual(events, [{ kind: "step", dx: c.want.dx, dy: c.want.dy }]);
  }
});

test("swipe: travel must exceed SWIPE_MIN — exactly at the threshold does not swipe", () => {
  const g = createGesture();
  g.feed({ x: 0, y: 0, t: 0, phase: "down" });
  const events = g.feed({ x: SWIPE_MIN, y: 0, t: 50, phase: "up" });
  assert.deepEqual(events, []);
});

test("swipe: released too slowly (beyond SWIPE_MS) does not swipe even with enough travel", () => {
  const g = createGesture();
  g.feed({ x: 0, y: 0, t: 0, phase: "down" });
  const events = g.feed({ x: SWIPE_MIN + 20, y: 0, t: SWIPE_MS + 50, phase: "up" });
  assert.deepEqual(events, []);
});

test("hold-stick: crossing the deadzone mid-hold snaps to the dominant cardinal and emits one step immediately", () => {
  const g = createGesture();
  g.feed({ x: 100, y: 100, t: 0, phase: "down" });
  const events = g.feed({ x: 100 + DEADZONE + 3, y: 100, t: 20, phase: "move" });
  assert.deepEqual(events, [{ kind: "step", dx: 1, dy: 0 }]);
});

test("hold-stick: staying within the deadzone emits nothing", () => {
  const g = createGesture();
  g.feed({ x: 100, y: 100, t: 0, phase: "down" });
  const events = g.feed({ x: 100 + DEADZONE - 1, y: 100, t: 20, phase: "move" });
  assert.deepEqual(events, []);
});

test("hold-stick: auto-repeats every REPEAT_MS while held past the deadzone", () => {
  const g = createGesture();
  g.feed({ x: 0, y: 0, t: 0, phase: "down" });
  const first = g.feed({ x: 30, y: 0, t: 10, phase: "move" });
  assert.deepEqual(first, [{ kind: "step", dx: 1, dy: 0 }]);

  // Not yet a full REPEAT_MS since the last step — no repeat.
  assert.deepEqual(g.tick(10 + REPEAT_MS - 1), []);
  // Exactly REPEAT_MS later — repeats.
  assert.deepEqual(g.tick(10 + REPEAT_MS), [{ kind: "step", dx: 1, dy: 0 }]);
  // Another REPEAT_MS later — repeats again.
  assert.deepEqual(g.tick(10 + 2 * REPEAT_MS), [{ kind: "step", dx: 1, dy: 0 }]);
});

test("hold-stick: tick() re-reads direction each time so the walk can curve", () => {
  const g = createGesture();
  g.feed({ x: 0, y: 0, t: 0, phase: "down" });
  g.feed({ x: 30, y: 0, t: 10, phase: "move" }); // engages, fires step right
  // Curve the finger downward before the next repeat boundary.
  g.feed({ x: 5, y: 30, t: 10 + REPEAT_MS - 5, phase: "move" });
  const repeat = g.tick(10 + REPEAT_MS);
  assert.deepEqual(repeat, [{ kind: "step", dx: 0, dy: 1 }]);
});

test("hold-stick: tick() emits nothing once the finger drifts back inside the deadzone", () => {
  const g = createGesture();
  g.feed({ x: 0, y: 0, t: 0, phase: "down" });
  g.feed({ x: 30, y: 0, t: 10, phase: "move" }); // engages
  g.feed({ x: 2, y: 0, t: 10 + REPEAT_MS - 5, phase: "move" }); // back inside deadzone
  assert.deepEqual(g.tick(10 + REPEAT_MS), []);
});

test("hold-stick: releasing after engaging emits no extra step (no double-fire with the swipe path)", () => {
  const g = createGesture();
  g.feed({ x: 0, y: 0, t: 0, phase: "down" });
  g.feed({ x: 30, y: 0, t: 10, phase: "move" }); // already fired one step here
  const onUp = g.feed({ x: 35, y: 0, t: 20, phase: "up" });
  assert.deepEqual(onUp, []);
});

test("tap: a short, near-stationary press-and-release is a tap", () => {
  const g = createGesture();
  g.feed({ x: 50, y: 60, t: 0, phase: "down" });
  const events = g.feed({ x: 50 + TAP_MAX - 1, y: 60, t: TAP_MS - 1, phase: "up" });
  assert.deepEqual(events, [{ kind: "tap", x: 50 + TAP_MAX - 1, y: 60 }]);
});

test("tap: exceeding TAP_MAX travel is not a tap (falls through to the swipe/no-op check)", () => {
  const g = createGesture();
  g.feed({ x: 0, y: 0, t: 0, phase: "down" });
  const events = g.feed({ x: TAP_MAX + 5, y: 0, t: 10, phase: "up" });
  // Travel is above TAP_MAX but below SWIPE_MIN — neither tap nor swipe.
  assert.deepEqual(events, []);
});

test("tap: held too long (beyond TAP_MS) is not a tap even with no movement", () => {
  const g = createGesture();
  g.feed({ x: 10, y: 10, t: 0, phase: "down" });
  const events = g.feed({ x: 10, y: 10, t: TAP_MS + 1, phase: "up" });
  assert.deepEqual(events, []);
});

test("diagonal input snaps to the dominant axis (one key, one meaning)", () => {
  const gRight = createGesture();
  gRight.feed({ x: 0, y: 0, t: 0, phase: "down" });
  assert.deepEqual(gRight.feed({ x: 20, y: 5, t: 10, phase: "move" }), [
    { kind: "step", dx: 1, dy: 0 },
  ]);

  const gDown = createGesture();
  gDown.feed({ x: 0, y: 0, t: 0, phase: "down" });
  assert.deepEqual(gDown.feed({ x: 5, y: 20, t: 10, phase: "move" }), [
    { kind: "step", dx: 0, dy: 1 },
  ]);

  // Exact tie: documented deterministic tie-break favors the x-axis.
  const gTie = createGesture();
  gTie.feed({ x: 0, y: 0, t: 0, phase: "down" });
  assert.deepEqual(gTie.feed({ x: 15, y: -15, t: 10, phase: "move" }), [
    { kind: "step", dx: 1, dy: 0 },
  ]);
});

test("diagonal swipe (release-only path) also snaps to the dominant axis", () => {
  const g = createGesture();
  g.feed({ x: 0, y: 0, t: 0, phase: "down" });
  const events = g.feed({ x: SWIPE_MIN + 10, y: 5, t: 50, phase: "up" });
  assert.deepEqual(events, [{ kind: "step", dx: 1, dy: 0 }]);
});

test("a new down after a completed gesture starts fresh", () => {
  const g = createGesture();
  g.feed({ x: 0, y: 0, t: 0, phase: "down" });
  g.feed({ x: 50, y: 50, t: 10, phase: "up" }); // tap: too slow to be a swipe? check
  assert.equal(g.active(), false);
  g.feed({ x: 200, y: 200, t: 100, phase: "down" });
  assert.equal(g.active(), true);
  const events = g.feed({ x: 200 + DEADZONE + 2, y: 200, t: 110, phase: "move" });
  assert.deepEqual(events, [{ kind: "step", dx: 1, dy: 0 }]);
});

test("active() reflects whether a gesture is currently in flight", () => {
  const g = createGesture();
  assert.equal(g.active(), false);
  g.feed({ x: 0, y: 0, t: 0, phase: "down" });
  assert.equal(g.active(), true);
  g.feed({ x: 0, y: 0, t: 10, phase: "up" });
  assert.equal(g.active(), false);
});

test("move/up/tick before any down is a safe no-op", () => {
  const g = createGesture();
  assert.deepEqual(g.feed({ x: 1, y: 1, t: 1, phase: "move" }), []);
  assert.deepEqual(g.feed({ x: 1, y: 1, t: 1, phase: "up" }), []);
  assert.deepEqual(g.tick(1000), []);
});
