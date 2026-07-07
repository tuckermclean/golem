/* ── DELTA A3 PR1 DoD tests: the adventure content pack
   (imported-content/adventure/content/) compiles through
   @golem-engine/content with zero errors, and its entity shape/counts
   match content/entities.mjs's hand-transcription of world.yaml's 33
   rooms / 5 doors / 50 items / 4 surviving characters (design spec,
   "Tests" — "pack compiles... expected entity count / a spot of key
   entities"). Also spot-checks 2 descriptions byte-identical to
   world.yaml (design spec, "Descriptions byte-identical"). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildSourcePack, compileContentPack } from "../content/build-pack.mjs";
import { compile } from "@golem-engine/content";

const WORLD_YAML = readFileSync(new URL("../legacy/world.yaml", import.meta.url), "utf8");

test("the adventure content pack compiles with zero errors", () => {
  const source = buildSourcePack();
  const result = compile(source);
  if (!result.ok) {
    console.error("CompileErrors:", JSON.stringify(result.errors, null, 2));
  }
  assert.equal(result.ok, true);
});

test("compileContentPack() round-trips the same result as compile(buildSourcePack())", () => {
  const viaHelper = compileContentPack();
  const source = buildSourcePack();
  const viaDirect = compile(source);
  assert.deepEqual(viaHelper, viaDirect);
});

test("tables: [] and maps: [] (a free-form room graph, not a grid — no natural table use)", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  assert.deepEqual(result.pack.tables, {});
  assert.deepEqual(result.pack.maps, {});
});

test("entity count: 33 rooms + 5 doors + 50 items + 4 characters = 92", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const ids = Object.keys(result.pack.entities);
  assert.equal(ids.length, 92);

  const rooms = ids.filter((id) => id.startsWith("entity:room_"));
  const doors = ids.filter((id) => id.startsWith("entity:door_"));
  const items = ids.filter((id) => id.startsWith("entity:item_"));
  const characters = ids.filter((id) => id.startsWith("entity:char_"));
  assert.equal(rooms.length, 33, "33 rooms (world.yaml's `rooms:` list)");
  assert.equal(doors.length, 5, "5 doors (world.yaml's `doors:` list)");
  assert.equal(items.length, 50, "50 items across all rooms + the wizard's odd key + the sarcophagus's rusty sword");
  assert.equal(characters.length, 4, "4 surviving characters: wizard + stray dog + raven + cat");
  assert.equal(rooms.length + doors.length + items.length + characters.length, ids.length);
});

test("village square room: Identity, RegionMembership, and 4 unlocked Exits", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const room = result.pack.entities["entity:room_village_square"];
  assert.ok(room, "entity:room_village_square must exist");
  assert.equal(room.components.Identity.name, "village square");
  assert.equal(room.components.RegionMembership.region, "village_square");
  assert.equal(room.components.Exits.length, 4);
  const targets = room.components.Exits.map((e) => e.to.$ref).sort();
  assert.deepEqual(targets, [
    "entity:room_back_alley",
    "entity:room_forest_road",
    "entity:room_shop",
    "entity:room_tavern",
  ]);
});

test("the secret-portal hidden door: no key, gated on an `any` insight condition", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const door = result.pack.entities["entity:door_secret_portal"];
  assert.ok(door, "entity:door_secret_portal must exist");
  assert.equal(door.components.Identity.name, "secret portal");
  assert.equal(door.components.Lock.key, undefined, "the secret portal is condition-gated, not keyed");
  assert.deepEqual(door.components.Lock.unlockCondition, {
    any: [{ fact: "mushroom_insight" }, { fact: "potion_insight" }],
  });
  const targets = door.components.Exits.map((e) => e.to.$ref).sort();
  assert.deepEqual(targets, ["entity:room_ancient_ruin", "entity:room_haunted_grove"]);
});

test("the 4 keyed doors' Lock.key resolves to a real item entity of that name", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const keyedDoors = {
    "entity:door_back_door": "entity:item_odd_key",
    "entity:door_front_door": "entity:item_sparkling_fish",
    "entity:door_basement_door": "entity:item_basement_key",
    "entity:door_tower_door": "entity:item_tower_key",
  };
  for (const [doorId, keyItemId] of Object.entries(keyedDoors)) {
    const door = result.pack.entities[doorId];
    assert.ok(door, `${doorId} must exist`);
    assert.equal(door.components.Lock.key.$ref, keyItemId);
    assert.ok(result.pack.entities[keyItemId], `${keyItemId} (the door's key) must exist as a real entity`);
  }
});

test("the wizard: Identity, Knowledge, an Interactable, and a Spawns handoff to the odd key", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const wizard = result.pack.entities["entity:char_wizard"];
  assert.ok(wizard, "entity:char_wizard must exist");
  assert.equal(wizard.components.Identity.name, "wizard");
  assert.ok(Array.isArray(wizard.components.Knowledge.knows));
  assert.ok(wizard.components.Knowledge.knows.length > 0);
  assert.equal(typeof wizard.components.Interactable.prompt, "string");
  assert.equal(wizard.components.Spawns.entity.$ref, "entity:item_odd_key");
  assert.deepEqual(wizard.components.Spawns.when, {
    all: [{ fact: "has_rare_mushroom" }, { not: { fact: "wizard_gave_key" } }],
  });
});

test("the odd key: a real, takeable item entity (not just a bare string)", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const key = result.pack.entities["entity:item_odd_key"];
  assert.ok(key, "entity:item_odd_key must exist");
  assert.equal(key.components.Identity.name, "odd key");
  assert.ok("Portable" in key.components);
});

test("no AICharacter survives: bartender/carl/old man/spider/alchemist are all omitted", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  for (const dropped of ["bartender", "carl", "old_man", "spider", "alchemist"]) {
    assert.equal(
      result.pack.entities[`entity:char_${dropped}`],
      undefined,
      `entity:char_${dropped} must not exist (AICharacter, dropped by type)`,
    );
  }
});

test("no entity anywhere carries a func:/condition: field name (only declarative components)", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  for (const entity of Object.values(result.pack.entities)) {
    assert.equal("func" in entity.components, false, `${entity.id} must not carry a func component`);
    assert.equal("condition" in entity.components, false, `${entity.id} must not carry a bare condition component`);
  }
});

// ── byte-identical description spot checks (design spec: "Descriptions
// byte-identical") ──────────────────────────────────────────────────────

test("village square's description is byte-identical to world.yaml", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const description = result.pack.entities["entity:room_village_square"].components.Identity.description;
  assert.ok(
    WORLD_YAML.includes(description),
    "village square's transcribed description must appear verbatim in world.yaml",
  );
});

test("the wizard's description is byte-identical to world.yaml", () => {
  const result = compileContentPack();
  assert.equal(result.ok, true);
  const description = result.pack.entities["entity:char_wizard"].components.Identity.description;
  assert.ok(
    WORLD_YAML.includes(description),
    "the wizard's transcribed description must appear verbatim in world.yaml",
  );
});
