/* ── L1 grammar tables (design doc §"Grammar tables"). Pure data, no
 * logic — tokenize.ts/parse.ts consume these as plain Map/Set lookups.
 *
 * Two corrections locked by the orchestrator's 2026-07-06 review (see
 * the design doc's final "Orchestrator decisions" section) are applied
 * here, not in the earlier draft tables:
 *
 *   A. "w" is NOT a VERB_ALIASES entry for "whisper". As drafted, verb-
 *      match runs before the bare-direction fallback, so a bare "w"
 *      would resolve to whisper (then fail with no target -> unknown)
 *      instead of moving west. Whisper stays reachable via "whisper"/
 *      "tell" (and the untouched /w slash command upstream in
 *      golem-grid). Bare "w" resolves to west — see DIRECTION_ALIASES.
 *
 *   B. "up" is NOT a FILLER_WORDS entry. "up" is a direction (bare "up"
 *      => move north); leaving it as filler broke "go up" (it would
 *      strip to no direction => unknown). The only reason "up" was ever
 *      considered filler ("pick up the X") is already handled because
 *      "pick up" is consumed whole as a two-token verb phrase (see
 *      tokenize.ts's matchVerbPhrase) before filler-stripping ever runs
 *      — "up" never needs to double as filler.
 */

export type CanonicalVerb =
  | "move"
  | "take"
  | "look"
  | "read"
  | "say"
  | "party"
  | "whisper"
  | "emote";

/** Keys may be one or two tokens ("pick up", "look at") — tokenize.ts's
 * matchVerbPhrase does a greedy longest-prefix match (2 tokens, then 1)
 * against this table before anything else runs. */
export const VERB_ALIASES: ReadonlyMap<string, CanonicalVerb> = new Map([
  // move
  ["go", "move"],
  ["walk", "move"],
  ["move", "move"],
  ["head", "move"],
  ["run", "move"],
  ["travel", "move"],
  // take
  ["take", "take"],
  ["get", "take"],
  ["grab", "take"],
  ["pick up", "take"],
  ["pick-up", "take"],
  ["pickup", "take"],
  ["snag", "take"],
  // look / examine (client-local — see design doc's "look has no wire
  // command at all")
  ["look", "look"],
  ["look at", "look"],
  ["examine", "look"],
  ["inspect", "look"],
  ["l", "look"],
  ["x", "look"],
  // read
  ["read", "read"],
  // say / chat
  ["say", "say"],
  ["chat", "say"],
  ["shout", "say"],
  // party
  ["party", "party"],
  // whisper — correction A: "w" deliberately absent, see file header
  ["whisper", "whisper"],
  ["tell", "whisper"],
  // emote
  ["emote", "emote"],
  ["me", "emote"],
]);

export interface DirVec {
  readonly dx: -1 | 0 | 1;
  readonly dy: -1 | 0 | 1;
}

/** Only the four cardinals — "one key, one meaning" (CLAUDE.md) rules
 * out relative left/right-from-facing or intercardinals. */
export const DIRECTION_ALIASES: ReadonlyMap<string, DirVec> = new Map([
  ["north", { dx: 0, dy: -1 }],
  ["n", { dx: 0, dy: -1 }],
  ["up", { dx: 0, dy: -1 }],
  ["↑", { dx: 0, dy: -1 }],
  ["south", { dx: 0, dy: 1 }],
  ["s", { dx: 0, dy: 1 }],
  ["down", { dx: 0, dy: 1 }],
  ["↓", { dx: 0, dy: 1 }],
  ["east", { dx: 1, dy: 0 }],
  ["e", { dx: 1, dy: 0 }],
  ["right", { dx: 1, dy: 0 }],
  ["→", { dx: 1, dy: 0 }],
  ["west", { dx: -1, dy: 0 }],
  ["w", { dx: -1, dy: 0 }],
  ["left", { dx: -1, dy: 0 }],
  ["←", { dx: -1, dy: 0 }],
]);

/** Stripped from noun phrases only (move/take/look targets) — never from
 * say/party/emote/whisper message bodies, which preserve the player's
 * actual words. Correction B: "up" is deliberately absent, see file
 * header. */
export const FILLER_WORDS: ReadonlySet<string> = new Set([
  "the",
  "a",
  "an",
  "to",
  "at",
  "over",
  "there",
  "here",
  "thing",
  "item",
]);
