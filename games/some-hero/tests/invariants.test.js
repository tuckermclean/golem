/* ── Property / invariant test for the some-hero reducer ──────────────
 *
 * The adversarial review campaign (#72-#75) verified several invariants
 * BY HAND — notably that gold never goes negative through the death
 * payment. This file encodes those as automated guards and, more
 * broadly, fuzzes the full command surface (move / tick / attack / answer)
 * over REAL generated tomb floors of every seal type, asserting after
 * every committed step that the core invariants hold, that nothing throws,
 * and that the whole random command log REPLAYS to a byte-identical
 * serializeState hash (determinism — the kernel's central promise).
 *
 * Fully deterministic: the "random" walk is driven by @golem-engine/
 * random's channel()/rint (seeded), never Math.random — so a failure is
 * always reproducible from the printed (seed, floor, step). Kept IN-TOMB
 * (high starting hp, no resurrect) so the world never swaps zones mid-run
 * — death/resurrect + the ow economy are covered by their own dedicated
 * tests (warden-seal / combat / death-respawn ceremony); this fuzz targets
 * in-tomb movement / pickups / seals / combat / boss + determinism. */
import test from "node:test";
import assert from "node:assert/strict";
import { h32, channel, rint } from "@golem-engine/random";
import { validate, deriveWorld, initBoss } from "../shared/module.js";
import { createState, reduce, serializeState } from "../shared/reducer.js";
import { pack } from "../rules/pack.js";
import { generateFloor } from "../shared/floorgen.js";

// One representative seed per seal type (found via an offline scan over
// generateFloor("<seed>",<floor>).puzzle.type — see this file's git blame).
const FLOORS = [
  { seed: "5", floor: 1, seal: "traps" },
  { seed: "2", floor: 1, seal: "plates" },
  { seed: "4", floor: 1, seal: "torch" },
  { seed: "1", floor: 1, seal: "key" },
  { seed: "8", floor: 1, seal: "riddle" },
  { seed: "1", floor: 4, seal: "warden" }, // floor 4 = warden boss
];

function deriveTombWorld(seed, floorNum) {
  return deriveWorld(pack, { zone: "tomb", floorNum, mapId: `tomb:${seed}:0:${floorNum}` }, seed);
}

/** A walkable tile orthogonally adjacent to `pt` (falls back to `pt`). Used
 *  to seat the player next to the boss so the warden floor's fuzz actually
 *  exercises the dash-boss state machine + its seeded cooldown jitter,
 *  rather than a random walk that never reaches it. */
function walkableAdjacent(world, pt) {
  for (const [dx, dy] of DIRS) {
    const x = pt.x + dx;
    const y = pt.y + dy;
    if (x >= 0 && y >= 0 && x < world.cols && y < world.rows && !world.walls.has(`${x},${y}`)) return { x, y };
  }
  return { x: pt.x, y: pt.y };
}

/** A fresh in-tomb state on a REAL generated floor: puzzle + enemies +
 *  boss all seeded from the floor (mirroring descendedEvent's own filter/
 *  id-assignment), high hp so the fuzz never dies (no zone swap), and a
 *  little gold/potions so those invariants have live values to guard. */
