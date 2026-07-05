// Build Order step 3 (completed) + step 5 (started):
// the Door Golem of Credential Verification, customs, the Menace Résumé,
// and the Riddle Door That Learned Its Lesson.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TL, ST } from '../src/constants.js';
import { addMenace } from '../src/core/meta.js';
import { missingCredentials, grantBackstory, grantDebt, swordVerdict } from '../src/systems/credentials.js';
import { nextRiddle, answerRiddle, doorSigh } from '../src/systems/riddle.js';
import { handleStairs } from '../src/systems/stairs.js';
import { stairsOpen, sealMsg } from '../src/systems/puzzles.js';
import { tombQuestLine } from '../src/systems/quest.js';
import { hurtPlayer, hitEnemy } from '../src/systems/combat.js';
import { usePotion } from '../src/systems/potions.js';
import { updatePickups } from '../src/systems/pickups.js';
import { mkEnemy } from '../src/entities/enemy.js';
import { enterTomb, exitTomb } from '../src/world/zones.js';
import { entryLines, approvalLines, smuggleOutcome, suspicionBook } from '../src/content/golem.js';
import { mulberry32 } from '../src/core/rng.js';
import { seededGame, blankGame, spyFx } from './helpers.js';

// ---------- credentials ----------

test('credentials: all three missing at first, grantable', () => {
  const game = blankGame();
  assert.deepEqual(missingCredentials(game.meta, 0), ['sword', 'backstory', 'debt']);
  assert.deepEqual(missingCredentials(game.meta, 1), ['backstory', 'debt']);
  grantBackstory(game.meta);
  assert.deepEqual(missingCredentials(game.meta, 1), ['debt']);
  grantDebt(game.meta);
  assert.deepEqual(missingCredentials(game.meta, 1), []);
  assert.deepEqual(missingCredentials(game.meta, 0), ['sword'], 'the hand is checked every time');
});

test('swordVerdict covers every tier (an open hand does not count)', () => {
  assert.match(swordVerdict(0), /open hand/);
  assert.match(swordVerdict(1), /swordfish/);
  assert.match(swordVerdict(2), /DIRK/);
  assert.match(swordVerdict(3), /engineered|materials data sheet/i);
  assert.match(swordVerdict(4), /moved/);
});

// ---------- the golem gates the dungeon mouth ----------

function standOnTrapdoor(game) {
  const ptx = Math.floor(game.player.x / T), pty = Math.floor(game.player.y / T);
  game.world.map[pty * game.world.w + ptx] = TL.SD;
  game.player.tk = 'stale';
}

test('uncredentialed entry is DENIED (and is not a zone transition)', () => {
  const game = seededGame(21), fx = spyFx();
  game.state = ST.PLAY;
  standOnTrapdoor(game);
  assert.equal(handleStairs(game, fx), false);
  assert.equal(game.zone, 'ow');
  assert.equal(fx.count('onGolemEntry'), 1);
  assert.deepEqual(fx.last('onGolemEntry')[1], ['sword', 'backstory', 'debt']);
  assert.equal(game.meta.runs, 0, 'no run started');
});

test('credentialed entry: stamp ceremony exactly once, then routine', () => {
  const game = seededGame(21), fx = spyFx();
  game.state = ST.PLAY;
  grantBackstory(game.meta); grantDebt(game.meta);
  game.player.swordLv = 1;   // Pointy: the third credential

  standOnTrapdoor(game);
  // the ceremony plays out BEFORE the descent — the screen must not give
  // the verdict away by going dark while the golem is still verifying
  assert.equal(handleStairs(game, fx), false);
  assert.equal(game.zone, 'ow', 'still topside during the stamp ceremony');
  assert.equal(fx.count('onGolemApproval'), 1);
  assert.equal(game.meta.golemApproved, true);
  fx.last('onGolemApproval')[1]();   // the dialog closes; entry proceeds
  assert.equal(game.zone, 'tomb');

  // back out and in again: no second ceremony
  exitTomb(game, fx);
  standOnTrapdoor(game);
  assert.equal(handleStairs(game, fx), true);
  assert.equal(fx.count('onGolemApproval'), 1);
  assert.equal(game.meta.runs, 2);
});

