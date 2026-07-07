/* ── DELTA A3 PR2 DoD tests: the adventure GameModule (imported-content/
   adventure/module/{module,reducer}.js). Generic declarative mechanics
   only — every case below drives a real content-pack entity/component,
   never a bespoke per-NPC branch. See docs/superpowers/specs/
   2026-07-07-a3-pr2-module-terminal-design.md's "Tests" section for the
   exact DoD list this file satisfies: go moves regions (locked door w/
   key denied-then-allowed); take/drop move items; use sets the insight
   fact; the secret-portal door's go is denied without insight, allowed
   with it (the walkability proof); determinism (replay -> identical
   hash). */
import test from "node:test";
import assert from "node:assert/strict";

import { compileContentPack } from "../content/build-pack.mjs";
import { deriveWorld, validate, reduce, createState, serializeState, module } from "../module/module.js";
import { replay } from "@golem-engine/kernel";
import { h32 } from "@golem-engine/random";

function compilePack() {
  const result = compileContentPack();
  assert.equal(result.ok, true, "adventure content pack must compile (PR1 gate)");
  return result.pack;
}

/** Apply one legal "go <region>" command, asserting it is NOT a Denial,
 *  and return the post-move state. Small helper so the walkability-proof
 *  test below reads as a real command-driven walk, not a hand-built
 *  state. */
function go(state, world, region) {
  const r = validate({ state, world }, { verb: "go", noun: region });
  assert.ok(Array.isArray(r), `expected "go ${region}" to be legal, got Denial: ${JSON.stringify(r)}`);
  let s = state;
  for (const ev of r) s = reduce(s, world, { ...ev, seq: s.seq + 1 });
  return s;
}

test("deriveWorld: 33 rooms, entry room is the pack's first room (village square)", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  assert.equal(Object.keys(world.rooms).length, 33);
  assert.equal(world.startRegion, "village_square");
  assert.equal(world.rooms.village_square.exits.length, 4);
});

test("go: moves the player between two unlocked regions", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  const state0 = createState(world);
  assert.equal(state0.region, "village_square");

  const r = validate({ state: state0, world }, { verb: "go", noun: "shop" });
  assert.deepEqual(r, [{ t: "MOVED", to: "shop" }]);
  const state1 = reduce(state0, world, { ...r[0], seq: state0.seq + 1 });
  assert.equal(state1.region, "shop");
});

test("go: unknown exit is denied with a reason", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  const state0 = createState(world);
  const r = validate({ state: state0, world }, { verb: "go", noun: "nowhere_at_all" });
  assert.equal(Array.isArray(r), false);
  assert.equal(typeof r.deny, "string");
});

test("go: a keyed locked door (tower door) is denied without the key, allowed with it", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  // Construct a state standing at "tower", the tower door's own inner
  // endpoint (door_tower_door bridges tower_stairs<->tower, Lock keyed
  // on entity:item_tower_key -- see content/entities.mjs's DOOR_DEFS).
  const atTower = { ...createState(world), region: "tower" };

  const denied = validate({ state: atTower, world }, { verb: "go", noun: "tower_stairs" });
  assert.equal(Array.isArray(denied), false);
  assert.match(denied.deny, /tower door/i);

  const withKey = { ...atTower, inventory: ["entity:item_tower_key"] };
  const allowed = validate({ state: withKey, world }, { verb: "go", noun: "tower_stairs" });
  assert.deepEqual(allowed, [{ t: "MOVED", to: "tower_stairs" }]);
});

test("take / drop: move an item between a room's item list and the player's inventory", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  let state = { ...createState(world), region: "shop" };
  assert.ok(state.roomItems.shop.includes("entity:item_dusty_lantern"));

  const took = validate({ state, world }, { verb: "take", noun: "entity:item_dusty_lantern" });
  assert.deepEqual(took, [{ t: "TOOK", item: "entity:item_dusty_lantern" }]);
  state = reduce(state, world, { ...took[0], seq: state.seq + 1 });
  assert.ok(state.inventory.includes("entity:item_dusty_lantern"));
  assert.equal(state.roomItems.shop.includes("entity:item_dusty_lantern"), false);

  const dropped = validate({ state, world }, { verb: "drop", noun: "entity:item_dusty_lantern" });
  assert.deepEqual(dropped, [{ t: "DROPPED", item: "entity:item_dusty_lantern" }]);
  state = reduce(state, world, { ...dropped[0], seq: state.seq + 1 });
  assert.equal(state.inventory.includes("entity:item_dusty_lantern"), false);
  assert.ok(state.roomItems.shop.includes("entity:item_dusty_lantern"));
});

