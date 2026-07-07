/* ── affordance-consumer helpers (DELTA A1 PR3): two small, pure,
 * illustrative consumers proving `Affordance` (ground.ts) is usable by
 * the two callers named in the A1 brief — a tutorial-hint picker and a
 * twin-grounding fact-feeder — WITHOUT building either a tutorial system
 * or an NPC planner. Both are plain functions over the same `Affordance`
 * shape ground.ts already exports; neither reads `requirements` (opaque
 * to this package) or does I/O of any kind. ───────────────────────────
 */
import type { Affordance } from "./ground.js";

/** nextHint: the tutorial-hint consumer. Picks the single affordance a
 *  tutorial overlay would point at this turn.
 *
 *  Priority is deliberately the simplest deterministic rule that still
 *  respects the caller: INPUT ORDER. The first affordance in the array
 *  with `enabled !== false` wins; ties don't exist because array order
 *  is already a total order. This keeps the decision entirely in the
 *  caller's hands (a game orders its own affordance list however it
 *  wants a hint to be prioritized — e.g. nearest-first, quest-relevant-
 *  first) rather than this game-agnostic package inventing its own
 *  verb-priority table, which would just be a second, competing
 *  ordering the caller would have to fight. Returns null when every
 *  affordance is disabled (or the list is empty) -- "no hint to show"
 *  is a real, expected outcome, not an error. */
export function nextHint(affordances: readonly Affordance[]): Affordance | null {
  for (const a of affordances) {
    if (a.enabled !== false) return a;
  }
  return null;
}

/** slug: shared convention with tools/harvest.js's own `slug()` (multi-
 *  word names underscore-joined) plus lower-casing so the resulting fact
 *  token matches the lowercase-slug convention every other fact token in
 *  this repo already uses (context.ts's `TruthEnvelope`/context.test.js
 *  fixtures: "hall", "crypt_theme", "silver_key" -- never mixed-case).
 *  Affordance names may arrive naturally cased (e.g. player name "Bram",
 *  per ground.ts's own case-insensitive scoreCandidate) -- lower-casing
 *  here is what keeps "Bram" and "bram" the same fact token. */
function slug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

/** affordancesToFacts: the twin-grounding consumer. Maps each ENABLED
 *  affordance to a `can-<verb>:<slug(name)>` fact token suitable for
 *  `compileEnvelope`'s `factUniverse` (context.ts) -- "the world asserts
 *  this capability exists" is exactly the kind of fact the closed-world
 *  complement (`doesNotKnow`) is built to reason about.
 *
 *  A disabled affordance (`enabled === false`) is deliberately NOT
 *  turned into a "can-..." fact: it is not currently an assertable
 *  capability of the world, so asserting it into the universe would let
 *  `doesNotKnow` claim an NPC "doesn't know" something that isn't even
 *  true right now.
 *
 *  Order-stable (first-occurrence order over the input array, matching
 *  context.ts's own `normalizeTokens` idiom) and deduped -- two
 *  affordances that reduce to the same fact token (e.g. the same item
 *  offering both "take" and independently a second "take" affordance
 *  under an alias) collapse to one token, never a repeat. */
export function affordancesToFacts(affordances: readonly Affordance[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of affordances) {
    if (a.enabled === false) continue;
    const token = `can-${a.verb}:${slug(a.name)}`;
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}
