// THE LEDGER — your Guild-issued auto-biographing ledger. Narrates your
// deeds in heroic prose it is bad at and defensive about. Grades every
// run (unfair, holds grudges, rubric never shown). Misspells with total
// authority and will not be corrected.
//
// All pure functions: deterministic given (meta, runStats), so the
// Ledger's grudges are unit-testable, which it would hate.

// ---- the spelling (authoritative, do not correct) ----
const HOUSE_STYLE = [
  [/\boriginal\b/gi, 'origenal'],
  [/\bdefinitely\b/gi, 'definately'],
  [/\bvictorious\b/gi, 'victoreous'],
  [/\bnemesis\b/gi, 'nemisis']
];

/** Apply the Ledger's house spelling. The Ledger notarized this function. */
export function ledgerize(text) {
  let out = text;
  for (const [re, fix] of HOUSE_STYLE) out = out.replace(re, m =>
    m[0] === m[0].toUpperCase() ? fix[0].toUpperCase() + fix.slice(1) : fix);
  return out;
}

// ---- incident reports ----
const CAUSE_REPORTS = {
  // ---- the Front Office ----
  skeleton: [
    'Cause of death: skeleton. Contributing factor: hubris. Recommended action: less hubris.',
    'Deceased was outperformed by a member of Local 206. The union has filed this under wins.',
    'Cause of death: skeleton. He was on break. He clocked back in for you.'
  ],
  mailbat: [
    'Cause of death: mailbat. The memo was marked URGENT. So, it turns out, was the mailbat.',
    'Employee failed to sign for a delivery. Delivery insisted.',
    'Cause of death: mailbat. Return to sender was not an option. You were the address.'
  ],
  consultant: [
    'Cause of death: consultant. Walls are for employees. It is not an employee. It billed for the hour anyway.',
    'Employee was restructured. The consultant has identified further efficiencies.',
    'Cause of death: consultant. Invoice attached. The invoice is also attached to you.'
  ],
  cabinet: [
    'Cause of death: filing cabinet. Employee has been filed. Under H, for hubris.',
    'Deceased attempted to open archival furniture. The furniture exercised its right to refuse.',
    'Cause of death: cabinet. Per the cabinet: this meeting could have been left closed.'
  ],
  // ---- Greater Pflum ----
  pigeon: [
    'Cause of death: pigeons. Plural. They remember faces, and you started it.',
    'Employee initiated hostilities with a bird. The bird had references.',
    'Cause of death: pigeon. The Safe Workplace banner has been updated. It now has an asterisk.'
  ],
  goose: [
    'Cause of death: goose. The kingdom is a certified Safe Workplace. The goose is not certified anything.',
    'Employee was warned about the goose. By the goose. Repeatedly. At volume.',
    'Cause of death: goose. Recommended action: there is none. It is a goose.'
  ],
  veteran: [
    'Cause of death: veteran. The war ended forty years ago. Someone should tell them. Not you. You tried.',
    'Deceased was mistaken for Malgrath. Posthumous correction filed. Veteran unconvinced.',
    'Cause of death: veteran. They held the line. The line was where you were standing.'
  ],
  'the Reenactor': [
    'Cause of death: the Reenactor. Historically accurate. He checked.',
    'Employee participated in a reenactment. The role of the casualty was played by the employee. Rave reviews.',
    'Cause of death: the Famous Charge, performed daily at noon. Admission was free. It cost everything.'
  ],
  // ---- the retired desert roster (the Ledger never forgets a cause) ----
  scarab: [
    'Cause of death: scarab. Contributing factor: hubris. Recommended action: less hubris.',
    'Employee was outmaneuvered by a beetle. The beetle has been promoted.',
    'Cause of death: scarab (again). The scarab has asked us to stop meeting like this.'
  ],
  jackal: [
    'Cause of death: jackal. Employee attempted to pet the jackal. Jackal did not consent.',
    'Deceased was warned the jackals are faster than they look. They look fast.',
    'Cause of death: jackal. The jackal filed its own report. It is glowing.'
  ],
  spirit: [
    'Cause of death: spirit. Walls were involved. The spirit ignored them. Employee did not.',
    'Employee attempted to negotiate with a ghost. Ghost cited policy.',
    'Cause of death: spirit. Employee is now eligible to apply for the position.'
  ],
  mummy: [
    'Cause of death: mummy. Slow and steady won. Employee was neither.',
    'Deceased underestimated the bandaged gentleman. He has seniority.',
    'Cause of death: mummy. Per the mummy: "kids these days." Per us: yeah.'
  ],
  'the Middle Manager': [
    'Cause of death: per the Middle Manager\'s last attack.',
    'Employee was circled back upon. Action item: do not be there.',
    'Cause of death: meeting that could have been an email. The email also charges.'
  ],
  unknown: [
    'Cause of death: unclear. The form does not have a box for this. We made a box. It says "?".',
    'Employee died of causes. Investigation ongoing. (It is not ongoing.)',
    'Cause of death: the Downstairs. Broadly.'
  ]
};

