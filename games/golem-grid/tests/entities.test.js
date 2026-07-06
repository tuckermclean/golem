/* DELTA C3's DoD, made runnable: golem-grid's players/items/prize are
 * reachable as entities/components via shared/entities.js's
 * `entitiesOf(state, dungeon)`, for all 25 frozen fixtures
 * (packages/testkit/fixtures/golem/) — both at final state (all 25
 * reach WIN, so `prize_by` is always set there) and at a log *prefix*
 * ending just before the fixture's single TAKE_PRIZE event (to
 * exercise the not-yet-taken prize branch, position = `dun.prize`).
 *
 * `entitiesOf` is a read-only overlay: it is never in the call graph
 * of `reduce`/`applyEvent`/`validate`/`serializeState` (see
 * entities-not-in-callgraph.test.js), so this file only has to prove
 * the *projection* is correct — the byte-identity of fixture hashes is
 * proven independently by packages/testkit/tests/kernel-replay.test.js
 * and `npm run freeze:verify`, both untouched by this task.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { genDungeon } from "../shared/worldgen.js";
import { createState, applyEvent } from "../shared/reducer.js";
import { entitiesOf } from "../shared/entities.js";

const FIXTURES_DIR = new URL(
  "../../../packages/testkit/fixtures/golem/",
  import.meta.url,
);
const index = JSON.parse(readFileSync(new URL("index.json", FIXTURES_DIR), "utf8"));

assert.equal(
  index.length,
  25,
  "expected exactly 25 frozen golem-grid seeds (DELTA P0.3) — the fixture set itself changed, which this test must not cause or paper over",
);

function replayLog(dun, log) {
  const st = createState();
  for (const ev of log) applyEvent(st, dun, ev);
  return st;
}

for (const entry of index) {
  const dun = genDungeon(entry.seed);
  const log = JSON.parse(readFileSync(new URL(entry.log, FIXTURES_DIR), "utf8"));

  test(`entitiesOf: seed "${entry.seed}" — final state entities/components`, () => {
    const st = replayLog(dun, log);
    assert.equal(st.D.get("gameover"), "WIN", `seed ${entry.seed}: expected fixture to reach WIN`);

    const entities = entitiesOf(st, dun);
    const byId = new Map(entities.map((e) => [e.id, e]));

    // One entity:player:<id> per player:<id> key, matching components.
    const playerKeys = [...st.D.keys()].filter((k) => k.startsWith("player:"));
    assert.ok(playerKeys.length > 0, `seed ${entry.seed}: expected at least one player`);
    for (const key of playerKeys) {
      const pid = key.slice("player:".length);
      const p = st.D.get(key);
      const ent = byId.get("entity:player:" + pid);
      assert.ok(ent, `seed ${entry.seed}: missing entity:player:${pid}`);
      assert.deepEqual(ent.components.Identity, { name: p.name });
      assert.deepEqual(ent.components.GridPosition, { x: p.x, y: p.y });
      assert.deepEqual(ent.components.Inventory, { items: p.inv });
      assert.deepEqual(ent.components.Actor, { controlledBy: "player" });
      assert.equal(Object.keys(ent.components).length, 4);
    }

    // One entity:item:<x>,<y> per un-taken dungeon.items key.
    for (const [key, name] of dun.items) {
      const taken = st.D.get("taken:" + key);
      const ent = byId.get("entity:item:" + key);
      if (taken) {
        assert.equal(ent, undefined, `seed ${entry.seed}: taken item ${key} must not be an entity`);
      } else {
        assert.ok(ent, `seed ${entry.seed}: missing entity:item:${key}`);
        const [x, y] = key.split(",").map(Number);
        assert.deepEqual(ent.components.Identity, { name });
        assert.deepEqual(ent.components.GridPosition, { x, y });
        assert.deepEqual(ent.components.Portable, {});
        assert.equal(Object.keys(ent.components).length, 3);
      }
    }

    // Exactly one entity:prize, whose GridPosition equals the carrying
    // player's GridPosition (all 25 fixtures reach WIN => prize_by set).
    const prizeEnts = entities.filter((e) => e.id === "entity:prize");
    assert.equal(prizeEnts.length, 1, `seed ${entry.seed}: expected exactly one entity:prize`);
    const prizeEnt = prizeEnts[0];
    const carrierId = st.D.get("prize_by");
    assert.ok(carrierId, `seed ${entry.seed}: expected prize_by to be set at final state`);
    const carrier = st.D.get("player:" + carrierId);
    assert.deepEqual(prizeEnt.components.Identity, { name: "prize" });
    assert.deepEqual(prizeEnt.components.Portable, {});
    assert.deepEqual(prizeEnt.components.GridPosition, { x: carrier.x, y: carrier.y });
    assert.equal(Object.keys(prizeEnt.components).length, 3);
  });

  test(`entitiesOf: seed "${entry.seed}" — prize not yet taken (position = dun.prize)`, () => {
    const takeIdx = log.findIndex((ev) => ev.t === "TAKE_PRIZE");
    assert.ok(takeIdx >= 0, `seed ${entry.seed}: expected one TAKE_PRIZE event in the log`);

    const prefix = log.slice(0, takeIdx);
    const st = replayLog(dun, prefix);
    assert.equal(st.D.get("prize_by"), undefined, `seed ${entry.seed}: prize_by must be unset before TAKE_PRIZE`);

    const entities = entitiesOf(st, dun);
    const prizeEnts = entities.filter((e) => e.id === "entity:prize");
    assert.equal(prizeEnts.length, 1, `seed ${entry.seed}: expected exactly one entity:prize`);
    assert.deepEqual(prizeEnts[0].components.GridPosition, { x: dun.prize.x, y: dun.prize.y });
  });
}
