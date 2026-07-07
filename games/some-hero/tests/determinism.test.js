/* ── DETERMINISM: the kernel acceptance hook (DELTA S2b PR2's test plan:
   "A determinism test: replay an event log through replay() →
   byte-identical serializeState/h32 — the kernel acceptance hook, like
   golem-grid/topdown-puzzle"). Drives a short scripted "live" session on
   the synthetic tomb-floor-1 fixture through the REAL validate()/reduce()
   host discipline (validate → seq-stamp → commit), recording the exact
   committed event log a real host would produce; then replays that SAME
   log from a FRESH createState() through @golem-engine/kernel's pure
   replay() (never applyEvent — some-hero has no such adapter yet, reduce
   IS the one true fold) and asserts the resulting serializeState()/h32
   is byte-identical to the live session's final state. */
import test from "node:test";
import assert from "node:assert/strict";
import { replay } from "@golem-engine/kernel";
import { h32 } from "@golem-engine/random";
import { createState, reduce, serializeState } from "../shared/reducer.js";
import { validate, deriveWorldFromPack } from "../shared/module.js";
import { compileSyntheticFloorPack, SYNTHETIC_MAP_ID } from "./fixtures/synthetic-floor.mjs";

test("replay() over a live-generated event log reproduces the exact same state hash", () => {
  const compiled = compileSyntheticFloorPack();
  assert.ok(compiled.ok, "the synthetic floor pack must compile");

  const worldState = { zone: "tomb", floorNum: 1, mapId: SYNTHETIC_MAP_ID };
  const world = deriveWorldFromPack(compiled.pack, worldState);

  // ── "Live" session: validate -> seq-stamp -> commit, exactly the
  // src/host.js discipline, recording the legal event log as it goes.
  let state = createState();
  let seq = 0;
  const log = [];
  function commit(ev) {
    seq += 1;
    const stamped = { ...ev, seq };
    log.push(stamped);
    state = reduce(state, world, stamped);
  }

  commit({ t: "FLOOR_ENTERED", zone: worldState.zone, floorNum: worldState.floorNum, mapId: worldState.mapId });

  // A scripted route across the synthetic floor's corridor to the
  // stairs, with some ticks interleaved — see tests/fixtures/
  // synthetic-floor.mjs's layout comment for the map this walks.
  const script = [
    "move 0 1", "move 0 1", "tick",
    "move 1 0", "move 1 0", "tick",
    "move 1 0", "move 1 0", "tick",
    "move 0 1", "move 0 1",
  ];
  for (const cmd of script) {
    const result = validate({ state, world }, cmd);
    assert.ok(Array.isArray(result), `expected "${cmd}" to be legal on the synthetic floor (got Denial: ${Array.isArray(result) ? "" : result.deny})`);
    for (const ev of result) commit(ev);
  }

  assert.deepEqual(state.character.pos, world.stairsAt, "the scripted route should end exactly on the stairs tile");

  const liveHash = h32(serializeState(state));

  // ── Replay the SAME committed log from a fresh createState() through
  // the kernel's pure replay() fold.
  const core = { reduce };
  const replayedState = replay(core, world, log, createState());
  const replayedHash = h32(serializeState(replayedState));

  assert.deepEqual(replayedState, state, "replay() must reproduce a structurally-identical state");
  assert.equal(replayedHash, liveHash, "replay() must reproduce the exact same state hash as the live session");

  // A second, independent replay of the same log is itself deterministic
  // (no hidden wall-clock/random dependency anywhere in the fold).
  const secondReplay = replay(core, world, log, createState());
  assert.equal(h32(serializeState(secondReplay)), liveHash);
});
