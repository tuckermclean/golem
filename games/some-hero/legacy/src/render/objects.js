// World object rendering: pushable blocks, braziers, legacy traps, pickups.
// Shapes are shared; colors come from the active skin (a skin may override
// the torch's whole shape via skin.drawTorch).

import { T } from '../constants.js';
import { getSkin } from './skins/index.js';

export function drawBlocks(ctx, game) {
  const S = getSkin(game);
  for (const b of game.blocks) {
    ctx.fillStyle = S.obj.block; ctx.fillRect(b.rx + 3, b.ry + 3, T - 6, T - 6);
    ctx.fillStyle = S.obj.blockHi; ctx.fillRect(b.rx + 5, b.ry + 5, T - 10, 6);
    ctx.fillStyle = S.obj.blockLo; ctx.fillRect(b.rx + 5, b.ry + T - 11, T - 10, 6);
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.strokeRect(b.rx + 3.5, b.ry + 3.5, T - 7, T - 7);
  }
}

export function drawTorches(ctx, game) {
  const S = getSkin(game);
  const t = game.t, pz = game.puzzle;
  for (const to of game.torches) {
    if (S.drawTorch) { S.drawTorch(ctx, to, game); continue; }
    const cx = to.tx * T + T / 2, cy = to.ty * T + T / 2;
    ctx.fillStyle = S.pal.wood; ctx.fillRect(cx - 5, cy - 2, 10, 12);
    ctx.fillStyle = S.obj.bowl; ctx.beginPath(); ctx.arc(cx, cy - 4, 8, Math.PI, 0); ctx.fill();
    if (to.lit) {
      const fl = 1 + Math.sin(t * 14 + cx) * .2;
      const g = ctx.createRadialGradient(cx, cy - 10, 2, cx, cy - 10, 30);
      g.addColorStop(0, S.obj.flameGlow); g.addColorStop(1, 'rgba(242,166,75,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy - 10, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = S.obj.flame;
      ctx.beginPath(); ctx.moveTo(cx - 5, cy - 6); ctx.quadraticCurveTo(cx, cy - 22 * fl, cx + 5, cy - 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = S.obj.flameCore;
      ctx.beginPath(); ctx.moveTo(cx - 2, cy - 6); ctx.quadraticCurveTo(cx, cy - 13 * fl, cx + 2, cy - 6); ctx.closePath(); ctx.fill();
      if (pz && pz.type === 'torch' && !pz.solved) {
        ctx.strokeStyle = S.obj.flame; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy - 10, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, to.tm / pz.time));
        ctx.stroke();
      }
    }
  }
}

/** Set dressing: break room furniture. The monsters eat lunch somewhere. */
export function drawProps(ctx, game) {
  const S = getSkin(game);
  for (const p of game.props) {
    if (p.kind === 'table') {
      ctx.fillStyle = 'rgba(0,0,0,.15)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = S.pal.wood;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 15, 9, 0, 0, Math.PI * 2); ctx.stroke();
      // a coffee ring. there is always a coffee ring.
      ctx.strokeStyle = 'rgba(94,62,34,.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x + 5, p.y - 2, 3, 0, Math.PI * 2); ctx.stroke();
    } else if (p.kind === 'chair') {
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 5, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6a7280';
      ctx.fillRect(p.x - 5, p.y - 2, 10, 7);                       // seat
      // backrest faces away from the table (face: -1 left, 1 right, 0 below)
      if (p.face === 0) ctx.fillRect(p.x - 5, p.y + 3, 10, 4);
      else ctx.fillRect(p.face > 0 ? p.x + 3 : p.x - 5, p.y - 8, 2, 8);
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.fillRect(p.x - 4, p.y - 1, 8, 2);
    }
  }
}

export function drawTraps(ctx, game) {
  const S = getSkin(game);
  for (const tr of game.traps) {
    const x = tr.tx * T, y = tr.ty * T;
    // a worn vent-plate; suspicious on purpose — the puzzle is realizing
    // you should step on it, not finding it
    ctx.fillStyle = tr.hit ? 'rgba(0,0,0,.3)' : 'rgba(255,255,255,.07)';
    ctx.fillRect(x + 4, y + 4, T - 8, T - 8);
    ctx.strokeStyle = S.obj.trapRim; ctx.lineWidth = 1;
    ctx.strokeRect(x + 4.5, y + 4.5, T - 9, T - 9);
    // dart holes (empty for years)
    ctx.fillStyle = tr.hit ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.4)';
    for (const [dx, dy] of [[9, 9], [T - 9, 9], [9, T - 9], [T - 9, T - 9]]) {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    if (tr.hit) {
      // the incident counter's little tally tick
      ctx.strokeStyle = S.obj.tally; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + T / 2 - 4, y + T / 2);
      ctx.lineTo(x + T / 2 - 1, y + T / 2 + 4);
      ctx.lineTo(x + T / 2 + 5, y + T / 2 - 5);
      ctx.stroke();
    }
  }
}

