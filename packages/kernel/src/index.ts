/* ── KERNEL — pure types + replay fold shared by every game module.
   DELTA K2 locks this package to the type surface and a single pure
   helper (`replay`); no game logic lives here. Kernel is synchronous
   and pure per DELTA §0.3: no async in validate/reduce/observe/
   affordances — IO (host sequencing, transports, storage) lives in
   adapters outside this package. ─────────────────────────────────── */

/** Every event is `{seq, t, ...fields}` per DELTA §0.3: a bare envelope
 *  (sequence number + type tag) intersected with whatever fields that
 *  event kind carries. `seq` is stamped by the host adapter at commit
 *  time (see games/golem-grid/src/main.js `hostCommit`) — `validate`
 *  never sets it; events it returns are seq-less until committed. */
export type EventBase = { seq: number; t: string };
export type Event<T extends object = Record<string, unknown>> = EventBase & T;

/** A command is whatever shape a game module's `validate` accepts. The
 *  kernel does not constrain it beyond "some value" — each game module
 *  defines its own command vocabulary (golem-grid's is a raw IRC-style
 *  command string; see games/golem-grid/shared/module.js). */
export type Command = unknown;

/** A denial: the host rejected a command. `deny` is the human-readable
 *  reason string shown to the actor (or, for other clients, relayed as
 *  a DENY wire message) — mirrors main.js's `hostDeny`. Extra fields are
 *  permitted (shape may carry more if a game's denial semantics need
 *  it), but `deny` is the one every consumer can rely on. */
export type Denial = { deny: string; [extra: string]: unknown };

export type ValidateResult<E extends Event = Event> = E[] | Denial;

/** Type guard distinguishing a Denial from a legal Event[] result. */
export function isDenial<E extends Event = Event>(
  r: ValidateResult<E>,
): r is Denial {
  return !Array.isArray(r);
}

/**
 * The full game-module surface (VISION.md's shape / this task's brief):
 * deriveWorld, validate, reduce, observe, affordances, narrativeFacts.
 * Fixtures may implement only a subset until K5/L1 land the rest of the
 * kernel (observe/affordances/narrativeFacts) — see `KernelCore` below
 * for the synchronous simulation subset K2 actually requires and tests.
 */
export interface GameModule<World, State, Cmd extends Command, Obs, Facts> {
  /** Pure f(seed) → World. Never stored, never sent (doctrine #1). */
  deriveWorld(seed: string): World;
  /** Legality check: ctx (whatever the game's host loop reads) + a raw
   *  command → the events it would cause, or a Denial. Never stamps
   *  seq; never mutates ctx. */
  validate(ctx: unknown, cmd: Cmd): ValidateResult;
  /** Pure fold: (state, world, event) → a NEW state. No mutation of the
   *  state or world handed in (identity-blind: no local/viewer
   *  identity is read here — doctrine #3). */
  reduce(state: State, world: World, event: Event): State;
  /** state + world, as seen by one viewer → that viewer's observation.
   *  Perception (seen/lit, fog of war) is derived here, not stored. */
  observe(state: State, world: World, viewer: string): Obs;
  /** observation + actor → legal-verb menu (adventure's affordance
   *  query, VISION.md: "powering text commands, context menus, NPC
   *  planning, tutorials, and twin grounding"). */
  affordances(observation: Obs, actor: string): unknown;
  /** state + world + event → facts the narrator (golem) may say aloud.
   *  The only integration point for prose generation (doctrine #4): the
   *  golem is a mouth, and this is the only thing it is allowed to say. */
  narrativeFacts(state: State, world: World, event: Event): Facts;
}

/** What K2 actually requires and tests: the synchronous simulation core
 *  (world derivation + legality + the pure fold), without the
 *  not-yet-built observation/affordance/narration surface. */
export type KernelCore<
  World = unknown,
  State = unknown,
  Cmd extends Command = Command,
> = Pick<GameModule<World, State, Cmd, unknown, unknown>, "deriveWorld" | "validate" | "reduce">;

/**
 * Pure fold over `reduce`: replay a committed event log from an initial
 * state through a game module's reduce, in order. Does not mutate the
 * caller's `initialState` (that guarantee comes from the `reduce`
 * implementation it's handed — replay itself never writes to any state
 * it's given, only threads the return value of one call into the next).
 * This is the function the conformance tests (packages/testkit's
 * kernel-replay + this package's own toy-module test) drive.
 */
export function replay<World, State, Cmd extends Command>(
  core: Pick<KernelCore<World, State, Cmd>, "reduce">,
  world: World,
  log: readonly Event[],
  initialState: State,
): State {
  let state = initialState;
  for (const ev of log) state = core.reduce(state, world, ev);
  return state;
}
