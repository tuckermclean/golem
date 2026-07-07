/* ── some-hero Ceremony content pack assembly (DELTA S1 PR1).
   Unlike games/topdown-puzzle/content/build-pack.mjs (which reads
   levels/*.txt off disk), every source here is already a hand-authored
   JS module — entities.mjs's ENTITY_DEFS, guild-hall-map.mjs's
   GUILD_HALL_MAP — so assembling the source pack needs no file IO and
   stays fully synchronous. `tables: []` this PR (schema-legal; PR2
   fills it in per the design spec's PR decomposition). */

import { compile } from "@golem-engine/content";
import { ENTITY_DEFS } from "./entities.mjs";
import { GUILD_HALL_MAP } from "./guild-hall-map.mjs";

/** Assembles the value @golem-engine/content's compile() expects as
 *  `unknown` (a SourcePack). Pure, synchronous, no IO. */
export function buildSourcePack() {
  return {
    name: "some-hero",
    version: 1,
    entities: ENTITY_DEFS,
    tables: [],
    maps: [GUILD_HALL_MAP],
  };
}

/** Builds the source pack and compiles it through @golem-engine/content,
 *  returning the same CompileResult compile() itself returns. */
export function compileContentPack() {
  const source = buildSourcePack();
  return compile(source);
}
