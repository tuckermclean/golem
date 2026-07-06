/* Level registry for the topdown-puzzle solution-log fixture toolchain
   (gen-tdp-solution-fixtures.mjs / verify-tdp-solution-fixtures.mjs /
   packages/testkit/tests/tdp-solution-replay.test.js) — a single source
   of "how do I derive this level's World", shared by all three so none
   of them forks another's logic (same discipline as every other
   packages/testkit/tools pair, e.g. gen-golem-fixtures.mjs /
   verify-golem-fixtures.mjs both importing games/golem-grid/shared/
   worldgen.js directly rather than duplicating genDungeon).

   PR1 registers exactly one level: the synthetic, hand-crafted,
   mover-free mechanism-proof (games/topdown-puzzle/tests/fixtures/
   synthetic-level.mjs — see that file's header comment for why none of
   the six real games/topdown-puzzle/levels/*.txt files qualify: every
   one carries at least one H/V baddie token, and PR1 does not simulate
   baddies). PR4 extends LEVELS with ≥5 real levels, deriving each via
   shared/module.js's production deriveWorld(level) directly, once PR2's
   tick bridge makes a baddie-carrying level's solution log meaningful. */
import { deriveWorldFromPack } from "../../../games/topdown-puzzle/shared/module.js";
import {
  compileSyntheticPack,
  SYNTHETIC_LEVEL_ID,
} from "../../../games/topdown-puzzle/tests/fixtures/synthetic-level.mjs";

export const LEVELS = [SYNTHETIC_LEVEL_ID];

/** Pure(ish): derives a fresh World for `level`. For the PR1 synthetic
 *  level this recompiles the tiny mechanism-proof pack from scratch
 *  every call — deliberately, so verify-tdp-solution-fixtures.mjs's
 *  "against a freshly re-derived world" claim is actually true, not
 *  reusing whatever gen-tdp-solution-fixtures.mjs happened to build. */
export function deriveLevelWorld(level) {
  if (level === SYNTHETIC_LEVEL_ID) {
    const result = compileSyntheticPack();
    if (!result.ok) {
      throw new Error(`tdp-solution-levels: synthetic level failed to compile: ${JSON.stringify(result.errors)}`);
    }
    return deriveWorldFromPack(result.pack, SYNTHETIC_LEVEL_ID);
  }
  throw new Error(`tdp-solution-levels: unknown level "${level}"`);
}
