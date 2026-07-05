// Skin registry contract: every skin must satisfy the full contract the
// shared renderers read blindly. Adding a key-read to a renderer without
// adding the key to every skin should fail here, not at draw time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TL } from '../src/constants.js';
import { SKINS, DEFAULT_SKIN, getSkin } from '../src/render/skins/index.js';
import { seededGame } from './helpers.js';

const HEX = /^#[0-9a-f]{6}$/i;
const PAL_KEYS = ['bg', 'glow', 'danger', 'gold', 'paper', 'wood'];
const OBJ_KEYS = ['block', 'blockHi', 'blockLo', 'trapRim', 'tally', 'bowl', 'flame',
  'flameCore', 'flameGlow', 'potion', 'cork', 'goldRim', 'key',
  'goldGlow', 'goldGlowSoft', 'goldGlowStrong'];
const ACTOR_KEYS = ['skinTone', 'eye', 'playerRobe', 'playerHat', 'playerAccent', 'sword', 'swordUp'];

/** A ctx stub good enough to smoke-execute any deco. */
function stubCtx() {
  const noop = () => {};
  const ctx = {};
  for (const m of ['fillRect', 'strokeRect', 'beginPath', 'closePath', 'fill', 'stroke',
                   'arc', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo']) ctx[m] = noop;
  ctx.createRadialGradient = () => ({ addColorStop: noop });
  for (const p of ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'globalAlpha', 'font']) {
    Object.defineProperty(ctx, p, { set: noop, get: () => 0 });
  }
  return ctx;
}

test('the registry has a valid default', () => {
  assert.ok(SKINS[DEFAULT_SKIN], 'DEFAULT_SKIN exists in SKINS');
  assert.equal(getSkin({ skin: 'no-such-skin' }), SKINS[DEFAULT_SKIN]);
  assert.equal(getSkin(null), SKINS[DEFAULT_SKIN]);
});

for (const [name, S] of Object.entries(SKINS)) {
  test(`skin "${name}" satisfies the contract`, () => {
    assert.equal(S.name, name);
    assert.ok(S.label && typeof S.label === 'string');

    // tile fills: one valid hex per tile id
    assert.equal(S.tcol.length, Object.keys(TL).length);
    for (const c of S.tcol) assert.match(c, HEX);

    // decos keyed by real tile ids, all functions
    const ids = new Set(Object.values(TL).map(String));
    for (const [k, fn] of Object.entries(S.tileDeco)) {
      assert.ok(ids.has(k), `tileDeco key ${k} is a tile id`);
      assert.equal(typeof fn, 'function');
    }

    // palettes complete
    for (const k of PAL_KEYS) assert.ok(k in S.pal, `pal.${k}`);
    for (const k of OBJ_KEYS) assert.ok(k in S.obj, `obj.${k}`);
    for (const k of ACTOR_KEYS) assert.ok(k in S.actors, `actors.${k}`);

    // lantern shape
    assert.ok(/^\d+,\d+,\d+$/.test(S.lantern.rgb));
    let last = -1;
    for (const [off] of S.lantern.stops) {
      assert.ok(off >= 0 && off <= 1 && off >= last, 'stops ascend within [0,1]');
      last = off;
    }
  });

  test(`skin "${name}": every tile deco smoke-executes on both hash branches`, () => {
    const game = seededGame(1);
    game.skin = name;
    game.zone = 'tomb';
    game.puzzle = { type: 'key', have: false };
    game.plates = [];
    game.t = 0.5;
    const ctx = stubCtx();
    for (const fn of Object.values(S.tileDeco)) {
      fn(ctx, 0, 0, 1, 1, 0.05, game);
      fn(ctx, 0, 0, 1, 1, 0.95, game);
    }
    if (S.drawTorch) S.drawTorch(ctx, { tx: 1, ty: 1, lit: true, tm: 4 }, game);
  });
}
