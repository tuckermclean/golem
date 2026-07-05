/* Type-level compile check for @golem-engine/kernel's public surface.
 *
 * This file is checked by `tsc -p tsconfig.tests.json` (see package.json
 * "pretest") — NOT executed by `node --test` (deliberately named
 * `.check.ts`, not `*.test.ts`, so node's test-file glob skips it; this
 * machine's node doesn't need to understand TypeScript at all for this
 * file to do its job). A failing build here IS the test failing.
 *
 * It exercises: KernelCore's exact three-member shape, GameModule's
 * exact six-member shape (deriveWorld/validate/reduce/observe/
 * affordances/narrativeFacts), the ValidateResult/Denial/isDenial
 * narrowing, and replay()'s generic signature — with a toy in-memory
 * counter "game" standing in for a real game module.
 */
import type {
  Command,
  Denial,
  Event,
  GameModule,
  KernelCore,
  ValidateResult,
} from "../src/index.js";
import { isDenial, replay } from "../src/index.js";

type World = { max: number };
type State = { n: number };
type Cmd = { verb: "inc" | "dec" | "nope" } & Command;

const core: KernelCore<World, State, Cmd> = {
  deriveWorld: (seed) => ({ max: seed.length }),
  validate: (_ctx, cmd): ValidateResult => {
    const c = cmd as Cmd;
    if (c.verb === "inc") return [{ seq: 0, t: "INC" }];
    if (c.verb === "dec") return [{ seq: 0, t: "DEC" }];
    const denial: Denial = { deny: "unknown verb" };
    return denial;
  },
  reduce: (state, world, ev) => {
    switch (ev.t) {
      case "INC":
        return { n: Math.min(world.max, state.n + 1) };
      case "DEC":
        return { n: state.n - 1 };
      default:
        return state;
    }
  },
};

// KernelCore alone is enough to drive replay() — this is the exact
// subset K2 requires (deriveWorld/validate/reduce), no more.
const world: World = core.deriveWorld("abcdef");
const log: Event[] = [
  { seq: 1, t: "INC" },
  { seq: 2, t: "INC" },
];
const finalState: State = replay(core, world, log, { n: 0 });
void finalState;

// ValidateResult / Denial / isDenial narrowing.
const r: ValidateResult = core.validate({}, { verb: "inc" });
if (isDenial(r)) {
  const d: Denial = r;
  void d.deny;
} else {
  const events: Event[] = r;
  void events;
}

// The full six-member GameModule shape — fixtures may implement only
// KernelCore until K5/L1, but the type must still accept a module that
// implements all six, exactly as documented.
const fullModule: GameModule<World, State, Cmd, State, string[]> = {
  ...core,
  observe: (state) => state,
  affordances: () => [],
  narrativeFacts: () => [],
};
void fullModule;
