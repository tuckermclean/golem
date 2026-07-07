// Puzzle #2: The Riddle Door That Learned Its Lesson. Ported from
// games/some-hero/legacy/src/systems/riddle.js. rng is injected as a
// parameter, as legacy already does (nextRiddle(game, rng = game.rng)).
//
// tombQuestLine lives here (not in a "quest" module) per the S2a design
// spec's explicit helper list ("riddle.js -> rules/riddle.js: nextRiddle,
// answerRiddle, doorSigh, tombQuestLine") even though its legacy source
// is systems/quest.js:41-56 — the seal-stairs ceremony area exercises it
// alongside the riddle door, so the spec groups it here.

import { tableRows } from "./pack.js";
import { ledgerize } from "./ledger.js";

// riddle.js:11-17 — KIND_NAMES. Excluded from S1's tables: the question
// that uses it is built by runtime string concatenation interpolating a
// resolved kind name (riddle.js:71-78), which content/tables.mjs's own
// header litmus calls out as logic, not a table candidate (same
// exclusion rationale as numberOptions). Ported as a plain literal.
const KIND_NAMES = {
  skeleton: "skeletons", mailbat: "mailbats", consultant: "consultants",
  cabinet: "cabinets", slime: "interns (technically)",
  pigeon: "pigeons", goose: "geese", veteran: "veterans",
  scarab: "scarabs", jackal: "jackals", spirit: "spirits", mummy: "mummies",
};

// table:riddle_questions — 4 static question strings, in riddle.js's own
// attempts-descending branch order: [0] attempts>=3 (riddle.js:47),
// [1] attempts===2 (riddle.js:59), [2] attempts===1 (riddle.js:66),
// [3] attempts===0 no-kills-fallback (riddle.js:80). The attempts===0
// kills-by-kind branch (riddle.js:75) is excluded (see KIND_NAMES above).
const QUESTIONS = tableRows("table:riddle_questions");

// table:riddle_shame_options — the a>=3 branch's options array, verbatim
// (riddle.js:49-53).
const SHAME_OPTIONS = tableRows("table:riddle_shame_options");

// table:riddle_door_sighs — doorSigh's 3 escalating lines (riddle.js:109-111).
const DOOR_SIGHS = tableRows("table:riddle_door_sighs");

/** Build numeric multiple-choice options around the true value. (riddle.js:20-31) */
function numberOptions(value, rng) {
  const set = new Set([value]);
  const candidates = [value + 1, Math.max(0, value - 1), value + 2, value + 3];
  for (const c of candidates) { if (set.size >= 4) break; set.add(c); }
  const opts = [...set].map(n => ({ label: String(n), correct: n === value }));
  for (let i = opts.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

/**
 * The door's next question, scaled (down) by how disappointed it is.
 * (riddle.js:33-83) Table-fed for every static question; the "real
 * question" branch (kills-by-kind) stays logic (see KIND_NAMES above).
 */
export function nextRiddle(game, rng = game.rng) {
  const pz = game.puzzle;
  const a = pz.attempts || 0;
  const rs = game.runStats;

  if (a >= 3) {
    return {
      q: QUESTIONS[0],
      options: SHAME_OPTIONS.map(o => ({ ...o })),
      shame: true,
    };
  }
  if (a === 2) {
    const f = game.floorNum;
    return { q: QUESTIONS[1], options: numberOptions(f, rng) };
  }
  if (a === 1) {
    const n = rs.glurpsDrunk || 0;
    return { q: QUESTIONS[2], options: numberOptions(n, rng) };
  }
  const kinds = Object.keys(rs.killsByKind || {});
  if (kinds.length) {
    const k = kinds[(rng() * kinds.length) | 0];
    return {
      q: ledgerize('"How many ' + (KIND_NAMES[k] || k + "s") + ' has our hero dispatched this run? The Ledger has been counting. So have I."'),
      options: numberOptions(rs.killsByKind[k], rng),
    };
  }
  return { q: QUESTIONS[3], options: numberOptions(rs.kills || 0, rng) };
}

/** Resolve a chosen answer. Returns 'solved' | 'shamed' | 'wrong'. (riddle.js:88-104) */
export function answerRiddle(game, option, fx) {
  const pz = game.puzzle;
  if (!pz || pz.type !== "riddle" || pz.solved) return "solved";
  if (option.correct) {
    pz.solved = true;
    fx.sfx("level");
    if (pz.attempts >= 3) {
      fx.toast(ledgerize("The door opens. It does not say anything else. The Ledger has recorded the name with the wrong spelling, out of solidarity."));
      return "shamed";
    }
    fx.toast('"…Correct." The door grinds open, satisfied. For now.');
    return "solved";
  }
  pz.attempts = (pz.attempts || 0) + 1;
  fx.sfx("douse");
  return "wrong";
}

/** The door's reaction to a wrong answer, by disappointment level. Table-fed. (riddle.js:106-113) */
export function doorSigh(attempts) {
  return DOOR_SIGHS[Math.min(attempts - 1, 2)];
}

/** Live quest line shown while inside the tomb (HTML). (quest.js:41-56) */
export function tombQuestLine(game) {
  let s = "Floor " + game.floorNum + " · ";
  const pz = game.puzzle;
  if (!pz) return s + "find the stairs";
  if (pz.type === "final") {
    return s + (pz.bossDead
      ? "<b>the desk is open ▣</b>"
      : "<b>" + ((game.boss && game.boss.name) || "the Origenal Hero") + "</b>");
  }
  if (pz.type === "warden") {
    return s + ((game.boss && game.boss.dead) ? "<b>stairs open ↓</b>"
      : "<b>performance review: " + ((game.boss && game.boss.name) || "the Warden") + "</b>");
  }
  if (pz.type === "key") return s + (pz.have ? "<b>stairs open ↓</b>" : "find the <b>bronze key</b>");
  if (pz.type === "plates") return s + (pz.solved ? "<b>stairs open ↓</b>" : "plates <b>" + pz.done + " / " + pz.need + "</b>");
  if (pz.type === "riddle") return s + (pz.solved ? "<b>stairs open ↓</b>" : "answer <b>the door</b>");
  if (pz.type === "traps") return s + (pz.solved ? "<b>stairs open ↓</b>" : "incidents <b>" + pz.done + " / " + pz.need + "</b>");
  const lit = game.torches.filter(o => o.lit).length;
  return s + (pz.solved ? "<b>stairs open ↓</b>" : "braziers <b>" + lit + " / " + pz.n + "</b>");
}
