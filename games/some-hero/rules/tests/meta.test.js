// Direct unit tests for rules/meta.js exports not exercised by any
// @ceremony test (startRun/recordDepth/addMenace/grantToken/
// heistComplete) — faithful to games/some-hero/legacy/src/core/meta.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMeta, startRun, recordDepth, addMenace, grantToken, heistComplete } from "../meta.js";

test("startRun advances runs and day (meta.js:40-45)", () => {
  const meta = createMeta();
  assert.equal(meta.runs, 0);
  assert.equal(meta.day, 1);
  startRun(meta);
  assert.equal(meta.runs, 1);
  assert.equal(meta.day, 2);
});

test("recordDepth tracks the deepest floor ever reached (meta.js:56-59)", () => {
  const meta = createMeta();
  recordDepth(meta, 3);
  assert.equal(meta.bestDepth, 3);
  recordDepth(meta, 1);
  assert.equal(meta.bestDepth, 3, "does not regress on a shallower run");
  recordDepth(meta, 7);
  assert.equal(meta.bestDepth, 7);
});

test("addMenace documents a deed with the current day (meta.js:61-65)", () => {
  const meta = createMeta();
  meta.day = 5;
  addMenace(meta, "Undeclared dungeon gold");
  assert.deepEqual(meta.menace, [{ deed: "Undeclared dungeon gold", day: 5 }]);
});

test("grantToken/heistComplete: complete only once all three heist tokens are held (meta.js:67-76)", () => {
  const meta = createMeta();
  assert.equal(heistComplete(meta), false);
  grantToken(meta, "skull");
  assert.equal(heistComplete(meta), false);
  grantToken(meta, "gregory");
  assert.equal(heistComplete(meta), false);
  grantToken(meta, "signature");
  assert.equal(heistComplete(meta), true);
});
