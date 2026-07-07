/* ── THE headless renderer-compatibility gate — DELTA S4 PR1 (see
 * docs/superpowers/specs/2026-07-07-s4-pr1-observe-adapter-design.md's
 * "render-adapter-drawable.test.js"). Proves src/render-adapter.js's
 * `adapt()` output is genuinely DRAWABLE by the real legacy renderer:
 * imports the actual legacy draw functions (drawTiles/drawBlocks/
 * drawTorches/drawTraps/drawPickups — games/some-hero/legacy/src/
 * render/{tiles,objects}.js) and replicates the `recordingCtx` op-log→
 * SHA technique from legacy/tests/skin-snapshot.test.js verbatim (same
 * ctx method/property interception, same hashing scheme), then feeds the
 * ADAPTER's own output through them and pins a NEW golden hash.
 *
 * A test importing legacy/ is fine (characterization tests already do —
 * see legacy/tests/skin-snapshot.test.js's own header); only the SHIPPED
 * adapter/module sources must stay legacy-free (tests/
 * src-no-legacy-import.test.js / tests/shared-no-legacy-import.test.js
 * enforce that separately).
 *
 * This does NOT touch legacy/tests/skin-snapshot.test.js or any of its
 * hashes — that file (the desert skin's own byte-for-byte pin) is
 * untouched and still passes; see this PR's report for confirmation. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { drawTiles } from "../legacy/src/render/tiles.js";
import { drawBlocks, drawTorches, drawTraps, drawPickups } from "../legacy/src/render/objects.js";
import { deriveWorldFromPack, observe } from "../shared/module.js";
import { reduce } from "../shared/reducer.js";
import { adapt } from "../src/render-adapter.js";
import { compileSyntheticFloorPack, SYNTHETIC_MAP_ID } from "./fixtures/synthetic-floor.mjs";
import { floorEnteredState } from "./helpers/build-state.mjs";

const T = 36; // legacy/src/constants.js:3 — used only to size the view window below

/** A ctx that records every call and property set, in order — copied
 *  verbatim from legacy/tests/skin-snapshot.test.js's own recordingCtx
 *  (same method/property lists), so the two golden-hash techniques are
 *  provably the same mechanism, not a look-alike. */
function recordingCtx(ops) {
  const ctx = {};
  for (const m of [
    "fillRect", "strokeRect", "beginPath", "closePath", "fill", "stroke",
    "arc", "ellipse", "moveTo", "lineTo", "quadraticCurveTo",
  ]) {
    ctx[m] = (...a) => ops.push(m + "(" + a.join(",") + ")");
  }
  ctx.createRadialGradient = (...a) => {
    ops.push("grad(" + a.join(",") + ")");
    return { addColorStop: (o, c) => ops.push("stop(" + o + "," + c + ")") };
  };
  for (const p of ["fillStyle", "strokeStyle", "lineWidth", "lineCap", "globalAlpha", "font"]) {
    Object.defineProperty(ctx, p, { set: (v) => ops.push(p + "=" + v), get: () => 0 });
  }
  return ctx;
}

const sha = (ops) => createHash("sha256").update(ops.join("\n")).digest("hex").slice(0, 16);

/** Builds a real adapter `game` off the synthetic tomb floor fixture
 *  (tests/fixtures/synthetic-floor.mjs — the same 7x7 walls/spawn/
 *  stairs-up/stairs-down/skeleton-spawn floor tests/module.test.js
 *  already exercises for deriveWorldFromPack), with `run.enemies` seeded
 *  from the derived `world.enemySpawns` exactly the way shared/
 *  module.js's real `enteredTombEvent()` does (id assignment order,
 *  stats from `world.enemyTypes`) — a realistic State, not a toy. */
function drawableGame() {
  const compiled = compileSyntheticFloorPack();
  assert.ok(compiled.ok, "expected the synthetic floor to compile");
  const world = deriveWorldFromPack(compiled.pack, { zone: "tomb", floorNum: 1, mapId: SYNTHETIC_MAP_ID });

  let state = floorEnteredState(world);
  const enemies = world.enemySpawns.map((s, i) => ({
    id: `e${i}`,
    kind: s.kind,
    pos: { ...s.pos },
    hp: world.enemyTypes[s.kind].hp,
  }));
  state = { ...state, run: { ...state.run, enemies } };
  // Walk one step so the player isn't sitting exactly on the spawn tile
  // (exercises the grid->pixel mapping away from (1,1), same spirit as
  // tests/module.test.js's own "committing a MOVED result" case).
  state = reduce(state, world, { t: "MOVED", x: 2, y: 1, seq: state.seq + 1 });

  return adapt(observe(state, world, "viewer"));
}

test("adapter output drives the real legacy draw functions headlessly (golden hash)", () => {
  const game = drawableGame();
  const ops = [];
  const ctx = recordingCtx(ops);
  const view = { w: game.world.w * T, h: game.world.h * T };

  drawTiles(ctx, game, view);
  drawBlocks(ctx, game);
  drawTorches(ctx, game);
  drawTraps(ctx, game);
  drawPickups(ctx, game);

  assert.ok(ops.length > 0, "expected at least one recorded draw op (the map/floor is non-empty)");
  assert.equal(
    sha(ops),
    "2c809e05f97fc4f7", // committed golden — a new hash proving adapt() emits a drawable game (see this file's header)
    "adapter output's drawable op-log hash changed:\n" + sha(ops),
  );
});
