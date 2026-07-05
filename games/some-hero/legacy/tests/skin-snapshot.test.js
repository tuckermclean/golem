// Pins the desert skin's draw output byte-for-byte. Written BEFORE the skin
// layer was extracted from tiles.js/objects.js/lighting.js; the hashes below
// were captured from the original inline code, so a matching hash proves the
// extraction is verbatim. If you change the desert skin ON PURPOSE, update
// the hashes; if you didn't mean to, that's the point of this file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { T } from '../src/constants.js';
import { drawTiles } from '../src/render/tiles.js';
import { drawBlocks, drawTorches, drawTraps, drawPickups } from '../src/render/objects.js';
import { drawLantern } from '../src/render/lighting.js';
import { blankGame } from './helpers.js';

/** A ctx that records every call and property set, in order. */
function recordingCtx(ops) {
  const ctx = {};
  for (const m of ['fillRect', 'strokeRect', 'beginPath', 'closePath', 'fill', 'stroke',
                   'arc', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo']) {
    ctx[m] = (...a) => ops.push(m + '(' + a.join(',') + ')');
  }
  ctx.createRadialGradient = (...a) => {
    ops.push('grad(' + a.join(',') + ')');
    return { addColorStop: (o, c) => ops.push('stop(' + o + ',' + c + ')') };
  };
  for (const p of ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'globalAlpha', 'font']) {
    Object.defineProperty(ctx, p, { set: v => ops.push(p + '=' + v), get: () => 0 });
  }
  return ctx;
}

const sha = ops => createHash('sha256').update(ops.join('\n')).digest('hex').slice(0, 16);

/** Two rows of every tile id; h2 hits the small-r branch on row 0, large-r on row 1. */
function stripGame(open) {
  const game = blankGame({ w: 16, h: 2, fill: 0 });
  game.skin = 'desert';
  for (let v = 0; v <= 14; v++) { game.world.map[v] = v; game.world.map[16 + v] = v; }
  game.world.h2 = (a, b) => (b === 0 ? 0.05 : 0.95);
  game.zone = 'tomb';
  game.puzzle = { type: 'key', have: open };
  game.plates = [{ tx: 14, ty: 0, on: open }];
  game.t = 0.5;
  game.cam = { x: 0, y: 0 };
  return game;
}

test('desert tiles draw exactly as they always have (sealed and open)', () => {
  for (const [open, want] of [[false, '0d09f627e4257b8b'], [true, '1035d0da30990e74']]) {
    const ops = [], ctx = recordingCtx(ops);
    drawTiles(ctx, stripGame(open), { w: 16 * T, h: 2 * T });
    assert.equal(sha(ops), want, (open ? 'open' : 'closed') + ' tile pass changed:\n' + sha(ops));
  }
});

test('desert objects and lantern draw exactly as they always have', () => {
  const game = stripGame(false);
  game.puzzle = { type: 'torch', time: 8, solved: false };
  game.blocks = [{ rx: 40, ry: 40 }];
  game.torches = [{ tx: 1, ty: 1, lit: true, tm: 4 }, { tx: 2, ty: 1, lit: false, tm: 0 }];
  game.traps = [{ tx: 3, ty: 1, hit: true }, { tx: 4, ty: 1, hit: false }];
  game.pickups = ['gold', 'heart', 'potion', 'key', 'guestbook', 'maxheart', 'sword', 'amulet']
    .map((kind, i) => ({ kind, x: 30 + i * 40, y: 60, v: 1 }));
  const ops = [], ctx = recordingCtx(ops);
  drawBlocks(ctx, game);
  drawTorches(ctx, game);
  drawTraps(ctx, game);
  drawPickups(ctx, game);
  drawLantern(ctx, game, { W: 800, H: 480, scale: 1 });
  assert.equal(sha(ops), '75575363dd60c07b', 'object/lantern pass changed:\n' + sha(ops));
});
