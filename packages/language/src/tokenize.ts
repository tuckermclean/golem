/* ── normalize + tokenize + longest-prefix verb-phrase match (design
 * doc §"Parse pipeline", steps 1-4). ────────────────────────────────────
 *
 * Ordering note (also flagged in tables.ts re: correction B): the
 * verb-phrase match in this file MUST run before any direction/filler
 * handling (which lives in parse.ts's per-verb slot filling). "pick up
 * the lantern" only works because "pick up" is consumed whole, as a
 * two-token verb phrase, right here — before filler-stripping (which no
 * longer treats "up" as filler) or the direction table (which maps bare
 * "up" to north) ever get a look at the remaining tokens. If a bare
 * direction/filler pass ran first, "up" would be misread as a direction
 * or dropped as filler before "pick up" ever got the chance to match as
 * a unit. Pipeline order is therefore fixed: verb-phrase match (this
 * file) -> bare-direction fallback -> per-verb slot filling (parse.ts).
 */
import { FILLER_WORDS, VERB_ALIASES, type CanonicalVerb } from "./tables.js";

/** Step 1: lowercase, trim, strip exactly one trailing !/?/., collapse
 * internal whitespace. */
export function normalize(utterance: string): string {
  const trimmed = utterance.toLowerCase().trim();
  const stripped = trimmed.replace(/[!?.]$/, "");
  return stripped.replace(/\s+/g, " ").trim();
}

/** Step 2: tokenize on whitespace. Empty normalized string -> []
 * (step 3's empty check happens in parse.ts, on this result). */
export function tokenize(normalized: string): string[] {
  return normalized === "" ? [] : normalized.split(" ");
}

export interface VerbMatch {
  readonly verb: CanonicalVerb;
  readonly rest: readonly string[];
}

/** Step 4: try the first two tokens joined by a single space, then the
 * first token alone, against VERB_ALIASES — longest match wins. */
export function matchVerbPhrase(tokens: readonly string[]): VerbMatch | null {
  if (tokens.length === 0) return null;
  if (tokens.length >= 2) {
    const twoToken = `${tokens[0]} ${tokens[1]}`;
    const verb = VERB_ALIASES.get(twoToken);
    if (verb) return { verb, rest: tokens.slice(2) };
  }
  const verb = VERB_ALIASES.get(tokens[0]);
  if (verb) return { verb, rest: tokens.slice(1) };
  return null;
}

/** Used by parse.ts's per-verb slot filling (move/take/look noun
 * phrases only — never say/party/emote/whisper message bodies). */
export function stripFillerWords(tokens: readonly string[]): string[] {
  return tokens.filter((t) => !FILLER_WORDS.has(t));
}
