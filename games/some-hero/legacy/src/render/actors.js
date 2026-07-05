// Actor rendering: shadows, NPCs, enemies, boss, player.
//
// Enemy looks live in ENEMY_DRAW, keyed by kind; the active skin may override
// per kind (skin.enemyDraw) or replace the boss entirely (skin.drawBoss) —
// that's where the retired desert roster's drawings are parked. Shared tones
// (skin color, player palette) come from skin.actors.

import { getSkin } from './skins/index.js';
import { strikeRadius } from '../systems/attack.js';

export function shadow(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(x, y, r, r * .45, 0, 0, Math.PI * 2); ctx.fill();
}

export function drawNpc(ctx, n, game) {
  const S = getSkin(game);
  const t = game.t, player = game.player;
  if (n.kind === 'machine') { drawMachine(ctx, n, game, S); return; }
  if (n.kind === 'radio') { drawRadio(ctx, n, game, S); return; }
  if (n.kind === 'rock') { drawRock(ctx, n, game, S); return; }
  if (n.kind === 'desk') { drawCancellationDesk(ctx, n, game, S); return; }
  if (n.stand) drawStand(ctx, n, game, S);   // behind the vendor
  shadow(ctx, n.x, n.y + 10, 9);
  // picketers march in unison (shared phase); everyone else bobs alone
  const bob = Math.sin(n.sign ? t * 2 : t * 2 + n.x) * 1.2;
  ctx.fillStyle = n.col; ctx.fillRect(n.x - 7, n.y - 6 + bob, 14, 16);
  ctx.fillStyle = S.actors.skinTone; ctx.beginPath(); ctx.arc(n.x, n.y - 12 + bob, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = n.hat; ctx.fillRect(n.x - 8, n.y - 18 + bob, 16, 5);
  if (n.sign) {
    // the sign: a post from the shoulder, a placard of illegible conviction
    const tilt = ((n.x % 7) - 3) * 0.04;
    ctx.save();
    ctx.translate(n.x + 6, n.y - 14 + bob);
    ctx.rotate(tilt);
    ctx.strokeStyle = '#8a7a5c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -12); ctx.stroke();
    ctx.fillStyle = S.pal.paper; ctx.fillRect(-11, -24, 22, 13);
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -20); ctx.lineTo(8, -20);
    ctx.moveTo(-8, -16); ctx.lineTo(4, -16);
    ctx.stroke();
    ctx.restore();
  }
  if (Math.hypot(n.x - player.x, n.y - player.y) < 44) {
    ctx.fillStyle = S.pal.paper; ctx.font = 'bold 11px Trebuchet MS';
    ctx.fillText('!', n.x - 2, n.y - 26 + Math.sin(t * 4) * 2);
  }
}

/** The GLURP-O-MATIC: lit front, rows of visible bottles. Unmissable. */
function drawMachine(ctx, n, game, S) {
  const t = game.t, player = game.player;
  shadow(ctx, n.x, n.y + 16, 13);
  // glow — a beacon of commerce in the institutional dark
  const g = ctx.createRadialGradient(n.x, n.y, 4, n.x, n.y, 46);
  g.addColorStop(0, 'rgba(116,196,184,' + (.18 + .05 * Math.sin(t * 2)) + ')');
  g.addColorStop(1, 'rgba(116,196,184,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, 46, 0, Math.PI * 2); ctx.fill();
  // cabinet
  ctx.fillStyle = '#2e3640'; ctx.fillRect(n.x - 12, n.y - 18, 24, 34);
  ctx.fillStyle = '#74c4b8'; ctx.fillRect(n.x - 10, n.y - 16, 16, 26);   // lit front
  // the merchandise (the ass-ton, on display)
  ctx.fillStyle = '#2e8f83';
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
    ctx.fillRect(n.x - 8 + col * 5, n.y - 14 + row * 6, 3, 4);
  }
  ctx.fillStyle = '#1d242c'; ctx.fillRect(n.x + 7, n.y - 16, 4, 26);     // coin column
  ctx.fillStyle = '#e7c95c'; ctx.fillRect(n.x + 8, n.y - 12, 2, 3);      // coin slot
  ctx.fillStyle = '#1d242c'; ctx.fillRect(n.x - 10, n.y + 11, 18, 4);    // dispenser tray
  if (Math.hypot(n.x - player.x, n.y - player.y) < 44) {
    ctx.fillStyle = S.pal.paper; ctx.font = 'bold 11px Trebuchet MS';
    ctx.fillText('!', n.x - 2, n.y - 26 + Math.sin(t * 4) * 2);
  }
}

