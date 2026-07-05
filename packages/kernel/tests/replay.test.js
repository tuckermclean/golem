/* Runtime unit test for @golem-engine/kernel's replay() + isDenial(),
 * driven against a toy in-memory counter module (deliberately NOT
 * golem-grid — this package must have zero game logic and zero
 * knowledge of any specific game; the real golem-grid conformance test
 * lives in packages/testkit/tests/kernel-replay.test.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { isDenial, replay } from "@golem-engine/kernel";

const core = {
  deriveWorld: (seed) => ({ max: seed.length }),
  reduce: (state, world, ev) => {
    switch (ev.t) {
      case "INC":
        return { n: Math.min(world.max, state.n + 1) };
      case "DEC":
        return { n: state.n - 1 };
      default:
        return state;
    }
  },
  validate: (_ctx, cmd) => {
    if (cmd === "inc") return [{ t: "INC" }];
    if (cmd === "dec") return [{ t: "DEC" }];
    return { deny: `unknown verb "${cmd}"` };
  },
};

test("replay: pure fold over reduce, in log order", () => {
  const world = core.deriveWorld("seed12"); // max = 6
  const log = [
    { seq: 1, t: "INC" },
    { seq: 2, t: "INC" },
    { seq: 3, t: "DEC" },
  ];
  const final = replay(core, world, log, { n: 0 });
  assert.deepEqual(final, { n: 1 });
});

test("replay: does not mutate the initialState object it was handed", () => {
  const world = core.deriveWorld("x");
  const initial = { n: 0 };
  replay(core, world, [{ seq: 1, t: "INC" }], initial);
  assert.deepEqual(initial, { n: 0 }, "replay must thread return values, never mutate its input");
});

test("replay: empty log returns the initialState (by value)", () => {
  const world = core.deriveWorld("x");
  assert.deepEqual(replay(core, world, [], { n: 5 }), { n: 5 });
});

test("replay: reduce's world argument is threaded through unchanged on every step", () => {
  // A reduce that asserts on `world` identity across the whole fold
  // catches a kernel bug where replay() might rebind or copy world
  // between iterations instead of passing the same reference through.
  const world = { max: 3 };
  let calls = 0;
  const worldCheckingCore = {
    reduce: (state, w, ev) => {
      calls++;
      assert.equal(w, world, `world reference changed on call ${calls}`);
      return { n: state.n + 1 };
    },
  };
  const log = [{ seq: 1, t: "X" }, { seq: 2, t: "X" }, { seq: 3, t: "X" }];
  const final = replay(worldCheckingCore, world, log, { n: 0 });
  assert.equal(calls, 3);
  assert.deepEqual(final, { n: 3 });
});

test("isDenial: distinguishes an Event[] result from a Denial result", () => {
  const events = core.validate({}, "inc");
  const denial = core.validate({}, "nope");
  assert.equal(isDenial(events), false);
  assert.equal(isDenial(denial), true);
  assert.deepEqual(denial, { deny: 'unknown verb "nope"' });
});
