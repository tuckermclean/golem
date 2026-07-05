// The desert skin — the original "Amulet of the Sands" look, preserved
// verbatim (tests/skin-snapshot.test.js proves it). Kept switchable for later.
//
// Skin contract: pure data + draw functions that receive ctx; no module-scope
// DOM/canvas access, so this file is importable headlessly by node tests.

import { T, TL } from '../../constants.js';
import { stairsOpen } from '../../systems/puzzles.js';

export const desert = {
  name: 'desert',
  label: 'Amulet of the Sands (classic)',

  // Base tile fills, indexed by tile id.
  tcol: [
    '#e8c27a', '#dcae5f', '#a8764f', '#2e9e8f', '#e8c27a', '#d9b98a',
    '#cdb592', '#8a6a52', '#d9b98a', '#e0b46a',
    '#4a3a30', '#241a14', '#4a3a30', '#4a3a30', '#4a3a30'
  ],

  // Per-tile decoration, drawn after the base fill. May repaint the tile.
  // Signature: (ctx, px, py, x, y, r, game) — r = world.h2(x*5, y*9).
  tileDeco: {
    [TL.SAND](ctx, px, py, x, y, r) {
      if (r < .18) {
        ctx.fillStyle = 'rgba(0,0,0,.05)'; ctx.fillRect(px + 8 + r * 60 % 14, py + 10, 3, 2);
      }
    },
    [TL.DUNE](ctx, px, py) {
      ctx.fillStyle = 'rgba(0,0,0,.08)';
      ctx.beginPath(); ctx.arc(px + T / 2, py + T * .8, T * .42, Math.PI, 0); ctx.fill();
    },
    [TL.ROCK](ctx, px, py) {
      ctx.fillStyle = '#8f6243'; ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(px + 5, py + 5, T - 14, 4);
    },
    [TL.WATER](ctx, px, py, x, y, r, game) {
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      const w1 = Math.sin(game.t * 2 + x * 1.3 + y * .7) * 3;
      ctx.fillRect(px + 5, py + 10 + w1, T - 10, 2); ctx.fillRect(px + 9, py + 22 - w1, T - 18, 2);
    },
    [TL.PALM](ctx, px, py, x, y, r, game) {
      ctx.fillStyle = '#cdb47e'; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#7a5230'; ctx.fillRect(px + T / 2 - 3, py + 12, 6, T - 14);
      ctx.fillStyle = '#3f8a4f';
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + .4 + Math.sin(game.t + x) * 0.06;
        ctx.beginPath();
        ctx.ellipse(px + T / 2 + Math.cos(a) * 9, py + 11 + Math.sin(a) * 6, 10, 3.6, a, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [TL.PAVE](ctx, px, py) {
      ctx.strokeStyle = 'rgba(0,0,0,.1)'; ctx.strokeRect(px + 1, py + 1, T - 2, T - 2);
    },
    [TL.RFLOOR](ctx, px, py, x, y, r) {
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.strokeRect(px + .5, py + .5, T - 1, T - 1);
      if (r < .12) { ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(px + 10, py + 14, 9, 3); }
    },
    [TL.RWALL](ctx, px, py) {
      ctx.fillStyle = '#6e523c'; ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(px + 4, py + 4, T - 8, 5);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px + 4, py + T - 9, T - 8, 5);
    },
    [TL.WELL](ctx, px, py) {
      ctx.fillStyle = '#8a6a52'; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2e9e8f'; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 8, 0, Math.PI * 2); ctx.fill();
    },
    [TL.ROAD](ctx, px, py) {
      ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(px, py + 4, T, T - 8);
    },
    [TL.TF](ctx, px, py, x, y, r) {
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.strokeRect(px + .5, py + .5, T - 1, T - 1);
      if (r < .08) {
        ctx.fillStyle = 'rgba(116,196,184,.12)';
        ctx.fillRect(px + 12, py + 12, 12, 3); ctx.fillRect(px + 16, py + 8, 3, 11);
      }
    },
    [TL.TW](ctx, px, py) {
      ctx.fillStyle = '#1a120d'; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#33261c'; ctx.fillRect(px + 2, py + 2, T - 4, T - 10);
      ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(px + 4, py + 4, T - 8, 4);
    },
    [TL.SD](ctx, px, py, x, y, r, game) {
      const t = game.t;
      const open = game.zone === 'ow' || stairsOpen(game);
      ctx.fillStyle = '#15100b'; ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
      if (open) {
        ctx.fillStyle = '#2a201a'; ctx.fillRect(px + 7, py + 7, T - 14, T - 14);
        ctx.fillStyle = '#3a2c22'; ctx.fillRect(px + 11, py + 11, T - 22, T - 22);
        ctx.fillStyle = 'rgba(116,196,184,' + (.3 + .2 * Math.sin(t * 3)) + ')';
        ctx.fillRect(px + 14, py + 14, T - 28, T - 28);
      } else {
        ctx.fillStyle = '#5a4a3c'; ctx.fillRect(px + 5, py + 5, T - 10, T - 10);
        ctx.strokeStyle = 'rgba(224,100,75,' + (.6 + .3 * Math.sin(t * 4)) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 8, 0, Math.PI * 2);
        ctx.moveTo(px + T / 2, py + T / 2 - 12); ctx.lineTo(px + T / 2, py + T / 2 + 12); ctx.stroke();
      }
    },
    [TL.SU](ctx, px, py) {
      ctx.fillStyle = '#5a4a3c'; ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
      ctx.fillStyle = '#6e5a48'; ctx.fillRect(px + 7, py + 7, T - 14, T - 14);
      ctx.fillStyle = '#83705c'; ctx.fillRect(px + 11, py + 11, T - 22, T - 22);
      ctx.fillStyle = '#f2d27a'; ctx.beginPath();
      ctx.moveTo(px + T / 2, py + 9); ctx.lineTo(px + T / 2 - 5, py + 17); ctx.lineTo(px + T / 2 + 5, py + 17);
      ctx.closePath(); ctx.fill();
    },
    [TL.PLATE](ctx, px, py, x, y, r, game) {
      const pl = game.plates.find(o => o.tx === x && o.ty === y);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.strokeRect(px + .5, py + .5, T - 1, T - 1);
      ctx.fillStyle = pl && pl.on ? 'rgba(116,196,184,.5)' : 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = pl && pl.on ? '#74c4b8' : '#8a6a52'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 11, 0, Math.PI * 2); ctx.stroke();
    }
  },

  // Shared-renderer palette (every key required; renderers read them blindly).
  pal: {
    bg: '#2a1c14',        // letterbox clear
    glow: '#74c4b8',      // puzzle/feedback accent
    danger: '#e0644b',    // hp bars, hearts, lockout pulse
    gold: '#f2d27a',      // coins, key glow, SU arrow
    paper: '#f6e7c8',     // guestbook pages, '!' alert
    wood: '#5a4a3c'       // pedestals, torch bases, book spines
  },
  obj: {
    block: '#a8835a', blockHi: 'rgba(255,255,255,.18)', blockLo: 'rgba(0,0,0,.25)',
    trapRim: '#8a6a52', tally: '#f2a64b',
    bowl: '#3a2c22', flame: '#f2a64b', flameCore: '#ffe9b8', flameGlow: 'rgba(242,166,75,.55)',
    potion: '#74c4b8', cork: '#8a6a52',
    goldRim: '#b9933a', key: '#d8a93f',
    goldGlow: 'rgba(242,210,122,.55)', goldGlowSoft: 'rgba(242,210,122,.5)', goldGlowStrong: 'rgba(242,210,122,.8)'
  },
  actors: {
    skinTone: '#e8c0a0', eye: '#2a1c14',
    playerRobe: '#3f6f9e', playerHat: '#f6e7c8', playerAccent: '#e0644b',
    sword: '#d8d8d8', swordUp: '#f2d27a'
  },

  // Lantern vignette (alphas kept as strings so the css text is byte-identical).
  lantern: { rgb: '12,8,6', stops: [[0, '0'], [.7, '.45'], [1, '.88']], flicker: .03, tint: null },

  // The retired desert roster's drawings, parked here working — a future
  // "classic roster" toggle lights them up via the actors.js dispatch table.
  enemyDraw: {
    scarab(ctx, e, game, fl) {
      ctx.fillStyle = fl ? '#fff' : e.col;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.moveTo(e.x, e.y - 8); ctx.lineTo(e.x, e.y + 8); ctx.stroke();
      ctx.fillStyle = '#2a1c14'; ctx.fillRect(e.x - 7, e.y - 2, 3, 3); ctx.fillRect(e.x + 4, e.y - 2, 3, 3);
    },
    jackal(ctx, e, game, fl) {
      ctx.fillStyle = fl ? '#fff' : e.col;
      ctx.fillRect(e.x - 11, e.y - 5, 22, 10);
      ctx.fillRect(e.x + 6, e.y - 12, 9, 9);
      ctx.beginPath(); ctx.moveTo(e.x + 7, e.y - 12); ctx.lineTo(e.x + 9, e.y - 18); ctx.lineTo(e.x + 12, e.y - 12); ctx.fill();
      ctx.fillStyle = '#2a1c14'; ctx.fillRect(e.x + 11, e.y - 9, 2, 2);
    },
    mummy(ctx, e, game, fl) {
      ctx.fillStyle = fl ? '#fff' : e.col;
      ctx.fillRect(e.x - 9, e.y - 14, 18, 26);
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(e.x - 9, e.y - 11 + i * 7); ctx.lineTo(e.x + 9, e.y - 8 + i * 7); ctx.stroke();
      }
      ctx.fillStyle = '#2a1c14'; ctx.fillRect(e.x - 4, e.y - 10, 4, 4);
      ctx.fillStyle = '#e0644b'; ctx.fillRect(e.x + 1, e.y - 10, 4, 4);
    },
    spirit(ctx, e, game, fl) {
      const fade = .55 + .25 * Math.sin(game.t * 4 + e.x);
      ctx.globalAlpha = fade;
      ctx.fillStyle = fl ? '#fff' : e.col;
      ctx.beginPath(); ctx.arc(e.x, e.y - 3, 10, Math.PI, 0);
      ctx.lineTo(e.x + 10, e.y + 8);
      for (let i = 0; i < 4; i++) ctx.lineTo(e.x + 10 - (i + .5) * 5, e.y + 8 - (i % 2 ? 0 : 4));
      ctx.lineTo(e.x - 10, e.y + 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a1c14'; ctx.fillRect(e.x - 5, e.y - 5, 3, 4); ctx.fillRect(e.x + 2, e.y - 5, 3, 4);
      ctx.globalAlpha = 1;
    }
  },

  /** The sarcophagus Guardian, exactly as it always was. */
  drawBoss(ctx, game) {
    const b = game.boss, t = game.t;
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + 22, 22, 22 * .45, 0, 0, Math.PI * 2); ctx.fill();
    const tele = b.state === 'tele' && Math.sin(t * 24) > 0;
    ctx.fillStyle = b.flash > 0 ? '#fff' : (tele ? '#e0644b' : '#8a6a52');
    ctx.beginPath();
    ctx.moveTo(b.x - 16, b.y + 22); ctx.lineTo(b.x - 20, b.y - 8); ctx.lineTo(b.x - 10, b.y - 24);
    ctx.lineTo(b.x + 10, b.y - 24); ctx.lineTo(b.x + 20, b.y - 8); ctx.lineTo(b.x + 16, b.y + 22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2d27a'; ctx.fillRect(b.x - 12, b.y - 18, 24, 4);
    if (b.state !== 'sleep') {
      ctx.fillStyle = '#74c4b8'; ctx.fillRect(b.x - 9, b.y - 10, 6, 5); ctx.fillRect(b.x + 3, b.y - 10, 6, 5);
    }
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(b.x - 21, b.y - 36, 42, 5);
    ctx.fillStyle = '#e0644b'; ctx.fillRect(b.x - 21, b.y - 36, 42 * b.hp / b.maxhp, 5);
  }
};
