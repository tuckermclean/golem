/* ── @golem-engine/language public surface (L1). tables.ts/tokenize.ts/
 * ground.ts are internal — exercised directly by their own unit tests
 * but not re-exported here, so the package can refactor its internals
 * without a breaking change (same posture as @golem-engine/net's
 * transports.ts/messages.ts staying internal to index.ts's curated
 * export list). ─────────────────────────────────────────────────────── */
export { parse } from "./parse.js";
export type { ParseOptions, Intent, ParseOk, ParseFail, ParseResult } from "./parse.js";
export type { Affordance } from "./ground.js";
export type { CanonicalVerb } from "./tables.js";

// L2 (tier-2 intent classifier): route() composes L1's parse() with the
// classifier for the utterances L1 gives up on. See
// docs/superpowers/specs/2026-07-06-l2-intent-classifier-design.md.
// features.ts/classify.ts/router.ts's fillSlot are internal (same
// posture as tables.ts/tokenize.ts/ground.ts) — exercised directly by
// their own unit tests but not re-exported here.
export { route } from "./router.js";
export type { ClassifyResult } from "./classify.js";
