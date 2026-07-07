/* ── some-hero content pack — public surface (DELTA S1 PR1).
   Re-exports the builder API. `compileContentPack()` is the one call a
   consumer needs: it assembles the source pack (entities.mjs's
   ENTITY_DEFS + guild-hall-map.mjs's GUILD_HALL_MAP, `tables: []` this
   PR) and compiles it through @golem-engine/content, returning the same
   CompileResult compile() itself returns (`{ ok: true, pack: RuntimePack
   }` or `{ ok: false, errors }`). */

export { buildSourcePack, compileContentPack } from "./build-pack.mjs";
export { ENTITY_DEFS } from "./entities.mjs";
export { GUILD_HALL_MAP } from "./guild-hall-map.mjs";
