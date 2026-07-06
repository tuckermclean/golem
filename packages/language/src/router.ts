/* ── packages/language/src/router.ts — route(): the L1+L2 composition
 * (design doc §"Routing"). L1's parse() always runs first; L2 only
 * gets a vote on `l1.reason === "unknown"` (orchestrator decision #3
 * — tier-1 always wins outright, "empty"/"ambiguous" both already have
 * a cheaper, defined answer). Output shape is EXACTLY L1's existing
 * ParseResult/Intent union — no new fields, no new `reason` values, no
 * new Intent variant (design doc §"Output shape — unchanged"). ───────
 */
import { parse, type Intent, type ParseOptions, type ParseResult } from "./parse.js";
import { DIRECTION_ALIASES, FILLER_WORDS, VERB_ALIASES } from "./tables.js";
import { normalize, stripFillerWords, tokenize } from "./tokenize.js";
import { groundNoun, type Affordance } from "./ground.js";
import { classifyIntent } from "./classify.js";

/** DELTA's own routing thresholds (design doc §"Routing" + orchestrator
 * decision #2: starting bars, not settled numbers). */
const EXECUTE_THRESHOLD = 0.9;
const GROUND_THRESHOLD = 0.65;

/** The classifier's 8 non-"unknown" labels — exactly L1's Intent
 * union's `type` field, so fillSlot's switch is complete by construction
 * (no `default` needed; TS enforces exhaustiveness). */
type GroundableLabel = Intent["type"];

/** fillSlot(label, utterance, affordances) -> the SAME deterministic
 * grounding machinery L1 already has (tables.ts's DIRECTION_ALIASES/
 * FILLER_WORDS/VERB_ALIASES, ground.ts's groundNoun) — applied more
 * permissively, scanning the WHOLE utterance rather than "the tokens
 * after a matched verb prefix" (design doc §"Routing": the classifier,
 * not a position in the token stream, is what identified the verb).
 * L2 changes *when* grounding runs and *over what span*, never *how*
 * grounding scores candidates (ground.ts is untouched).
 *
 * Exported (not part of index.ts's curated public surface) so the
 * permissive whole-utterance scan can be exercised directly by tests —
 * the same "internal module, tested against dist/ directly" posture
 * tables.test.js/ground.test.js/tokenize.test.js already take with
 * L1's own internals. */
export function fillSlot(
  label: GroundableLabel,
  utterance: string,
  affordances: readonly Affordance[],
): ParseResult {
  const tokens = tokenize(normalize(utterance));
  switch (label) {
    case "move": {
      // "a pathological utterance containing two direction words": first
      // hit (in utterance order) wins, none found -> unknown (design
      // doc Open Question 6 / orchestrator decision #6).
      const dirToken = tokens.find((t) => DIRECTION_ALIASES.has(t));
      if (!dirToken) return { ok: false, reason: "unknown" };
      const { dx, dy } = DIRECTION_ALIASES.get(dirToken)!;
      return { ok: true, intent: { type: "move", dx, dy } };
    }
    case "take":
    case "look": {
      const phrase = stripFillerWords(tokens).join(" ");
      if (phrase === "") {
        return label === "take" ? { ok: true, intent: { type: "take" } } : { ok: true, intent: { type: "look" } };
      }
      const g = groundNoun(phrase, label, affordances);
      if (g.ok) {
        return label === "take"
          ? { ok: true, intent: { type: "take", item: g.target } }
          : { ok: true, intent: { type: "look", target: g.target } };
      }
      if (g.reason === "ambiguous") return { ok: false, reason: "ambiguous", candidates: g.candidates };
      return { ok: false, reason: "unknown" };
    }
    case "read":
      // No slot to fill — module.js's own `read` ignores args (L1
      // mirrors this; see parse.ts's identical "read" case).
      return { ok: true, intent: { type: "read" } };
    case "say":
      // The classifier already told us the shape; the entire
      // (un-stripped, but normalized/tokenized-and-rejoined, matching
      // L1's own say/party/emote convention) utterance becomes `text`.
      return { ok: true, intent: { type: "say", text: tokens.join(" ") } };
    case "party":
      return { ok: true, intent: { type: "party", text: tokens.join(" ") } };
    case "emote":
      return { ok: true, intent: { type: "emote", text: tokens.join(" ") } };
    case "whisper": {
      // Mirrors L1's "next word after the verb is the target" rule:
      // there's no affordance-based grounding for player names here or
      // in L1, so the first token that is neither a filler word nor
      // itself a recognized verb-phrase token is the target.
      const idx = tokens.findIndex((t) => !FILLER_WORDS.has(t) && !VERB_ALIASES.has(t));
      if (idx === -1) return { ok: false, reason: "unknown" };
      const to = tokens[idx];
      const text = tokens.slice(idx + 1).join(" ");
      return { ok: true, intent: { type: "whisper", to, text } };
    }
  }
}

/** The design's `classifyAndGround` pseudocode (§"Routing"), applied
 * verbatim: <0.65 or label "unknown" -> unknown; >=0.90 executes iff
 * grounded, else an honest downgrade (never guesses); the 0.65-0.90
 * medium band executes ONLY if there is exactly one grounded
 * interpretation. say/party/emote never fail to "ground" (no
 * affordance lookup involved), so per orchestrator decision #4 they
 * execute at >=0.65 — intentionally looser than the medium-band gate
 * for move/take/look/whisper, which do have something to disambiguate
 * against. */
function classifyAndGround(utterance: string, opts: ParseOptions): ParseResult {
  const affordances = opts.affordances ?? [];
  const { label, confidence } = classifyIntent(utterance);
  if (label === "unknown" || confidence < GROUND_THRESHOLD) {
    return { ok: false, reason: "unknown" };
  }
  const filled = fillSlot(label as GroundableLabel, utterance, affordances);
  if (confidence >= EXECUTE_THRESHOLD) {
    if (filled.ok) return { ok: true, intent: filled.intent };
    // High label-confidence but slot-fill failed/ambiguous: still can't
    // execute an ungrounded target. Downgrade honestly rather than
    // guess — `filled` is itself a well-formed ParseFail.
    return filled;
  }
  // 0.65 <= confidence < 0.90: execute ONLY if there is exactly one
  // grounded interpretation (DELTA's own phrase, applied literally).
  if (filled.ok) return { ok: true, intent: filled.intent };
  return { ok: false, reason: "unknown" }; // no single grounded reading in the medium band -> don't guess
}

/** route(utterance, opts?) -> ParseResult. The public L2 entry point
 * (design doc §"Routing"):
 *   - l1.ok === true  -> tier-1 already has a structural match; L2
 *     never gets a vote (VISION's "go north never touches the decoder"
 *     is a hard law, not a soft preference).
 *   - l1.reason === "empty" -> nothing to classify, pass through.
 *   - l1.reason === "ambiguous" -> L1 already found a known verb AND a
 *     grounded slot space, just with a tie; that's not the long tail
 *     L2 is for (the existing `feedLine("Did you mean: ...")` hint
 *     already answers it upstream in golem-grid).
 *   - l1.reason === "unknown" -> the ONLY case L2 runs. */
export function route(utterance: string, opts: ParseOptions = {}): ParseResult {
  const l1 = parse(utterance, opts);
  if (l1.ok) return l1;
  if (l1.reason !== "unknown") return l1;
  return classifyAndGround(utterance, opts);
}
