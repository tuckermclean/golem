import test from "node:test";
import assert from "node:assert/strict";
import { h32, channel, pick, rint } from "../shared/rng.js";

test("h32 golden values (frozen: the hash is a public API)", () => {
  assert.equal(h32("plagueis"), 740258109);
  assert.equal(h32(""), 2019044825);
});

test("channel: same parts → same stream", () => {
  const a = channel("plagueis", "dungeon"), b = channel("plagueis", "dungeon");
  const va = [a(), a(), a()], vb = [b(), b(), b()];
  assert.deepEqual(va, vb);
  assert.equal(va[0], 0.916303388774395);
  assert.equal(va[1], 0.5478345134761184);
  assert.equal(va[2], 0.31257767020724714);
});

test("channel: different parts → different stream", () => {
  assert.notEqual(channel("a", "x")(), channel("a", "y")());
});

test("pick/rint stay in range", () => {
  const r = channel("t");
  for (let i = 0; i < 100; i++) {
    assert.ok(["a", "b", "c"].includes(pick(r, ["a", "b", "c"])));
    const n = rint(r, 5);
    assert.ok(n >= 0 && n < 5 && Number.isInteger(n));
  }
});
