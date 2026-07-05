// The OST — lo-fi electronic, light and dark versions. One rule for the
// whole album: music is diegetic. Every track plays FROM somewhere, louder
// the closer you are, and several sources can be audible at once (the
// GLURP-O-MATIC hums its own ad over the imps' radio; that's the joke).
//
//   ledger-lightning-bolt — the title screen (non-spatial; the screen is
//       the source). Heroic self-aware music for beating the beast of
//       corporate. Drum hits at 10s and 20s (pickups at 18/19) — the
//       splash reacts to its own soundtrack.
//   audit-microwave — cheeky, cheery, corporate: the Guild Hall radio.
//   factory-synesthesia — working stiff monster music: the imp break
//       room's radio, every floor.
//   performance-review — radiates from the Warden himself. You hear the
//       review approaching.
//   apocalypse-cancel — for facing the final boss (interim: floor 12).
//   gumdrop-verdict — strikes up when the Reenactor activates; hideously
//       winds down when he's killed.
//   glurp-jingle — the hit single. 🎵 GLURP! It's adventure fluid! /
//       GLURP! Don't ask what's in it! / If you're hurt or sad or cursed
//       or dead-ish, / GLURP'll fix you in a minute!* 🎵 [spoken, rapidly:]
//       BY OPENING THE LID, YOU AGREE TO INDEMNIFY THE GLURP BOTTLING
//       CONCERN FOR ANY CLAIMS ARISING FROM THE USE OF GLURP. — Plays from
//       everything that dispenses Glurp, and ends with a really wet
//       *glurp*, which is the sound of drinking one (glurpSting).
//
// Best-effort everywhere: missing assets or unavailable audio = silence,
// never an error. Everything routes through the master gain (mute is mute).

import { ST } from '../constants.js';
import { getAC, masterOut } from './sfx.js';

const TRACKS = {
  lightning: 'assets/audio/ledger-lightning-bolt.mp3',
  microwave: 'assets/audio/audit-microwave.mp3',
  factory: 'assets/audio/factory-synesthesia.mp3',
  review: 'assets/audio/performance-review.mp3',
  apocalypse: 'assets/audio/apocalypse-cancel.mp3',
  gumdrop: 'assets/audio/gumdrop-verdict.mp3',
  jingle: 'assets/audio/glurp-jingle.mp3'
};

const TITLE_BEATS = [10, 18, 19, 20];   // seconds; per the composer's notes
const STING_AT = 13.107;                // the wet glurp's onset (per the composer)

/**
 * Everything currently making music, with positions. Pure — unit-tested.
 * Non-spatial sources omit x/y. Several sources may be live at once;
 * playback takes each track's loudest source.
 */
export function musicSources(game) {
  if (game.state === ST.MENU) return [{ name: 'lightning', max: 0.4 }];
  const out = [];
  if (game.zone === 'ow') {
    // an activated Reenactor performs. with accompaniment. he brought it.
    const b = game.boss;
    if (b && !b.dead && b.state !== 'sleep') {
      out.push({ name: 'gumdrop', x: b.x, y: b.y, range: 700, max: 0.45 });
    } else {
      // Hespeth's radio, on the desk — the light set
      const r = game.npcs.find(n => n.kind === 'radio');
      if (r) out.push({ name: 'microwave', x: r.x, y: r.y, range: 520, max: 0.4 });
    }
  } else if (game.boss && !game.boss.dead && game.floorNum % 4 === 0) {
    // the review radiates from the reviewer
    out.push({
      name: game.floorNum >= 12 ? 'apocalypse' : 'review',
      x: game.boss.x, y: game.boss.y, range: 640, max: 0.45
    });
  } else {
    // Skritch's radio, in its own room — the break room is for Glurp
    const r = game.npcs.find(n => n.kind === 'radio');
    if (r) out.push({ name: 'factory', x: r.x, y: r.y, range: 460, max: 0.4 });
  }
  // the hit single: everything that dispenses Glurp hums it
  for (const n of game.npcs) {
    if (n.name === 'Gift Shop Gnoll' || n.kind === 'machine') {
      out.push({ name: 'jingle', x: n.x, y: n.y, range: 130, max: 0.5 });
    }
  }
  return out;
}

/** Positional gain for a source, given the listener. Pure. */
export function sourceGain(src, x, y) {
  if (src.x === undefined) return src.max;          // non-spatial
  const d = Math.hypot(src.x - x, src.y - y);
  return d >= src.range ? 0 : src.max * (1 - d / src.range);
}

// ---------- playback (browser-side) ----------

const buffers = {}, loading = {};
const channels = {};            // track name -> { src, gain }
let beatCb = null, beatTimers = [];

