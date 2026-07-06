/* ── PR2 TICK-BRIDGE MECHANISM-PROOF LEVEL — like tests/fixtures/
   synthetic-level.mjs (PR1's mover-free proof), NOT one of the "≥5
   legacy levels" DELTA C4's DoD asks for (that's PR4's real-level
   fixture work, once the tick bridge and validate/reduce are both
   proven).

   This level adds exactly one autonomous moving block and one baddie —
   the two systems shared/tick.js's resolveTick introduces — so its
   solution log's command sequence mixes `"move ..."` and `"tick"`
   commands, proving the literal claim the design doc's tick-bridge
   section makes: "the tick events are in the log" is what makes a
   recorded solution replay bit-identically with no wall-clock. Compiled
   independently through @golem-engine/content's own compile() (see
   synthetic-level.mjs's header comment for why this lives under
   tests/fixtures/ rather than games/topdown-puzzle/levels/ — same
   reasoning applies here unchanged: it must stay invisible to the
   committed content/pack.json and to the frozen P0.3 parse-snapshot
   triad).

   Layout (5 rows x 6 cols; see games/topdown-puzzle/tests/solutions/
   synthetic-pr2.moves.json for the scripted route):

     ######
     #@   #    @ player (1,1)
     #E   #    E moving block, facing East, (1,2) — blocks the only
                 path down to the diamond until it vacates on its own
     #D H #    D diamond (1,3);  H baddie (horizontal), (3,3) —
                 patrols harmlessly off to the side, never touching the
                 player, purely to prove its MOVED(+moveDir) events
                 (including the wall-reflect flip) land in the log too
     ######

   The winning route: two "tick" commands first (the moving block steps
   east off (1,2) on the very first tick, clearing the corridor; the
   baddie ticks along its own patrol both times, harmlessly), then
   "move 0 1" twice — straight down the now-clear corridor onto the
   diamond, which collects on contact and wins (the last diamond).
   Contact damage/HP-derived LOSE are deliberately NOT exercised by this
   fixture (they're covered directly, and more thoroughly, by tests/
   tick.test.js's hand-built states) — keeping this level's own state
   space small keeps the fixture itself easy to verify by inspection. */
import { compile } from "@golem-engine/content";
import { buildMapSource } from "../../content/build-pack.mjs";
import { ENTITY_TEMPLATES } from "../../content/entities.mjs";

export const SYNTHETIC_LEVEL_ID = "synthetic-pr2";
const SYNTHETIC_FILENAME = `${SYNTHETIC_LEVEL_ID}.txt`;

export const SYNTHETIC_LEVEL_TEXT =
  ["######", "#@   #", "#E   #", "#D H #", "######"].join("\n") + "\n";

/** Compiles the synthetic level through the real @golem-engine/content
 *  compile() — returns the same CompileResult shape compile() itself
 *  returns ({ok:true,pack} or {ok:false,errors}). Never touches disk;
 *  pure given this file's own constants. */
export function compileSyntheticPack() {
  const mapSource = buildMapSource(SYNTHETIC_FILENAME, SYNTHETIC_LEVEL_TEXT);
  const source = {
    name: "topdown-puzzle-pr2-tick-bridge-mechanism-proof",
    version: 1,
    entities: ENTITY_TEMPLATES,
    tables: [],
    maps: [mapSource],
  };
  return compile(source);
}
