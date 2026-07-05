// The Door Golem of Credential Verification. Bit: agonizing seriousness,
// the suspicion book, and a tiny stamp he is not as good with as Hespeth,
// which haunts him. He inspects everything. He always knows. He can't prove it.

import { swordVerdict } from '../systems/credentials.js';
import { addMenace } from '../core/meta.js';
import { ledgerize } from '../systems/ledger.js';

const CRED_LINES = {
  sword: 'Sword-shaped object: NOT DETECTED. The golem has checked both of your hands. Twice. A man in the west meadow has\u2026 inventory.',
  backstory: 'Tragic backstory: NOT ON FILE. Must be notarized. Clerk Hespeth stamps; the Ledger writes. The Ledger is\u2026 available. Unfortunately.',
  debt: 'Crippling debt: NONE DETECTED. The golem is concerned. Adventurers without debt have options. Options are dangerous. The gift shop extends credit.'
};

/** Blocked at the dungeon mouth: list verdicts, slowly. */
export function entryLines(game, missing) {
  const lines = [
    'HALT. Credential verification. The golem will now verify. Credentials.',
    swordVerdict(game.player.swordLv)
  ];
  for (const m of missing) lines.push(CRED_LINES[m]);
  lines.push('ENTRY: DENIED. The golem takes no pleasure in this. The golem takes no pleasure in anything. It is a compliance feature.');
  return lines;
}

/** The stamp ceremony. The pause is sacred; do not cut the pause. */
export function approvalLines(game) {
  return [
    'HALT. Credential verification. The golem will now verify. Credentials.',
    swordVerdict(game.player.swordLv),
    'Tragic backstory: notarized. The golem read it. The golem does not wish to discuss page two.',
    'Crippling debt: verified. Congratulations.',
    'The golem will now stamp your ticket.',
    '\u2026',
    '\u2026',
    '(He is lining it up.)',
    '\u2026',
    '*stamp*',
    'It is crooked. The golem knows it is crooked. Proceed. PROCEED.'
  ];
}

/** Customs inspection on surfacing with dungeon gold. */
export function customsIntro(gold) {
  return [
    'HALT. Customs. The golem detects approximately\u2026 exactly ' + gold + ' gold of dungeon origin.',
    'The golem will now ask the question. Do you have anything to declare.'
  ];
}

export function declareOutcome(gold) {
  return 'Declared: ' + gold + ' g. Inspected. (He looks at each coin. Individually. It takes a while. It is, somehow, respectful.) Cleared. The golem thanks you for your compliance, which is its love language.';
}

export function smuggleOutcome(game) {
  addMenace(game.meta, 'Undeclared dungeon gold (' + game.runStats.goldGained + ' g). The golem knows.');
  return '"\u2026Nothing to declare." The golem looks at you. The golem looks at the bulge of exactly ' +
    game.runStats.goldGained + ' gold. The golem writes something in a little book. "Cleared," he says, in a voice.';
}

/** Every page is about you. */
export function suspicionBook(meta) {
  if (!meta.menace.length) {
    return ['Page 1: "Subject has done nothing. Yet. The golem finds this suspicious." The rest of the book is blank. There are many pages. They are all about you.'];
  }
  const pages = meta.menace.map((m, i) =>
    ledgerize('Page ' + (i + 1) + ' (Day ' + m.day + '): "' + m.deed + '"'));
  pages.push('There are no other subjects in this book.');
  return pages;
}