export function drawPickups(ctx, game) {
  const S = getSkin(game);
  const t = game.t;
  for (const p of game.pickups) {
    if (p.kind === 'gold') {
      ctx.fillStyle = S.pal.gold; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = S.obj.goldRim; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.stroke();
    } else if (p.kind === 'heart') {
      ctx.fillStyle = S.pal.danger; ctx.beginPath();
      ctx.arc(p.x - 3, p.y - 2, 4, 0, Math.PI * 2); ctx.arc(p.x + 3, p.y - 2, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x, p.y + 8); ctx.lineTo(p.x + 7, p.y); ctx.fill();
    } else if (p.kind === 'potion') {
      ctx.fillStyle = S.obj.potion; ctx.fillRect(p.x - 4, p.y - 3, 8, 9);
      ctx.fillStyle = S.obj.cork; ctx.fillRect(p.x - 2, p.y - 7, 4, 4);
    } else if (p.kind === 'key') {
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 22);
      g.addColorStop(0, S.obj.goldGlow); g.addColorStop(1, 'rgba(242,210,122,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = S.obj.key; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(p.x - 4, p.y, 4, 0, Math.PI * 2); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 9, p.y);
      ctx.moveTo(p.x + 6, p.y); ctx.lineTo(p.x + 6, p.y + 4); ctx.moveTo(p.x + 9, p.y); ctx.lineTo(p.x + 9, p.y + 4); ctx.stroke();
    } else if (p.kind === 'guestbook') {
      // the gap guestbook: an open book on a tiny pedestal
      ctx.fillStyle = S.pal.wood; ctx.fillRect(p.x - 3, p.y + 4, 6, 5);
      ctx.fillStyle = S.pal.paper;
      ctx.fillRect(p.x - 8, p.y - 4, 7, 9);
      ctx.fillRect(p.x + 1, p.y - 4, 7, 9);
      ctx.strokeStyle = S.pal.wood; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 5); ctx.stroke();
      ctx.strokeStyle = 'rgba(90,74,60,.5)';
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y - 1); ctx.lineTo(p.x - 3, p.y - 1);
      ctx.moveTo(p.x + 3, p.y - 1); ctx.lineTo(p.x + 6, p.y - 1);
      ctx.moveTo(p.x - 6, p.y + 2); ctx.lineTo(p.x - 3, p.y + 2);
      ctx.stroke();
    } else if (p.kind === 'maxheart') {
      ctx.strokeStyle = S.pal.gold; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = S.pal.danger; ctx.beginPath();
      ctx.arc(p.x - 3, p.y - 2, 4, 0, Math.PI * 2); ctx.arc(p.x + 3, p.y - 2, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x, p.y + 8); ctx.lineTo(p.x + 7, p.y); ctx.fill();
    } else if (p.kind === 'sword') {
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 24);
      g.addColorStop(0, S.obj.goldGlowSoft); g.addColorStop(1, 'rgba(242,210,122,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = S.pal.gold; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - 6, p.y + 7); ctx.lineTo(p.x + 6, p.y - 7);
      ctx.moveTo(p.x - 2, p.y + 1); ctx.lineTo(p.x - 7, p.y - 4); ctx.stroke();
    } else if (p.kind === 'amulet') {
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 30);
      g.addColorStop(0, S.obj.goldGlowStrong); g.addColorStop(1, 'rgba(242,210,122,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = S.pal.gold; ctx.beginPath();
      const s = Math.sin(t * 3) * .15 + 1;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + t;
        ctx.lineTo(p.x + Math.cos(a) * (i % 2 ? 5 : 11) * s, p.y + Math.sin(a) * (i % 2 ? 5 : 11) * s);
      }
      ctx.closePath(); ctx.fill();
    }
  }
}
