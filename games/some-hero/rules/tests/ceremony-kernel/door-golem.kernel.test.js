// Mirror of games/some-hero/ceremony/door-golem.ceremony.test.js against
// rules/ instead of legacy/src.
//
// S2b PR3 (docs/superpowers/specs/2026-07-07-s2b-pr3-ceremony-machine-
// design.md) fills in the 3 real state-machine tests that S2a deferred
// (they need handleStairs()'s kernel equivalent — shared/module.js's
// validate()'s "move" case gate check — which did not exist until this
// PR):
//  - "denial: stepping on the trapdoor uncredentialed fires onGolemEntry..."
//    (ceremony/door-golem.ceremony.test.js:43-52) -> below, GOLEM_DENIED.
//  - "pass: credentialed entry plays the stamp ceremony exactly once..."
//    (ceremony/door-golem.ceremony.test.js:63-83) -> below, the two-step
//    GOLEM_APPROVED / "proceed" / ENTERED_TOMB / EXITED_TOMB /
//    ENTERED_TOMB chain.
//  - "BITE: the gate is read-only on denial..." (ceremony/
//    door-golem.ceremony.test.js:93-104) -> below, GOLEM_DENIED read-only.
// These 3 exercise the REAL kernel (shared/module.js/shared/reducer.js)
// via rules/tests/ceremony-kernel/kernel-helpers.mjs, not blankGame()'s
// hand-shaped legacy-style game object (which has no notion of a derived
// World/gate at all) — see that helper file's own header. The other 4
// are pure-function tests, unchanged from S2a.

import { test } from "node:test";
import assert from "node:assert/strict";
import { missingCredentials, grantBackstory, grantDebt, swordVerdict, entryLines, approvalLines } from "../../credentials.js";
import { blankGame } from "./fixtures.js";
import { guildHallWorld, tombWorld, floorEnteredState, commit } from "./kernel-helpers.mjs";

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

// ── The 3 real state-machine tests (S2b PR3) ──────────────────────────
//
// The Guild Hall's map:guild_hall spawns at (1,1) and its stairsAt is
// (3,4) — both already pinned, unrelated to this file, by tests/
// module.test.js's own "the real committed map:guild_hall..." test. The
// walk below (1,0)(1,0)(0,1)(0,1)(0,1) takes the player from spawn to
// exactly one step short of the stairs, then the final "move 0 1" lands
// on stairsAt and is the one command each test actually inspects.

// ceremony/door-golem.ceremony.test.js:43-52
test("@ceremony-kernel denial: stepping on the trapdoor uncredentialed fires GOLEM_DENIED with the exact missing list, no zone change, no run started", () => {
  const world = guildHallWorld();
  let state = floorEnteredState(world);
  ({ state } = commit(state, world, "move 1 0"));
  ({ state } = commit(state, world, "move 1 0"));
  ({ state } = commit(state, world, "move 0 1"));
  ({ state } = commit(state, world, "move 0 1"));
  let result;
  ({ state, result } = commit(state, world, "move 0 1"));

  assert.deepEqual(result, [
    { t: "MOVED", x: world.stairsAt.x, y: world.stairsAt.y },
    { t: "GOLEM_DENIED", missing: ["sword", "backstory", "debt"] },
  ]);
  assert.equal(state.world.zone, "ow", "not a zone transition");
  assert.equal(state.knowledge.runs, 0, "no run started on denial");
});

// ceremony/door-golem.ceremony.test.js:63-83
test("@ceremony-kernel pass: credentialed entry plays the stamp ceremony exactly once (topside during it), then routine on repeat entries", () => {
  const ow = guildHallWorld();
  let state = floorEnteredState(ow);
  // Grant the three credentials (mirrors legacy's grantBackstory(game.
  // meta)/grantDebt(game.meta)/game.player.swordLv = 1) directly on the
  // freshly-entered state — plain object construction, not a reducer
  // event, since no ceremony event grants credentials (that is S2c's
  // credential-acquisition territory; S2a already mirrors it fully).
  state = {
    ...state,
    knowledge: { ...state.knowledge, credentials: { backstory: true, debt: true } },
    character: { ...state.character, swordLv: 1 },
  };

  let result;
  ({ state } = commit(state, ow, "move 1 0"));
  ({ state } = commit(state, ow, "move 1 0"));
  ({ state } = commit(state, ow, "move 0 1"));
  ({ state } = commit(state, ow, "move 0 1"));
  ({ state, result } = commit(state, ow, "move 0 1"));

  assert.deepEqual(
    result,
    [{ t: "MOVED", x: ow.stairsAt.x, y: ow.stairsAt.y }, { t: "GOLEM_APPROVED" }],
    "ceremony must play before descent; screen must not tell the verdict early",
  );
  assert.equal(state.world.zone, "ow", "still topside mid-ceremony");
  assert.equal(state.knowledge.golemApproved, true);

  ({ state, result } = commit(state, ow, "proceed"));
  assert.deepEqual(result.map((e) => e.t), ["ENTERED_TOMB"]);
  assert.equal(state.world.zone, "tomb", "entry proceeds once the ceremony resolves");

  // "(exit)" — the voluntary-ascent step (design spec's Fixture
  // extension): the synthetic tomb's upstairsAt sits one step east of
  // its own spawn (tests/fixtures/synthetic-floor.mjs's layout).
  const tomb = tombWorld();
  ({ state, result } = commit(state, tomb, "move 1 0"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED", "EXITED_TOMB"]);
  assert.equal(state.world.zone, "ow");

  ({ state } = commit(state, ow, "move 1 0"));
  ({ state } = commit(state, ow, "move 1 0"));
  ({ state } = commit(state, ow, "move 0 1"));
  ({ state } = commit(state, ow, "move 0 1"));
  ({ state, result } = commit(state, ow, "move 0 1"));

  assert.deepEqual(
    result.map((e) => e.t),
    ["MOVED", "ENTERED_TOMB"],
    "second entry is a routine zone transition — no second GOLEM_APPROVED, ever",
  );
  assert.equal(state.knowledge.runs, 2);
});

// ceremony/door-golem.ceremony.test.js:93-104
test("@ceremony-kernel BITE: the gate is read-only on denial (a deliberately wrong expectation must fail)", () => {
  const world = guildHallWorld();
  let state = floorEnteredState(world);
  state = { ...state, character: { ...state.character, gold: 37 } };
  const gold = state.character.gold;
  const deaths = state.knowledge.deaths;

  ({ state } = commit(state, world, "move 1 0"));
  ({ state } = commit(state, world, "move 1 0"));
  ({ state } = commit(state, world, "move 0 1"));
  ({ state } = commit(state, world, "move 0 1"));
  ({ state } = commit(state, world, "move 0 1"));

  assert.equal(state.character.gold, gold);
  assert.equal(state.knowledge.deaths, deaths);
  assert.equal(state.world.zone, "ow");
  // Bite evidence lives in the report: flipping this assert.equal to a
  // wrong constant demonstrably fails.
});
