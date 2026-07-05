// The cinematic splash screen. Owns its DOM (stamp wobble, typewriter,
// embers, fadeout); installs NO window listeners — main.js routes keys and
// pointers here while the game is in MENU state.

import { SPLASH_START_LINE, splashLine } from '../content/splash.js';

/**
 * @param {object} els  { splash, stamp, ledger, press, embers }
 * @param {object} cb   { onStart } — called once, when Enter / the prompt fires
 * Returns { key(e), pointer(e) }.
 */
export function makeSplash(els, { onStart }) {
  const { splash, stamp, ledger, press, embers } = els;
  const hero = splash.querySelector('.hero');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0, started = false, typeTimer = 0, emberRaf = 0;

  // ---------- embers ----------
  if (!reduced) {
    const x = embers.getContext('2d');
    let W, H, P = [];
    const size = () => { W = embers.width = embers.clientWidth; H = embers.height = embers.clientHeight; };
    size(); addEventListener('resize', size);
    const spawn = () => ({
      x: Math.random() * W, y: H + 10 + Math.random() * 40,
      r: .6 + Math.random() * 1.8, vy: .25 + Math.random() * .7,
      vx: (Math.random() - .5) * .3, life: 0, max: 400 + Math.random() * 400,
      flick: Math.random() * 6.28
    });
    for (let k = 0; k < 46; k++) { const p = spawn(); p.y = Math.random() * H; P.push(p); }
    (function tick() {
      x.clearRect(0, 0, W, H);
      for (const p of P) {
        p.y -= p.vy; p.x += p.vx + Math.sin((p.life + p.flick) * .02) * .2; p.life++;
        const fade = Math.min(p.life / 60, 1) * Math.max(0, 1 - p.life / p.max);
        const a = fade * (0.35 + 0.25 * Math.sin(p.life * .1 + p.flick));
        x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.28);
        x.fillStyle = `rgba(232,180,74,${a.toFixed(3)})`; x.fill();
        if (p.life > p.max || p.y < -12) Object.assign(p, spawn());
      }
      emberRaf = requestAnimationFrame(tick);
    })();
  }

  // ---------- the Ledger reacts ----------
  function typeOut(t) {
    clearTimeout(typeTimer);
    ledger.innerHTML = '<em>— the Ledger</em>';
    const span = document.createElement('span');
    span.style.display = 'block';
    ledger.prepend(span);
    if (reduced) { span.textContent = t; return; }
    let n = 0;
    (function step() {
      span.textContent = t.slice(0, ++n);
      if (n < t.length) typeTimer = setTimeout(step, 18);
    })();
  }

  // the band starts on the first gesture (browser rules); retire the hint
  const soundHint = splash.querySelector('.soundhint');
  function hintOff() { if (soundHint) soundHint.classList.add('off'); }

  function react() {
    if (started) return;
    hintOff();
    stamp.classList.remove('wobble'); void stamp.offsetWidth; stamp.classList.add('wobble');
    typeOut(splashLine(i++));
  }

  function begin() {
    if (started) return;
    started = true;
    hintOff();
    typeOut(SPLASH_START_LINE);
    splash.classList.add('fadeout');
    onStart();  // the game starts NOW; the splash fades off of it
    let gone = false;
    const dismiss = () => {
      if (gone) return; gone = true;
      cancelAnimationFrame(emberRaf);
      splash.style.display = 'none';
    };
    splash.addEventListener('transitionend', dismiss, { once: true });
    setTimeout(dismiss, 1500);  // fallback if the transition never fires
  }

  // the stamp slams again, in time (re-trigger via the animation-reset trick;
  // the .restamp class stays on so the base animation never re-arms)
  function restamp() {
    stamp.classList.add('restamp');
    stamp.style.animation = 'none'; void stamp.offsetWidth; stamp.style.animation = '';
  }

  return {
    /** Route a keydown here while in MENU state. */
    key(e) {
      if (started || e.repeat) return;   // held keys don't burn the Ledger's lines
      if (e.key === 'Enter') begin(); else react();
    },
    /** Route a pointerdown here while in MENU state. */
    pointer(e) {
      if (started) return;
      if (e.target === press) begin(); else react();
    },
    /** The title track's drum hits (10s; pickups 18/19; the big one at 20). */
    beat(sec) {
      if (started || reduced) return;
      if (sec === 10 || sec === 20) restamp();
      else { stamp.classList.remove('wobble'); void stamp.offsetWidth; stamp.classList.add('wobble'); }
      if (sec === 20) hero.classList.add('resweep');   // one shine, on the hit
    }
  };
}
