/* ── Warden-seal boss resolution (docs/superpowers/specs/2026-07-07-
   warden-boss-resolution-design.md): the sixth and final tomb-floor-seal
   made progressable — a warden floor (`floorNum % 4 === 0`) spawns the
   legacy dash-boss (`run.boss`, a sibling of `run.enemies`), and killing
   it (`stairsOpen`'s warden branch: `boss ? boss.dead : true`) opens the
   stairs, exactly like the five puzzle seals (riddle/traps/key/plates/
   torch) before it. This is the LARGEST mechanic in the series: a
   `sleep -> idle -> tele -> dash -> idle(cooldown)` state machine driven
   by `resolveTick`, plus a new "attack boss" strike path in `validate()`'s
   "attack" case.

   Honest scope (mirrors every other seal-resolution test file's own
   header): seed "1" floor 4 draws a "warden" seal — floor.boss is "the
   Middle Manager" (hp:69, dmg:2, maxhp:69), home tile (4,4), stairsAt
   (4,5) directly south of it, inside a small room spanning x:2-6,y:2-7.
   Found via the same kind of offline scan this repo's other seal-
   resolution test files describe (a throwaway scan script, discarded —
   not committed):
     - boss home (4,4); stairsAt (4,5) — one tile south of the boss.
     - room walls: x=1 is solid two tiles west of the boss's home row
       (a wall within ~2 tiles, used by the dash-wall-stop test below);
       a long open corridor runs south along x=4 from y=2 through y=17
       (used by the full state-machine sequence test, so the boss's
       natural creep/dash never needs to detour around geometry).
     - a second room at roughly x:2-8,y:13-17 (fully open, no walls
       nearby) is used by the contact-damage test below, purely for open
       floor space — position-independent of the boss's actual home,
       same "positioning discipline" torch-seal.test.js's own header
       documents (character/boss positions are placed directly via state
       overrides, not BFS-walked; every command that matters — the
       attack, the tick, the move onto stairsAt — is still driven through
       the real "attack"/"tick"/"move dx dy" verbs -> validate() ->
       reduce(), never poked directly).
   generateFloor("1", 1) (used for the non-warden regression, same
   convention as every other seal test file) draws a "key" seal.

   `run.enemies` is forced to `[]` in `wardenFloorState` — the boss
   mechanic is isolated from skeleton-family combat (which has its own
   tests in tests/combat.test.js), so ticks/attacks below only ever
   touch the boss.

   DETERMINISM: the post-dash cooldown timer draws the series' first
   seeded nondeterminism (`channel(seed, "warden", String(tick))` ->
   `rint(..., WARDEN.cooldownJitter)`, `seed` = `world.mapId`). The exact
   picks this file asserts (tick 1 -> 2, tick 9 -> 1) were computed once,
   offline, against the real `@golem-engine/random` channel/rint — not
   guessed — and are pinned here as the proof the draw is reproducible. */
import test from "node:test";
import assert from "node:assert/strict";
import { h32 } from "@golem-engine/random";
import { validate, deriveWorld, initBoss } from "../shared/module.js";
import { createState, reduce, serializeState } from "../shared/reducer.js";
import { pack } from "../rules/pack.js";
import { generateFloor } from "../shared/floorgen.js";

// generateFloor("1", 4).puzzle.type === "warden" (found via the same
// kind of offline scan this repo's other seal-resolution test files
// describe). boss "the Middle Manager", hp:69, dmg:2, home (4,4),
// stairsAt (4,5).
const WARDEN_SEED = "1";
// generateFloor("1", 1).puzzle.type === "key" — the same non-warden
// regression seed the other seal-resolution test files already use
// (same seed string, a different floor number: floor 1 is never a
// warden floor by construction, floorNum % 4 !== 0).
const NON_WARDEN_SEED = "1";

function deriveTombWorld(seed, floorNum) {
  const mapId = `tomb:${seed}:0:${floorNum}`;
  return deriveWorld(pack, { zone: "tomb", floorNum, mapId }, seed);
}

