/* ── noun grounding (design doc §"Noun grounding" / "Matching
 * algorithm"). Deterministic, no scoring MODEL — a small ranked set of
 * plain comparisons over a list that in practice never exceeds single
 * digits (whatever's on/adjacent to one tile). ─────────────────────────
 */

/** A dependency the caller provides — packages/language never hardcodes
 * any game's items/lore/players. Shaped to need only a rename/no-op
 * adapter once A1 (Phase 5) lands (see design doc Open Question 2). */
export interface Affordance {
  /** Canonical verb this affordance responds to ("take"|"look"|...).
   * Open vocabulary — grounding only ever filters by exact string
   * equality against the canonical verb already resolved upstream. */
  verb: string;
  /** Opaque identifier the caller hands back to itself once grounded —
   * packages/language never inspects this beyond returning it. */
  target: string;
  /** Primary grounding name, e.g. "lantern", "Bram", "the stone sign". */
  name: string;
  /** Extra synonyms grounding may also match. */
  aliases?: readonly string[];
  /** Default true. Present for forward-compatibility with A1's shape;
   * tier-1 filters out enabled:false affordances before matching. */
  enabled?: boolean;
}

export type GroundResult =
  | { readonly ok: true; readonly target: string }
  | { readonly ok: false; readonly reason: "unknown" }
  | {
      readonly ok: false;
      readonly reason: "ambiguous";
      readonly candidates: readonly string[];
    };

/** Best-of-three scoring for one candidate name (+ its aliases) against
 * an already-normalized, already-filler-stripped noun phrase:
 *   3 — phrase equals the name/an alias, exactly.
 *   2 — phrase is a substring of the name/an alias, or vice versa.
 *   1 — phrase and the name share at least one non-filler token.
 *   0 — no relation.
 * (Filler-stripping already happened upstream, in parse.ts's per-verb
 * slot filling, on both the phrase this function receives and — by
 * construction of the fixture data — the names/aliases authored here;
 * this function does no stripping of its own.) */
function scoreCandidate(phrase: string, name: string, aliases: readonly string[]): number {
  // Affordance names/aliases come from the caller's game state and may
  // carry natural casing (e.g. a player name "Bram"); the phrase arrives
  // already lowercased by parse.ts's upstream normalize() step. Compare
  // case-insensitively so grounding doesn't depend on callers
  // pre-lowercasing their own data.
  const p = phrase.toLowerCase();
  const names = [name, ...aliases].map((n) => n.toLowerCase());
  if (names.some((n) => p === n)) return 3;
  if (names.some((n) => n.includes(p) || p.includes(n))) return 2;
  const phraseTokens = new Set(p.split(" ").filter(Boolean));
  if (names.some((n) => n.split(" ").filter(Boolean).some((t) => phraseTokens.has(t)))) return 1;
  return 0;
}

/** groundNoun(phrase, verb, affordances) -> single match / unknown (max
 * score 0) / ambiguous (tie at the max, score > 0). */
export function groundNoun(
  phrase: string,
  verb: string,
  affordances: readonly Affordance[],
): GroundResult {
  const candidates = affordances.filter((a) => a.enabled !== false && a.verb === verb);
  let bestScore = 0;
  let bestTargets: string[] = [];
  for (const a of candidates) {
    const score = scoreCandidate(phrase, a.name, a.aliases ?? []);
    if (score === 0) continue;
    if (score > bestScore) {
      bestScore = score;
      bestTargets = [a.target];
    } else if (score === bestScore) {
      bestTargets.push(a.target);
    }
  }
  if (bestScore === 0) return { ok: false, reason: "unknown" };
  if (bestTargets.length === 1) return { ok: true, target: bestTargets[0] };
  return { ok: false, reason: "ambiguous", candidates: bestTargets };
}
