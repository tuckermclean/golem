/* ── adventure content pack assembly (DELTA A3 PR1).
   Mirrors games/some-hero/content/build-pack.mjs and games/
   topdown-puzzle/content/build-pack.mjs: every source here is already a
   hand-authored JS module (entities.mjs's ENTITY_DEFS) — no file IO, no
   YAML parsing, fully synchronous. `tables: []` — no natural table use
   for this PR1 world graph (the bartender-as-Shop mechanic that would
   have wanted one is dropped, see DECISION-LOG.md). `maps: []` —
   adventure is a free-form room graph, not a grid (design spec,
   "Method"); see entities.mjs's Exits/Contains components for the
   graph/placement data instead. */

import { compile } from "@golem-engine/content";
import { ENTITY_DEFS } from "./entities.mjs";

/** Assembles the value @golem-engine/content's compile() expects as
 *  `unknown` (a SourcePack). Pure, synchronous, no IO. */
export function buildSourcePack() {
  return {
    name: "adventure",
    version: 1,
    entities: ENTITY_DEFS,
    tables: [],
    maps: [],
  };
}

/** Builds the source pack and compiles it through @golem-engine/content,
 *  returning the same CompileResult compile() itself returns. */
export function compileContentPack() {
  const source = buildSourcePack();
  return compile(source);
}