/** validate() -> assert legal -> fold every returned event through
 *  reduce() — same commit() idiom as tests/torch-seal.test.js /
 *  tests/plates-seal.test.js. */
function commit(state, world, cmd) {
  const result = validate({ state, world }, cmd);
  assert.ok(
    Array.isArray(result),
    `expected "${cmd}" to be legal (got Denial: ${Array.isArray(result) ? "" : result.deny})`,
  );
  let seq = state.seq;
  for (const ev of result) state = reduce(state, world, { ...ev, seq: ++seq });
  return { state, result };
}

/** A state freshly standing on a real generated tomb floor's warden
 *  seal, `run.boss` built the same way ENTERED_TOMB's own seeded branch
 *  populates it (shared/module.js's initBoss()) — `floorBoss` is
 *  `generateFloor(seed, floorNum).boss` (null on a non-warden floor,
 *  yielding `run.boss = null`, exactly like createState()'s own
 *  default). `bossOverrides` is spread over the freshly-initted boss
 *  (never over the same reference twice — each call builds fresh
 *  objects), letting individual tests place the boss mid-state-machine
 *  (`state`/`timer`/`dashDir`/`pos`) without walking it there tick by
 *  tick — same "positioning discipline" as torch-seal.test.js's own
 *  `torchFloorState`. `run.enemies` is forced to `[]` — see this file's
 *  header. */
function wardenFloorState(world, floorBoss, pos, bossOverrides = {}) {
  let state = reduce(createState(), world, {
    t: "FLOOR_ENTERED",
    zone: world.zone,
    floorNum: world.floorNum,
    mapId: world.mapId,
    seq: 1,
  });
  const boss = floorBoss ? { ...initBoss(floorBoss), ...bossOverrides } : null;
  state = {
    ...state,
    run: {
      ...state.run,
      puzzle: world.puzzle ? { ...world.puzzle } : null,
      enemies: [],
      boss,
    },
    character: { ...state.character, pos: { ...pos } },
  };
  return state;
}

// ── group 1: slay + descend ─────────────────────────────────────────────