/**
 * The Ledger writes up your death. Deterministic per (cause, deaths).
 * After death #50 the reports stop trying.
 */
export function deathReport(meta, cause) {
  if (meta.deaths >= 50) return 'Yeah.';
  const pool = CAUSE_REPORTS[cause] || CAUSE_REPORTS.unknown;
  let line = pool[(meta.deaths - 1) % pool.length];
  if (meta.repeatCause === 1) line += ' (Same one as last time. The Ledger noticed.)';
  if (meta.repeatCause >= 2) line += ' (THE SAME ONE. AGAIN. The Ledger is no longer narrating this heroically.)';
  return ledgerize(line);
}

// ---- run grading (rubric never shown; changes when questioned) ----
const GRADES = ['F', 'D', 'C', 'B', 'A', 'S'];

/**
 * Grade a run. Unfair on purpose, but deterministically unfair:
 *  - start at C
 *  - +1 grade per 3 floors of depth
 *  - +1 for a personal-best depth ("EXTREMELY THE GOOD KIND of progress")
 *  - +1 for 10+ kills
 *  - -1 for dying at all; a further -1 for dying to the same thing as last time
 *  - surviving (exited on foot) +1
 *  - -1 for harming the intern. The rubric is never shown. This is the rubric.
 */
export function gradeRun(meta, run) {
  let g = 2; // C
  g += Math.floor(run.depth / 3);
  if (run.depth > 0 && run.depth >= meta.bestDepth) g++;
  if (run.kills >= 10) g++;
  if (run.killsByKind && run.killsByKind.slime) g--;
  if (run.died) {
    g--;
    if (meta.repeatCause >= 1) g--;
  } else {
    g++;
  }
  g = Math.max(0, Math.min(GRADES.length - 1, g));
  return GRADES[g];
}

/** The Ledger's remark to accompany a grade. */
export function gradeRemark(grade) {
  return ledgerize({
    S: 'The Ledger has used its BEST pen.',
    A: 'The Ledger is prepared to call this heroism, with reservations.',
    B: 'Adequate. The king would be proud, which should worry you.',
    C: 'Our hero strode boldly into the— FINE. Walked. The grade stands.',
    D: 'The Ledger has written this page in pencil, out of mercy.',
    F: 'The Ledger is not angry. The Ledger is documenting.'
  }[grade]);
}

/** Loot the Ledger considers EXTREMELY THE GOOD KIND. */
export function lootLine(kind) {
  return ledgerize({
    sword: 'SUN-STEEL. AN ACTUAL SWORD. EXTREMELY THE GOOD KIND. The Ledger is pressing very hard with the pen.',
    maxheart: 'CONSTITUTION INCREASE. The Ledger has underlined it twice.',
    amulet: 'TICKET #44,107: STAMPED. The Ledger is doing a voice. It is the same voice.'
  }[kind] || '');
}

/** Stratum I monsters are unionized. The union has a newsletter. */
export function union206Line() {
  return ledgerize('The deceased was a dues-paying member of Rattling Brotherhood Local 206. The union has been notified. The union has a newsletter.');
}

/** The slime was not a member. The slime was an intern. */
export function internLine() {
  return ledgerize('It was an intern. It was TECHNICALLY doing its best. The Ledger has noted this. The Ledger will keep noting it.');
}

/** Fresh per-run stats. The riddle door and customs both read from this. */
export function newRunStats() {
  return { depth: 0, kills: 0, died: false, killsByKind: {}, glurpsDrunk: 0, goldGained: 0 };
}