function tombState(seed, floorNum) {
  const world = deriveTombWorld(seed, floorNum);
  const floor = generateFloor(seed, floorNum);
  const enemyTypes = world.enemyTypes; // the derived World already carries it
  const enemies = [];
  for (const e of floor.enemies) {
    const type = enemyTypes[e.kind];
    if (!type) continue; // decor / non-combatant kinds, exactly like descendedEvent
    enemies.push({ id: `e${enemies.length}`, kind: e.kind, pos: { x: e.x, y: e.y }, hp: type.hp });
  }
  let state = reduce(createState(), world, {
    t: "FLOOR_ENTERED",
    zone: world.zone,
    floorNum: world.floorNum,
    mapId: world.mapId,
    seq: 1,
  });
  // On a boss floor, start ADJACENT to the boss so the fuzz's ticks/attacks
  // actually drive the dash-boss (it wakes within aggro range / on a hit);
  // otherwise start at the derived spawn.
  const startPos = floor.boss ? walkableAdjacent(world, { x: floor.boss.x, y: floor.boss.y }) : { ...world.spawn };
  state = {
    ...state,
    character: { ...state.character, hp: 500, maxhp: 500, gold: 25, potions: 3, pos: startPos },
    run: {
      ...state.run,
      puzzle: floor.puzzle ? JSON.parse(JSON.stringify(floor.puzzle)) : null,
      enemies,
      boss: floor.boss ? initBoss(floor.boss) : null,
      collectedTiles: [],
    },
  };
  return { state, world };
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A deterministic "random" command for this step (seeded by (seed,floor,
 *  step)). Weighted toward move+tick (the gameplay loop) with occasional
 *  attack (a random live enemy or the boss) and answer (riddle options).
 *  Illegal commands are fine — validate() denies them and the fold below
 *  simply skips a Denial. */
function commandFor(rng, state) {
  const roll = rint(rng, 100);
  if (roll < 45) {
    const [dx, dy] = DIRS[rint(rng, 4)];
    return `move ${dx} ${dy}`;
  }
  if (roll < 75) return "tick";
  if (roll < 90) {
    // attack a random target: an existing enemy id, or the boss
    const targets = state.run.enemies.map((e) => e.id);
    if (state.run.boss && !state.run.boss.dead) targets.push("boss");
    if (targets.length === 0) return "tick";
    return `attack ${targets[rint(rng, targets.length)]}`;
  }
  return `answer ${rint(rng, 4)}`; // riddle floors; denied elsewhere
}

function commit(state, world, cmd) {
  const result = validate({ state, world }, cmd);
  if (!Array.isArray(result)) return state; // Denial — no state change
  let seq = state.seq;
  for (const ev of result) state = reduce(state, world, { ...ev, seq: ++seq });
  return state;
}

/** The invariants — objective, seal-agnostic, and (for the first three)
 *  exactly what the #72-#75 economy/combat reviews verified by hand. */
function assertInvariants(state, where) {
  const c = state.character;
  assert.ok(c.gold >= 0, `${where}: gold must never be negative (was ${c.gold})`);
  assert.ok(c.potions >= 0, `${where}: potions must never be negative (was ${c.potions})`);
  assert.ok(c.hp <= c.maxhp, `${where}: hp (${c.hp}) must never exceed maxhp (${c.maxhp})`);
  const tiles = state.run.collectedTiles || [];
  assert.equal(new Set(tiles).size, tiles.length, `${where}: collectedTiles must have no duplicates`);
  const ids = state.run.enemies.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, `${where}: run.enemies ids must be unique`);
}

const STEPS = 200;

for (const { seed, floor, seal } of FLOORS) {
  test(`invariants + determinism hold over ${STEPS} seeded random steps on a real ${seal} floor (seed ${seed}, floor ${floor})`, () => {
    const rng = channel("some-hero-invariant-fuzz", seed, String(floor));

    // Live run: fold each command, assert invariants after every step,
    // record the exact command log.
    let { state, world } = tombState(seed, floor);
    assertInvariants(state, `${seal} step 0`);
    const log = [];
    for (let step = 1; step <= STEPS; step++) {
      const cmd = commandFor(rng, state);
      log.push(cmd);
      state = commit(state, world, cmd); // throws → test fails (the no-crash invariant)
      assertInvariants(state, `${seal} step ${step} (cmd "${cmd}")`);
    }

    // Determinism: replay the identical log from a fresh state → the final
    // serializeState hash must be byte-identical (the kernel's promise).
    let replay = tombState(seed, floor).state;
    const rworld = tombState(seed, floor).world;
    for (const cmd of log) replay = commit(replay, rworld, cmd);
    assert.equal(
      h32(serializeState(replay)),
      h32(serializeState(state)),
      `${seal}: replaying the random command log must reproduce an identical state hash`,
    );
  });
}
