// Content smoke tests for dialogue that mutates state. The dialog box is
// stubbed (it's DOM-side); we only need say()'s after-callback semantics.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { talkTo } from '../src/content/dialogue.js';
import { blankGame, spyFx } from './helpers.js';
import { addMenace, grantToken } from '../src/core/meta.js';
import { MENACE_THRESHOLD } from '../src/systems/heist.js';
import { ST } from '../src/constants.js';

function stubDialog() {
  const log = [];
  return {
    log,
    say(name, lines, after) { log.push({ name, lines }); if (after) after(); },
    setSpeaker() {}, setText(t) { log.push({ text: t }); },
    open() {}, showHint() {}, choice(opts) { log.push({ opts }); }
  };
}

test('Hermit Gorse grants Pointy once, while stickless, and is re-talkable', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  game.player.swordLv = 0;
  talkTo({ name: 'Hermit Gorse' }, game, dlg, fx);
  assert.equal(game.player.swordLv, 1, 'Pointy granted');
  assert.match(fx.last('toast')[1], /Pointy/);

  // with a stick (or better) in hand, he just asks after her
  talkTo({ name: 'Hermit Gorse' }, game, dlg, fx);
  assert.equal(game.player.swordLv, 1);
  game.player.swordLv = 3;
  talkTo({ name: 'Hermit Gorse' }, game, dlg, fx);
  assert.equal(game.player.swordLv, 3, 'never downgrades');
});

test('the GLURP-O-MATIC: hazard pricing, credit at your APR, futile kicks', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  const machine = { name: 'GLURP-O-MATIC', kind: 'machine' };

  // cash sale at hazard pricing (topside is 20; down here is 35)
  game.player.gold = 40;
  talkTo(machine, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /Insert/.test(o.label)).fn();
  assert.equal(game.player.potions, 1);
  assert.equal(game.player.gold, 5, '35 g. the hazard is ambient.');

  // credit requires income (the machine reads the same form)
  talkTo(machine, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /credit/.test(o.label)).fn();
  assert.equal(game.meta.credit.balance, 0, 'declined: no verifiable income');
  game.meta.income = 15;
  talkTo(machine, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /credit/.test(o.label)).fn();
  assert.equal(game.meta.credit.balance, 35, 'financed at hazard pricing');
  assert.equal(game.player.potions, 2);

  // the kick is documented and yields nothing. it has never yielded anything.
  for (let i = 0; i < 5; i++) {
    talkTo(machine, game, dlg, fx);
    dlg.log.at(-1).opts.find(o => /KICK/.test(o.label)).fn();
  }
  assert.equal(game.meta.menace.length, 5);
  assert.match(game.meta.menace[0].deed, /vending machine/);
  assert.equal(game.player.potions, 2, 'nothing drops. nothing has ever dropped.');
});

test("Skritch's radio: touching it is documented; respecting the note is not", () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  const radio = { name: "Skritch's Radio", kind: 'radio' };
  talkTo(radio, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /TOUCH/.test(o.label)).fn();
  assert.equal(game.meta.menace.length, 1);
  assert.match(game.meta.menace[0].deed, /note specifically said/);

  talkTo(radio, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /Respect/.test(o.label)).fn();
  assert.equal(game.meta.menace.length, 1, 'restraint goes undocumented');
});

test("Hespeth's radio: the dial is settled law; touching it is documented", () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  talkTo({ name: "Hespeth's Radio", kind: 'radio' }, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /Touch the dial/.test(o.label)).fn();
  assert.equal(game.meta.menace.length, 1);
  assert.match(game.meta.menace[0].deed, /Stampathy saw/);
});

// ---- Skull (Docent Brell) ----

test('Brell: three agrees → skull granted', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  // opening say → click through → review plaques choice
  talkTo({ name: 'Docent Brell' }, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /Review/.test(o.label)).fn();
  // three agree rounds
  for (let i = 0; i < 3; i++) {
    dlg.log.at(-1).opts.find(o => /absolutely right/.test(o.label)).fn();
  }
  assert.equal(game.meta.heist.skull, true, 'skull granted after three agrees');
  assert.equal(fx.count('sfx'), 1, 'a level-up sfx fires');
});

test('Brell: stealing the skull grants it and adds menace', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  talkTo({ name: 'Docent Brell' }, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /Just take/.test(o.label)).fn();
  assert.equal(game.meta.heist.skull, true, 'skull granted via theft');
  assert.ok(game.meta.menace.some(m => /museum/.test(m.deed)), 'menace documented');
});

test('Brell: correcting her does not advance the agree count', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  talkTo({ name: 'Docent Brell' }, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /Review/.test(o.label)).fn();
  dlg.log.at(-1).opts.find(o => /plaque seems fine/.test(o.label)).fn();  // correct her
  assert.equal(game.meta.heist.skull, false, 'correction does not grant skull');
});

