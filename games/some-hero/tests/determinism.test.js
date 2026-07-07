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
import { compile } from "@golem-engine/content";
import { replay } from "@golem-engine/kernel";
import { h32 } from "@golem-engine/random";
import { createState, reduce, serializeState } from "../shared/reducer.js";
import { validate, deriveWorldFromPack } from "../shared/module.js";
import { compileSyntheticFloorPack, SYNTHETIC_MAP_ID } from "./fixtures/synthetic-floor.mjs";
import { ENTITY_DEFS } from "../content/entities.mjs";
import { GUILD_HALL_MAP } from "../content/guild-hall-map.mjs";

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

// ── PR4 (docs/superpowers/specs/2026-07-07-s2c-pr4-combat-design.md):
// the same kernel-acceptance proof, extended with enemy stepping, a
// kill, and a pickup — all within a SINGLE zone ("tomb"), so a plain
// single-World replay() (no segmented-replay helper — none exists yet;
// @golem-engine/kernel's replay() takes one World for the whole log,
// per src/host.js's own header comment) is sufficient. Starts from
// ENTERED_TOMB rather than FLOOR_ENTERED — the one event that both
// bootstraps world/character.pos AND seeds run.enemies in one committed
// step, exactly the shape shared/module.js's own enteredTombEvent()
// produces (proven, separately, against the real ow->tomb ceremony in
// tests/combat.test.js's own "ENTERED_TOMB seeds run.enemies..." test).
test("replay() reproduces the exact same hash for a session with enemy stepping, a kill, and a pickup", () => {
  const compiled = compileSyntheticFloorPack();
  assert.ok(compiled.ok, "the synthetic floor pack must compile");

  const worldState = { zone: "tomb", floorNum: 1, mapId: SYNTHETIC_MAP_ID };
  const world = deriveWorldFromPack(compiled.pack, worldState);
  assert.deepEqual(world.enemySpawns, [{ kind: "skeleton", pos: { x: 3, y: 3 } }]);
  // A gold pickup, test-injected directly onto the derived World's own
  // (empty-by-default) pickupAt Map — no committed map authors pickup
  // tokens yet (shared/module.js's deriveWorldFromPack header comment).
  world.pickupAt.set("4,3", { kind: "gold", amount: 5 });

  let state = createState();
  let seq = 0;
  const log = [];
  function commit(ev) {
    seq += 1;
    const stamped = { ...ev, seq };
    log.push(stamped);
    state = reduce(state, world, stamped);
  }

  commit({
    t: "ENTERED_TOMB",
    zone: worldState.zone,
    floorNum: worldState.floorNum,
    mapId: worldState.mapId,
    spawn: world.spawn,
    enemies: [{ id: "e0", kind: "skeleton", pos: { x: 3, y: 3 }, hp: world.enemyTypes.skeleton.hp }],
  });

  // Walk from spawn (1,1) down to (1,3) — the skeleton spawns at (3,3),
  // 2 tiles away, well within its aggro range (150px / T(36) = round(4.17)
  // = 4 tiles) — then two ticks: the first step lands the skeleton
  // adjacent to the player (newly-established contact -> HURT), the
  // second steps it onto the player's own tile (already in contact, no
  // repeat HURT — shared/tick.js's re-arm-on-separation discipline).
  const script = ["move 0 1", "move 0 1", "tick", "tick", "attack e0", "attack e0", "attack e0", "attack e0", "move 1 0", "move 1 0", "move 1 0"];
  for (const cmd of script) {
    const result = validate({ state, world }, cmd);
    assert.ok(Array.isArray(result), `expected "${cmd}" to be legal (got Denial: ${Array.isArray(result) ? "" : result.deny})`);
    for (const ev of result) commit(ev);
  }

  // The scripted session actually exercised every PR4 path under test.
  assert.equal(state.character.hp, 9, "one contact HURT landed (skeleton dmg 1)");
  assert.deepEqual(state.run.enemies, [], "the skeleton was killed (4 attacks, hp 4->0)");
  assert.equal(state.run.runStats.kills, 1);
  assert.deepEqual(state.run.runStats.killsByKind, { skeleton: 1 });
  assert.equal(state.character.gold, 5, "the gold pickup at (4,3) was collected");
  assert.deepEqual(state.character.pos, { x: 4, y: 3 });

  const liveHash = h32(serializeState(state));

  const core = { reduce };
  const replayedState = replay(core, world, log, createState());
  assert.deepEqual(replayedState, state, "replay() must reproduce a structurally-identical state");
  assert.equal(h32(serializeState(replayedState)), liveHash, "replay() must reproduce the exact same state hash as the live session");

  const secondReplay = replay(core, world, log, createState());
  assert.equal(h32(serializeState(secondReplay)), liveHash);
});