test('golem content: entry lines cover each missing credential; the pause is intact', () => {
  const game = blankGame();
  const lines = entryLines(game, ['backstory', 'debt']);
  assert.ok(lines.some(l => /backstory/i.test(l)));
  assert.ok(lines.some(l => /debt/i.test(l)));
  assert.match(lines.at(-1), /DENIED/);
  const ceremony = approvalLines(game);
  assert.ok(ceremony.filter(l => l === '\u2026').length >= 3, 'do not cut the pause');
  assert.ok(ceremony.includes('*stamp*'));
});

// ---------- customs + the Menace Résumé ----------

test('surfacing with dungeon gold triggers customs; dying does not', async () => {
  const game = seededGame(22), fx = spyFx();
  enterTomb(game, fx);
  game.runStats.goldGained = 12;
  exitTomb(game, fx);
  assert.equal(fx.count('onGolemCustoms'), 1);
  assert.equal(fx.last('onGolemCustoms')[1], 12);
  // inspection happens AT the door: no daylight until customs resolves
  assert.equal(game.zone, 'tomb', 'still at the door during inspection');
  fx.last('onGolemCustoms')[2]();    // customs concludes; released topside
  assert.equal(game.zone, 'ow');
  assert.match(fx.last('toast')[1], /Daylight/);

  // death is a customs exemption (the body bin has diplomatic status)
  const game2 = seededGame(22), fx2 = spyFx();
  enterTomb(game2, fx2);
  game2.runStats.goldGained = 9;
  const { respawnAtGuild } = await import('../src/systems/respawn.js');
  game2.player.hp = 0;
  respawnAtGuild(game2, fx2);
  assert.equal(fx2.count('onGolemCustoms'), 0);
});

test('surfacing empty-handed skips customs', () => {
  const game = seededGame(23), fx = spyFx();
  enterTomb(game, fx);
  exitTomb(game, fx);
  assert.equal(fx.count('onGolemCustoms'), 0);
});

test('the Ledger grades survived runs on surfacing', () => {
  const game = seededGame(23), fx = spyFx();
  enterTomb(game, fx);
  exitTomb(game, fx);
  assert.equal(game.meta.grades.length, 1);
  assert.match(fx.calls.filter(c => c[0] === 'toast').at(-1)[1], /Run grade: [SFABCD]/);
});

test('smuggling goes in the book; the book is all about you', () => {
  const game = blankGame();
  game.runStats.goldGained = 7;
  const line = smuggleOutcome(game);
  assert.match(line, /exactly 7 gold/);
  assert.equal(game.meta.menace.length, 1);
  assert.match(game.meta.menace[0].deed, /Undeclared/);
  assert.equal(game.meta.menace[0].day, game.meta.day);

  const book = suspicionBook(game.meta);
  assert.match(book[0], /Page 1/);
  assert.match(book.at(-1), /no other subjects/);
  // an empty book is still about you
  const fresh = blankGame();
  assert.match(suspicionBook(fresh.meta)[0], /suspicious/);
});

test('addMenace records the deed with the surface day', () => {
  const game = blankGame();
  game.meta.day = 5;
  addMenace(game.meta, 'Removed a DO NOT REMOVE tag.');
  assert.deepEqual(game.meta.menace[0], { deed: 'Removed a DO NOT REMOVE tag.', day: 5 });
});

// ---------- the Riddle Door That Learned Its Lesson ----------

test('riddle seal: stairsOpen, sealMsg, quest line', () => {
  const game = blankGame();
  game.puzzle = { type: 'riddle', solved: false, attempts: 0 };
  assert.equal(stairsOpen(game), false);
  assert.match(sealMsg(game.puzzle), /question/);
  game.floorNum = 2;
  assert.match(tombQuestLine(game), /the door/);
  game.puzzle.solved = true;
  assert.equal(stairsOpen(game), true);
});

test('sealed riddle stairs ask the door instead of toasting', () => {
  const game = seededGame(24), fx = spyFx();
  enterTomb(game, fx);
  game.puzzle = { type: 'riddle', solved: false, attempts: 0 };
  // stand on the down-stairs
  for (let i = 0; i < game.world.map.length; i++) {
    if (game.world.map[i] === TL.SD) {
      game.player.x = (i % game.world.w) * T + T / 2;
      game.player.y = ((i / game.world.w) | 0) * T + T / 2;
      break;
    }
  }
  game.player.tk = 'stale';
  assert.equal(handleStairs(game, fx), false);
  assert.equal(fx.count('onRiddle'), 1);
});

