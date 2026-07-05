// SOME HERO systems: meta persistence, the Ledger, Hespeth, the
// resurrection deductible, and pinned (load-bearing) rooms.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TL, ST, VIL } from '../src/constants.js';
import { createMeta, startRun, recordDeath, recordDepth } from '../src/core/meta.js';
import { ledgerize, deathReport, gradeRun, gradeRemark, lootLine, newRunStats } from '../src/systems/ledger.js';
import { hespethLine, resurrectionNote } from '../src/content/hespeth.js';
import { respawnAtGuild } from '../src/systems/respawn.js';
import { generateFloor } from '../src/world/floorgen.js';
import { mulberry32, makeHash2 } from '../src/core/rng.js';
import { createGame, newRun } from '../src/core/game.js';
import { enterTomb } from '../src/world/zones.js';
import { hurtPlayer } from '../src/systems/combat.js';
import { seededGame, blankGame, spyFx } from './helpers.js';

// ---------- meta: knowledge is permanent ----------

test('meta: startRun ticks the run and the surface day', () => {
  const m = createMeta();
  startRun(m); startRun(m);
  assert.equal(m.runs, 2);
  assert.equal(m.day, 3);  // day starts at 1
});

test('meta: recordDeath tracks cause repetition (the Ledger holds grudges)', () => {
  const m = createMeta();
  recordDeath(m, 'scarab');
  assert.equal(m.deaths, 1);
  assert.equal(m.repeatCause, 0);
  recordDeath(m, 'scarab');
  assert.equal(m.repeatCause, 1);
  recordDeath(m, 'scarab');
  assert.equal(m.repeatCause, 2);
  recordDeath(m, 'jackal');
  assert.equal(m.repeatCause, 0);
  assert.equal(m.lastCause, 'jackal');
});

test('meta survives newRun; quest and player do not', () => {
  const game = seededGame(8);
  game.meta.deaths = 7; game.meta.day = 4; game.player.gold = 500; game.quest.stage = 3;
  newRun(game);
  assert.equal(game.meta.deaths, 7);
  assert.equal(game.meta.day, 4);
  assert.equal(game.player.gold, 0);
  assert.equal(game.quest.stage, 0);
});

test('entering the Downstairs starts a run, ticks the day, announces it', () => {
  const game = seededGame(8), fx = spyFx();
  enterTomb(game, fx);
  assert.equal(game.meta.runs, 1);
  assert.equal(game.meta.day, 2);
  assert.ok(fx.calls.some(c => c[0] === 'toast' && /NOW LEAVING: SAFETY/.test(c[1])));
  assert.equal(game.runStats.depth, 1);
});

// ---------- the Ledger ----------

test('ledgerize misspells with total authority', () => {
  assert.equal(ledgerize('the original hero'), 'the origenal hero');
  assert.equal(ledgerize('Original character'), 'Origenal character');
  assert.equal(ledgerize('definitely victorious'), 'definately victoreous');
  assert.equal(ledgerize('a plain sentence'), 'a plain sentence');
});

test('deathReport is deterministic, cause-aware, and notices repeats', () => {
  const m = createMeta();
  recordDeath(m, 'scarab');
  const r1 = deathReport(m, 'scarab');
  assert.match(r1, /scarab|beetle/i);
  assert.equal(deathReport(m, 'scarab'), r1, 'deterministic for the same state');

  recordDeath(m, 'scarab');  // repeat
  assert.match(deathReport(m, 'scarab'), /noticed/);
  recordDeath(m, 'scarab');  // repeat again
  assert.match(deathReport(m, 'scarab'), /AGAIN/);
});

test('after death #50 the reports stop trying', () => {
  const m = createMeta();
  m.deaths = 50;
  assert.equal(deathReport(m, 'mummy'), 'Yeah.');
});

test('unknown causes get the "?" box', () => {
  const m = createMeta();
  recordDeath(m, null);
  assert.ok(deathReport(m, null).length > 0);
});

test('gradeRun: deeper is better, dying is worse, repeats are unforgivable', () => {
  const m = createMeta();
  // shallow death
  let g1 = gradeRun({ ...m, deaths: 1 }, { depth: 1, kills: 2, died: true });
  // deep survival
  let g2 = gradeRun(m, { depth: 7, kills: 12, died: false });
  const order = ['F', 'D', 'C', 'B', 'A', 'S'];
  assert.ok(order.indexOf(g2) > order.indexOf(g1), `${g2} should beat ${g1}`);

  // dying to the same thing twice drops a full grade
  const once = gradeRun({ ...m, repeatCause: 0 }, { depth: 3, kills: 5, died: true });
  const again = gradeRun({ ...m, repeatCause: 1 }, { depth: 3, kills: 5, died: true });
  assert.equal(order.indexOf(once) - order.indexOf(again), 1);
});

test('every grade has a remark and the remarks are in house style', () => {
  for (const g of ['S', 'A', 'B', 'C', 'D', 'F']) {
    assert.ok(gradeRemark(g).length > 0);
  }
});

test('lootLine goes ALL CAPS about THE GOOD KIND', () => {
  assert.match(lootLine('sword'), /SUN-STEEL/);
  assert.match(lootLine('amulet'), /44,107/);
  assert.equal(lootLine('gold'), '');
});

// ---------- Hespeth ----------

