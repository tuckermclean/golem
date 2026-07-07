/* Level registry for the topdown-puzzle solution-log fixture toolchain
   (gen-tdp-solution-fixtures.mjs / verify-tdp-solution-fixtures.mjs /
   packages/testkit/tests/tdp-solution-replay.test.js) — a single source
   of "how do I derive this level's World", shared by all three so none
   of them forks another's logic (same discipline as every other
   packages/testkit/tools pair, e.g. gen-golem-fixtures.mjs /
   verify-golem-fixtures.mjs both importing games/golem-grid/shared/
   worldgen.js directly rather than duplicating genDungeon).

   PR1 registered exactly one level: the synthetic, hand-crafted,
   mover-free mechanism-proof (games/topdown-puzzle/tests/fixtures/
   synthetic-level.mjs — see that file's header comment for why none of
   the six real games/topdown-puzzle/levels/*.txt files qualify: every
   one carries at least one H/V baddie token, and PR1 does not simulate
   baddies). PR2 adds a second synthetic level (tests/fixtures/
   synthetic-level-pr2.mjs) exercising the tick bridge itself (one
   moving block + one baddie), proving a log that mixes "move ..." and
   "tick" commands replays bit-identically. PR4 extends LEVELS with the
   five real, shipped levels (001–005) that now have hand-PLAYED,
   recorder-captured solution logs (games/topdown-puzzle/tests/solutions/
   00N.moves.json — captured bit-exactly by the in-client solution
   recorder, src/main.js, so every timed push/tick is preserved with no
   eyeballing), deriving each via the production deriveWorld(level)
   against the committed content/pack.json — NOT a synthetic recompile.
   That real-vs-synthetic split is the whole point of routing through
   REAL_LEVELS below: synthetic levels recompile their own tiny pack per
   call (mechanism proofs), real levels re-derive from shipped content. */
import { deriveWorldFromPack } from "../../../games/topdown-puzzle/shared/module.js";
import { deriveWorld as deriveRealWorld } from "../../../games/topdown-puzzle/shared/pack-loader.js";
import {
  compileSyntheticPack as compileSyntheticPackPr1,
  SYNTHETIC_LEVEL_ID as SYNTHETIC_LEVEL_ID_PR1,
} from "../../../games/topdown-puzzle/tests/fixtures/synthetic-level.mjs";
import {
  compileSyntheticPack as compileSyntheticPackPr2,
  SYNTHETIC_LEVEL_ID as SYNTHETIC_LEVEL_ID_PR2,
} from "../../../games/topdown-puzzle/tests/fixtures/synthetic-level-pr2.mjs";

/* The five real, shipped levels with recorded winning solution logs —
   the ≥5 the DELTA C4 DoD asks for. Ids match content/pack.json's map
   ids (map:tdp_00N → "00N") and games/topdown-puzzle/tests/solutions/
   00N.moves.json one-to-one. */
export const REAL_LEVELS = ["001", "002", "003", "004", "005"];

export const LEVELS = [SYNTHETIC_LEVEL_ID_PR1, SYNTHETIC_LEVEL_ID_PR2, ...REAL_LEVELS];

const SYNTHETIC_COMPILERS = {
  [SYNTHETIC_LEVEL_ID_PR1]: compileSyntheticPackPr1,
  [SYNTHETIC_LEVEL_ID_PR2]: compileSyntheticPackPr2,
};

/** Pure(ish): derives a fresh World for `level`. A synthetic level
 *  recompiles its own tiny mechanism-proof pack from scratch every call
 *  — deliberately, so verify-tdp-solution-fixtures.mjs's "against a
 *  freshly re-derived world" claim is actually true, not reusing
 *  whatever gen-tdp-solution-fixtures.mjs happened to build. A real
 *  level re-derives from the committed content/pack.json via the same
 *  production deriveWorld() the Node client/tests use (pack-loader.js),
 *  which memoizes the immutable pack but builds a fresh World object per
 *  call — so the "freshly re-derived" guarantee holds there too. */
export function deriveLevelWorld(level) {
  const compileSyntheticPack = SYNTHETIC_COMPILERS[level];
  if (compileSyntheticPack) {
    const result = compileSyntheticPack();
    if (!result.ok) {
      throw new Error(`tdp-solution-levels: synthetic level "${level}" failed to compile: ${JSON.stringify(result.errors)}`);
    }
    return deriveWorldFromPack(result.pack, level);
  }
  if (REAL_LEVELS.includes(level)) {
    return deriveRealWorld(level);
  }
  throw new Error(`tdp-solution-levels: unknown level "${level}"`);
}
