// WebAudio synth bleeps + the shared audio plumbing. Everything the game
// plays routes through one AudioContext and one master gain, so mute is
// mute (beeps, stings, and the jingle alike).

import { glurpSting } from './music.js';

let AC = null, MASTER = null;
let muted = false;
try { muted = localStorage.getItem('sh-mute') === '1'; } catch (e) { /* private mode */ }

/** The shared AudioContext (created lazily — needs a user gesture anyway). */
export function getAC() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    MASTER = AC.createGain();
    MASTER.gain.value = muted ? 0 : 1;
    MASTER.connect(AC.destination);
  }
  return AC;
}

/** The master gain node; connect all audio here, never to the destination. */
export function masterOut() {
  getAC();
  return MASTER;
}

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = !!m;
  if (MASTER) MASTER.gain.value = muted ? 0 : 1;
  try { localStorage.setItem('sh-mute', muted ? '1' : '0'); } catch (e) { /* private mode */ }
}

export function beep(f, d, type, vol, slide) {
  try {
    const ctx = getAC();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime + d);
    g.gain.setValueAtTime(vol || .04, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + d);
    o.connect(g); g.connect(MASTER);
    o.start(); o.stop(ctx.currentTime + d);
  } catch (e) { /* audio unavailable */ }
}

export const sfx = {
  swing:  () => beep(300, .1, 'sawtooth', .03, 120),
  hit:    () => beep(150, .1, 'square', .05),
  hurt:   () => beep(100, .25, 'sawtooth', .06, 60),
  coin:   () => { beep(990, .06, 'sine', .05); setTimeout(() => beep(1480, .09, 'sine', .05), 50); },
  heal:   () => beep(520, .18, 'sine', .05, 780),
  level:  () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .14, 'sine', .05), i * 90)); },
  talk:   () => beep(660, .05, 'square', .03),
  boss:   () => beep(60, .5, 'sawtooth', .08),
  win:    () => { [523, 659, 784, 659, 1046].forEach((f, i) => setTimeout(() => beep(f, .2, 'sine', .06), i * 140)); },
  push:   () => beep(110, .09, 'square', .05),
  ignite: () => beep(680, .16, 'sine', .06, 1250),
  douse:  () => beep(180, .12, 'sine', .03, 90),
  // a dry mechanism clack, then the sad thunk of a dart not arriving
  click:  () => { beep(1300, .03, 'square', .06); setTimeout(() => beep(220, .05, 'square', .03), 45); },
  // an open hand meeting a goose. neither is proud of it
  slap:   () => beep(240, .06, 'triangle', .05, 140),
  // drinking Glurp plays the wet *glurp* from the end of the jingle;
  // the heal bleep stands in until the recording has loaded
  glurp:  () => { if (!glurpSting()) beep(520, .18, 'sine', .05, 780); }
};

export function playSfx(name) {
  const f = sfx[name];
  if (f) f();
}
