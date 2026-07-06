/* ── topdown-puzzle content pack — public surface (DELTA C2).
   Re-exports the importer's builder API. `compileContentPack()` is the
   one call a consumer needs: it reads every games/topdown-puzzle/
   levels/*.txt file, assembles the source pack (entities.mjs's shared
   templates + one MapSource per level), and compiles it through
   @golem-engine/content, returning the same CompileResult compile()
   itself returns (`{ ok: true, pack: RuntimePack }` or
   `{ ok: false, errors }`). */

export { buildSourcePack, buildMapSource, compileContentPack, loadLevelFiles, mapIdFor, TOKEN_LEGEND, FLOOR } from "./build-pack.mjs";
export { ENTITY_TEMPLATES } from "./entities.mjs";
