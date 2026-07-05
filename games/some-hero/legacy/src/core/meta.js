// Persistent meta-state: everything that survives death and respawn.
// "Items are temporary; knowledge is permanent" — this is where the
// permanent half lives. The day counter ticks once per dungeon run
// (engine prerequisite for the Letter to Lesser Pflum, Skritch's
// renovations, and anything else on surface time).

export function createMeta() {
  return {
    deaths: 0,          // lifetime body count (Hespeth tracks this)
    runs: 0,            // dungeon runs started
    day: 1,             // surface day; +1 per dungeon run
    lastCause: null,    // what killed you last time (the Ledger holds grudges)
    repeatCause: 0,     // consecutive deaths to the same cause
    grades: [],         // the Ledger's run grades, in order
    bestDepth: 0,       // deepest floor ever reached
    credentials: {      // Door Golem entry requirements (knowledge: permanent)
      backstory: false, // notarized tragic backstory (the Ledger writes it)
      debt: false       // crippling debt (one purchase on credit suffices)
    },
    golemApproved: false, // the stamp ceremony happens exactly once
    menace: [],           // the Menace Résumé: [{ deed, day }]
    income: 0,            // verified income (Guild payroll; slaying geese is payroll)
    credit: {             // the Guild Revolving Credit Account (systems/credit.js)
      balance: 0,
      score: 650,         // a polite assumption
      missed: 0           // two suspends the account
    },
    // Act II heist triangle: three permanent knowledge tokens needed to cancel
    // the apocalypse. Each is gathered topside; each survives death and newRun.
    heist: {
      skull: false,       // proof of death (the Skull Job via Docent Brell)
      gregory: false,     // security answer — Malgrath's first pet (a rock)
      signature: false    // account-holder signature (menace earns the gauntlet)
    },
    cancelled: false,   // ending A taken: the apocalypse is cancelled
    owner: false        // ending B taken: player becomes the account holder (NG+)
  };
}

/** A dungeon run begins: advance surface time. */
export function startRun(meta) {
  meta.runs++;
  meta.day++;
  return meta;
}

/** Record a death and track cause repetition for the grading rubric. */
export function recordDeath(meta, cause) {
  meta.deaths++;
  if (cause && cause === meta.lastCause) meta.repeatCause++;
  else meta.repeatCause = 0;
  meta.lastCause = cause || null;
  return meta;
}

export function recordDepth(meta, floor) {
  meta.bestDepth = Math.max(meta.bestDepth, floor);
  return meta;
}

/** Document a petty crime. The golem always knows. */
export function addMenace(meta, deed) {
  meta.menace.push({ deed, day: meta.day });
  return meta;
}

/** Grant one heist token by name ('skull', 'gregory', or 'signature'). */
export function grantToken(meta, which) {
  meta.heist[which] = true;
  return meta;
}

/** True only when all three heist tokens are held. */
export function heistComplete(meta) {
  return meta.heist.skull && meta.heist.gregory && meta.heist.signature;
}