test("slay + descend: 12 attacks (ceil(69/6)) kill the Middle Manager — the last yields [WARDEN_HURT, WARDEN_SLAIN]; before death, walking onto the sealed stairs is a silent [MOVED]; after death, [MOVED, DESCENDED] opens the next floor", () => {
  const world = deriveTombWorld(WARDEN_SEED, 4);
  assert.equal(world.puzzle.type, "warden", "sanity: seed 1 floor 4 must be a warden seal");
  const floor = generateFloor(WARDEN_SEED, 4);
  assert.equal(floor.boss.stats.hp, 69, "sanity: this floor's boss hp");
  assert.equal(floor.boss.stats.dmg, 2, "sanity: this floor's boss dmg");

  // Start one tile north of the boss's home (4,4) — adjacent (Manhattan
  // 1), in melee range without needing to move first.
  let state = wardenFloorState(world, floor.boss, { x: 4, y: 3 });
  state = { ...state, character: { ...state.character, swordLv: 4 } }; // attackDamage(4) === 6
  let result;

  // Hit 1: boss alive, hp 69 -> 63.
  ({ state, result } = commit(state, world, "attack boss"));
  assert.deepEqual(result.map((e) => e.t), ["WARDEN_HURT"]);
  assert.equal(state.run.boss.hp, 63);
  assert.equal(state.run.boss.dead, false);

  // Walk onto the boss's own (still-alive) tile, then onto stairsAt
  // (4,5) itself — sealed while the boss lives, so this is a SILENT
  // [MOVED] (design spec's point 1: "Before death, moving onto the
  // stairs is a silent [MOVED]"), not a Denial and not DESCENDED.
  ({ state, result } = commit(state, world, "move 0 1"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED"]);
  assert.deepEqual(state.character.pos, { x: 4, y: 4 });

  ({ state, result } = commit(state, world, "move 0 1"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED"], "the warden seal is still sealed — no DESCENDED, no Denial");
  assert.deepEqual(state.character.pos, { x: 4, y: 5 });
  assert.equal(state.world.zone, "tomb", "not a zone transition");
  assert.equal(state.world.floorNum, 4, "still floor 4 — no descend");

  // Still adjacent to the boss (Manhattan 1) from stairsAt — keep
  // attacking from here. Hits 2-11: hp 63 -> 57 -> ... -> 3.
  for (let i = 2; i <= 11; i++) {
    ({ state, result } = commit(state, world, "attack boss"));
    assert.deepEqual(result.map((e) => e.t), ["WARDEN_HURT"]);
    assert.equal(state.run.boss.hp, 69 - i * 6);
    assert.equal(state.run.boss.dead, false);
  }
  assert.equal(state.run.boss.hp, 3, "sanity: 11 hits of 6 leave 3 hp");

  // Hit 12: the killing blow. hp 3 -> -3 (<=0), WARDEN_SLAIN follows.
  ({ state, result } = commit(state, world, "attack boss"));
  assert.deepEqual(result.map((e) => e.t), ["WARDEN_HURT", "WARDEN_SLAIN"]);
  assert.equal(state.run.boss.hp, -3);
  assert.equal(state.run.boss.dead, true);

  // Arrange runStats so the "preserved across floors" proof is not
  // vacuous (same idiom as every other seal test's own descend proof).
  state = { ...state, run: { ...state.run, runStats: { ...state.run.runStats, kills: 7, goldGained: 20 } } };
  const knowledgeBefore = state.knowledge;

  // Step off the stairs and back on — a NEW move command landing on
  // stairsAt, now that the boss is dead.
  ({ state, result } = commit(state, world, "move 0 -1"));
  assert.deepEqual(result.map((e) => e.t), ["MOVED"]);
  assert.deepEqual(state.character.pos, { x: 4, y: 4 });

  const { state: next, result: descendResult } = commit(state, world, "move 0 1");
  assert.deepEqual(descendResult.map((e) => e.t), ["MOVED", "DESCENDED"], "a slain warden opens onto DESCENDED");

  const descended = descendResult[1];
  assert.equal(descended.floorNum, 5);
  assert.equal(descended.mapId, `tomb:${WARDEN_SEED}:0:5`);
  assert.equal(next.world.floorNum, 5);
  assert.equal(next.world.mapId, `tomb:${WARDEN_SEED}:0:5`);
  assert.deepEqual(next.character.pos, descended.spawn);

  assert.equal(next.run.runStats.kills, 7, "kills must be preserved across the floor transition");
  assert.equal(next.run.runStats.goldGained, 20, "goldGained must be preserved across the floor transition");
  assert.equal(next.run.runStats.depth, 5, "depth bumps to the new floor number");

  assert.deepEqual(next.knowledge, knowledgeBefore, "knowledge (runs/day/interest/...) must be entirely untouched by a floor-to-floor descend");
});

// ── group 2: attack range / id ──────────────────────────────────────────

test("'attack boss' from more than Manhattan 1 away denies 'Too far to strike.'", () => {
  const world = deriveTombWorld(WARDEN_SEED, 4);
  const floor = generateFloor(WARDEN_SEED, 4);
  // (4,2) is Manhattan distance 2 from the boss's home (4,4).
  const state = wardenFloorState(world, floor.boss, { x: 4, y: 2 });

  const result = validate({ state, world }, "attack boss");
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.equal(result.deny, "Too far to strike.");
});

test("'attack boss' with no live boss on the floor (a non-warden floor, or an already-slain warden) denies the existing 'nothing by that name' — byte-identical to the enemy path", () => {
  // Sub-case A: a non-warden floor (run.boss is null by construction).
  const nonWardenWorld = deriveTombWorld(NON_WARDEN_SEED, 1);
  assert.equal(nonWardenWorld.puzzle.type, "key", "sanity: seed 1 floor 1 must be a key seal, never a warden");
  const noBossState = wardenFloorState(nonWardenWorld, null, nonWardenWorld.spawn);
  assert.equal(noBossState.run.boss, null);

  let result = validate({ state: noBossState, world: nonWardenWorld }, "attack boss");
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.equal(result.deny, "There is nothing here by that name to strike.");

  // Sub-case B: the SAME warden floor, after the boss has been slain.
  const world = deriveTombWorld(WARDEN_SEED, 4);
  const floor = generateFloor(WARDEN_SEED, 4);
  let state = wardenFloorState(world, floor.boss, { x: 4, y: 3 }, { hp: 1 }); // one hit from dead
  state = { ...state, character: { ...state.character, swordLv: 4 } };
  ({ state } = commit(state, world, "attack boss"));
  assert.equal(state.run.boss.dead, true, "sanity: the boss must be dead before this assertion");

  result = validate({ state, world }, "attack boss");
  assert.ok(!Array.isArray(result), "expected a Denial");
  assert.equal(result.deny, "There is nothing here by that name to strike.");
});

// ── group 3: the full state machine, ticked out and hand-computed ──────

test("state machine: sleep -> idle(creep) -> tele(telegraph) -> dash -> idle(cooldown), hand-computed tick by tick", () => {
  const world = deriveTombWorld(WARDEN_SEED, 4);
  const floor = generateFloor(WARDEN_SEED, 4);
  const mapId = world.mapId; // "tomb:1:0:4" — resolveTick's own `seed` param

  // Player fixed at (4,9): Manhattan distance 5 from the boss's home
  // (4,4), straight down the open x=4 corridor (floor from y=2 through
  // y=17 — see this file's header) — exactly WARDEN.aggroTiles, so the
  // very first tick wakes it.
  let state = wardenFloorState(world, floor.boss, { x: 4, y: 9 });
  let result;

  // tick 0 (sanity): the player one tile FARTHER out (Manhattan 6, just
  // outside aggroTiles=5) leaves a fresh boss asleep — no WARDEN_ADVANCED.
  {
    const asleep = wardenFloorState(world, floor.boss, { x: 4, y: 10 });
    const { result: r } = commit(asleep, world, "tick");
    assert.deepEqual(r.map((e) => e.t), ["TICK_ADVANCED"], "out of aggro range: a clean idle tick, no event for the boss");
  }

  // tick 1: sleep -> idle (wake). No movement on the wake tick itself.
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"]);
  assert.deepEqual(state.run.boss.pos, { x: 4, y: 4 });
  assert.equal(state.run.boss.state, "idle");
  assert.equal(state.run.boss.timer, 3);

  // ticks 2-3: idle creep, one cell/tick toward the player (straight
  // down the corridor).
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"]);
  assert.deepEqual(state.run.boss.pos, { x: 4, y: 5 });
  assert.equal(state.run.boss.state, "idle");
  assert.equal(state.run.boss.timer, 2);

  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"]);
  assert.deepEqual(state.run.boss.pos, { x: 4, y: 6 });
  assert.equal(state.run.boss.state, "idle");
  assert.equal(state.run.boss.timer, 1);

  // tick 4: the LAST idle step (still moves this tick) + timer hits 0 ->
  // transitions to "tele" in the same tick.
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"]);
  assert.deepEqual(state.run.boss.pos, { x: 4, y: 7 });
  assert.equal(state.run.boss.state, "tele");
  assert.equal(state.run.boss.timer, 2);

  // ticks 5-6: tele stands still (the dodge window); the last tick locks
  // dashDir toward the player and transitions to "dash".
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"]);
  assert.deepEqual(state.run.boss.pos, { x: 4, y: 7 }, "tele never moves");
  assert.equal(state.run.boss.state, "tele");
  assert.equal(state.run.boss.timer, 1);

  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"]);
  assert.deepEqual(state.run.boss.pos, { x: 4, y: 7 }, "tele never moves, even on the transition tick");
  assert.equal(state.run.boss.state, "dash");
  assert.equal(state.run.boss.timer, 3);
  assert.deepEqual(state.run.boss.dashDir, { dx: 0, dy: 1 }, "locked toward the player (straight down)");

  // tick 7: dash moves dashCells (2) toward the player -> lands exactly
  // on the player's own tile (4,9). Contact was NOT touching at the
  // start of this tick (dist 2) and IS touching after the move (dist 0)
  // -> newly established -> HURT.
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED", "HURT"]);
  assert.deepEqual(state.run.boss.pos, { x: 4, y: 9 });
  assert.equal(state.run.boss.state, "dash");
  assert.equal(state.run.boss.timer, 2);
  assert.equal(state.character.hp, 8, "10 - boss.dmg(2)");

  // tick 8: dash moves 2 more cells, past the player -> separates (dist
  // 2) -> no repeat HURT (re-arms, doesn't re-fire while still touching
  // — but here it separates outright).
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"]);
  assert.deepEqual(state.run.boss.pos, { x: 4, y: 11 });
  assert.equal(state.run.boss.state, "dash");
  assert.equal(state.run.boss.timer, 1);
  assert.equal(state.character.hp, 8, "no repeat HURT this tick");

  // tick 9: the LAST dash tick — moves 2 more cells, timer hits 0 ->
  // transitions to idle(cooldown): timer = cooldownBase(4) + the ONE
  // seeded draw (rint(channel(mapId,"warden","9"), 3) === 1, computed
  // offline against the real @golem-engine/random channel/rint — see
  // this file's header).
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"]);
  assert.deepEqual(state.run.boss.pos, { x: 4, y: 13 });
  assert.equal(state.run.boss.state, "idle", "the post-dash cooldown reuses the 'idle' state");
  assert.equal(state.run.boss.timer, 5, "cooldownBase(4) + the seeded pick(1) for mapId=" + mapId + ", tick=9");
  assert.equal(state.run.boss.dashDir, null);
});

// ── group 4: contact damage ──────────────────────────────────────────────

test("contact damage: newly-established adjacency fires HURT once, re-arms on separation, and enough contact kills the player (DIED)", () => {
  const world = deriveTombWorld(WARDEN_SEED, 4);
  const floor = generateFloor(WARDEN_SEED, 4);

  // A second, fully open room (x:2-8,y:13-17 — see this file's header)
  // far from the boss's real home, used purely for open floor space.
  // Player fixed at (5,15); boss starts at (7,15) (Manhattan 2) in
  // "idle" with a huge timer (100) so it never transitions mid-test —
  // this isolates the CONTACT mechanic from the tele/dash phases
  // (already proven separately by group 3 above).
  let state = wardenFloorState(world, floor.boss, { x: 5, y: 15 }, {
    pos: { x: 7, y: 15 },
    state: "idle",
    timer: 100,
  });
  let result;

  // tick 1: idle creep closes distance 2 -> 1 -> newly established -> HURT.
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED", "HURT"]);
  assert.deepEqual(state.run.boss.pos, { x: 6, y: 15 });
  assert.equal(state.character.hp, 8, "10 - dmg(2), hit 1");

  // tick 2: idle creep closes 1 -> 0 (onto the player's own tile) — both
  // BEFORE and AFTER this tick are "touching" (<=1), so this is NOT a
  // newly-established contact — no repeat HURT.
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"], "still touching — no repeat HURT");
  assert.deepEqual(state.run.boss.pos, { x: 5, y: 15 });
  assert.equal(state.character.hp, 8, "unchanged");

  // tick 3: already at the player's tile — stepToward is a no-op; still
  // touching before and after -> still no repeat HURT.
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"], "still touching — no repeat HURT");
  assert.equal(state.character.hp, 8, "unchanged");

  // Simulate separation-then-re-contact directly (positioning
  // discipline — see this file's header): reset the boss back out to
  // Manhattan 2 and tick again. Each cycle re-arms and lands one more
  // newly-established HURT (dmg 2/hit): hp 8 -> 6 -> 4 -> 2 -> 0 (DIED
  // on the last).
  for (const expectedHp of [6, 4, 2]) {
    state = { ...state, run: { ...state.run, boss: { ...state.run.boss, pos: { x: 7, y: 15 } } } };
    ({ state, result } = commit(state, world, "tick"));
    assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED", "HURT"]);
    assert.equal(state.character.hp, expectedHp);
  }

  state = { ...state, run: { ...state.run, boss: { ...state.run.boss, pos: { x: 7, y: 15 } } } };
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED", "HURT", "DIED"], "the killing hit bridges to DIED");
  assert.equal(state.character.hp, 0);
  assert.equal(state.pending.kind, "resurrection");
  assert.equal(state.pending.cause, "warden");
});

// ── group 5: dash wall-stop ──────────────────────────────────────────────

test("dash wall-stop: dashing at a wall a couple tiles away stops AT the wall (partial dash), never enters it", () => {
  const world = deriveTombWorld(WARDEN_SEED, 4);
  const floor = generateFloor(WARDEN_SEED, 4);

  // The boss's own home row (y=4) has a wall at x=1, three tiles west of
  // (4,4) — see this file's header. Player fixed far away (the derived
  // spawn) so no contact interferes with this test.
  let state = wardenFloorState(world, floor.boss, world.spawn, {
    pos: { x: 4, y: 4 },
    state: "dash",
    timer: 3,
    dashDir: { dx: -1, dy: 0 },
  });
  let result;

  // tick 1: dashCells(2) west, both cells clear (3,4) then (2,4) — a
  // full, unobstructed dash step.
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"]);
  assert.deepEqual(state.run.boss.pos, { x: 2, y: 4 });
  assert.equal(state.run.boss.state, "dash", "still dashing — timer hasn't run out yet");
  assert.equal(state.run.boss.timer, 2);

  // tick 2: the very next cell west, (1,4), is a wall — the dash stops
  // BEFORE entering it (a partial/zero-cell dash this tick), pos stays
  // (2,4).
  ({ state, result } = commit(state, world, "tick"));
  assert.deepEqual(result.map((e) => e.t), ["TICK_ADVANCED", "WARDEN_ADVANCED"]);
  assert.deepEqual(state.run.boss.pos, { x: 2, y: 4 }, "the dash stopped at the wall, never entered it");
  assert.equal(state.run.boss.state, "dash");
  assert.equal(state.run.boss.timer, 1);
});

// ── group 6: determinism ─────────────────────────────────────────────────

test("determinism: replaying a scripted log (a seeded cooldown draw + slay + descend) twice reproduces an identical h32(serializeState(...))", () => {
  function run() {
    const world = deriveTombWorld(WARDEN_SEED, 4);
    const floor = generateFloor(WARDEN_SEED, 4);

    // Start the boss already mid-dash (timer 1 — the very next tick
    // finishes the dash and draws the seeded cooldown), player far away
    // so no contact interferes.
    let state = wardenFloorState(world, floor.boss, { x: 23, y: 26 }, {
      pos: { x: 4, y: 4 },
      state: "dash",
      timer: 1,
      dashDir: { dx: 1, dy: 0 },
    });
    state = { ...state, character: { ...state.character, swordLv: 4 } };

    // The one tick: dash moves to (6,4), timer hits 0, draws the seeded
    // cooldown jitter (channel(mapId,"warden","1")) and transitions to
    // idle(cooldown).
    ({ state } = commit(state, world, "tick"));

    // Reposition adjacent to the boss's new position and slay it (12
    // attacks, ceil(69/6)).
    state = { ...state, character: { ...state.character, pos: { x: 5, y: 4 } } };
    for (let i = 0; i < 12; i++) {
      ({ state } = commit(state, world, "attack boss"));
    }

    // Reposition adjacent to stairsAt (4,5) and descend.
    state = { ...state, character: { ...state.character, pos: { x: 4, y: 6 } } };
    ({ state } = commit(state, world, "move 0 -1"));
    return state;
  }

  const a = run();
  const b = run();
  // Sanity: the script ends past a successful descend to floor 5 — a
  // non-warden floor (5 % 4 !== 0), so run.boss is correctly reset to
  // null by DESCENDED (the slain warden was on floor 4, now behind us).
  assert.equal(a.world.floorNum, 5, "sanity: the script must end past a successful descend");
  assert.equal(a.run.boss, null, "sanity: floor 5 is not a warden floor");
  assert.deepEqual(a, b, "two independent runs of the same command log must produce structurally identical state");
  assert.equal(h32(serializeState(a)), h32(serializeState(b)), "and byte-identical hashes");
});
