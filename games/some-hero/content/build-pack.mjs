/* ── some-hero Ceremony content pack assembly (DELTA S1 PR2).
   Unlike games/topdown-puzzle/content/build-pack.mjs (which reads
   levels/*.txt off disk), every source here is already a hand-authored
   JS module — entities.mjs's ENTITY_DEFS, tables.mjs's TABLE_DEFS,
   guild-hall-map.mjs's GUILD_HALL_MAP — so assembling the source pack
   needs no file IO and stays fully synchronous. `tables: []` was PR1's
   schema-legal placeholder; PR2 (this change) wires in the real
   Ledger/Door-Golem/seal/riddle/floors copy per the design spec's PR
   decomposition. */

import { compile } from "@golem-engine/content";
import { ENTITY_DEFS } from "./entities.mjs";
import { TABLE_DEFS } from "./tables.mjs";
import { GUILD_HALL_MAP } from "./guild-hall-map.mjs";

/** Assembles the value @golem-engine/content's compile() expects as
 *  `unknown` (a SourcePack). Pure, synchronous, no IO. */
export function buildSourcePack() {
  return {
    name: "some-hero",
    version: 1,
    entities: ENTITY_DEFS,
    tables: TABLE_DEFS,
    maps: [GUILD_HALL_MAP],
  };
}

/** Builds the source pack and compiles it through @golem-engine/content,
 *  returning the same CompileResult compile() itself returns. */
export function compileContentPack() {
  const source = buildSourcePack();
  return compile(source);
}