/** The Glurp stand: counter, striped awning, the BIG sign, and a radio
 *  on the counter playing the theme. Location, location, foot traffic. */
function drawStand(ctx, n, game, S) {
  const t = game.t;
  // the BIG sign, planted beside the stand
  ctx.fillStyle = '#8a7a5c';
  ctx.fillRect(n.x + 26, n.y - 44, 3, 50);                       // post
  ctx.fillStyle = '#74c4b8';
  ctx.fillRect(n.x + 6, n.y - 58, 44, 22);                       // placard
  ctx.strokeStyle = '#2e8f83'; ctx.lineWidth = 2;
  ctx.strokeRect(n.x + 7, n.y - 57, 42, 20);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Trebuchet MS'; ctx.textAlign = 'center';
  ctx.fillText('GLURP™', n.x + 28, n.y - 44);
  ctx.font = '5px Trebuchet MS';
  ctx.fillText('NOW WITH FEWER EELS!', n.x + 28, n.y - 38.5);
  ctx.textAlign = 'left';
  // awning over the vendor: posts + stripes
  ctx.fillStyle = '#6e5a48';
  ctx.fillRect(n.x - 20, n.y - 26, 2, 30); ctx.fillRect(n.x + 18, n.y - 26, 2, 30);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#e8e2d0' : '#c0392b';
    ctx.fillRect(n.x - 22 + i * 7.5, n.y - 32, 7.5, 7);
  }
  // the counter
  ctx.fillStyle = S.pal.wood; ctx.fillRect(n.x - 20, n.y + 2, 40, 9);
  ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(n.x - 20, n.y + 2, 40, 2);
  // bottles on display
  ctx.fillStyle = '#74c4b8';
  for (let i = 0; i < 3; i++) ctx.fillRect(n.x - 14 + i * 8, n.y - 3, 4, 6);
  // the radio, on the counter, mid-jingle
  ctx.fillStyle = '#3a3f46'; ctx.fillRect(n.x + 8, n.y - 5, 12, 7);
  ctx.fillStyle = '#1d242c';
  ctx.beginPath(); ctx.arc(n.x + 11, n.y - 1.5, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = S.pal.glow;
  for (let i = 0; i < 2; i++) {
    const h = 1.5 + Math.abs(Math.sin(t * 6 + i * 1.4)) * 2.5;
    ctx.fillRect(n.x + 14.5 + i * 2.5, n.y - 1 - h, 1.5, h);
  }
}

