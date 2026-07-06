/* Table-content tests focused on the two orchestrator-locked corrections
 * (design doc's final "Orchestrator decisions" section) — these are the
 * exact regressions that would silently reappear if someone "cleaned up"
 * the tables later without reading the doc. */
import test from "node:test";
import assert from "node:assert/strict";
import { VERB_ALIASES, DIRECTION_ALIASES, FILLER_WORDS } from "../dist/tables.js";

test("correction A: 'w' is not a whisper verb alias", () => {
  assert.equal(VERB_ALIASES.has("w"), false);
});

test("whisper stays reachable via 'whisper' and 'tell'", () => {
  assert.equal(VERB_ALIASES.get("whisper"), "whisper");
  assert.equal(VERB_ALIASES.get("tell"), "whisper");
});

test("'w' is the west direction alias", () => {
  assert.deepEqual(DIRECTION_ALIASES.get("w"), { dx: -1, dy: 0 });
});

test("correction B: 'up' is not a filler word", () => {
  assert.equal(FILLER_WORDS.has("up"), false);
});

test("'up' is the north direction alias", () => {
  assert.deepEqual(DIRECTION_ALIASES.get("up"), { dx: 0, dy: -1 });
});

test("all four cardinals have word/letter/relative/arrow forms", () => {
  const expectDir = (tok, dx, dy) => assert.deepEqual(DIRECTION_ALIASES.get(tok), { dx, dy });
  expectDir("north", 0, -1);
  expectDir("n", 0, -1);
  expectDir("up", 0, -1);
  expectDir("↑", 0, -1);
  expectDir("south", 0, 1);
  expectDir("s", 0, 1);
  expectDir("down", 0, 1);
  expectDir("↓", 0, 1);
  expectDir("east", 1, 0);
  expectDir("e", 1, 0);
  expectDir("right", 1, 0);
  expectDir("→", 1, 0);
  expectDir("west", -1, 0);
  expectDir("w", -1, 0);
  expectDir("left", -1, 0);
  expectDir("←", -1, 0);
});

test("multi-word verb aliases are present for take/look", () => {
  assert.equal(VERB_ALIASES.get("pick up"), "take");
  assert.equal(VERB_ALIASES.get("pick-up"), "take");
  assert.equal(VERB_ALIASES.get("pickup"), "take");
  assert.equal(VERB_ALIASES.get("look at"), "look");
});

test("l/x are look aliases, me is an emote alias", () => {
  assert.equal(VERB_ALIASES.get("l"), "look");
  assert.equal(VERB_ALIASES.get("x"), "look");
  assert.equal(VERB_ALIASES.get("me"), "emote");
});
