// @ceremony — Area 1: Door Golem requirements, denial, and pass behavior.
//
// Characterization tests, read-only against games/some-hero/legacy/src.
// These pin exact observed strings/values; they duplicate assertions
// already made in legacy/tests/golem-riddle.test.js on purpose (see
// games/some-hero/CEREMONY.md) so this file survives legacy's archival.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TL, ST } from '../legacy/src/constants.js';
import { missingCredentials, grantBackstory, grantDebt, swordVerdict } from '../legacy/src/systems/credentials.js';
import { handleStairs } from '../legacy/src/systems/stairs.js';
import { entryLines, approvalLines } from '../legacy/src/content/golem.js';
import { enterTomb, exitTomb } from '../legacy/src/world/zones.js';
import { seededGame, blankGame, spyFx } from '../legacy/tests/helpers.js';

function standOnTrapdoor(game) {
  const ptx = Math.floor(game.player.x / T), pty = Math.floor(game.player.y / T);
  game.world.map[pty * game.world.w + ptx] = TL.SD;
  game.player.tk = 'stale';
}

test('@ceremony Door Golem requires sword-shaped object, notarized backstory, crippling debt', () => {
  const game = blankGame();
  assert.deepEqual(missingCredentials(game.meta, 0), ['sword', 'backstory', 'debt']);
  assert.deepEqual(missingCredentials(game.meta, 1), ['backstory', 'debt']);
  grantBackstory(game.meta);
  assert.deepEqual(missingCredentials(game.meta, 1), ['debt']);
  grantDebt(game.meta);
  assert.deepEqual(missingCredentials(game.meta, 1), [], 'all three satisfied');
  // the sword check is re-evaluated live, every time, off the hand not meta
  assert.deepEqual(missingCredentials(game.meta, 0), ['sword']);
});

test('@ceremony swordVerdict text is pinned per tier (0..4)', () => {
  assert.equal(swordVerdict(0), 'Sword: an open hand. The golem has checked both. It does not count.');
  assert.equal(swordVerdict(1), 'Sword: technically. The golem has seen swordfish pass this checkpoint. Approved.');
  assert.equal(swordVerdict(2), 'Sword: a DIRK!™. "Basically a sword." The golem has read the case law. It counts.');
  assert.equal(swordVerdict(3), 'Sword: engineered composite. The golem has read the materials data sheet. Approved, reluctantly, on page nine.');
  assert.equal(swordVerdict(4), 'Sword: sun-steel. Extremely sword-shaped. The golem is moved.');
});

test('@ceremony denial: stepping on the trapdoor uncredentialed fires onGolemEntry with the exact missing list, no zone change, no run started', () => {
  const game = seededGame(21), fx = spyFx();
  game.state = ST.PLAY;
  standOnTrapdoor(game);
  assert.equal(handleStairs(game, fx), false, 'not a zone transition');
  assert.equal(game.zone, 'ow');
  assert.equal(fx.count('onGolemEntry'), 1);
  assert.deepEqual(fx.last('onGolemEntry')[1], ['sword', 'backstory', 'debt']);
  assert.equal(game.meta.runs, 0, 'no run started on denial');
});

test('@ceremony denial content: entry lines name each missing credential and end DENIED', () => {
  const game = blankGame();
  const lines = entryLines(game, ['backstory', 'debt']);
  assert.equal(lines[0], 'HALT. Credential verification. The golem will now verify. Credentials.');
  assert.ok(lines.some(l => l === 'Tragic backstory: NOT ON FILE. Must be notarized. Clerk Hespeth stamps; the Ledger writes. The Ledger is… available. Unfortunately.'));
  assert.ok(lines.some(l => l === 'Crippling debt: NONE DETECTED. The golem is concerned. Adventurers without debt have options. Options are dangerous. The gift shop extends credit.'));
  assert.equal(lines.at(-1), 'ENTRY: DENIED. The golem takes no pleasure in this. The golem takes no pleasure in anything. It is a compliance feature.');
});

test('@ceremony pass: credentialed entry plays the stamp ceremony exactly once (topside during it), then routine on repeat entries', () => {
  const game = seededGame(21), fx = spyFx();
  game.state = ST.PLAY;
  grantBackstory(game.meta);
  grantDebt(game.meta);
  game.player.swordLv = 1;

  standOnTrapdoor(game);
  assert.equal(handleStairs(game, fx), false, 'ceremony must play before descent; screen must not tell the verdict early');
  assert.equal(game.zone, 'ow', 'still topside mid-ceremony');
  assert.equal(fx.count('onGolemApproval'), 1);
  assert.equal(game.meta.golemApproved, true);
  fx.last('onGolemApproval')[1]();
  assert.equal(game.zone, 'tomb', 'entry proceeds once the dialog closes');

  exitTomb(game, fx);
  standOnTrapdoor(game);
  assert.equal(handleStairs(game, fx), true, 'second entry is a routine zone transition');
  assert.equal(fx.count('onGolemApproval'), 1, 'no second ceremony, ever');
  assert.equal(game.meta.runs, 2);
});

test('@ceremony approval ceremony content: the pause is exactly 3 ellipses, and the stamp line is present', () => {
  const game = blankGame();
  const ceremony = approvalLines(game);
  assert.equal(ceremony.filter(l => l === '…').length, 3, 'do not cut the pause');
  assert.ok(ceremony.includes('*stamp*'));
  assert.equal(ceremony.at(-1), 'It is crooked. The golem knows it is crooked. Proceed. PROCEED.');
});

test('@ceremony BITE: the gate is read-only on denial (a deliberately wrong expectation must fail)', () => {
  const game = seededGame(25), fx = spyFx();
  game.state = ST.PLAY;
  const gold = game.player.gold, deaths = game.meta.deaths;
  standOnTrapdoor(game);
  handleStairs(game, fx);
  assert.equal(game.player.gold, gold);
  assert.equal(game.meta.deaths, deaths);
  assert.equal(game.zone, 'ow');
  // Bite evidence lives in the report (p0.3b-report.md): flipping this
  // assert.equal to a wrong constant demonstrably fails.
});
