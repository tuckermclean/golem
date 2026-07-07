/* ── PR2 SYNTHETIC TEST FIXTURE — tomb-floor-1 (DELTA S2b design spec's
   "deriveWorld + the synthetic floor fixture"). S3 (procedural floor
   generation) has not landed and packages/world is still a stub, so
   there is no real generated tomb floor yet to exercise grid movement/
   collision/stairs against. This is a small, hand-authored map — the
   games/topdown-puzzle/tests/fixtures/synthetic-level.mjs precedent,
   same rationale — used by TESTS ONLY, NEVER committed into
   games/some-hero/content/pack.json (the real generated floor is S3's
   job; this dependency direction is deliberate, so S3 is not pulled
   forward by this PR).

   Layout (7 rows x 7 cols):

     #######
     #@<...#      @ spawn (1,1); < stairs up (2,1)
     #.###.#
     #..s..#      s a skeleton spawn (3,3) — PR4's addition
     #.###.#
     #....>#      > stairs down (5,5)
     #######

   Legend convention (games/some-hero/shared/module.js's
   deriveWorldFromPack): a cell's resolved Identity.name of "wall" is
   blocking geometry; "spawn" is the player's initial position; a name
   matching /stairs/i (and NOT /up/i) is the descent marker (stairsAt);
   a name matching /stairs/i AND /up/i is the ascent marker (upstairsAt
   — PR3's addition, docs/superpowers/specs/2026-07-07-s2b-pr3-ceremony-
   machine-design.md's "Fixture extension"). A component bag carrying an
   `Actor` stat bag is an enemy spawn (PR4's addition, docs/superpowers/
   specs/2026-07-07-s2c-pr4-combat-design.md — `world.enemySpawns`).
   Mirrors the exact inline-components convention games/some-hero/
   content/guild-hall-map.mjs's own '#'/'>' tokens already use — nothing
   invented fresh here.

   PR3's '<' token is placed immediately beside '@' (2,1), not literally
   ON the spawn cell: a single ASCII cell can only carry one legend
   token, and '@' must stay put (world.spawn = (1,1) is pinned by an
   existing, unchanged assertion in tests/module.test.js — this fixture
   must not move it). "at spawn" (the design spec's fixture-extension
   wording) is read here as "in the spawn room, immediately reachable
   from the entry point" — functionally equivalent for this fixture's
   one job (proving the upstairsAt derivation + driving the voluntary-
   ascent EXITED_TOMB transition), not a claim of exact positional
   overlap.

   PR4's 's' token (3,3) — the middle cell of the row-3 corridor, chosen
   because every existing walk script that crosses this floor (this
   file's own consumers: tests/determinism.test.js, rules/tests/
   ceremony-kernel/{door-golem,seal-stairs}.kernel.test.js) already
   passes straight through (3,3) as ordinary floor; the enemy token is
   walkable geometry (deriveWorldFromPack never marks an Actor-bearing
   cell as a wall), so none of those existing, unchanged assertions are
   affected — only tests that actually inspect `world.enemySpawns`/
   `run.enemies` (this PR's own new tests) see it. References
   `entity:enemy_skeleton` (content/entities.mjs) rather than inlining
   its stat bag, so `world.enemyTypes.skeleton` below is the SAME
   content-authored stats every other consumer of that entity sees — no
   second, drifting copy. No Door Golem placement: PR2/PR3's move/tick/
   ceremony proofs still need none of that (S3 territory — see the
   design spec's "Scope boundaries"). */
import { compile } from "@golem-engine/content";
import { ENTITY_DEFS } from "../../content/entities.mjs";

export const SYNTHETIC_MAP_ID = "map:tomb_floor_1_synthetic";

export const SYNTHETIC_TOMB_FLOOR_1 = {
  id: SYNTHETIC_MAP_ID,
  floor: ".",
  legend: {
    "#": { components: { Identity: { name: "wall" } } },
    "@": { components: { Identity: { name: "spawn" } } },
    "<": { components: { Identity: { name: "Stairs Up" } } },
    ">": { components: { Identity: { name: "Stairs Down" } } },
    "s": { entity: "entity:enemy_skeleton" },
  },
  cells: [
    "#######",
    "#@<...#",
    "#.###.#",
    "#..s..#",
    "#.###.#",
    "#....>#",
    "#######",
  ],
};

/** Compiles the synthetic floor through the real @golem-engine/content
 *  compile() — same CompileResult shape compile() itself returns. Never
 *  touches disk; pure given this file's own constants. `entities:
 *  ENTITY_DEFS` (PR4: was `[]` — every entity S1 authored, including all
 *  four tomb enemy kinds; only `entity:enemy_skeleton` is placed on this
 *  map's own legend, same "compiled but not necessarily placed" latitude
 *  rules/tests/ceremony-kernel/kernel-helpers.mjs's guildHallWorld()
 *  already relies on for map:guild_hall). */
export function compileSyntheticFloorPack() {
  const source = {
    name: "some-hero-s2b-synthetic-tomb-floor-1",
    version: 1,
    entities: ENTITY_DEFS,
    tables: [],
    maps: [SYNTHETIC_TOMB_FLOOR_1],
  };
  return compile(source);
}
