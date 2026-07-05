// The Greater Pflum skin — the game's real setting. Comedy-pastoral kingdom
// topside (meadows, hedgerows, Chauncey's fountain); institutional Front
// Office below (carpet tiles, filing-cabinet walls, elevator doors, EXIT-sign
// green as the puzzle accent). Same tile semantics as every skin; only look.

import { T, TL } from '../../constants.js';
import { stairsOpen } from '../../systems/puzzles.js';

const GLOW = '#6fdd92';     // EXIT-sign green
const HEDGE = '#3e6b35';

export const pflum = {
  name: 'pflum',
  label: 'Greater Pflum',

  tcol: [
    '#7aa85a',  // SAND   -> meadow grass
    '#659148',  // DUNE   -> grassy knoll
    '#7aa85a',  // ROCK   -> hedgerow (deco repaints)
    '#3d86b8',  // WATER  -> pond
    '#7aa85a',  // PALM   -> oak (deco repaints)
    '#b8aa92',  // PAVE   -> village cobbles
    '#9c9478',  // RFLOOR -> strike-camp ground
    '#6f6a5e',  // RWALL  -> weathered rampart
    '#9aa0a6',  // WELL   -> fountain stone
    '#a9854f',  // ROAD   -> packed dirt
    '#4a5560',  // TF     -> office carpet
    '#20252b',  // TW     -> filing-cabinet wall
    '#4a5560',  // SD     -> elevator (deco draws doors)
    '#4a5560',  // SU     -> stairwell exit
    '#4a5560'   // PLATE  -> carpet pressure pad
  ],

  tileDeco: {
    [TL.SAND](ctx, px, py, x, y, r) {
      if (r < .18) {
        ctx.fillStyle = 'rgba(0,0,0,.06)';
        ctx.fillRect(px + 8 + r * 60 % 14, py + 9, 2, 4);
        ctx.fillRect(px + 20 - r * 40 % 9, py + 22, 2, 3);
      }
      if (r < .04) {
        ctx.fillStyle = r < .02 ? '#e8d96a' : '#d9789e';
        ctx.fillRect(px + 14 + r * 200 % 8, py + 15, 3, 3);
      }
    },
    [TL.DUNE](ctx, px, py) {
      ctx.fillStyle = 'rgba(0,0,0,.08)';
      ctx.beginPath(); ctx.arc(px + T / 2, py + T * .8, T * .42, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.beginPath(); ctx.arc(px + T / 2, py + T * .42, T * .3, Math.PI, 0); ctx.fill();
    },
    [TL.ROCK](ctx, px, py, x, y, r) {
      // a hedgerow: leafy mass bulging over the tile
      ctx.fillStyle = HEDGE;
      ctx.fillRect(px + 2, py + 6, T - 4, T - 8);
      ctx.beginPath();
      ctx.arc(px + 9, py + 8, 8, 0, Math.PI * 2);
      ctx.arc(px + T / 2, py + 5, 9, 0, Math.PI * 2);
      ctx.arc(px + T - 9, py + 8, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.beginPath();
      ctx.arc(px + 10, py + 6, 3, 0, Math.PI * 2);
      ctx.arc(px + T / 2 + 2, py + 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(px + 6 + r * 50 % 12, py + 16, 2, 2);
      ctx.fillRect(px + 22 - r * 30 % 10, py + 24, 2, 2);
    },
    [TL.WATER](ctx, px, py, x, y, r, game) {
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      const w1 = Math.sin(game.t * 2 + x * 1.3 + y * .7) * 3;
      ctx.fillRect(px + 5, py + 10 + w1, T - 10, 2); ctx.fillRect(px + 9, py + 22 - w1, T - 18, 2);
    },
    [TL.PALM](ctx, px, py, x, y, r, game) {
      // an oak: trunk + three-circle canopy, swaying gently
      const sway = Math.sin(game.t + x) * 1.5;
      ctx.fillStyle = '#6b4a32'; ctx.fillRect(px + T / 2 - 3, py + 14, 6, T - 16);
      ctx.fillStyle = '#4a7d3a';
      ctx.beginPath();
      ctx.arc(px + T / 2 - 7 + sway, py + 13, 9, 0, Math.PI * 2);
      ctx.arc(px + T / 2 + 7 + sway, py + 13, 9, 0, Math.PI * 2);
      ctx.arc(px + T / 2 + sway, py + 7, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5e964a';
      ctx.beginPath(); ctx.arc(px + T / 2 - 4 + sway, py + 5, 7, 0, Math.PI * 2); ctx.fill();
    },
    [TL.PAVE](ctx, px, py, x, y, r) {
      ctx.strokeStyle = 'rgba(0,0,0,.1)'; ctx.strokeRect(px + 1, py + 1, T - 2, T - 2);
      if (r < .5) {
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        ctx.beginPath(); ctx.arc(px + 8 + r * 40 % 20, py + 10 + r * 70 % 16, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    },
    [TL.RFLOOR](ctx, px, py, x, y, r) {
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.strokeRect(px + .5, py + .5, T - 1, T - 1);
      if (r < .12) {
        // a fallen picket sign
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(px + 16, py + 18, 2, 8);
        ctx.fillStyle = 'rgba(240,234,214,.4)'; ctx.fillRect(px + 11, py + 13, 12, 7);
      } else if (r > .88) {
        ctx.fillStyle = 'rgba(0,0,0,.1)';
        ctx.beginPath(); ctx.ellipse(px + T / 2, py + T / 2 + 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      }
    },
    [TL.RWALL](ctx, px, py) {
      ctx.fillStyle = '#57534a'; ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(px + 4, py + 4, T - 8, 5);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px + 4, py + T - 9, T - 8, 5);
    },
    [TL.WELL](ctx, px, py, x, y, r, game) {
      // Chauncey's fountain. The royal seal has relocated here. He has demands.
      const t = game.t;
      ctx.strokeStyle = '#7e858c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#3d86b8';
      ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(px + T / 2 + Math.cos(t) * 6 - 2, py + T / 2 + Math.sin(t) * 6 - 1, 4, 2);
      const bob = Math.sin(t * 1.5) * 1.5;
      ctx.fillStyle = '#5b6066';
      ctx.beginPath(); ctx.ellipse(px + T / 2, py + T / 2 + bob, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#454a4f';
      ctx.fillRect(px + T / 2 + 5, py + T / 2 + bob - 2, 3, 2);  // the snout. respect it.
    },
    [TL.ROAD](ctx, px, py) {
      ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(px, py + 4, T, T - 8);
      ctx.fillStyle = 'rgba(0,0,0,.05)';
      ctx.fillRect(px, py + 10, T, 2); ctx.fillRect(px, py + 24, T, 2);
    },
    [TL.TF](ctx, px, py, x, y, r) {
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.strokeRect(px + .5, py + .5, T - 1, T - 1);
      if (r < .08) {
        // a coffee ring. nobody owns the mug. the mug owns the floor.
        ctx.strokeStyle = 'rgba(94,62,34,.30)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px + 18, py + 18, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(94,62,34,.22)';
        ctx.beginPath(); ctx.arc(px + 22, py + 22, 3, 0, Math.PI * 2); ctx.fill();
      }
    },
    [TL.TW](ctx, px, py, x, y, r) {
      ctx.fillStyle = '#3e4650'; ctx.fillRect(px + 2, py + 2, T - 4, T - 10);
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(px + 4, py + 4, T - 8, 4);
      if (r < .3) {
        // filing cabinets line the corridors. of course they do.
        ctx.fillStyle = '#5a6470';
        ctx.fillRect(px + 8, py + 12, 10, 2); ctx.fillRect(px + 8, py + 20, 10, 2);
      }
    },
    [TL.SD](ctx, px, py, x, y, r, game) {
      const t = game.t;
      const open = game.zone === 'ow' || stairsOpen(game);
      ctx.fillStyle = '#1b1f24'; ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
      if (open) {
        // doors parted; the shaft hums in EXIT green
        ctx.fillStyle = '#6a7280';
        ctx.fillRect(px + 4, py + 5, 5, T - 10); ctx.fillRect(px + T - 9, py + 5, 5, T - 10);
        ctx.fillStyle = '#171a1f'; ctx.fillRect(px + 10, py + 6, T - 20, T - 12);
        ctx.fillStyle = '#20242a'; ctx.fillRect(px + 12, py + 9, T - 24, T - 18);
        ctx.fillStyle = 'rgba(111,221,146,' + (.3 + .2 * Math.sin(t * 3)) + ')';
        ctx.fillRect(px + 14, py + 12, T - 28, T - 24);
      } else {
        ctx.fillStyle = '#6a7280';
        ctx.fillRect(px + 5, py + 5, T / 2 - 6, T - 10); ctx.fillRect(px + T / 2 + 1, py + 5, T / 2 - 6, T - 10);
        ctx.fillStyle = '#1b1f24'; ctx.fillRect(px + T / 2 - 1, py + 5, 2, T - 10);
        ctx.strokeStyle = 'rgba(217,107,75,' + (.6 + .3 * Math.sin(t * 4)) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 8, 0, Math.PI * 2);
        ctx.moveTo(px + T / 2 - 6, py + T / 2 + 6); ctx.lineTo(px + T / 2 + 6, py + T / 2 - 6); ctx.stroke();
      }
    },
    [TL.SU](ctx, px, py) {
      ctx.fillStyle = '#3a4046'; ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
      ctx.fillStyle = '#4a525a'; ctx.fillRect(px + 7, py + 7, T - 14, T - 14);
      ctx.fillStyle = '#5a646e'; ctx.fillRect(px + 11, py + 11, T - 22, T - 22);
      ctx.fillStyle = GLOW; ctx.beginPath();
      ctx.moveTo(px + T / 2, py + 9); ctx.lineTo(px + T / 2 - 5, py + 17); ctx.lineTo(px + T / 2 + 5, py + 17);
      ctx.closePath(); ctx.fill();
    },
    [TL.PLATE](ctx, px, py, x, y, r, game) {
      const pl = game.plates.find(o => o.tx === x && o.ty === y);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.strokeRect(px + .5, py + .5, T - 1, T - 1);
      ctx.fillStyle = pl && pl.on ? 'rgba(111,221,146,.5)' : 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = pl && pl.on ? GLOW : '#6a7280'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 11, 0, Math.PI * 2); ctx.stroke();
    }
  },

  pal: {
    bg: '#1d2620',
    glow: GLOW,
    danger: '#d96b4b',
    gold: '#e7c95c',
    paper: '#f0ead6',
    wood: '#57534a'
  },
  obj: {
    // blocks are cardboard banker's boxes down here
    block: '#8a7a5c', blockHi: 'rgba(255,255,255,.18)', blockLo: 'rgba(0,0,0,.25)',
    trapRim: '#6a7280', tally: '#e7c95c',
    bowl: '#3e4650', flame: '#cfe8d6', flameCore: '#ffffff', flameGlow: 'rgba(207,232,214,.45)',
    potion: '#74c4b8', cork: '#57534a',
    goldRim: '#b89a3c', key: '#d8b54a',
    goldGlow: 'rgba(231,201,92,.55)', goldGlowSoft: 'rgba(231,201,92,.5)', goldGlowStrong: 'rgba(231,201,92,.8)'
  },
  actors: {
    skinTone: '#e8c0a0', eye: '#20252b',
    playerRobe: '#4a6a8a', playerHat: '#f0ead6', playerAccent: '#d96b4b',
    sword: '#d8d8d8', swordUp: '#e7c95c'
  },

  /** The Front Office "brazier" is a desk lamp. Lighting it is still sacred. */
  drawTorch(ctx, to, game) {
    const pz = game.puzzle;
    const cx = to.tx * T + T / 2, cy = to.ty * T + T / 2;
    ctx.fillStyle = '#6a7280';
    ctx.fillRect(cx - 5, cy + 8, 10, 3);          // base
    ctx.fillRect(cx - 1.5, cy - 4, 3, 12);        // stem
    ctx.fillStyle = '#3e4650';
    ctx.beginPath();                               // shade
    ctx.moveTo(cx - 8, cy - 2); ctx.lineTo(cx - 4, cy - 10);
    ctx.lineTo(cx + 4, cy - 10); ctx.lineTo(cx + 8, cy - 2);
    ctx.closePath(); ctx.fill();
    if (to.lit) {
      const g = ctx.createRadialGradient(cx, cy - 4, 2, cx, cy - 4, 28);
      g.addColorStop(0, 'rgba(207,232,214,.45)'); g.addColorStop(1, 'rgba(207,232,214,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy - 4, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 5, cy - 3, 10, 2);
      if (pz && pz.type === 'torch' && !pz.solved) {
        ctx.strokeStyle = GLOW; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy - 10, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, to.tm / pz.time));
        ctx.stroke();
      }
    }
  },

  // fluorescent gloom: cooler, buzzier, with a faint institutional wash
  lantern: { rgb: '18,22,20', stops: [[0, '0'], [.7, '.4'], [1, '.85']], flicker: .05, tint: 'rgba(120,160,130,.05)' }
};
