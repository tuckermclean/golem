// Bootstrap. The only file that knows about both the DOM and the game state.

import { ST, T, VH, VIL } from './constants.js';
import { createGame, newRun } from './core/game.js';
import { updateGame } from './core/update.js';
import { makeEffects } from './core/effects.js';
import { playSfx, setMuted, isMuted, getAC, masterOut } from './audio/sfx.js';
import { updateMusic, onTitleBeat, musicDebug } from './audio/music.js';
import { loadMeta, saveMeta } from './core/save.js';
import { makeHud } from './ui/hud.js';
import { makeToast } from './ui/toast.js';
import { makeDialog } from './ui/dialog.js';
import { makeScreens } from './ui/screens.js';
import { makeSplash } from './ui/splash.js';
import { makeStick } from './input/stick.js';
import { makeKeyboard } from './input/keyboard.js';
import { talkTo } from './content/dialogue.js';
import { bufferAttack } from './systems/movement.js';
import { usePotion } from './systems/potions.js';
import { questLabel } from './systems/quest.js';
import { respawnAtGuild } from './systems/respawn.js';
import { deathReport, gradeRun, gradeRemark } from './systems/ledger.js';
import { hespethLine, resurrectionNote } from './content/hespeth.js';
import { entryLines, approvalLines, customsIntro, declareOutcome, smuggleOutcome, suspicionBook } from './content/golem.js';
import { nextRiddle, answerRiddle, doorSigh } from './systems/riddle.js';
import { render } from './render/index.js';
import { SKINS, DEFAULT_SKIN } from './render/skins/index.js';
import { makeCheats } from './ui/cheats.js';

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const els = {
  hud: $('hud'), hpFill: $('hpFill'), xpFill: $('xpFill'), statline: $('statline'),
  questEl: $('quest'), btnA: $('btnA'), btnP: $('btnP'),
  dlg: $('dlg'), dlgName: $('dlgName'), dlgText: $('dlgText'), dlgBtns: $('dlgBtns'), dlgHint: $('dlgHint'),
  over: $('over'), overTitle: $('overTitle'), overSub: $('overSub'), overTip: $('overTip'),
  splash: $('splash'), splashStamp: $('splashStamp'), splashLedger: $('splashLedger'),
  splashPress: $('splashPress'), embers: $('embers'),
  toast: $('toast'), stickBase: $('stickBase'), stickKnob: $('stickKnob')
};

// ---------- screen ----------
const screen = { W: 0, H: 0, dpr: 1, scale: 1, viewW: 0 };
function resize() {
  screen.dpr = Math.min(window.devicePixelRatio || 1, 2);
  screen.W = cv.clientWidth; screen.H = cv.clientHeight;
  cv.width = screen.W * screen.dpr; cv.height = screen.H * screen.dpr;
  screen.scale = screen.H / VH;
  screen.viewW = screen.W / screen.scale;
}
window.addEventListener('resize', resize);
resize();

// ---------- game + UI ----------
const game = createGame();

