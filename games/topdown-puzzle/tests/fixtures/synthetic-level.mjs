/* ── PR1 MECHANISM-PROOF LEVEL — NOT one of the "≥5 legacy levels" DELTA
   C4's DoD asks for.

   PR1 does not simulate baddies or moving blocks (that is PR2's tick
   bridge), so its solution-log fixture needs a level whose tokens are
   only `# @ B D` and optionally `M` — no `H V E W N S`. Every one of the
   six real games/topdown-puzzle/levels/*.txt files fails that test: per
   games/topdown-puzzle/levels/manifest.json, every single one carries at
   least one `H` or `V` baddie token (001: H=1,V=1; 002: H=1,V=2; 003:
   H=9; 004: H=4,V=2; 005: V=2; 006: H=2,V=2). Per the design doc's
   orchestrator decision #7 ("do NOT fake it... a small SYNTHETIC
   mover-free level... under games/topdown-puzzle/levels/ or a test
   fixtures dir"), this file is that synthetic level, living under
   tests/fixtures/ rather than games/topdown-puzzle/levels/ specifically
   so it stays invisible to:
     - games/topdown-puzzle/content/build.mjs / the committed content/
       pack.json (which must stay EXACTLY what C2's unmodified
       compileContentPack() produces from the real six levels)
     - packages/testkit/tools/gen-tdp-snapshots.mjs /
       verify-tdp-snapshots.mjs (the frozen P0.3 parse-snapshot triad,
       part of `npm run freeze:verify` — this file must not add a 7th
       snapshot to that gate)

   This level is compiled independently, through @golem-engine/content's
   own compile() (imported directly, same as every other consumer) fed a
   tiny one-map SourcePack built from C2's own, unmodified
   buildMapSource()/ENTITY_TEMPLATES helpers — no forked parsing logic,
   just a different (smaller, synthetic) input. Its only purpose is
   proving the full solution-log fixture toolchain (authored .moves.json
   -> generated log -> finalHash -> verifier, see packages/testkit/tools/
   gen-tdp-solution-fixtures.mjs / verify-tdp-solution-fixtures.mjs) on
   the smallest possible surface before PR4 repeats it for ≥5 real
   levels, once PR2's tick bridge makes a baddie-carrying level's
   solution log meaningful.

   Layout (6 rows x 6 cols; see games/topdown-puzzle/tests/solutions/
   synthetic-pr1.moves.json for the hand-verified winning route):

     ######
     #@ B #      @ player (1,1)   B block (3,1)
     #  D #      D diamond (3,2)
     #M   #      M memory hole (1,3) — present so deriveWorld's
     #    #        wall/memoryHole bucketing is exercised even though
     ######        the winning route never steps on it

   The winning route (down, right, right) walks the player onto the
   diamond directly — collected on the spot per tryMove's own rule,
   never needing to push the block or approach the memory hole — which
   is exactly why this level needs no BFS to solve by hand: it is small
   enough to read at a glance. The block and memory hole are there only
   to prove deriveWorld parses every PR1-relevant token kind, not because
   the win path touches them; push-chain math itself is covered directly
   by games/topdown-puzzle/tests/push.test.js's own hand-built state
   fixtures. */
import { compile } from "@golem-engine/content";
import { buildMapSource } from "../../content/build-pack.mjs";
import { ENTITY_TEMPLATES } from "../../content/entities.mjs";

export const SYNTHETIC_LEVEL_ID = "synthetic-pr1";
const SYNTHETIC_FILENAME = `${SYNTHETIC_LEVEL_ID}.txt`;

export const SYNTHETIC_LEVEL_TEXT =
  ["######", "#@ B #", "#  D #", "#M   #", "#    #", "######"].join("\n") + "\n";

/** Compiles the synthetic level through the real @golem-engine/content
 *  compile() — returns the same CompileResult shape compile() itself
 *  returns ({ok:true,pack} or {ok:false,errors}). Never touches disk;
 *  pure given this file's own constants. */
export function compileSyntheticPack() {
  const mapSource = buildMapSource(SYNTHETIC_FILENAME, SYNTHETIC_LEVEL_TEXT);
  const source = {
    name: "topdown-puzzle-pr1-mechanism-proof",
    version: 1,
    entities: ENTITY_TEMPLATES,
    tables: [],
    maps: [mapSource],
  };
  return compile(source);
}