test('the first question is about this run, and exactly one option is correct', () => {
  const game = blankGame();
  game.rng = mulberry32(3);
  game.puzzle = { type: 'riddle', solved: false, attempts: 0 };
  game.runStats.killsByKind = { jackal: 3 };
  game.runStats.kills = 3;
  const r = nextRiddle(game);
  assert.match(r.q, /jackals/);
  assert.equal(r.options.filter(o => o.correct).length, 1);
  assert.ok(r.options.some(o => o.correct && o.label === '3'));
  assert.ok(r.options.length >= 3);
});

test('questions get easier with disappointment; the third is written on the door', () => {
  const game = blankGame();
  game.rng = mulberry32(4);
  game.floorNum = 6;
  game.puzzle = { type: 'riddle', solved: false, attempts: 1 };
  game.runStats.glurpsDrunk = 2;
  assert.match(nextRiddle(game).q, /Glurps/);
  game.puzzle.attempts = 2;
  const r = nextRiddle(game);
  assert.match(r.q, /floor/);
  assert.ok(r.options.some(o => o.correct && o.label === '6'));
});

test('answer flow: wrong sighs and escalates, right opens, name-asking shames', () => {
  const game = blankGame(), fx = spyFx();
  game.rng = mulberry32(5);
  game.puzzle = { type: 'riddle', solved: false, attempts: 0 };
  game.runStats.killsByKind = { scarab: 2 };

  assert.equal(answerRiddle(game, { correct: false }, fx), 'wrong');
  assert.equal(game.puzzle.attempts, 1);
  assert.ok(doorSigh(1).length > 0);

  assert.equal(answerRiddle(game, { correct: true }, fx), 'solved');
  assert.equal(game.puzzle.solved, true);
  assert.equal(stairsOpen(game), true);

  // the shame path
  const game2 = blankGame(), fx2 = spyFx();
  game2.puzzle = { type: 'riddle', solved: false, attempts: 3 };
  const name = nextRiddle(game2, mulberry32(6));
  assert.ok(name.shame);
  assert.ok(name.options.every(o => o.correct), 'every name is correct; that is the punishment');
  assert.equal(answerRiddle(game2, name.options[0], fx2), 'shamed');
  assert.equal(game2.puzzle.solved, true);
});

// ---------- run-stat tracking feeding the door ----------

test('kills by kind, Glurps drunk, and dungeon gold are all tracked', () => {
  const game = blankGame(), fx = spyFx();
  hitEnemy(game, mkEnemy('jackal', 0, 0), 99, 0, 0, fx);
  hitEnemy(game, mkEnemy('jackal', 0, 0), 99, 0, 0, fx);
  hitEnemy(game, mkEnemy('spirit', 0, 0), 99, 0, 0, fx);
  assert.deepEqual(game.runStats.killsByKind, { jackal: 2, spirit: 1 });

  game.player.hp = 1; game.player.potions = 1;   // bought, not found
  usePotion(game, fx);
  assert.equal(game.runStats.glurpsDrunk, 1);

  game.zone = 'tomb';
  game.pickups = [{ kind: 'gold', x: game.player.x, y: game.player.y, v: 4 }];
  updatePickups(game, 1 / 60, fx);
  assert.equal(game.runStats.goldGained, 4);

  // topside gold is not dungeon gold
  game.zone = 'ow';
  game.pickups = [{ kind: 'gold', x: game.player.x, y: game.player.y, v: 4 }];
  updatePickups(game, 1 / 60, fx);
  assert.equal(game.runStats.goldGained, 4, 'unchanged');
});

test('death by the boss while uncredentialed never happens at the mouth: gate is read-only', () => {
  // stepping on the trapdoor uncredentialed must not mutate anything but tk
  const game = seededGame(25), fx = spyFx();
  game.state = ST.PLAY;
  const gold = game.player.gold, deaths = game.meta.deaths;
  standOnTrapdoor(game);
  handleStairs(game, fx);
  assert.equal(game.player.gold, gold);
  assert.equal(game.meta.deaths, deaths);
  assert.equal(game.zone, 'ow');
});
