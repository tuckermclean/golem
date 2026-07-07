// Mirror of games/some-hero/ceremony/door-golem.ceremony.test.js against
// rules/ instead of legacy/src.
//
// DEFERRED to S2b (3 of 7 tests, all real state-machine tests needing
// handleStairs()/a real tomb zone):
//  - "denial: stepping on the trapdoor uncredentialed fires onGolemEntry..."
//    (ceremony/door-golem.ceremony.test.js:43-52)
//  - "pass: credentialed entry plays the stamp ceremony exactly once..."
//    (ceremony/door-golem.ceremony.test.js:63-83)
//  - "BITE: the gate is read-only on denial..." (ceremony/
//    door-golem.ceremony.test.js:93-104)
// The remaining 4 are pure-function tests and are covered below.

import { test } from "node:test";
import assert from "node:assert/strict";
import { missingCredentials, grantBackstory, grantDebt, swordVerdict, entryLines, approvalLines } from "../../credentials.js";
import { blankGame } from "./fixtures.js";

// ceremony/door-golem.ceremony.test.js:23-33
test("@ceremony-kernel Door Golem requires sword-shaped object, notarized backstory, crippling debt", () => {
  const game = blankGame();
  assert.deepEqual(missingCredentials(game.meta, 0), ["sword", "backstory", "debt"]);
  assert.deepEqual(missingCredentials(game.meta, 1), ["backstory", "debt"]);
  grantBackstory(game.meta);
  assert.deepEqual(missingCredentials(game.meta, 1), ["debt"]);
  grantDebt(game.meta);
  assert.deepEqual(missingCredentials(game.meta, 1), [], "all three satisfied");
  assert.deepEqual(missingCredentials(game.meta, 0), ["sword"]);
});

// ceremony/door-golem.ceremony.test.js:35-41
test("@ceremony-kernel swordVerdict text is pinned per tier (0..4)", () => {
  assert.equal(swordVerdict(0), "Sword: an open hand. The golem has checked both. It does not count.");
  assert.equal(swordVerdict(1), "Sword: technically. The golem has seen swordfish pass this checkpoint. Approved.");
  assert.equal(swordVerdict(2), 'Sword: a DIRK!™. "Basically a sword." The golem has read the case law. It counts.');
  assert.equal(swordVerdict(3), "Sword: engineered composite. The golem has read the materials data sheet. Approved, reluctantly, on page nine.");
  assert.equal(swordVerdict(4), "Sword: sun-steel. Extremely sword-shaped. The golem is moved.");
});

// ceremony/door-golem.ceremony.test.js:54-61
test("@ceremony-kernel denial content: entry lines name each missing credential and end DENIED", () => {
  const game = blankGame();
  const lines = entryLines(game, ["backstory", "debt"]);
  assert.equal(lines[0], "HALT. Credential verification. The golem will now verify. Credentials.");
  assert.ok(lines.some(l => l === "Tragic backstory: NOT ON FILE. Must be notarized. Clerk Hespeth stamps; the Ledger writes. The Ledger is… available. Unfortunately."));
  assert.ok(lines.some(l => l === "Crippling debt: NONE DETECTED. The golem is concerned. Adventurers without debt have options. Options are dangerous. The gift shop extends credit."));
  assert.equal(lines.at(-1), "ENTRY: DENIED. The golem takes no pleasure in this. The golem takes no pleasure in anything. It is a compliance feature.");
});

// ceremony/door-golem.ceremony.test.js:85-91
test("@ceremony-kernel approval ceremony content: the pause is exactly 3 ellipses, and the stamp line is present", () => {
  const game = blankGame();
  const ceremony = approvalLines(game);
  assert.equal(ceremony.filter(l => l === "…").length, 3, "do not cut the pause");
  assert.ok(ceremony.includes("*stamp*"));
  assert.equal(ceremony.at(-1), "It is crooked. The golem knows it is crooked. Proceed. PROCEED.");
});
