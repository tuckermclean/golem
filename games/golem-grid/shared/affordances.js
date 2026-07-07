/* ── AFFORDANCES — golem-grid's implementation of @golem-engine/kernel's
   `GameModule.affordances(observation, actor) → readonly Affordance[]`
   hook (DELTA A1; see docs/superpowers/specs/
   2026-07-07-a1-pr2-golem-grid-adopt-design.md). Lives in its OWN file,
   not shared/module.js, because it is the C3 entity overlay's (shared/
   entities.js) first real consumer — module.js/reducer.js must stay
   entitiesOf-free (tests/entities-not-in-callgraph.test.js's ban), so
   `affordances()` importing `entitiesOf` has to live somewhere module.js
   only RE-EXPORTS FROM, never calls into itself. Lifted from src/
   language-adapter.js's proven interim `computeAffordances(S, x, y)`
   (take/look on items+prize, look on nearby lore) — output is byte-
   identical to that function for take/look (tests/
   affordances-menu-parity.test.js is the guardrail) — plus a NEW `read`
   affordance for lore (computeAffordances never had one; handleTap's
   "read the inscription" menu action was hand-rolled directly off
   `dun.lore` until now — see src/input.js).

   Pure, DOM-free, no Math.random/Date.now/eval. `actor` is accepted for
   structural parity with the kernel's `affordances(observation, actor)`
   signature but never read — same "present, deliberately unused" posture
   games/some-hero/shared/module.js's own affordances() documents (A1
   PR1): golem-grid's Obs is already computed FOR one specific actor's
   position (`observation.me`), so there is nothing left for a second
   actor id to disambiguate here. ───────────────────────────────────── */
import { entitiesOf } from "./entities.js";
import { prizeCarrier } from "./reducer.js";

/** observationAt(state, dungeon, me, extra?): builds the Obs bundle
 *  `affordances()` consumes, from real game state — the one place that
 *  calls `entitiesOf` on a caller's behalf (src/input.js and src/
 *  language-adapter.js both use this rather than re-deriving entities
 *  computation themselves).
 *
 *  Obs shape: `{entities, me, seenT, litT, lore, prizeName,
 *  prizeCarried}`. The first four fields are exactly the design doc's
 *  declared Obs shape (`seenT`/`litT` are accepted for forward
 *  structural parity — like computeAffordances before it, `affordances`
 *  below does not yet read them). Two fields are a deliberate, documented
 *  narrowing beyond that list:
 *    - `lore`: raw `dungeon.lore` (a Map). Lore is not an `entitiesOf`
 *      entity (the design doc says so explicitly) so there is nothing
 *      in `entities` to source a "read"/lore-"look" affordance from.
 *    - `prizeName`/`prizeCarried`: `entitiesOf`'s own `entity:prize`
 *      is a deliberately GENERIC overlay entity — `Identity.name` is
 *      literally `"prize"` (locked by tests/entities.test.js), not the
 *      floor's actual flavor text (e.g. "the Final Ledger"), and its
 *      `GridPosition` alone can't distinguish "sitting on the floor,
 *      untaken" from "already carried, coincidentally standing on this
 *      tile" (the entity is present, and positioned at the CARRIER's
 *      tile, either way). `computeAffordances`'s own prize branch reads
 *      both `dun.T.prize` and `!prizeCarrier(st)` directly for exactly
 *      this reason; `affordances()` below still consults
 *      `observation.entities` for the prize entity's *position*
 *      (matching item-lookup's structure) but needs these two fields to
 *      get the name/gating right. Documented, not an oversight. */
export function observationAt(state, dungeon, me, extra = {}) {
  return {
    entities: entitiesOf(state, dungeon),
    me,
    seenT: extra.seenT ?? null,
    litT: extra.litT ?? null,
    lore: dungeon.lore,
    prizeName: dungeon.T.prize,
    prizeCarried: !!prizeCarrier(state),
  };
}

/** affordances(observation, actor) -> Affordance[]. `observation.me` is
 *  the actor's OWN tile (same restriction computeAffordances's header
 *  comment documents: take/prize reach is same-tile only, matching
 *  module.js's `take`; `read`/lore-`look` reach is the same 3x3
 *  neighborhood module.js's `read` checks). Pure w.r.t. its inputs —
 *  builds a fresh array every call, never mutates `observation`. */
export function affordances(observation, actor) {
  void actor; // structurally present for kernel-hook parity; unused — see header.
  const { entities, me, lore, prizeName, prizeCarried } = observation;
  if (!me) return [];
  const out = [];

  for (const e of entities) {
    const pos = e.components.GridPosition;
    if (!pos || pos.x !== me.x || pos.y !== me.y) continue;

    if (e.id.startsWith("entity:item:")) {
      const name = e.components.Identity.name;
      out.push({ verb: "take", target: name, name });
      out.push({ verb: "look", target: `${me.x},${me.y}`, name });
    } else if (e.id === "entity:prize" && !prizeCarried) {
      const bare = prizeName.replace(/^the\s+/i, ""); // "Quiet Bell", for a name-only grounding hit
      out.push({ verb: "take", target: prizeName, name: prizeName, aliases: [bare] });
      out.push({ verb: "look", target: `${me.x},${me.y}`, name: prizeName, aliases: [bare] });
    }
  }

  // read's own 3x3-neighborhood reach (module.js: Math.abs(lx-p.x)<=1 &&
  // Math.abs(ly-p.y)<=1) — mirrored here for BOTH `look`'s grounding
  // (computeAffordances's original behavior) and the new `read`
  // affordance (handleTap's hand-rolled "read the inscription" trigger,
  // now sourceable from here too).
  if (lore) {
    for (const [k] of lore) {
      const [lx, ly] = k.split(",").map(Number);
      if (Math.abs(lx - me.x) <= 1 && Math.abs(ly - me.y) <= 1) {
        out.push({
          verb: "look",
          target: `${lx},${ly}`,
          name: "inscription",
          aliases: ["sign", "writing", "stone"],
        });
        out.push({
          verb: "read",
          target: `${lx},${ly}`,
          name: "inscription",
          aliases: ["sign", "writing", "stone"],
        });
      }
    }
  }

  return out;
}
