/* ── adventure content pack — public surface (DELTA A3 PR1).
   Re-exports the builder API. `compileContentPack()` is the one call a
   consumer needs: it assembles the source pack (entities.mjs's
   ENTITY_DEFS, `tables: []`, `maps: []`) and compiles it through
   @golem-engine/content, returning the same CompileResult compile()
   itself returns (`{ ok: true, pack: RuntimePack }` or
   `{ ok: false, errors }`). */

export { buildSourcePack, compileContentPack } from "./build-pack.mjs";
export { ENTITY_DEFS } from "./entities.mjs";