// knowledge is permanent — across the tab, too
const savedMeta = loadMeta();
if (savedMeta) game.meta = savedMeta;
let lastSaved = '';
function persist() {
  const now = JSON.stringify(game.meta);
  if (now !== lastSaved && saveMeta(game.meta)) lastSaved = now;
}
window.addEventListener('beforeunload', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
setInterval(persist, 5000);

// skin: game.skin drives the canvas, a body class drives the CSS vars
function setSkin(name) {
  if (!SKINS[name]) name = DEFAULT_SKIN;
  game.skin = name;
  document.body.className = document.body.className.replace(/\bskin-\S+/g, '').trim();
  document.body.classList.add('skin-' + name);
  try { localStorage.setItem('sh-skin', name); } catch (e) { /* private mode */ }
}
let savedSkin = null;
try { savedSkin = localStorage.getItem('sh-skin'); } catch (e) { /* private mode */ }
setSkin(savedSkin || DEFAULT_SKIN);
const hud = makeHud(els);
const toast = makeToast(els.toast);
const screens = makeScreens(els);
const dialog = makeDialog(game, els, () => playSfx('talk'));
const splash = makeSplash(
  { splash: els.splash, stamp: els.splashStamp, ledger: els.splashLedger,
    press: els.splashPress, embers: els.embers },
  { onStart: startGame });
onTitleBeat(sec => splash.beat(sec));   // the splash reacts to its own soundtrack

// browsers gate audio behind a gesture; any input is consent to be sung at
function resumeAudio() { try { getAC().resume(); } catch (e) { /* no audio */ } }
window.addEventListener('keydown', resumeAudio);
window.addEventListener('pointerdown', resumeAudio);

const fx = makeEffects({
  sfx: playSfx,
  toast: msg => toast.show(msg),
  hudChanged: () => hud.update(game.player, game.meta),
  questChanged: () => hud.setQuestHTML(questLabel(game.quest, game.deepest)),
  setQuestHTML: html => hud.setQuestHTML(html),
  nearNpc: npc => { els.btnA.textContent = npc ? 'TALK' : 'ATTACK'; },
  requestTalk: npc => talkTo(npc, game, dialog, fx),
  onPlayerDeath: () => {
    hud.hide();
    // the Ledger files its report BEFORE Hespeth processes the body
    const cause = game.lastHitBy || null;
    const willBeDeaths = game.meta.deaths + 1;
    const grade = gradeRun(
      { ...game.meta, deaths: willBeDeaths,
        repeatCause: cause && cause === game.meta.lastCause ? game.meta.repeatCause + 1 : 0 },
      { ...game.runStats, died: true });
    pendingDeath = { grade };
    const reportMeta = { deaths: willBeDeaths,
      repeatCause: cause && cause === game.meta.lastCause ? game.meta.repeatCause + 1 : 0 };
    screens.showIncidentReport(
      deathReport(reportMeta, cause) + ' ' + gradeRemark(grade),
      grade,
      hespethLine(willBeDeaths));
  },
  onAmuletFound: () => screens.showWin(),
  onEpilogue:    () => screens.showEpilogue(),
  onTransfer:    () => screens.showTransfer(),

  // ---- the Door Golem ----
  onGolemEntry: missing => dialog.say('Door Golem', entryLines(game, missing)),
  // entry waits for the stamp: the trapdoor opens when the ceremony ends
  onGolemApproval: done => dialog.say('Door Golem', approvalLines(game), done),
  // customs happens AT the door; `done` releases the player into daylight
  onGolemCustoms: (gold, done) => {
    const ask = () => {
      dialog.setSpeaker('Door Golem');
      dialog.setText('Anything to declare?');
      dialog.open();
      dialog.choice([
        { label: 'Declare it', fn: () => dialog.say('Door Golem', [declareOutcome(gold)], done) },
        { label: '"Nothing to declare."', fn: () => dialog.say('Door Golem', [smuggleOutcome(game)], done) },
        { label: '\u{1F4D3} Read his little book', fn: () =>
          // a peek, not an answer — the question is still pending
          dialog.say('Door Golem', suspicionBook(game.meta), ask) }
      ]);
    };
    dialog.say('Door Golem', customsIntro(gold), ask);
  },

  // ---- the Riddle Door That Learned Its Lesson ----
  onRiddle: () => askTheDoor()
});

// ---------- playtest cheats (?cheats or ?test; backtick toggles) ----------
const q = new URLSearchParams(location.search);
const cheats = (q.has('cheats') || q.has('test'))
  ? makeCheats(game, fx, {
      skins: { list: () => Object.keys(SKINS), get: () => game.skin, set: setSkin }
    })
  : null;

function askTheDoor() {
  const r = nextRiddle(game);
  dialog.say('The Door', [r.q], () => {});
  dialog.choice(r.options.map(o => ({
    label: o.label,
    fn: () => {
      const result = answerRiddle(game, o, fx);
      if (result === 'wrong') {
        // the sigh deserves its own beat: show it, tap, then the easier question
        dialog.say('The Door', [doorSigh(game.puzzle.attempts)], () => askTheDoor());
      } else {
        dialog.advance();  // close; the toast carries the verdict
      }
    }
  })));
}

// ---------- input ----------
const { stick, start: startStick } = makeStick(els.stickBase, els.stickKnob);

const kb = makeKeyboard({
  onConfirm: () => {
    if (game.state === ST.DIALOG) dialog.advance();
    else if (game.state === ST.MENU) return;  // the splash owns menu keys
    else if (game.state === ST.DEAD) resurrect();
    else bufferAttack(game);
  },
  onPotion: () => { if (game.state !== ST.MENU) usePotion(game, fx); }
});

// every key on the splash goes to the Ledger; only Enter starts
window.addEventListener('keydown', e => { if (game.state === ST.MENU) splash.key(e); });

// backtick toggles the cheat panel (never on the splash — the Ledger would notice)
window.addEventListener('keydown', e => {
  if (e.key === '`' && cheats && game.state !== ST.MENU) cheats.toggle();
});

// ---------- mute (button + M key; persisted) ----------
const muteBtn = document.createElement('div');
muteBtn.id = 'muteBtn';
muteBtn.textContent = isMuted() ? '\u{1F507}' : '\u{1F50A}';
// visible from boot — a silent title screen should at least show you why
muteBtn.addEventListener('pointerdown', e => { e.stopPropagation(); toggleMute(); });
document.getElementById('wrap').appendChild(muteBtn);
function toggleMute() {
  setMuted(!isMuted());
  muteBtn.textContent = isMuted() ? '\u{1F507}' : '\u{1F50A}';
}
window.addEventListener('keydown', e => {
  if ((e.key === 'm' || e.key === 'M') && game.state !== ST.MENU) toggleMute();
});

let pendingDeath = null;
window.addEventListener('pointerdown', e => {
  if (game.state === ST.MENU) { splash.pointer(e); return; }
  if (game.state === ST.DEAD) { resurrect(); return; }
  if (game.state === ST.WIN) {
    screens.closeOver();
    // Transfer (New Game+): close the screen into a fresh run. meta is kept —
    // heist tokens, menace, knowledge, owner flag all survive newRun() by design.
    if (game.meta.owner && !game.meta.cancelled) { newRun(game); fx.hudChanged(); fx.questChanged(); }
    game.state = ST.PLAY;
    return;
  }
  if (game.state === ST.DIALOG) { dialog.advance(); return; }
  if (e.target.classList && e.target.classList.contains('btn')) return;
  if (e.target.tagName === 'BUTTON') return;
  if (e.clientX < screen.W * 0.55 && !stick.active) startStick(e);
});

els.btnA.addEventListener('pointerdown', e => { e.stopPropagation(); bufferAttack(game); els.btnA.classList.add('on'); });
els.btnA.addEventListener('pointerup', () => els.btnA.classList.remove('on'));
els.btnP.addEventListener('pointerdown', e => { e.stopPropagation(); usePotion(game, fx); });

// ---------- start / loop ----------
function resurrect() {
  const grade = pendingDeath ? pendingDeath.grade : 'C';
  pendingDeath = null;
  const { deductible, garnish } = respawnAtGuild(game, fx);
  game.meta.grades.push(grade);
  screens.closeOver();
  hud.show();
  toast.show(resurrectionNote(deductible, garnish));
}

function startGame() {
  newRun(game);
  game.state = ST.PLAY;
  screens.closeOver();
  hud.show();
  if (cheats) cheats.button.style.display = 'flex';
  fx.hudChanged();
  fx.questChanged();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(.033, (now - last) / 1000);
  last = now;
  const m = kb.moveVector();
  const controls = {
    mx: m.mx !== 0 ? m.mx : stick.dx,
    my: m.my !== 0 ? m.my : stick.dy
  };
  updateGame(game, controls, dt, { w: screen.viewW }, fx);
  updateMusic(game);    // the whole album is diegetic; closer is louder
  toast.tick(dt);
  render(ctx, game, screen);
  requestAnimationFrame(loop);
}

// e2e handle (tests/e2e): exposed only when the page is loaded with ?test
if (new URLSearchParams(location.search).has('test')) window.__sh = { game, fx, getAC, masterOut, musicDebug };

// menu backdrop: a generated world behind the title
newRun(game);
game.cam.x = Math.max(0, game.player.x - 600);
game.cam.y = Math.max(0, game.player.y - 240);
requestAnimationFrame(loop);