// ---- Gregory / Malgrath's Mother ----

test("Malgrath's Mother: naming Gregory grants the token", () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  talkTo({ name: "Malgrath's Mother" }, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /Gregory/.test(o.label)).fn();
  assert.equal(game.meta.heist.gregory, true, 'gregory token granted');
  assert.equal(fx.count('sfx'), 1, 'sfx fires');
});

test("Malgrath's Mother: wrong answers do not grant the token", () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  talkTo({ name: "Malgrath's Mother" }, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /goose/.test(o.label)).fn();
  assert.equal(game.meta.heist.gregory, false, 'wrong answer — not granted');
});

test('Gregory: talks, reflects meta knowledge', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  talkTo({ name: 'Gregory' }, game, dlg, fx);
  assert.ok(dlg.log.length > 0, 'dialogue runs');
  // with meta known:
  game.meta.heist.gregory = true;
  const dlg2 = stubDialog();
  talkTo({ name: 'Gregory' }, game, dlg2, fx);
  assert.ok(dlg2.log[0].lines.join('').includes('calm'), 'flavor reflects known Gregory');
});

// ---- Gauntlet ----

test('gauntlet: insufficient menace → no grant', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  addMenace(game.meta, 'just one');
  talkTo({ name: "Malgrath's Gauntlet" }, game, dlg, fx);
  assert.equal(game.meta.heist.signature, false, 'not enough menace');
  assert.ok(dlg.log[0].lines.join('').includes('INSUFFICIENT'));
});

test('gauntlet: enough menace → signature granted', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  for (let i = 0; i < MENACE_THRESHOLD; i++) addMenace(game.meta, 'crime ' + i);
  talkTo({ name: "Malgrath's Gauntlet" }, game, dlg, fx);
  assert.equal(game.meta.heist.signature, true, 'signature granted');
  assert.equal(fx.count('sfx'), 1, 'sfx fires');
});

// ---- petty crime interactables ----

test('Royal Grass Sign: crossing adds menace once', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  talkTo({ name: 'Royal Grass Sign' }, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /Cross/.test(o.label)).fn();
  assert.equal(game.meta.menace.length, 1);
  assert.match(game.meta.menace[0].deed, /royal grass/);
});

test('Museum Exhibit Tag: removing adds menace', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  talkTo({ name: 'Museum Exhibit Tag' }, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /Remove it/.test(o.label)).fn();
  assert.equal(game.meta.menace.length, 1);
  assert.match(game.meta.menace[0].deed, /DO NOT REMOVE/);
});

// ---- Cancellation Desk ----

test('desk: before boss dead, reports the Hero is still here', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  game.puzzle = { type: 'final', bossDead: false };
  grantToken(game.meta, 'skull'); grantToken(game.meta, 'gregory'); grantToken(game.meta, 'signature');
  talkTo({ name: 'Cancellation Desk' }, game, dlg, fx);
  assert.ok(dlg.log[0].lines.join('').toLowerCase().includes('hero'), 'hero mentioned');
  assert.equal(game.meta.cancelled, false, 'no ending yet');
});

test('desk: after boss dead, incomplete triangle → reports missing tokens', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  game.puzzle = { type: 'final', bossDead: true };
  // only skull granted
  grantToken(game.meta, 'skull');
  talkTo({ name: 'Cancellation Desk' }, game, dlg, fx);
  const text = dlg.log.map(e => e.lines ? e.lines.join(' ') : '').join(' ');
  assert.ok(text.includes('Gregory') || text.includes('Signature') || text.toLowerCase().includes('missing'), 'missing tokens reported');
  assert.equal(game.meta.cancelled, false);
});

test('desk: all tokens + bossDead → Cancel choice applies cancel ending', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  game.puzzle = { type: 'final', bossDead: true };
  grantToken(game.meta, 'skull'); grantToken(game.meta, 'gregory'); grantToken(game.meta, 'signature');
  talkTo({ name: 'Cancellation Desk' }, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /Cancel everything/.test(o.label)).fn();
  assert.equal(game.meta.cancelled, true, 'cancelled set');
  assert.equal(game.state, ST.WIN, 'state is WIN');
  assert.equal(fx.count('onEpilogue'), 1, 'epilogue effect called');
});

test('desk: all tokens + bossDead → Transfer choice applies transfer ending', () => {
  const game = blankGame(), fx = spyFx(), dlg = stubDialog();
  game.puzzle = { type: 'final', bossDead: true };
  grantToken(game.meta, 'skull'); grantToken(game.meta, 'gregory'); grantToken(game.meta, 'signature');
  talkTo({ name: 'Cancellation Desk' }, game, dlg, fx);
  dlg.log.at(-1).opts.find(o => /Transfer ownership/.test(o.label)).fn();
  assert.equal(game.meta.owner, true, 'owner set');
  assert.equal(fx.count('onTransfer'), 1, 'transfer effect called');
});
