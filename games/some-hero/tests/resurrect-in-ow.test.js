/* Adversarial-review regression (2026-07-07, Major): RESURRECTED must
   reset character.pos to the guild-hall spawn even when the player dies
   while ALREADY in the "ow" zone — previously ev.spawn was set only for a
   tomb death, so dying in the guild hall left the player standing where
   they died (silent divergence from legacy respawnAtGuild + the spec's
   unconditional "character.pos = the ow map's world.spawn"). Reachable
   via the un-gated `hurt` verb. */
import test from "node:test";
import assert from "node:assert/strict";
import { validate, reduce } from "../shared/module.js";
import { createState } from "../shared/reducer.js";
import { guildHallWorld } from "../rules/tests/ceremony-kernel/kernel-helpers.mjs";

test("RESURRECTED resets pos to the guild spawn even when dying in the ow zone", () => {
  const owWorld = guildHallWorld();
  let st = reduce(createState(), owWorld, { t: "FLOOR_ENTERED", zone: "ow", floorNum: 0, mapId: "map:guild_hall", seq: 1 });
  const spawn = { ...st.character.pos };

  const apply = (cmd) => {
    const r = validate({ state: st, world: owWorld, from: "player" }, cmd);
    assert.ok(Array.isArray(r), `expected "${cmd}" legal, got ${JSON.stringify(r)}`);
    for (const ev of r) st = reduce(st, owWorld, { ...ev, seq: st.seq + 1 });
    return r;
  };

  // Stand somewhere other than the spawn tile, still in "ow".
  st = { ...st, character: { ...st.character, pos: { x: spawn.x + 1, y: spawn.y } } };
  assert.notDeepEqual(st.character.pos, spawn);
  assert.equal(st.world.zone, "ow");

  // Die in ow, then resurrect.
  apply("hurt 999 test");
  assert.equal(st.pending?.kind, "resurrection", "hurting to 0 hp in ow must arm resurrection");
  apply("resurrect");

  assert.equal(st.world.zone, "ow");
  assert.deepEqual(st.character.pos, spawn,
    "resurrecting after an ow death must return the player to the guild spawn, not leave them where they died");
});
