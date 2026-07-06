# @golem-engine/language

L1 (DELTA §L1): the tier-1 deterministic parser. Verb/alias/direction
grammar + noun grounding against an injected affordance set — no ML
model, no scoring function, table-driven and synchronous throughout
("go north"/"n"/"walk north" all resolve in well under 1ms). See
`docs/superpowers/specs/2026-07-06-l1-language-parser-design.md` for the
full design this package implements verbatim.

Public surface (`src/index.ts`): `parse(utterance, opts?)` plus the
`Affordance`/`ParseOptions`/`Intent`/`CanonicalVerb`/`ParseOk`/`ParseFail`/
`ParseResult` types. `tables.ts`/`tokenize.ts`/`ground.ts` are internal —
exercised directly by their own unit tests but not re-exported, so the
package can refactor internals without a breaking change.

`parse()` never touches golem-grid, or any other game, directly: it
returns a game-agnostic `Intent` union; a small per-game adapter (see
`games/golem-grid/src/language-adapter.js`) turns that into the game's
actual wire command (or a client-local action, for `look`).

The parser, intent classifier (L2), twin runtime (WASM), context
compiler, and model pipeline tooling live under later Phase 3/4 tasks —
this package currently only holds L1.

`dist/` is built by this package's `prepare` script (`tsc -p .`), which
root `npm ci`/`npm install` runs automatically. If `dist/` is missing
after a manual wipe, re-run `npm ci` (or `npm install`) at the repo
root rather than calling `tsc` by hand.
