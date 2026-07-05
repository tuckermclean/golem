import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHunt, recordPestKill, claimReward, completeQuest, questLabel, tombQuestLine } from '../src/systems/quest.js';
import { blankGame } from './helpers.js';

test('full quest arc: 0 -> hunt -> claim -> seek -> done', () => {
  const game = blankGame();
  const q = game.quest;
  assert.equal(q.stage, 0);

  startHunt(q);
  assert.equal(q.stage, 1);
  assert.equal(q.kills, 0);

  for (let i = 0; i < q.need; i++) assert.equal(recordPestKill(q), true);
  assert.equal(q.stage, 2);

  const goldBefore = game.player.gold;
  claimReward(game);
  assert.equal(game.player.gold, goldBefore + 15);
  assert.equal(game.meta.income, 15, 'the bounty is payroll: it verifies income');
  assert.equal(q.stage, 3);

  completeQuest(q);
  assert.equal(q.stage, 4);
});

test('recordPestKill is a no-op outside the hunt stage', () => {
  const q = { stage: 0, kills: 0, need: 5 };
  assert.equal(recordPestKill(q), false);
  q.stage = 3;
  assert.equal(recordPestKill(q), false);
  assert.equal(q.kills, 0);
});

test('questLabel matches each stage', () => {
  assert.match(questLabel({ stage: 0 }), /Clerk Hespeth/);
  assert.match(questLabel({ stage: 0 }), /44,107/);
  assert.match(questLabel({ stage: 1, kills: 2, need: 5 }), /2 \/ 5/);
  assert.match(questLabel({ stage: 2 }), /Return/);
  assert.match(questLabel({ stage: 3 }), /Reenactor/);
  assert.match(questLabel({ stage: 4 }, 0), /apocalypse/);
  assert.match(questLabel({ stage: 4 }, 6), /depth 6/);
});

test('tombQuestLine reflects each puzzle type and solved state', () => {
  const game = blankGame();
  game.floorNum = 3;

  game.puzzle = null;
  assert.match(tombQuestLine(game), /find the stairs/);

  game.puzzle = { type: 'warden' };
  game.boss = { dead: false };
  assert.match(tombQuestLine(game), /the Warden/);
  game.boss.dead = true;
  assert.match(tombQuestLine(game), /stairs open/);

  game.puzzle = { type: 'key', have: false };
  assert.match(tombQuestLine(game), /bronze key/);
  game.puzzle.have = true;
  assert.match(tombQuestLine(game), /stairs open/);

  game.puzzle = { type: 'plates', done: 1, need: 3, solved: false };
  assert.match(tombQuestLine(game), /1 \/ 3/);

  game.puzzle = { type: 'torch', n: 4, solved: false };
  game.torches = [{ lit: true }, { lit: false }, { lit: true }, { lit: false }];
  assert.match(tombQuestLine(game), /2 \/ 4/);

  game.puzzle = { type: 'traps', done: 1, need: 4, solved: false };
  assert.match(tombQuestLine(game), /incidents/);
  assert.match(tombQuestLine(game), /1 \/ 4/);
  game.puzzle.solved = true;
  assert.match(tombQuestLine(game), /stairs open/);
});
