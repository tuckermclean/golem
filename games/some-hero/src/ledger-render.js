/* ── LEDGER-RENDER: the twin-disabled template path (design spec's
   "renderLedger(facts) → string (the template path)"). Consumes the
   RAW FACTS shared/module.js's `narrativeFacts` emits and calls S2a's
   pure rules/ledger.js prose functions to produce the exact same prose
   ledger-text.ceremony.test.js pins — no new prose logic lives here,
   only the bridge from facts to the existing prose selection.

   This is what a host calls to show the Ledger with the twin OFF (law
   10 / S5 check 3); a future twin (L4-L6, S5 check 4) renders from the
   SAME facts instead — narrativeFacts is the one seam both paths share.
   Pure, deterministic: no Math.random/Date.now, no state mutation. */
import { deathReport, gradeRemark } from "../rules/ledger.js";

/** facts -> prose. `facts` is whatever shared/module.js's
 *  narrativeFacts(state, world, event) returned for the event being
 *  narrated; `null` (an event with nothing to say) renders to "". */
export function renderLedger(facts) {
  if (!facts) return "";
  switch (facts.kind) {
    case "death":
      // deathReport(meta, cause) only reads meta.deaths/meta.repeatCause
      // (rules/ledger.js:57-64) — narrativeFacts already computed those
      // as the would-be post-this-death values, so this is a direct,
      // no-op-otherwise pass-through.
      return deathReport({ deaths: facts.deaths, repeatCause: facts.repeatCause }, facts.cause);
    case "grade":
      // gradeRemark(grade) is the Ledger's own accompanying line
      // (rules/ledger.js:93-96); `facts.grade` is already the letter
      // gradeRun computed (narrativeFacts mirrors reduce()'s own call),
      // so there is nothing left to compute here.
      return gradeRemark(facts.grade);
    default:
      return "";
  }
}
