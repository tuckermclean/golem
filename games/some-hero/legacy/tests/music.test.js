// One regime for the whole album: music is diegetic, every track comes
// from somewhere, several sources can be live at once. musicSources and
// sourceGain are pure; playback stays browser-side.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ST } from '../src/constants.js';
import { musicSources, sourceGain } from '../src/audio/music.js';
import { mkBoss } from '../src/entities/boss.js';
import { blankGame } from './helpers.js';

const byName = (list, name) => list.filter(s => s.name === name);

test('the title screen plays Ledger Lightning Bolt, non-spatially, alone', () => {
  const game = blankGame();
  game.state = ST.MENU;
  const s = musicSources(game);
  assert.equal(s.length, 1);
  assert.equal(s[0].name, 'lightning');
  assert.equal(s[0].x, undefined, 'the title screen is its own source');
});

test('topside: the Guild Hall radio AND the gift shop jingle, simultaneously', () => {
  const game = blankGame();
  game.zone = 'ow';
  game.npcs = [
    { name: 'Clerk Hespeth', x: 500, y: 600 },
    { name: "Hespeth's Radio", kind: 'radio', x: 446, y: 600 },
    { name: 'Gift Shop Gnoll', x: 800, y: 600 }
  ];
  const s = musicSources(game);
  assert.equal(byName(s, 'microwave')[0].x, 446, 'the music comes from her radio, not from her');
  assert.equal(byName(s, 'jingle')[0].x, 800, 'the hit single, from the shop');
  assert.equal(s.length, 2, 'both at once — that\'s the album');
});

test('downstairs: Skritch\'s radio plays the music; the machine only hums its ad', () => {
  const game = blankGame();
  game.zone = 'tomb'; game.floorNum = 2;
  game.npcs = [
    { name: 'GLURP-O-MATIC', kind: 'machine', x: 300, y: 300 },
    { name: "Skritch's Radio", kind: 'radio', x: 700, y: 500 }
  ];
  const s = musicSources(game);
  assert.equal(byName(s, 'factory')[0].x, 700, 'the music comes from the radio room');
  assert.equal(byName(s, 'jingle')[0].x, 300, 'the ad comes from the machine');
  assert.equal(byName(s, 'jingle')[0].range, 130, 'the jingle stays close to home');

  // a machine alone is not a music source
  game.npcs = [{ name: 'GLURP-O-MATIC', kind: 'machine', x: 300, y: 300 }];
  assert.equal(byName(musicSources(game), 'factory').length, 0);
});

test('Performance Review radiates from the Warden; floor 12 gets the apocalypse', () => {
  const game = blankGame();
  game.zone = 'tomb'; game.floorNum = 4;
  game.npcs = [
    { name: 'GLURP-O-MATIC', kind: 'machine', x: 300, y: 300 },
    { name: "Skritch's Radio", kind: 'radio', x: 200, y: 900 }
  ];
  game.boss = mkBoss(700, 700);
  let s = musicSources(game);
  assert.equal(byName(s, 'review')[0].x, 700, 'the review follows the reviewer');
  assert.equal(byName(s, 'factory').length, 0, 'the radio defers to the review');
  assert.equal(byName(s, 'jingle').length, 1, 'the machine does not defer to anyone');

  game.floorNum = 12;
  assert.equal(byName(musicSources(game), 'apocalypse').length, 1);

  // a concluded review reverts to the working-stiff station
  game.floorNum = 4;
  game.boss.dead = true;
  assert.equal(byName(musicSources(game), 'factory').length, 1);
});

test('Gumdrop Verdict: the activated Reenactor brings his own accompaniment', () => {
  const game = blankGame();
  game.zone = 'ow';
  game.npcs = [
    { name: 'Clerk Hespeth', x: 500, y: 600 },
    { name: "Hespeth's Radio", kind: 'radio', x: 446, y: 600 }
  ];
  game.boss = mkBoss(900, 200);

  assert.equal(byName(musicSources(game), 'microwave').length, 1, 'asleep: just the radio');
  game.boss.state = 'idle';
  const s = musicSources(game);
  assert.equal(byName(s, 'gumdrop')[0].x, 900, 'the overture follows the performer');
  assert.equal(byName(s, 'microwave').length, 0, 'the radio yields the stage');
  game.boss.state = 'dash';
  assert.equal(byName(musicSources(game), 'gumdrop').length, 1, 'any waking state performs');
  game.boss.dead = true;
  assert.equal(byName(musicSources(game), 'microwave').length, 1, 'the verdict is in; back to the radio');
});

test('sourceGain: full at the source, zero at range, linear between', () => {
  const src = { name: 'factory', x: 0, y: 0, range: 400, max: 0.4 };
  assert.equal(sourceGain(src, 0, 0), 0.4);
  assert.equal(sourceGain(src, 400, 0), 0);
  assert.equal(sourceGain(src, 1000, 0), 0);
  assert.ok(Math.abs(sourceGain(src, 200, 0) - 0.2) < 1e-9);
  assert.equal(sourceGain({ name: 'lightning', max: 0.4 }, 999, 999), 0.4, 'non-spatial ignores distance');
});