test("take: denies an item that isn't Portable", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  const state = { ...createState(world), region: "forest_road" };
  assert.ok(state.roomItems.forest_road.includes("entity:item_signpost"));
  const r = validate({ state, world }, { verb: "take", noun: "entity:item_signpost" });
  assert.equal(Array.isArray(r), false);
});

test("use: eating the rare mushroom sets the mushroom_insight fact", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  let state = { ...createState(world), region: "deep_forest_path" };
  assert.ok(state.roomItems.deep_forest_path.includes("entity:item_rare_mushroom"));

  const r = validate({ state, world }, { verb: "use", noun: "entity:item_rare_mushroom" });
  assert.deepEqual(r, [{ t: "USED", item: "entity:item_rare_mushroom", setFact: "mushroom_insight" }]);
  state = reduce(state, world, { ...r[0], seq: state.seq + 1 });
  assert.ok(state.facts.includes("mushroom_insight"));
});

test("use: the flashlight's Toggle flips on/off across two uses", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  let state = { ...createState(world), region: "pantry" };
  assert.ok(state.roomItems.pantry.includes("entity:item_flashlight"));

  let r = validate({ state, world }, { verb: "use", noun: "entity:item_flashlight" });
  assert.deepEqual(r, [{ t: "TOGGLED", item: "entity:item_flashlight", on: true }]);
  state = reduce(state, world, { ...r[0], seq: state.seq + 1 });

  r = validate({ state, world }, { verb: "use", noun: "entity:item_flashlight" });
  assert.deepEqual(r, [{ t: "TOGGLED", item: "entity:item_flashlight", on: false }]);
});

test("use: the antidote potion's clearFact only fires when the `when` gate (mutant) holds", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  const state = { ...createState(world), region: "library" };
  assert.ok(state.roomItems.library.includes("entity:item_antidote_potion"));

  // Not mutant yet: the event still fires (a legal "use"), but no
  // clearFact field is attached (the `when` gate did not hold).
  const r1 = validate({ state, world }, { verb: "use", noun: "entity:item_antidote_potion" });
  assert.deepEqual(r1, [{ t: "USED", item: "entity:item_antidote_potion" }]);

  const mutantState = { ...state, facts: ["mutant"] };
  const r2 = validate({ state: mutantState, world }, { verb: "use", noun: "entity:item_antidote_potion" });
  assert.deepEqual(r2, [{ t: "USED", item: "entity:item_antidote_potion", clearFact: "mutant" }]);
  const after = reduce(mutantState, world, { ...r2[0], seq: mutantState.seq + 1 });
  assert.equal(after.facts.includes("mutant"), false);
});

test("use: the sarcophagus Spawns the rusty sword into the room once the mutant fact holds", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  const mutantState = { ...createState(world), region: "catacombs", facts: ["mutant"] };
  assert.ok(mutantState.roomItems.catacombs.includes("entity:item_sarcophagus"));
  assert.equal(mutantState.roomItems.catacombs.includes("entity:item_rusty_sword"), false);

  const r = validate({ state: mutantState, world }, { verb: "use", noun: "entity:item_sarcophagus" });
  assert.deepEqual(r, [
    { t: "USED", item: "entity:item_sarcophagus" },
    { t: "SPAWNED", entity: "entity:item_rusty_sword", region: "catacombs" },
  ]);
  let state = mutantState;
  for (const ev of r) state = reduce(state, world, { ...ev, seq: state.seq + 1 });
  assert.ok(state.roomItems.catacombs.includes("entity:item_rusty_sword"));
});

test("talk: the wizard hands over the odd key once the player is holding the rare mushroom", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  const state = { ...createState(world), region: "wizards_tower", inventory: ["entity:item_rare_mushroom"] };
  assert.ok(world.rooms.wizards_tower.npcs.includes("entity:char_wizard"));

  const r = validate({ state, world }, { verb: "talk", noun: "entity:char_wizard" });
  assert.deepEqual(r, [{ t: "SPAWNED", entity: "entity:item_odd_key", region: "wizards_tower" }]);
  const after = reduce(state, world, { ...r[0], seq: state.seq + 1 });
  assert.ok(after.roomItems.wizards_tower.includes("entity:item_odd_key"));
});

