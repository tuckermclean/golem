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
