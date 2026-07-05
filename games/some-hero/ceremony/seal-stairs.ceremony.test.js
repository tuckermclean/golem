// @ceremony — Area 4: seal / stairsOpen logic. The full truth table over
// puzzle types, plus the riddle door (the seal used by the Ceremony route).
//
// Characterization tests, read-only against games/some-hero/legacy/src.
// Deliberate overlap with legacy/tests/puzzles.test.js and
// legacy/tests/golem-riddle.test.js (see CEREMONY.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TL } from '../legacy/src/constants.js';
import { stairsOpen, sealMsg } from '../legacy/src/systems/puzzles.js';
import { nextRiddle, answerRiddle, doorSigh } from '../legacy/src/systems/riddle.js';
import { handleStairs } from '../legacy/src/systems/stairs.js';
import { tombQuestLine } from '../legacy/src/systems/quest.js';
import { mulberry32 } from '../legacy/src/core/rng.js';
import { enterTomb } from '../legacy/src/world/zones.js';
import { blankGame, seededGame, spyFx } from './helpers.js';

test('@ceremony stairsOpen truth table: null puzzle is always open', () => {
  const game = blankGame();
  game.puzzle = null;
  assert.equal(stairsOpen(game), true);
});

test('@ceremony stairsOpen truth table: warden — open iff boss.dead, or no boss at all', () => {
  const game = blankGame();
  game.puzzle = { type: 'warden' };
  game.boss = { dead: false };
  assert.equal(stairsOpen(game), false);
  game.boss.dead = true;
  assert.equal(stairsOpen(game), true);
  game.boss = null;
  assert.equal(stairsOpen(game), true, 'warden floor with no boss object is open');
});

test('@ceremony stairsOpen truth table: final is always closed (no down-stairs on the final floor)', () => {
  const game = blankGame();
  game.puzzle = { type: 'final' };
  assert.equal(stairsOpen(game), false);
  game.puzzle.bossDead = true;
  assert.equal(stairsOpen(game), false, 'final never opens via stairsOpen — the desk, not stairs, is the exit');
});

test('@ceremony stairsOpen truth table: key — open iff pz.have', () => {
  const game = blankGame();
  game.puzzle = { type: 'key', have: false };
  assert.equal(stairsOpen(game), false);
  game.puzzle.have = true;
  assert.equal(stairsOpen(game), true);
});

test('@ceremony stairsOpen truth table: plates/traps/torch/riddle all fall through to pz.solved', () => {
  const game = blankGame();
  for (const type of ['plates', 'traps', 'torch', 'riddle']) {
    game.puzzle = { type, solved: false };
    assert.equal(stairsOpen(game), false, `${type} closed while unsolved`);
    game.puzzle.solved = true;
    assert.equal(stairsOpen(game), true, `${type} open once solved`);
  }
});

test('@ceremony sealMsg names each seal type exactly', () => {
  assert.equal(sealMsg({ type: 'warden' }), 'The seal holds — slay the Warden.');
  assert.equal(sealMsg({ type: 'final' }), 'The cancellation desk is here. The Hero stands between you and it.');
  assert.equal(sealMsg({ type: 'key' }), 'Sealed. A bronze key lies on this floor.');
  assert.equal(sealMsg({ type: 'plates', done: 1, need: 2 }), 'Sealed. Push the blocks onto the glowing plates (1/2).');
  assert.equal(sealMsg({ type: 'riddle' }), 'Sealed. The door has a question. The door has been waiting.');
  assert.equal(sealMsg({ type: 'traps', done: 1, need: 4 }),
    'Sealed. INCIDENT COUNTER: 1/4. The traps ran out of darts years ago. Nobody told the counter. Step on them.');
  assert.equal(sealMsg({ type: 'torch', n: 3 }), 'Sealed. All 3 braziers must burn at once.');
});

test('@ceremony the riddle door (Ceremony seal): first question is about this run, exactly one option correct', () => {
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

test('@ceremony riddle escalation: attempts 1 asks Glurps, attempts 2 asks the floor number', () => {
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

test('@ceremony riddle shame path (attempts >= 3): every option is correct', () => {
  const game = blankGame();
  game.puzzle = { type: 'riddle', solved: false, attempts: 3 };
  const q = nextRiddle(game, mulberry32(6));
  assert.equal(q.q, 'The door sighs. A long one. "What’s… what’s your name."');
  assert.ok(q.shame);
  assert.deepEqual(q.options.map(o => o.label), ['Some Hero', 'TICKET #44,107', 'The new hire']);
  assert.ok(q.options.every(o => o.correct));
});

test('@ceremony answerRiddle: wrong sighs and escalates attempts; right opens the seal', () => {
  const game = blankGame(), fx = spyFx();
  game.puzzle = { type: 'riddle', solved: false, attempts: 0 };

  assert.equal(answerRiddle(game, { correct: false }, fx), 'wrong');
  assert.equal(game.puzzle.attempts, 1);
  assert.ok(doorSigh(1).length > 0);

  assert.equal(answerRiddle(game, { correct: true }, fx), 'solved');
  assert.equal(game.puzzle.solved, true);
  assert.equal(stairsOpen(game), true);
});

test('@ceremony answerRiddle shamed path sets solved=true via answerRiddle, distinct return value "shamed"', () => {
  const game = blankGame(), fx = spyFx();
  game.puzzle = { type: 'riddle', solved: false, attempts: 3 };
  const name = nextRiddle(game, mulberry32(6));
  assert.equal(answerRiddle(game, name.options[0], fx), 'shamed');
  assert.equal(game.puzzle.solved, true);
});

test('@ceremony doorSigh escalates in disappointment with attempts 1/2/3+', () => {
  assert.equal(doorSigh(1), '"…No." The door exhales through a keyhole it does not have.');
  assert.equal(doorSigh(2), '"That is— no. Again, no." The hinges creak in a way that means something.');
  assert.equal(doorSigh(3), '"I learned riddles for this." A pause you can stand in.');
  assert.equal(doorSigh(4), doorSigh(3), 'disappointment tops out at index 2 (min(attempts-1, 2))');
});

test('@ceremony sealed riddle stairs ask the door (onRiddle), never toast, and it is not a zone transition', () => {
  const game = seededGame(24), fx = spyFx();
  enterTomb(game, fx);
  game.puzzle = { type: 'riddle', solved: false, attempts: 0 };
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

test('@ceremony tombQuestLine reads live off the puzzle: "find the stairs" unsealed vs "answer the door" for the riddle', () => {
  const game = blankGame();
  game.puzzle = null;
  game.floorNum = 2;
  assert.equal(tombQuestLine(game), 'Floor 2 · find the stairs');
  game.puzzle = { type: 'riddle', solved: false, attempts: 0 };
  assert.equal(tombQuestLine(game), 'Floor 2 · answer <b>the door</b>');
  game.puzzle.solved = true;
  assert.equal(tombQuestLine(game), 'Floor 2 · <b>stairs open ↓</b>');
});

test('@ceremony BITE: stairsOpen for an unsolved riddle is false, not true — flipping this fails', () => {
  const game = blankGame();
  game.puzzle = { type: 'riddle', solved: false, attempts: 0 };
  assert.equal(stairsOpen(game), false);
  assert.notEqual(stairsOpen(game), true, 'the real value is false — this assertion is the bite');
});
