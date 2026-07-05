// Puzzle #2: The Riddle Door That Learned Its Lesson.
// It asks about things that happened THIS RUN — solutions are information,
// so the puzzle coexists with permadeath instead of fighting it.
//
// Wrong answers: the door sighs and asks an easier one, more disappointed
// each time. Third wrong answer, it just asks your name, and being asked
// your name by a disappointed door is a worse punishment than damage.

import { ledgerize } from './ledger.js';

const KIND_NAMES = {
  skeleton: 'skeletons', mailbat: 'mailbats', consultant: 'consultants',
  cabinet: 'cabinets', slime: 'interns (technically)',
  pigeon: 'pigeons', goose: 'geese', veteran: 'veterans',
  // retired desert roster
  scarab: 'scarabs', jackal: 'jackals', spirit: 'spirits', mummy: 'mummies'
};

/** Build numeric multiple-choice options around the true value. */
function numberOptions(value, rng) {
  const set = new Set([value]);
  const candidates = [value + 1, Math.max(0, value - 1), value + 2, value + 3];
  for (const c of candidates) { if (set.size >= 4) break; set.add(c); }
  const opts = [...set].map(n => ({ label: String(n), correct: n === value }));
  // shuffle
  for (let i = opts.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

/**
 * The door's next question, scaled (down) by how disappointed it is.
 * attempts 0: a real question about this run.
 * attempts 1: an easier one (consumables).
 * attempts 2: the floor number. It is written on the door.
 * attempts 3+: it just asks your name. Every answer is correct. It knows.
 */
export function nextRiddle(game, rng = game.rng) {
  const pz = game.puzzle;
  const a = pz.attempts || 0;
  const rs = game.runStats;

  if (a >= 3) {
    return {
      q: 'The door sighs. A long one. "What\u2019s\u2026 what\u2019s your name."',
      options: [
        { label: 'Some Hero', correct: true },
        { label: 'TICKET #44,107', correct: true },
        { label: 'The new hire', correct: true }
      ],
      shame: true
    };
  }
  if (a === 2) {
    const f = game.floorNum;
    return {
      q: '"Fine. What floor is this." (It is written on the door. The door knows you won\u2019t check.)',
      options: numberOptions(f, rng)
    };
  }
  if (a === 1) {
    const n = rs.glurpsDrunk || 0;
    return {
      q: '"Easier, then. How many Glurps has our hero consumed this run?" (See label.)',
      options: numberOptions(n, rng)
    };
  }
  // a real question: pick a kind killed this run, or fall back to total kills
  const kinds = Object.keys(rs.killsByKind || {});
  if (kinds.length) {
    const k = kinds[(rng() * kinds.length) | 0];
    return {
      q: ledgerize('"How many ' + (KIND_NAMES[k] || k + 's') + ' has our hero dispatched this run? The Ledger has been counting. So have I."'),
      options: numberOptions(rs.killsByKind[k], rng)
    };
  }
  return {
    q: '"How many foes has our hero dispatched this run? Counting is heroic. Probably."',
    options: numberOptions(rs.kills || 0, rng)
  };
}

/**
 * Resolve a chosen answer. Returns 'solved' | 'shamed' | 'wrong'.
 */
export function answerRiddle(game, option, fx) {
  const pz = game.puzzle;
  if (!pz || pz.type !== 'riddle' || pz.solved) return 'solved';
  if (option.correct) {
    pz.solved = true;
    fx.sfx('level');
    if (pz.attempts >= 3) {
      fx.toast(ledgerize('The door opens. It does not say anything else. The Ledger has recorded the name with the wrong spelling, out of solidarity.'));
      return 'shamed';
    }
    fx.toast('"\u2026Correct." The door grinds open, satisfied. For now.');
    return 'solved';
  }
  pz.attempts = (pz.attempts || 0) + 1;
  fx.sfx('douse');
  return 'wrong';
}

/** The door's reaction to a wrong answer, by disappointment level. */
export function doorSigh(attempts) {
  return [
    '"\u2026No." The door exhales through a keyhole it does not have.',
    '"That is\u2014 no. Again, no." The hinges creak in a way that means something.',
    '"I learned riddles for this." A pause you can stand in.'
  ][Math.min(attempts - 1, 2)];
}
