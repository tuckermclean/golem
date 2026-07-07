/* ── some-hero Ceremony content — the Guild Hall map (DELTA S1 PR1).
   In legacy, "Guild Hall" is procedurally generated overworld terrain
   (games/some-hero/legacy/src/world/overworld.js, 72x72 noise) — there
   is no authored map file to transcribe. Per the design spec's locked
   decision #1, S1 hand-authors a MINIMAL map instead: a small room
   holding the Door Golem and a stairs-down tile reachable from spawn.
   The 72x72 noise overworld itself is explicitly out of scope (S3/
   worldgen).

   Modeled on packages/content/tests/fixtures/sample-pack.json's own
   `map:guild_hall_entry` (same token/legend shape: '#' wall via inline
   components, an authored-entity token via `entity:`, a floor token). */

import { ENTITY_DEFS } from "./entities.mjs";

const DOOR_GOLEM_ID = ENTITY_DEFS.find((e) => e.id === "entity:door_golem").id;

export const GUILD_HALL_MAP = {
  id: "map:guild_hall",
  floor: ".",
  legend: {
    "#": { components: { Identity: { name: "wall" } } },
    G: { entity: DOOR_GOLEM_ID },
    // The stairs-down tile the Door Golem gates entry to (design spec's
    // bar: "a stairs-down tile reachable from spawn"). Where it actually
    // leads is S2/S3's job to wire (no `map:tomb_floor_1` exists yet in
    // this PR) — an Identity label is all PR1 needs.
    ">": { components: { Identity: { name: "Stairs Down" } } },
  },
  cells: ["#######", "#.....#", "#..G..#", "#.....#", "#..>..#", "#######"],
};