function load(name) {
  if (buffers[name] || loading[name]) return;
  loading[name] = true;
  fetch(TRACKS[name])
    .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(d => getAC().decodeAudioData(d))
    .then(b => { buffers[name] = b; })
    .catch(() => { loading[name] = 'failed'; /* no music from this source today */ });
}

/** Trim encoder padding so mp3 loops don't gap. */
function loopPoints(b) {
  const d = b.getChannelData(0), thr = 0.001;
  let s = 0, e = d.length - 1;
  while (s < e && Math.abs(d[s]) < thr) s++;
  while (e > s && Math.abs(d[e]) < thr) e--;
  return { start: s / b.sampleRate, end: (e + 1) / b.sampleRate };
}

function clearBeats() {
  for (const t of beatTimers) clearTimeout(t);
  beatTimers = [];
}

function scheduleBeats() {
  clearBeats();
  beatTimers = TITLE_BEATS.map(sec => setTimeout(() => beatCb && beatCb(sec), sec * 1000));
}

/** Start (at gain 0) a looping channel for a loaded track. */
function ensureChannel(name) {
  if (channels[name] || !buffers[name]) return;
  const ctx = getAC();
  const b = buffers[name];
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.loop = true;
  const lp = loopPoints(b);
  src.loopStart = lp.start; src.loopEnd = lp.end;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(gain); gain.connect(masterOut());
  src.start(0, lp.start);
  channels[name] = { src, gain };
  if (name === 'lightning' && beatCb) {
    // the drum hits land relative to when the audio actually runs —
    // a suspended context (pre-gesture) hasn't started the song yet
    if (ctx.state === 'running') scheduleBeats();
    else ctx.addEventListener('statechange', function once() {
      if (ctx.state === 'running') { ctx.removeEventListener('statechange', once); scheduleBeats(); }
    });
  }
}

/** The tape hideously winds down: pitch dives, volume dies. For verdicts. */
function windDown(name) {
  const ch = channels[name];
  if (!ch) return;
  delete channels[name];        // a fresh channel next time it's sourced
  const ctx = getAC();
  try {
    ch.src.playbackRate.setValueAtTime(1, ctx.currentTime);
    ch.src.playbackRate.exponentialRampToValueAtTime(0.04, ctx.currentTime + 2.2);
    ch.gain.gain.setValueAtTime(ch.gain.gain.value, ctx.currentTime);
    ch.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.4);
    setTimeout(() => { try { ch.src.stop(); } catch (e) { /* stopped */ } }, 2600);
  } catch (e) { /* audio unavailable */ }
}

/** The splash registers here to pulse on the title track's drum hits. */
export function onTitleBeat(cb) { beatCb = cb; }

/** Debug/diagnostics: what's loaded, what's playing, at what gain. */
export function musicDebug() {
  const out = { loaded: Object.keys(buffers), failed: [], channels: {} };
  for (const [n, v] of Object.entries(loading)) if (v === 'failed') out.failed.push(n);
  for (const [n, ch] of Object.entries(channels)) out.channels[n] = +ch.gain.gain.value.toFixed(3);
  return out;
}

/** The wet *glurp* from the end of the jingle. False if not loaded yet. */
export function glurpSting() {
  try {
    if (!buffers.jingle) { load('jingle'); return false; }
    const ctx = getAC();
    const b = buffers.jingle;
    const s = ctx.createBufferSource();
    s.buffer = b;
    const g = ctx.createGain();
    g.gain.value = 0.8;
    s.connect(g); g.connect(masterOut());
    s.start(0, STING_AT, b.duration - STING_AT);
    return true;
  } catch (e) { return false; }
}

/**
 * Per-frame: gather sources, load what's wanted, and fade every channel
 * toward its loudest source (0 when unsourced). One system, whole album.
 */
export function updateMusic(game) {
  try {
    const want = {};   // track -> target gain (0 = sourced but out of earshot:
                       // the tape still spins, so approach never hits a load)
    for (const s of musicSources(game)) {
      const g = sourceGain(s, game.player.x, game.player.y);
      if (!(s.name in want) || g > want[s.name]) want[s.name] = g;
    }
    // the Reenactor's overture doesn't fade on his death; the tape dies
    if (channels.gumdrop && !('gumdrop' in want) &&
        game.zone === 'ow' && game.boss && game.boss.dead) {
      windDown('gumdrop');
    }
    const ctx = getAC();
    for (const name of Object.keys(want)) {
      if (!buffers[name]) { load(name); continue; }
      ensureChannel(name);
      channels[name].gain.gain.setTargetAtTime(want[name], ctx.currentTime, 0.2);
    }
    for (const name of Object.keys(channels)) {
      if (!(name in want)) channels[name].gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    }
  } catch (e) { /* audio unavailable */ }
}
