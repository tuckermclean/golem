// Shared plumbing for the 3 PR3 mirror files (door-golem/seal-stairs/
// death-respawn-persistence.kernel.test.js) that exercise the REAL kernel
// (shared/module.js's validate()/reduce()/deriveWorldFromPack()) rather
// than rules/'s hand-shaped blankGame()/fixtures.js (the pure-function
// mirror style used by the other ceremony-kernel files). Those 6 wired
// tests need a real derived World (walls/spawn/stairsAt/upstairsAt/gate)
// on both sides of the ow<->tomb swap, so they build one from the SAME
// content this repo already ships/tests against:
//   - the ow side: the REAL committed content (content/entities.mjs +
//     content/guild-hall-map.mjs), recompiled here exactly like tests/
//     module.test.js's own "the real committed map:guild_hall" test does
//     — never reads/mutates content/pack.json itself.
//   - the tomb side: the SAME synthetic tomb-floor-1 fixture tests/
//     determinism.test.js already uses (test-fixture-only, per that
//     file's own header — never touches content/pack.json).
import assert from "node:assert/strict";
import { compile } from "@golem-engine/content";
import { ENTITY_DEFS } from "../../../content/entities.mjs";
import { GUILD_HALL_MAP } from "../../../content/guild-hall-map.mjs";
import { compileSyntheticFloorPack, SYNTHETIC_MAP_ID } from "../../../tests/fixtures/synthetic-floor.mjs";
import { deriveWorldFromPack, validate } from "../../../shared/module.js";
import { createState, reduce } from "../../../shared/reducer.js";

/** The real ow World, derived off the real committed content (Door
 *  Golem gate included — the whole point of these tests). */
export function guildHallWorld() {
  const compiled = compile({
    name: "ceremony-kernel-mirror-guild-hall",
    version: 1,
    entities: ENTITY_DEFS,
    tables: [],
    maps: [GUILD_HALL_MAP],
  });
  assert.ok(compiled.ok, `expected map:guild_hall to compile: ${JSON.stringify(compiled.ok ? null : compiled.errors)}`);
  return deriveWorldFromPack(compiled.pack, { zone: "ow", floorNum: 0, mapId: "map:guild_hall" });
}

/** The synthetic tomb-floor-1 World (test-fixture-only; see tests/
 *  fixtures/synthetic-floor.mjs's own header). */
export function tombWorld() {
  const compiled = compileSyntheticFloorPack();
  assert.ok(compiled.ok, "the synthetic floor pack must compile");
  return deriveWorldFromPack(compiled.pack, { zone: "tomb", floorNum: 1, mapId: SYNTHETIC_MAP_ID });
}

/** A freshly-entered state for `world` — one FLOOR_ENTERED fold, exactly
 *  as every fixture/host does (mirrors tests/helpers/build-state.mjs's
 *  own floorEnteredState()). */
export function floorEnteredState(world) {
  return reduce(createState(), world, {
    t: "FLOOR_ENTERED",
    zone: world.zone,
    floorNum: world.floorNum,
    mapId: world.mapId,
    seq: 1,
  });
}

/** validate() -> assert legal -> fold every returned event through
 *  reduce(), returning `{state, result}` (the committed events, for
 *  assertions) so a caller can both drive setup moves (discarding
 *  `result`) and inspect the one interesting command's exact event
 *  array — the same validate->seq-stamp->commit discipline src/host.js
 *  and tests/determinism.test.js's "live session" both use. */
export function commit(state, world, cmd) {
  const result = validate({ state, world }, cmd);
  assert.ok(Array.isArray(result), `expected "${cmd}" to be legal on this world (got Denial: ${Array.isArray(result) ? "" : result.deny})`);
  let seq = state.seq;
  for (const ev of result) state = reduce(state, world, { ...ev, seq: ++seq });
  return { state, result };
}
