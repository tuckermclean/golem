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
   "tick" commands replays bit-identically. PR4 extends LEVELS with ≥5
   real levels, deriving each via shared/module.js's production
   deriveWorld(level) directly, once ≥5 real levels have hand-authored
   solution logs. */
import { deriveWorldFromPack } from "../../../games/topdown-puzzle/shared/module.js";
import {
  compileSyntheticPack as compileSyntheticPackPr1,
  SYNTHETIC_LEVEL_ID as SYNTHETIC_LEVEL_ID_PR1,
} from "../../../games/topdown-puzzle/tests/fixtures/synthetic-level.mjs";
import {
  compileSyntheticPack as compileSyntheticPackPr2,
  SYNTHETIC_LEVEL_ID as SYNTHETIC_LEVEL_ID_PR2,
} from "../../../games/topdown-puzzle/tests/fixtures/synthetic-level-pr2.mjs";

export const LEVELS = [SYNTHETIC_LEVEL_ID_PR1, SYNTHETIC_LEVEL_ID_PR2];

const SYNTHETIC_COMPILERS = {
  [SYNTHETIC_LEVEL_ID_PR1]: compileSyntheticPackPr1,
  [SYNTHETIC_LEVEL_ID_PR2]: compileSyntheticPackPr2,
};

/** Pure(ish): derives a fresh World for `level`. For every synthetic
 *  level this recompiles its own tiny mechanism-proof pack from scratch
 *  every call — deliberately, so verify-tdp-solution-fixtures.mjs's
 *  "against a freshly re-derived world" claim is actually true, not
 *  reusing whatever gen-tdp-solution-fixtures.mjs happened to build. */
export function deriveLevelWorld(level) {
  const compileSyntheticPack = SYNTHETIC_COMPILERS[level];
  if (!compileSyntheticPack) {
    throw new Error(`tdp-solution-levels: unknown level "${level}"`);
  }
  const result = compileSyntheticPack();
  if (!result.ok) {
    throw new Error(`tdp-solution-levels: synthetic level "${level}" failed to compile: ${JSON.stringify(result.errors)}`);
  }
  return deriveWorldFromPack(result.pack, level);
}
