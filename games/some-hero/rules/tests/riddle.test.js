// Direct unit tests for rules/riddle.js's tombQuestLine branches not
// exercised by any @ceremony test (only the null-puzzle and riddle-puzzle
// branches are ceremony-pinned; warden/key/plates/traps/torch are
// exercised here) — faithful to games/some-hero/legacy/src/systems/
// quest.js:41-56.

import { test } from "node:test";
import assert from "node:assert/strict";
import { tombQuestLine } from "../riddle.js";

function baseGame() {
  return { floorNum: 4, puzzle: null, boss: null, torches: [] };
}

test("tombQuestLine: warden branch reads game.boss.dead / game.boss.name (quest.js:48-49)", () => {
  const game = baseGame();
  game.puzzle = { type: "warden" };
  game.boss = { dead: false, name: "the Warden" };
  assert.equal(tombQuestLine(game), "Floor 4 · <b>performance review: the Warden</b>");
  game.boss.dead = true;
  assert.equal(tombQuestLine(game), "Floor 4 · <b>stairs open ↓</b>");
});

test("tombQuestLine: key branch reads pz.have (quest.js:50)", () => {
  const game = baseGame();
  game.puzzle = { type: "key", have: false };
  assert.equal(tombQuestLine(game), "Floor 4 · find the <b>bronze key</b>");
  game.puzzle.have = true;
  assert.equal(tombQuestLine(game), "Floor 4 · <b>stairs open ↓</b>");
});

test("tombQuestLine: plates branch reads pz.done/pz.need (quest.js:51)", () => {
  const game = baseGame();
  game.puzzle = { type: "plates", solved: false, done: 1, need: 3 };
  assert.equal(tombQuestLine(game), "Floor 4 · plates <b>1 / 3</b>");
  game.puzzle.solved = true;
  assert.equal(tombQuestLine(game), "Floor 4 · <b>stairs open ↓</b>");
});

test("tombQuestLine: traps branch reads pz.done/pz.need (quest.js:53)", () => {
  const game = baseGame();
  game.puzzle = { type: "traps", solved: false, done: 2, need: 4 };
  assert.equal(tombQuestLine(game), "Floor 4 · incidents <b>2 / 4</b>");
  game.puzzle.solved = true;
  assert.equal(tombQuestLine(game), "Floor 4 · <b>stairs open ↓</b>");
});

test("tombQuestLine: torch (default) branch counts lit braziers (quest.js:54-55)", () => {
  const game = baseGame();
  game.puzzle = { type: "torch", solved: false, n: 3 };
  game.torches = [{ lit: true }, { lit: false }, { lit: false }];
  assert.equal(tombQuestLine(game), "Floor 4 · braziers <b>1 / 3</b>");
  game.puzzle.solved = true;
  assert.equal(tombQuestLine(game), "Floor 4 · <b>stairs open ↓</b>");
});

test("tombQuestLine: final branch reads pz.bossDead / game.boss.name (quest.js:45-47)", () => {
  const game = baseGame();
  game.puzzle = { type: "final", bossDead: false };
  game.boss = { name: "the Origenal Hero" };
  assert.equal(tombQuestLine(game), "Floor 4 · <b>the Origenal Hero</b>");
  game.puzzle.bossDead = true;
  assert.equal(tombQuestLine(game), "Floor 4 · <b>the desk is open ▣</b>");
});
