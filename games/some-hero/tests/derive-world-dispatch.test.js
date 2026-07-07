/* ── Unit tests for S3 PR4 (docs/superpowers/specs/2026-07-07-s3-pr4-
   derive-wiring-design.md): the `deriveWorld` dispatcher + seed
   threading. Two concerns:

     - The DISPATCHER itself (shared/module.js's `deriveWorld(pack,
       worldState, seed?)`): a "map:" mapId routes to the existing,
       byte-for-byte-unchanged `deriveWorldFromPack` path; a "tomb:"
       mapId routes to the NEW generated-floor path (shared/floorgen.js's
       generateFloor, S3 PR2).
     - The PRODUCTION FLOW: a real host (src/host.js's createHost) with
       a `seed`, driven through the real ow gate -> "proceed" ->
       ENTERED_TOMB ceremony, proves the seed actually reaches the
       ENTERED_TOMB mapId AND that `deriveWorld` reproduces a live,
       walkable, enemy-populated generated tomb floor from it — not just
       that the dispatcher branches correctly in isolation.

   Backward-compat (the PR's hard constraint) is proven ELSEWHERE: every
   existing some-hero/ceremony-kernel/legacy-ceremony test already
   exercises validate()/enteredTombEvent() with NO seed in ctx, and stays
   green unchanged (see this PR's own commit message for the exact
   counts). This file only adds NEW coverage for the additive seed path. */
import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "@golem-engine/content";
import { validate, deriveWorldFromPack, deriveWorld } from "../shared/module.js";
import { generateFloor } from "../shared/floorgen.js";
import { createState, reduce } from "../shared/reducer.js";
import { createHost } from "../src/host.js";
import { compileSyntheticFloorPack, SYNTHETIC_MAP_ID } from "./fixtures/synthetic-floor.mjs";
import { ENTITY_DEFS } from "../content/entities.mjs";
import { GUILD_HALL_MAP } from "../content/guild-hall-map.mjs";

function compileGuildHall(name) {
  const compiled = compile({ name, version: 1, entities: ENTITY_DEFS, tables: [], maps: [GUILD_HALL_MAP] });
  assert.ok(compiled.ok, `expected map:guild_hall to compile: ${JSON.stringify(compiled.ok ? null : compiled.errors)}`);
  return compiled.pack;
}

// ── deriveWorld dispatcher: "map:" mapId ────────────────────────────────

test("deriveWorld: a \"map:\" mapId routes to the unchanged deriveWorldFromPack path", () => {
  const compiled = compileSyntheticFloorPack();
  assert.ok(compiled.ok, "the synthetic floor pack must compile");
  const worldState = { zone: "tomb", floorNum: 1, mapId: SYNTHETIC_MAP_ID };

  const viaDispatcher = deriveWorld(compiled.pack, worldState);
  const viaDirect = deriveWorldFromPack(compiled.pack, worldState);
  assert.deepEqual(viaDispatcher, viaDirect, "the \"map:\" branch must be byte-for-byte identical to calling deriveWorldFromPack directly");

  // Same for the real committed map:guild_hall — the OTHER "map:" mapId
  // in live use (the ow side of the ceremony).
  const pack = compileGuildHall("derive-world-dispatch-map-branch");
  const owState = { zone: "ow", floorNum: 0, mapId: "map:guild_hall" };
  assert.deepEqual(deriveWorld(pack, owState), deriveWorldFromPack(pack, owState));
});

// ── deriveWorld dispatcher: "tomb:" mapId ───────────────────────────────

test('deriveWorld: a "tomb:a:0:1" mapId generates the floor via generateFloor("a", 1)', () => {
  const pack = compileGuildHall("derive-world-dispatch-tomb-branch");
  const worldState = { zone: "tomb", floorNum: 1, mapId: "tomb:a:0:1" };

  const world = deriveWorld(pack, worldState);
  const floor = generateFloor("a", 1);

  assert.equal(world.zone, "tomb");
  assert.equal(world.floorNum, 1);
  assert.equal(world.mapId, "tomb:a:0:1");
  assert.equal(world.rows, floor.gridH);
  assert.equal(world.cols, floor.gridW);
  assert.deepEqual([...world.walls].sort(), [...floor.walls].sort());
  assert.deepEqual(world.spawn, floor.spawn);
  assert.deepEqual(world.stairsAt, floor.stairsAt);
  assert.equal(world.upstairsAt, null, "the generator has no ascent tile — tomb floors are entered only, never generator-authored with a '<' equivalent");
  assert.equal(world.gate, null, "no Door Golem in the tomb");
  assert.deepEqual(
    world.enemySpawns,
    floor.enemies.map((e) => ({ kind: e.kind, pos: { x: e.x, y: e.y } })),
  );
  assert.ok(world.enemyTypes.skeleton, "enemyTypes is pack-scoped, unchanged — buildEnemyTypes(pack)");
  assert.equal(world.enemyTypes.skeleton.hp, 4);
  for (const p of floor.pickups) {
    assert.deepEqual(world.pickupAt.get(`${p.x},${p.y}`), { kind: p.kind, amount: p.amount });
  }
  assert.deepEqual(world.puzzle, floor.puzzle);
  assert.deepEqual(world.pinnedRooms, floor.pinnedRooms);

  // Purity: re-deriving the SAME mapId reproduces the exact same floor
  // (doctrine #1 — the mapId string alone is the generation key).
  const again = deriveWorld(pack, worldState);
  assert.deepEqual(again, world);
});