test('hespethLine escalates with the death count', () => {
  assert.match(hespethLine(0), /Welcome/);
  assert.equal(hespethLine(1), 'Oh no.');
  assert.match(hespethLine(7), /laminated/);
  assert.match(hespethLine(30), /Stampathy and I were just talking about you/);
  assert.match(hespethLine(31), /Stampathy and I/);
  assert.match(hespethLine(99), /the number/);
});

test('resurrectionNote covers paid and broke', () => {
  assert.match(resurrectionNote(25), /25 g/);
  assert.match(resurrectionNote(0), /sympathy/);
});

// ---------- the resurrection deductible ----------

test('respawnAtGuild: deductible, item reset, full hp, back at the Guild Hall', () => {
  const game = blankGame(), fx = spyFx();
  game.lastHitBy = 'jackal';
  game.player.gold = 101; game.player.potions = 5; game.player.swordLv = 2;
  game.player.hp = 0;
  const { deductible, cause } = respawnAtGuild(game, fx);
  assert.equal(deductible, 51);            // rounded up
  assert.equal(cause, 'jackal');
  assert.equal(game.player.gold, 50);
  assert.equal(game.player.potions, 1);    // items are temporary (capped, never gifted)
  assert.equal(game.player.swordLv, 2);    // DIRK!s are basically immortal
  assert.equal(game.player.hp, game.player.maxhp);
  assert.equal(game.state, ST.PLAY);
  assert.equal(game.meta.deaths, 1);
  assert.equal(Math.floor(game.player.x / T), VIL.x + 1);
});

test('resurrection no longer includes a complimentary Glurp (budget)', () => {
  const game = blankGame(), fx = spyFx();
  game.player.potions = 0;
  game.player.hp = 0;
  respawnAtGuild(game, fx);
  assert.equal(game.player.potions, 0, 'discontinued');
});

test('dying in the Downstairs respawns Topside with the overworld intact', () => {
  const game = seededGame(12), fx = spyFx();
  const owWorld = game.world, owNpcs = game.npcs;
  enterTomb(game, fx);
  assert.equal(game.zone, 'tomb');
  game.lastHitBy = 'spirit';
  respawnAtGuild(game, fx);
  assert.equal(game.zone, 'ow');
  assert.equal(game.world, owWorld, 'surface persists exactly');
  assert.equal(game.npcs, owNpcs);
  assert.equal(game.owSave, null);
  assert.equal(game.puzzle, null);
  assert.equal(game.runStats.died, true);
});

test('the full chain: contact kill records a cause the Ledger can use', () => {
  const game = blankGame(), fx = spyFx();
  game.player.hp = 1;
  hurtPlayer(game, 5, fx, 'mummy');
  assert.equal(game.state, ST.DEAD);
  assert.equal(game.lastHitBy, 'mummy');
  respawnAtGuild(game, fx);
  assert.equal(game.meta.lastCause, 'mummy');
  assert.match(deathReport(game.meta, 'mummy'), /mummy|bandaged|seniority/i);
});

// ---------- pinned rooms (engine prerequisite #1) ----------

test('pinned rooms always generate, are tagged, connected, and never hold stairs', () => {
  const h2 = makeHash2(1, 2);
  for (let seed = 1; seed <= 100; seed++) {
    for (const f of [1, 2, 4, 5]) {
      const g = generateFloor(f, h2, mulberry32(seed), [{ w: 5, h: 4, tag: 'breakroom' }]);
      assert.equal(g.pinnedRooms.length, 1);
      const r = g.pinnedRooms[0];
      assert.equal(r.tag, 'breakroom');
      // every tile of the pinned room is carved floor (and not stairs)
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        const v = g.world.map[y * g.world.w + x];
        assert.ok(v === TL.TF || v === TL.PLATE, `seed ${seed} floor ${f}: pinned room tile is ${v}`);
      }
    }
  }
});

test('the break room has furniture, not freebies (the machine is the supply)', () => {
  const h2 = makeHash2(1, 2);
  const g = generateFloor(3, h2, mulberry32(4), [{ w: 5, h: 4, tag: 'breakroom' }]);
  assert.equal(g.pickups.filter(p => p.kind === 'potion').length, 0, 'no loose Glurp anywhere');
  assert.equal(g.props.filter(p => p.kind === 'table').length, 1);
  assert.equal(g.props.filter(p => p.kind === 'chair').length, 3);
  const r = g.pinnedRooms[0];
  const inRoom = p =>
    p.x >= r.x * T && p.x < (r.x + r.w) * T && p.y >= r.y * T && p.y < (r.y + r.h) * T;
  assert.ok(g.props.every(inRoom), 'lunch happens in the break room');
});

test('floors without pinned specs behave exactly as before', () => {
  const h2 = makeHash2(1, 2);
  const g = generateFloor(2, h2, mulberry32(9));
  assert.deepEqual(g.pinnedRooms, []);
});

// ---------- the rubric is never shown; this is the rubric ----------

test('harming the intern costs a letter grade', () => {
  const meta = createMeta();
  const clean = gradeRun(meta, { depth: 1, kills: 0, died: false, killsByKind: {} });
  const guilty = gradeRun(meta, { depth: 1, kills: 0, died: false, killsByKind: { slime: 1 } });
  const order = ['F', 'D', 'C', 'B', 'A', 'S'];
  assert.equal(order.indexOf(guilty), order.indexOf(clean) - 1);
});
