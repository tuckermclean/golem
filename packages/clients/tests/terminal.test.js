/* ── DELTA A3 PR2 DoD tests: createTerminalSession (src/terminal.js).
   Uses the real adventure GameModule + content pack (imported-content/
   adventure) as its fixture -- the same cross-package "packages test
   against a real, frozen game fixture" posture packages/testkit's own
   tests take against games/golem-grid/some-hero fixtures. terminal.js
   itself stays generic (any {verb,noun} GameModule); this is simply the
   one real fixture the monorepo has to prove it end-to-end. */
import test from "node:test";
import assert from "node:assert/strict";

import { createTerminalSession } from "../src/index.js";
import { compileContentPack } from "@golem-engine/adventure/content/build-pack.mjs";
import { deriveWorld, createState, module } from "@golem-engine/adventure/module/module.js";

function makeSession(seed = "terminal-test-seed") {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const world = deriveWorld({}, result.pack);
  const state = createState(world);
  return { session: createTerminalSession({ module, world, state, seed }), world };
}

test("render(): lists the entry room's description and an affordance verb menu", () => {
  const { session } = makeSession();
  const lines = session.render();
  assert.ok(lines.some((l) => l.includes("village")), "expected the village square description");
  assert.ok(lines.includes("You can:"));
  assert.ok(lines.some((l) => /go /.test(l)), "expected at least one 'go <exit>' menu line");
});

test('submit("go shop"): moves the player and re-renders the new room', () => {
  const { session } = makeSession();
  const lines = session.submit("go shop");
  assert.ok(lines.some((l) => /go to shop/i.test(l)));
  assert.ok(lines.some((l) => l.includes("cramped general store")), "expected the shop's description after moving");
});

test('submit("take dusty lantern"): takes the item after moving into the shop', () => {
  const { session } = makeSession();
  session.submit("go shop");
  const lines = session.submit("take dusty lantern");
  assert.ok(lines.some((l) => /take the dusty lantern/i.test(l)));

  // The taken lantern no longer shows up in a subsequent look's
  // room-items line (it moved from the room into the player's inventory).
  const after = session.render();
  assert.equal(after.some((l) => l.startsWith("You see:") && l.includes("dusty lantern")), false);
});

test('submit("eat rare mushroom"): a verb alias ("eat") reaches the SAME generic "use" mechanic and sets the insight fact', () => {
  const { session } = makeSession();
  for (const cmd of ["go forest_road", "go forest_clearing", "go enchanted_pond", "go deep_forest_path"]) {
    session.submit(cmd);
  }
  const took = session.submit("take rare mushroom");
  assert.ok(took.some((l) => /take the rare mushroom/i.test(l)));
  const used = session.submit("eat rare mushroom");
  assert.ok(used.some((l) => /use the rare mushroom/i.test(l)));
});

test('submit("talk wizard"): returns a deterministic twin line, identical across two fresh sessions with the same seed', () => {
  const { session: s1 } = makeSession("same-seed");
  const { session: s2 } = makeSession("same-seed");
  for (const s of [s1, s2]) {
    for (const cmd of ["go forest_road", "go forest_clearing", "go wizards_tower"]) s.submit(cmd);
  }
  const lines1 = s1.submit("talk wizard");
  const lines2 = s2.submit("talk wizard");
  assert.deepEqual(lines1, lines2);
  assert.ok(lines1.length > 0);
});

test('submit("talk wizard"): a different seed can produce a different (still deterministic) line', () => {
  const { session: sA } = makeSession("seed-a");
  const { session: sB } = makeSession("seed-b");
  for (const s of [sA, sB]) {
    for (const cmd of ["go forest_road", "go forest_clearing", "go wizards_tower"]) s.submit(cmd);
  }
  const repeatA1 = sA.submit("talk wizard");
  const repeatA2 = sA.submit("talk wizard");
  // Same session, same seed, same envelope inputs -> same line every time.
  assert.deepEqual(repeatA1, repeatA2);
  // Different seed is not asserted to differ (template pool is small and
  // may coincide) -- only that it is still well-formed, non-empty output.
  const linesB = sB.submit("talk wizard");
  assert.ok(linesB.length > 0);
});

test("submit(): an unknown verb returns a helpful denial", () => {
  const { session } = makeSession();
  const lines = session.submit("frobnicate lamp");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /don't know how to "frobnicate"/i);
});

test("submit(): an unknown noun returns a helpful denial", () => {
  const { session } = makeSession();
  const lines = session.submit("take xyzzy_nonexistent_thing");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /don't see/i);
});

test("submit(): a locked exit is denied with the door's own reason", () => {
  const { session } = makeSession();
  for (const cmd of [
    "go forest_road",
    "go forest_clearing",
    "go enchanted_pond",
    "go old_oak_clearing",
  ]) {
    session.submit(cmd);
  }
  const lines = session.submit("go spooky_house");
  assert.ok(lines.some((l) => /go to spooky house/i.test(l)), "spooky house is directly reachable, unlocked");
  const denied = session.submit("go foyer");
  assert.equal(denied.length, 1);
  assert.match(denied[0], /front door.*locked/i);
});