/** Skritch's radio: a boombox with a note. DO NOT TOUCH. */
function drawRadio(ctx, n, game, S) {
  const t = game.t, player = game.player;
  shadow(ctx, n.x, n.y + 8, 10);
  ctx.fillStyle = '#3a3f46'; ctx.fillRect(n.x - 11, n.y - 4, 22, 12);     // body
  ctx.strokeStyle = '#6a7280'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(n.x + 8, n.y - 4); ctx.lineTo(n.x + 13, n.y - 13); ctx.stroke();  // antenna
  ctx.fillStyle = '#1d242c';
  ctx.beginPath();
  ctx.arc(n.x - 6, n.y + 2, 3.5, 0, Math.PI * 2);
  ctx.arc(n.x + 6, n.y + 2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // the EQ, working hard
  ctx.fillStyle = S.pal.glow;
  for (let i = 0; i < 3; i++) {
    const hgt = 2 + Math.abs(Math.sin(t * 6 + i * 1.3)) * 4;
    ctx.fillRect(n.x - 3 + i * 3, n.y - 2 - hgt + 4, 2, hgt);
  }
  ctx.fillStyle = S.pal.paper; ctx.fillRect(n.x - 10, n.y - 9, 8, 6);     // the note
  ctx.strokeStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.moveTo(n.x - 9, n.y - 7); ctx.lineTo(n.x - 4, n.y - 7);
  ctx.moveTo(n.x - 9, n.y - 5); ctx.lineTo(n.x - 5, n.y - 5); ctx.stroke();
  if (Math.hypot(n.x - player.x, n.y - player.y) < 44) {
    ctx.fillStyle = S.pal.paper; ctx.font = 'bold 11px Trebuchet MS';
    ctx.fillText('!', n.x - 2, n.y - 20 + Math.sin(t * 4) * 2);
  }
}

/** Gregory: a rock. He persists. Rocks don't die, dear. */
function drawRock(ctx, n, game, S) {
  const player = game.player, t = game.t;
  shadow(ctx, n.x, n.y + 6, 8);
  ctx.fillStyle = '#8a8a7a';
  ctx.beginPath();
  ctx.ellipse(n.x, n.y, 9, 7, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6a6a5a';
  ctx.beginPath();
  ctx.ellipse(n.x + 3, n.y - 2, 5, 4, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b0b09a';
  ctx.beginPath();
  ctx.ellipse(n.x - 3, n.y - 2, 4, 2.5, -0.3, 0, Math.PI); ctx.fill();
  if (Math.hypot(n.x - player.x, n.y - player.y) < 44) {
    ctx.fillStyle = S.pal.paper; ctx.font = 'bold 11px Trebuchet MS';
    ctx.fillText('!', n.x - 2, n.y - 18 + Math.sin(t * 4) * 2);
  }
}

/** The Cancellation Desk: a counter with a sign. The bureaucracy is real. */
function drawCancellationDesk(ctx, n, game, S) {
  const player = game.player, t = game.t;
  shadow(ctx, n.x, n.y + 14, 14);
  // the desk body
  ctx.fillStyle = '#5a4030'; ctx.fillRect(n.x - 14, n.y - 4, 28, 18);
  ctx.fillStyle = '#3a2820'; ctx.fillRect(n.x - 14, n.y - 4, 28, 4);   // front edge
  // the sign on the desk
  ctx.fillStyle = S.pal.paper; ctx.fillRect(n.x - 10, n.y - 12, 20, 10);
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1;
  ctx.strokeRect(n.x - 10, n.y - 12, 20, 10);
  ctx.fillStyle = '#3a2820'; ctx.font = '5px Trebuchet MS'; ctx.textAlign = 'center';
  ctx.fillText('CANCEL', n.x, n.y - 7);
  ctx.fillText('HERE', n.x, n.y - 3);
  ctx.textAlign = 'left';
  // paperwork stacks
  ctx.fillStyle = '#f0ead6'; ctx.fillRect(n.x - 8, n.y - 2, 6, 2);
  ctx.fillStyle = '#e8e2ca'; ctx.fillRect(n.x - 8, n.y - 4, 6, 2);
  if (Math.hypot(n.x - player.x, n.y - player.y) < 44) {
    ctx.fillStyle = S.pal.paper; ctx.font = 'bold 11px Trebuchet MS';
    ctx.fillText('!', n.x - 2, n.y - 24 + Math.sin(t * 4) * 2);
  }
}

// ---------- per-kind enemy drawings (the default roster) ----------

const ENEMY_DRAW = {
  skeleton(ctx, e, game, fl) {
    // Rattling Brotherhood Local 206. The pin is rendered. The pin is dues.
    ctx.fillStyle = fl ? '#fff' : e.col;
    ctx.fillRect(e.x - 8, e.y - 12, 16, 22);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(e.x - 5, e.y - 9, 4, 4); ctx.fillRect(e.x + 1, e.y - 9, 4, 4);
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(e.x - 8, e.y); ctx.lineTo(e.x + 8, e.y);
    ctx.moveTo(e.x - 8, e.y + 5); ctx.lineTo(e.x + 8, e.y + 5);
    ctx.stroke();
    ctx.fillStyle = '#d4a017';
    ctx.beginPath(); ctx.arc(e.x - 4, e.y + 2, 2, 0, Math.PI * 2); ctx.fill();  // the union pin
  },
  mailbat(ctx, e, game, fl) {
    const flap = Math.sin(game.t * 12 + e.x) * 5;
    ctx.fillStyle = fl ? '#fff' : e.col;
    ctx.beginPath();
    ctx.moveTo(e.x - 8, e.y); ctx.lineTo(e.x - 18, e.y - 6 - flap); ctx.lineTo(e.x - 8, e.y - 5);
    ctx.moveTo(e.x + 8, e.y); ctx.lineTo(e.x + 18, e.y - 6 + flap); ctx.lineTo(e.x + 8, e.y - 5);
    ctx.fill();
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 3, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20252b'; ctx.fillRect(e.x - 5, e.y - 6, 3, 3); ctx.fillRect(e.x + 2, e.y - 6, 3, 3);
    // the URGENT envelope (it is not urgent)
    ctx.fillStyle = '#f0ead6'; ctx.fillRect(e.x - 5, e.y + 4, 10, 7);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(e.x - 5, e.y + 6, 10, 2);
  },
  consultant(ctx, e, game, fl) {
    // external, billable, intangible. walls are for employees.
    const fade = .55 + .25 * Math.sin(game.t * 4 + e.x);
    ctx.globalAlpha = fade;
    ctx.fillStyle = fl ? '#fff' : e.col;
    ctx.beginPath(); ctx.arc(e.x, e.y - 3, 10, Math.PI, 0);
    ctx.lineTo(e.x + 10, e.y + 8);
    for (let i = 0; i < 4; i++) ctx.lineTo(e.x + 10 - (i + .5) * 5, e.y + 8 - (i % 2 ? 0 : 4));
    ctx.lineTo(e.x - 10, e.y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a2d2d'; ctx.fillRect(e.x - 1, e.y - 4, 3, 9);  // the tie
    ctx.fillStyle = '#20252b'; ctx.fillRect(e.x - 6, e.y - 6, 3, 4); ctx.fillRect(e.x + 3, e.y - 6, 3, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(e.x + 10, e.y + 1, 7, 6);  // the briefcase stays opaque
  },
  cabinet(ctx, e, game, fl) {
    // archival furniture. it resents the term "mimic."
    ctx.fillStyle = fl ? '#fff' : e.col;
    ctx.fillRect(e.x - 9, e.y - 14, 18, 27);
    ctx.fillStyle = '#5f646d';
    const openTop = e.provoked ? 4 : 0;
    ctx.fillRect(e.x - 7, e.y - 11 - openTop, 14, 3);
    ctx.fillRect(e.x - 7, e.y - 2, 14, 3);
    ctx.fillRect(e.x - 7, e.y + 7, 14, 3);
    ctx.fillStyle = '#454a52';
    ctx.fillRect(e.x - 1, e.y - 10 - openTop, 3, 1); ctx.fillRect(e.x - 1, e.y - 1, 3, 1);
    if (e.provoked) {
      ctx.fillStyle = '#171a1f'; ctx.fillRect(e.x - 7, e.y - 11, 14, 4);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(e.x - 5 + i * 5, e.y - 11); ctx.lineTo(e.x - 3 + i * 5, e.y - 7); ctx.lineTo(e.x - 1 + i * 5, e.y - 11);
        ctx.fill();
      }
    }
  },
  slime(ctx, e, game, fl) {
    // the intern. TECHNICALLY doing its best.
    const jig = Math.sin(game.t * 5 + e.x) * 1.5;
    ctx.fillStyle = '#4f8f3a';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 3, 10 + jig * .5, 8 - jig * .3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fl ? '#fff' : e.col;
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, 9 + jig * .5, 7 - jig * .3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20252b'; ctx.fillRect(e.x - 4, e.y - 2, 2, 3); ctx.fillRect(e.x + 2, e.y - 2, 2, 3);
    // HELLO MY NAME IS (illegible, which is correct)
    ctx.fillStyle = '#fff'; ctx.fillRect(e.x - 4, e.y + 4, 8, 5);
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(e.x - 3, e.y + 7); ctx.lineTo(e.x + 3, e.y + 6); ctx.stroke();
  },
  pigeon(ctx, e, game, fl) {
    const peck = Math.sin(game.t * 3 + e.x) > .6 ? 2 : 0;
    ctx.fillStyle = fl ? '#fff' : e.col;
    ctx.beginPath(); ctx.arc(e.x, e.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.x + 6, e.y - 5 + peck, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6e747c';
    ctx.beginPath(); ctx.arc(e.x - 2, e.y, 6, Math.PI * .8, Math.PI * 1.9); ctx.fill();
    ctx.fillStyle = '#d98e2b';
    ctx.beginPath();
    ctx.moveTo(e.x + 10, e.y - 5 + peck); ctx.lineTo(e.x + 14, e.y - 4 + peck); ctx.lineTo(e.x + 10, e.y - 3 + peck);
    ctx.fill();
    ctx.fillRect(e.x - 3, e.y + 7, 2, 3); ctx.fillRect(e.x + 1, e.y + 7, 2, 3);
    ctx.fillStyle = '#20252b'; ctx.fillRect(e.x + 6, e.y - 7 + peck, 2, 2);
  },
  goose(ctx, e, game, fl) {
    // the neck extends toward you. that is the attack posture. it is a goose.
    const angry = e.provoked || Math.hypot(game.player.x - e.x, game.player.y - e.y) < e.aggro;
    const dir = Math.sign(game.player.x - e.x) || 1;
    const reach = angry ? 12 : 5;
    ctx.fillStyle = fl ? '#fff' : e.col;
    ctx.beginPath(); ctx.ellipse(e.x, e.y, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(e.x + (dir > 0 ? 4 : -4 - reach), e.y - 10, reach + 2, 3);     // the neck
    ctx.beginPath(); ctx.arc(e.x + dir * (6 + reach), e.y - 9, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0892a';
    ctx.beginPath();
    const bx = e.x + dir * (10 + reach);
    ctx.moveTo(bx, e.y - 10); ctx.lineTo(bx + dir * 5, e.y - 9); ctx.lineTo(bx, e.y - 8);
    ctx.fill();
    ctx.fillStyle = '#20252b'; ctx.fillRect(e.x + dir * (5 + reach) - 1, e.y - 11, 2, 2);
  },
  veteran(ctx, e, game, fl) {
    // they held the line. the honor outlived the soldier.
    const fade = .55 + .25 * Math.sin(game.t * 4 + e.x);
    ctx.globalAlpha = fade;
    ctx.fillStyle = fl ? '#fff' : e.col;
    ctx.beginPath(); ctx.arc(e.x, e.y - 3, 10, Math.PI, 0);
    ctx.lineTo(e.x + 10, e.y + 8);
    for (let i = 0; i < 4; i++) ctx.lineTo(e.x + 10 - (i + .5) * 5, e.y + 8 - (i % 2 ? 0 : 4));
    ctx.lineTo(e.x - 10, e.y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#20252b'; ctx.fillRect(e.x - 5, e.y - 5, 3, 4); ctx.fillRect(e.x + 2, e.y - 5, 3, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#b3441e'; ctx.fillRect(e.x - 6, e.y + 1, 4, 5);            // the ribbon
    ctx.fillStyle = '#d4a017';
    ctx.beginPath(); ctx.arc(e.x - 4, e.y + 7, 3, 0, Math.PI * 2); ctx.fill();  // the medal stays opaque
  }
};

/** Unknown kinds get a readable blob rather than a crash. */
function drawFallback(ctx, e, game, fl) {
  ctx.fillStyle = fl ? '#fff' : e.col;
  ctx.fillRect(e.x - 9, e.y - 9, 18, 18);
  ctx.fillStyle = '#20252b'; ctx.fillRect(e.x - 5, e.y - 4, 3, 4); ctx.fillRect(e.x + 2, e.y - 4, 3, 4);
}

export function drawEnemy(ctx, e, game) {
  const S = getSkin(game);
  shadow(ctx, e.x, e.y + e.h / 2 - 2, e.w / 2);
  const fl = e.flash > 0;
  const fn = (S.enemyDraw && S.enemyDraw[e.kind]) || ENEMY_DRAW[e.kind] || drawFallback;
  fn(ctx, e, game, fl);
  if (e.hp < e.maxhp) {
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(e.x - 10, e.y - e.h / 2 - 9, 20, 3);
    ctx.fillStyle = S.pal.danger; ctx.fillRect(e.x - 10, e.y - e.h / 2 - 9, 20 * e.hp / e.maxhp, 3);
  }
}

export function drawBoss(ctx, game) {
  const S = getSkin(game);
  if (S.drawBoss) { S.drawBoss(ctx, game); return; }
  const b = game.boss, t = game.t;
  shadow(ctx, b.x, b.y + 22, 22);
  const tele = b.state === 'tele' && Math.sin(t * 24) > 0;
  if (b.name === 'the Reenactor') {
    // verdigris-bronze knight, performing. both sides. alone. forty years.
    ctx.fillStyle = b.flash > 0 ? '#fff' : (tele ? S.pal.danger : '#6e8f7a');
    ctx.fillRect(b.x - 14, b.y - 16, 28, 38);
    ctx.fillStyle = '#4a6354'; ctx.fillRect(b.x - 14, b.y + 6, 28, 16);
    ctx.fillStyle = '#d4a017';                                  // the sash
    ctx.beginPath();
    ctx.moveTo(b.x - 14, b.y - 14); ctx.lineTo(b.x + 14, b.y + 4);
    ctx.lineTo(b.x + 14, b.y + 9); ctx.lineTo(b.x - 14, b.y - 9);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = b.flash > 0 ? '#fff' : '#6e8f7a';           // helmet
    ctx.fillRect(b.x - 8, b.y - 26, 16, 11);
    ctx.fillStyle = tele ? '#fff' : '#b03a2e';                  // the plume flashes before the Famous Charge
    ctx.beginPath(); ctx.arc(b.x, b.y - 28, 6, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#20252b'; ctx.fillRect(b.x - 5, b.y - 22, 10, 3);
    if (tele) {
      ctx.fillStyle = '#5b5147'; ctx.fillRect(b.x + 14, b.y - 30, 2, 16);  // a tiny flag, raised
      ctx.fillStyle = '#b03a2e'; ctx.fillRect(b.x + 16, b.y - 30, 9, 6);
    }
  } else {
    // a Warden (floor 4: the Middle Manager himself) — suit, lanyard, horns
    ctx.fillStyle = b.flash > 0 ? '#fff' : (tele ? S.pal.danger : '#4a525a');
    ctx.fillRect(b.x - 15, b.y - 18, 30, 40);
    ctx.fillStyle = '#f0ead6'; ctx.fillRect(b.x - 6, b.y - 18, 12, 14);   // the shirt
    ctx.fillStyle = '#7a2d2d'; ctx.fillRect(b.x - 2, b.y - 18, 4, 14);    // the tie
    ctx.fillStyle = b.flash > 0 ? '#fff' : '#8a7a6a';                     // the head
    ctx.fillRect(b.x - 9, b.y - 30, 18, 13);
    ctx.fillStyle = '#d8cfc0';                                            // the horns. he's a bull man.
    ctx.beginPath();
    ctx.moveTo(b.x - 9, b.y - 26); ctx.lineTo(b.x - 17, b.y - 32); ctx.lineTo(b.x - 9, b.y - 30);
    ctx.moveTo(b.x + 9, b.y - 26); ctx.lineTo(b.x + 17, b.y - 32); ctx.lineTo(b.x + 9, b.y - 30);
    ctx.fill();
    if (b.state !== 'sleep') {
      ctx.fillStyle = tele ? S.pal.danger : '#20252b';
      ctx.fillRect(b.x - 6, b.y - 27, 4, 4); ctx.fillRect(b.x + 2, b.y - 27, 4, 4);
    }
    ctx.fillStyle = '#d4a017'; ctx.fillRect(b.x - 1, b.y - 4, 2, 8);      // the lanyard. laminated.
  }
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(b.x - 21, b.y - 40, 42, 5);
  ctx.fillStyle = S.pal.danger; ctx.fillRect(b.x - 21, b.y - 40, 42 * b.hp / b.maxhp, 5);
}

export function drawPlayer(ctx, game) {
  const S = getSkin(game);
  const A = S.actors;
  const p = game.player, t = game.t;
  shadow(ctx, p.x, p.y + 10, 9);
  if (p.inv > 0 && Math.sin(t * 26) > 0) return;  // hit-flicker
  ctx.fillStyle = A.playerRobe; ctx.fillRect(p.x - 7, p.y - 5, 14, 15);
  ctx.fillStyle = A.skinTone; ctx.beginPath(); ctx.arc(p.x, p.y - 11, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = A.playerHat; ctx.fillRect(p.x - 8, p.y - 16, 16, 5);
  ctx.fillStyle = A.playerAccent; ctx.fillRect(p.x + 4, p.y - 16, 4, 5);
  ctx.fillStyle = A.eye;
  const ex = p.x + p.fx * 3; ctx.fillRect(ex - 3, p.y - 12, 2, 3); ctx.fillRect(ex + 1, p.y - 12, 2, 3);
  // swing: the visual arc matches the weapon's real reach — what you see
  // is what hits. tier 0 is a short, honest whap
  if (p.atkT > 0.14) {
    const R = strikeRadius(p.swordLv);
    const fm = Math.hypot(p.fx, p.fy) || 1, fx = p.fx / fm, fy = p.fy / fm;
    const prog = 1 - (p.atkT - 0.14) / 0.2;
    const a0 = Math.atan2(fy, fx) - 1.2 + prog * 2.4;
    if (p.swordLv >= 1) {
      ctx.strokeStyle = p.swordLv > 1 ? A.swordUp : A.sword; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a0) * 10, p.y - 4 + Math.sin(a0) * 10);
      ctx.lineTo(p.x + Math.cos(a0) * (R + 8), p.y - 4 + Math.sin(a0) * (R + 8)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = p.swordLv >= 1 ? 8 : 6;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(p.x, p.y - 4, R + 4, a0 - .5, a0 + .1); ctx.stroke();
  }
}
