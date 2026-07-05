// Dialogue box: queued lines, tap-to-advance, button choices.
// Owns the DIALOG <-> PLAY state flip.

import { ST } from '../constants.js';

export function makeDialog(game, els, playTalkSfx) {
  const { dlg, dlgName, dlgText, dlgBtns, dlgHint } = els;
  let queue = [], after = null;

  const api = {
    /** Show a named speaker's lines; optional callback after the last line. */
    say(name, lines, afterFn) {
      queue = lines.slice();
      after = afterFn || null;
      dlgName.textContent = name;
      dlgBtns.innerHTML = '';
      dlgHint.style.display = 'block';
      dlgText.textContent = queue.shift();
      dlg.style.display = 'block';
      game.state = ST.DIALOG;
      playTalkSfx();
    },

    /** Tap anywhere: next line, or close (and run the after-callback). */
    advance() {
      if (dlgBtns.children.length) return;  // waiting on a button choice
      if (queue.length) {
        dlgText.textContent = queue.shift();
        playTalkSfx();
        return;
      }
      dlg.style.display = 'none';
      game.state = ST.PLAY;
      if (after) { const f = after; after = null; f(); }
    },

    /** Present buttons: [{label, fn}]. */
    choice(opts) {
      dlgHint.style.display = 'none';
      dlgBtns.innerHTML = '';
      for (const o of opts) {
        const b = document.createElement('button');
        b.textContent = o.label;
        b.addEventListener('pointerdown', e => { e.stopPropagation(); dlgBtns.innerHTML = ''; o.fn(); });
        dlgBtns.appendChild(b);
      }
    },

    /** Direct text/hint control for shop follow-ups. */
    setSpeaker(name) { dlgName.textContent = name; },
    setText(t) { dlgText.textContent = t; },
    showHint() { dlgHint.style.display = 'block'; },
    open() { dlg.style.display = 'block'; game.state = ST.DIALOG; }
  };
  return api;
}