test("talk: without the mushroom, talking to the wizard is legal but spawns nothing", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  const state = { ...createState(world), region: "wizards_tower" };
  const r = validate({ state, world }, { verb: "talk", noun: "entity:char_wizard" });
  assert.deepEqual(r, []);
});

test("talk: an unknown/absent npc is denied", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  const state = createState(world); // village square has no npcs
  const r = validate({ state, world }, { verb: "talk", noun: "entity:char_wizard" });
  assert.equal(Array.isArray(r), false);
});

test("unknown verb is denied with a reason", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  const state = createState(world);
  const r = validate({ state, world }, { verb: "frobnicate", noun: "entity:item_fountain" });
  assert.equal(Array.isArray(r), false);
  assert.match(r.deny, /frobnicate/);
});

// ── The walkability proof (design spec's own phrase): the secret
// portal (haunted_grove <-> ancient_ruin) is denied without insight and
// allowed with it, walked entirely via legal go/take/use commands from
// the real entry room -- not a hand-built state. ─────────────────────
test("walkability proof: the secret portal is denied without insight, walked from the entry room", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);

  let state = createState(world);
  state = go(state, world, "forest_road");
  state = go(state, world, "forest_clearing");
  state = go(state, world, "enchanted_pond");
  state = go(state, world, "deep_forest_path");
  state = go(state, world, "misty_glen");
  state = go(state, world, "fae_circle");
  state = go(state, world, "haunted_grove");

  const denied = validate({ state, world }, { verb: "go", noun: "ancient_ruin" });
  assert.equal(Array.isArray(denied), false);
  assert.match(denied.deny, /secret portal/i);
});

test("walkability proof: the secret portal is allowed once mushroom_insight is set, walked from the entry room", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);

  let state = createState(world);
  state = go(state, world, "forest_road");
  state = go(state, world, "forest_clearing");
  state = go(state, world, "enchanted_pond");
  state = go(state, world, "deep_forest_path");

  const took = validate({ state, world }, { verb: "take", noun: "entity:item_rare_mushroom" });
  state = reduce(state, world, { ...took[0], seq: state.seq + 1 });
  const used = validate({ state, world }, { verb: "use", noun: "entity:item_rare_mushroom" });
  state = reduce(state, world, { ...used[0], seq: state.seq + 1 });
  assert.ok(state.facts.includes("mushroom_insight"));

  state = go(state, world, "misty_glen");
  state = go(state, world, "fae_circle");
  state = go(state, world, "haunted_grove");

  const allowed = validate({ state, world }, { verb: "go", noun: "ancient_ruin" });
  assert.deepEqual(allowed, [{ t: "MOVED", to: "ancient_ruin" }]);
});

// ── Determinism: replaying a committed event log via @golem-engine/
// kernel's replay() from a fresh initial state reaches the exact same
// serialized/hashed state as the incremental fold used to produce that
// log in the first place. ────────────────────────────────────────────
test("determinism: replay() over a committed log reproduces the same state hash", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);

  const initialState = createState(world);
  const log = [];
  let state = initialState;

  function commit(ev) {
    const stamped = { ...ev, seq: state.seq + 1 };
    log.push(stamped);
    state = reduce(state, world, stamped);
  }

  for (const region of ["forest_road", "forest_clearing", "enchanted_pond", "deep_forest_path"]) {
    const r = validate({ state, world }, { verb: "go", noun: region });
    for (const ev of r) commit(ev);
  }
  const took = validate({ state, world }, { verb: "take", noun: "entity:item_rare_mushroom" });
  for (const ev of took) commit(ev);
  const used = validate({ state, world }, { verb: "use", noun: "entity:item_rare_mushroom" });
  for (const ev of used) commit(ev);

  const replayed = replay(module, world, log, initialState);

  assert.equal(serializeState(replayed), serializeState(state));
  assert.equal(h32(serializeState(replayed)), h32(serializeState(state)));
  assert.equal(replayed.region, "deep_forest_path");
  assert.ok(replayed.facts.includes("mushroom_insight"));
});

test("determinism: two independent replays of the same log hash identically", () => {
  const pack = compilePack();
  const world = deriveWorld({}, pack);
  const initialState = createState(world);

  const log = [
    { t: "MOVED", to: "forest_road", seq: 1 },
    { t: "MOVED", to: "forest_clearing", seq: 2 },
  ];

  const a = replay(module, world, log, initialState);
  const b = replay(module, world, log, initialState);
  assert.equal(h32(serializeState(a)), h32(serializeState(b)));
});