test("deriveWorld: an unseeded call ignores its (unused) seed parameter for a \"tomb:\" mapId — the mapId alone decides", () => {
  const pack = compileGuildHall("derive-world-dispatch-tomb-seed-param");
  const worldState = { zone: "tomb", floorNum: 1, mapId: "tomb:xyz:2:1" };
  const withSeedArg = deriveWorld(pack, worldState, "totally-different-seed-value");
  const withoutSeedArg = deriveWorld(pack, worldState);
  assert.deepEqual(withSeedArg, withoutSeedArg, "the generation seed lives in the mapId, never a side-channel");
  assert.deepEqual(withSeedArg, deriveWorld(pack, worldState, undefined));
});

// ── Production flow: a real host, a seed, gate -> proceed -> ENTERED_TOMB ──

test("production flow: a seeded host's ENTERED_TOMB carries a real \"tomb:\" mapId, and deriveWorld reproduces a live generated floor", () => {
  const SEED = "s3-pr4-production-flow-seed";
  const pack = compileGuildHall("derive-world-dispatch-production-flow");
  const owWorld = deriveWorldFromPack(pack, { zone: "ow", floorNum: 0, mapId: "map:guild_hall" });

  let st = reduce(createState(), owWorld, { t: "FLOOR_ENTERED", zone: "ow", floorNum: 0, mapId: "map:guild_hall", seq: 1 });
  // Satisfy the Door Golem's credential gate (same setup as tests/
  // combat.test.js's own "ENTERED_TOMB seeds run.enemies..." test).
  st = {
    ...st,
    knowledge: { ...st.knowledge, credentials: { backstory: true, debt: true } },
    character: { ...st.character, swordLv: 1 },
  };

  const S = { st, world: owWorld, pack, seed: SEED };
  const commits = [];
  const denials = [];
  const host = createHost(S, {
    onCommit: (ev) => commits.push(ev),
    onDenyLocal: (reason) => denials.push(reason),
    onCmd: () => {},
  });

  // Walk from spawn to the guild hall's stairsAt tile (the Door Golem's
  // own gate check fires on arrival) — same route combat.test.js walks.
  for (const cmd of ["move 1 0", "move 1 0", "move 0 1", "move 0 1", "move 0 1"]) {
    host.hostCmd("p1", cmd);
  }
  assert.deepEqual(denials, [], "no move in the scripted route should be denied");
  assert.equal(S.st.world.zone, "ow", "GOLEM_APPROVED only — still topside, ceremony pending");
  assert.equal(S.st.pending && S.st.pending.kind, "ceremony");

  host.hostCmd("p1", "proceed");
  assert.deepEqual(denials, [], "\"proceed\" must be legal once the ceremony is pending");

  assert.equal(S.st.world.zone, "tomb");
  const expectedMapId = `tomb:${SEED}:0:1`;
  assert.equal(S.st.world.mapId, expectedMapId, "runs was 0 pre-ENTERED_TOMB (state.knowledge.runs at construction time)");
  assert.equal(S.world.mapId, expectedMapId, "the host re-derived S.world off the same seeded mapId");

  // The independently-recomputed floor for this exact (seed, floorNum)
  // must match what the live ceremony actually produced, by purity.
  const floor = generateFloor(SEED, 1);
  assert.deepEqual(S.st.character.pos, floor.spawn, "the player lands on the generated floor's own spawn tile");
  assert.deepEqual(S.world.spawn, floor.spawn);
  assert.deepEqual(S.world.stairsAt, floor.stairsAt);
  assert.ok(S.world.walls.size > 0, "a real generated floor has walls");
  assert.ok(S.st.run.enemies.length > 0, "the generated tomb floor is populated with live enemies");

  // deriveWorld(pack, state.world, seed) — the exact call the design
  // spec's production-flow test asks for — reproduces the SAME world.
  const rederived = deriveWorld(pack, S.st.world, SEED);
  assert.deepEqual(rederived, S.world);

  // The player can move: from a room center, at least the +x neighbor is
  // always in-bounds floor (every generated room is >= 4 wide/tall, so a
  // room's center has a floor neighbor on every side — see
  // packages/world's placeRooms: cx = x + (w>>1)).
  const before = S.st.character.pos;
  host.hostCmd("p1", "move 1 0");
  assert.deepEqual(denials, [], "movement in the freshly-generated tomb must be legal");
  assert.deepEqual(S.st.character.pos, { x: before.x + 1, y: before.y }, "the character actually moved");
});
