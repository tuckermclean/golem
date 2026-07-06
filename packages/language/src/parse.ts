/* ── the parse orchestrator (design doc §"Parse pipeline" step 5
 * onward + §"Output shape"): wires tokenize.ts + tables.ts + ground.ts
 * per canonical verb into the public `parse()` entry point. ───────────
 */
import { DIRECTION_ALIASES, type CanonicalVerb } from "./tables.js";
import { matchVerbPhrase, normalize, stripFillerWords, tokenize } from "./tokenize.js";
import { groundNoun, type Affordance } from "./ground.js";

export interface ParseOptions {
  /** Everything the actor could plausibly name right now. Default []. */
  affordances?: readonly Affordance[];
}

export type Intent =
  | { type: "move"; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { type: "take"; item?: string }
  | { type: "look"; target?: string } // client-local; see design doc
  | { type: "read" }
  | { type: "say"; text: string }
  | { type: "party"; text: string }
  | { type: "whisper"; to: string; text: string }
  | { type: "emote"; text: string };

export type ParseOk = { ok: true; intent: Intent };
export type ParseFail = {
  ok: false;
  reason: "unknown" | "ambiguous" | "empty";
  candidates?: readonly string[];
};
export type ParseResult = ParseOk | ParseFail;

/** Grounds a filler-stripped noun phrase for the move/take/look verbs
 * that support it, translating ground.ts's GroundResult into the
 * matching ParseFail shape when grounding doesn't produce a single hit. */
function groundOrFail(
  phrase: string,
  verb: string,
  affordances: readonly Affordance[],
): { ok: true; target: string } | ParseFail {
  const g = groundNoun(phrase, verb, affordances);
  if (g.ok) return { ok: true, target: g.target };
  if (g.reason === "ambiguous") return { ok: false, reason: "ambiguous", candidates: g.candidates };
  return { ok: false, reason: "unknown" };
}

/** parse(utterance, opts?): pure, synchronous, table-driven text -> Intent
 * mapper (design doc DoD: "go north"/"n"/"walk north" resolve in <1ms —
 * no scoring model, no fallback-through-a-model, no ML anywhere in this
 * file). See the design doc's "Parse pipeline" for the full step list;
 * step numbers below track that document. */
export function parse(utterance: string, opts: ParseOptions = {}): ParseResult {
  const affordances = opts.affordances ?? [];

  // Steps 1-2: normalize + tokenize.
  const tokens = tokenize(normalize(utterance));

  // Step 3: empty check.
  if (tokens.length === 0) return { ok: false, reason: "empty" };

  // Step 4: verb-phrase match (longest-prefix, tokenize.ts).
  const verbMatch = matchVerbPhrase(tokens);

  let verb: CanonicalVerb;
  let rest: readonly string[];
  if (verbMatch) {
    verb = verbMatch.verb;
    rest = verbMatch.rest;
  } else if (tokens.length === 1 && DIRECTION_ALIASES.has(tokens[0])) {
    // Step 5: bare-direction fallback — the ONLY place a bare single
    // utterance can turn into a command without a matched verb phrase.
    verb = "move";
    rest = tokens;
  } else {
    // Step 6: no match at all.
    return { ok: false, reason: "unknown" };
  }

  // Step 7: per-verb slot filling.
  switch (verb) {
    case "move": {
      const stripped = stripFillerWords(rest);
      const dirToken = stripped.find((t) => DIRECTION_ALIASES.has(t));
      if (!dirToken) return { ok: false, reason: "unknown" };
      const { dx, dy } = DIRECTION_ALIASES.get(dirToken)!;
      return { ok: true, intent: { type: "move", dx, dy } };
    }
    case "take": {
      const phrase = stripFillerWords(rest).join(" ");
      if (phrase === "") return { ok: true, intent: { type: "take" } };
      const g = groundOrFail(phrase, "take", affordances);
      if (!g.ok) return g;
      return { ok: true, intent: { type: "take", item: g.target } };
    }
    case "look": {
      const phrase = stripFillerWords(rest).join(" ");
      if (phrase === "") return { ok: true, intent: { type: "look" } };
      const g = groundOrFail(phrase, "look", affordances);
      if (!g.ok) return g;
      return { ok: true, intent: { type: "look", target: g.target } };
    }
    case "read":
      // module.js's own `read` ignores args and auto-detects nearby
      // lore — tier-1 mirrors that. No grounding needed.
      return { ok: true, intent: { type: "read" } };
    case "say":
      // rest re-joined WITHOUT filler-stripping — preserve the
      // player's exact words. Empty text is legal.
      return { ok: true, intent: { type: "say", text: rest.join(" ") } };
    case "party":
      return { ok: true, intent: { type: "party", text: rest.join(" ") } };
    case "whisper": {
      // Target is deliberately NOT groundable through Affordance — see
      // design doc's "Parse pipeline" §whisper. No target token at all
      // => unknown (nothing to send).
      if (rest.length === 0) return { ok: false, reason: "unknown" };
      const [to, ...msgTokens] = rest;
      return { ok: true, intent: { type: "whisper", to, text: msgTokens.join(" ") } };
    }
    case "emote":
      return { ok: true, intent: { type: "emote", text: rest.join(" ") } };
  }
}
