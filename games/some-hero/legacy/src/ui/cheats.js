// The cheat/playtest panel. Builds its own DOM (the shipped page carries no
// cheat markup); installs no window listeners — main.js routes the backtick.
// The panel floats over the running game: game.state is never touched, and
// the panel root stops pointerdown propagation (the #btnA pattern) so taps
// here never reach the stick or the dialog router.

import * as dbg from '../systems/debug.js';
import { grantBackstory, grantDebt } from '../systems/credentials.js';
import { addMenace, createMeta } from '../core/meta.js';
import { wipeSave } from '../core/save.js';
import { newRun } from '../core/game.js';

const SEAL_CYCLE = [null, 'key', 'plates', 'torch', 'riddle', 'traps', 'warden'];

/**
 * @param {object} game
 * @param {object} fx
 * @param {object} opts  { skins } — optional adapter { list(), get(), set(name) }
 * Returns { toggle, open, close, button }.
 */
export function makeCheats(game, fx, { skins } = {}) {
  const wrap = document.getElementById('wrap') || document.body;

  const button = document.createElement('div');
  button.id = 'cheatBtn';
  button.textContent = 'CHEAT';
  button.style.display = 'none';

  const panel = document.createElement('div');
  panel.id = 'cheatPanel';
  panel.style.display = 'none';
  panel.addEventListener('pointerdown', e => e.stopPropagation());
  button.addEventListener('pointerdown', e => { e.stopPropagation(); api.toggle(); });

  function head(text) {
    const h = document.createElement('div');
    h.className = 'cheatHead';
    h.textContent = text;
    panel.appendChild(h);
  }
  function row() {
    const r = document.createElement('div');
    r.className = 'cheatRow';
    panel.appendChild(r);
    return r;
  }
  function btn(r, label, fn) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('pointerdown', e => { e.stopPropagation(); fn(b); });
    r.appendChild(b);
    return b;
  }

  // ---- GO TO ----
  head('GO TO');
  let r = row();
  btn(r, 'Guild Hall', () => { dbg.gotoVillage(game, fx); api.close(); });
  btn(r, 'Trapdoor', () => { dbg.gotoTrapdoor(game, fx); api.close(); });
  btn(r, 'Surface (door)', () => { api.close(); dbg.surfaceViaDoor(game, fx); });
  r = row();
  for (const f of [1, 3, 4, 8, 12]) {
    btn(r, 'Floor ' + f, () => { api.close(); dbg.gotoFloor(game, f, fx); });
  }

  // ---- GRANT ----
  head('GRANT');
  r = row();
  btn(r, 'Credentials', () => {
    grantBackstory(game.meta); grantDebt(game.meta);
    fx.toast('Backstory notarized; debt crippling. The golem will be pleased. He won’t show it.');
  });
  btn(r, '+100 gold', () => { game.player.gold += 100; fx.hudChanged(); });
  btn(r, 'Sword MAX', () => { game.player.swordLv = 4; fx.hudChanged(); });
  btn(r, '+5 Glurp', () => { game.player.potions += 5; fx.hudChanged(); });
  btn(r, '+1 menace', () => {
    addMenace(game.meta, 'Playtester behavior. Documented.');
    fx.toast('The golem writes something in his little book.');
  });
  btn(r, 'Grant triangle', () => { dbg.grantHeist(game, fx); });

  // ---- SET ----
  head('SET');
  r = row();
  btn(r, 'Quest: ' + game.quest.stage, b => {
    dbg.setQuestStage(game, (game.quest.stage + 1) % 5, fx);
    b.textContent = 'Quest: ' + game.quest.stage;
  });
  btn(r, 'Deaths +10', () => { game.meta.deaths += 10; fx.hudChanged(); fx.toast('Deaths on file: ' + game.meta.deaths + '. Hespeth sighs somewhere.'); });
  btn(r, 'Day +1', () => { game.meta.day++; fx.hudChanged(); });
  btn(r, 'Seal: random', b => {
    const i = (SEAL_CYCLE.indexOf(game.debug.forceSeal) + 1) % SEAL_CYCLE.length;
    game.debug.forceSeal = SEAL_CYCLE[i];
    b.textContent = 'Seal: ' + (game.debug.forceSeal || 'random');
  });

  // ---- TOGGLES ----
  head('TOGGLES');
  r = row();
  btn(r, 'God: off', b => { game.debug.god = !game.debug.god; b.textContent = 'God: ' + (game.debug.god ? 'ON' : 'off'); });
  btn(r, 'Lights: off', b => { game.debug.reveal = !game.debug.reveal; b.textContent = 'Lights: ' + (game.debug.reveal ? 'ON' : 'off'); });
  if (skins && skins.list().length > 1) {
    btn(r, 'Skin: ' + skins.get(), b => {
      const list = skins.list();
      const next = list[(list.indexOf(skins.get()) + 1) % list.length];
      skins.set(next);
      b.textContent = 'Skin: ' + next;
    });
  }

  // ---- TRIGGER ----
  head('TRIGGER');
  r = row();
  btn(r, 'Die now', () => { api.close(); dbg.dieNow(game, fx); });
  btn(r, 'Customs 12g', () => { api.close(); dbg.triggerCustoms(game, fx); });
  btn(r, 'Win (topside)', () => { api.close(); dbg.triggerWin(game, fx); });
  btn(r, 'Kill boss', () => { api.close(); dbg.killBossNow(game, fx); });
  btn(r, 'New Game+', () => {
    api.close();
    game.meta.owner = true; game.meta.cancelled = false;
    newRun(game); fx.hudChanged(); fx.questChanged();
    fx.toast('Ownership transferred. The monsters will call you "boss." Hespeth: "Oh no. Sir."');
  });
  btn(r, 'Wipe save', () => {
    wipeSave();
    game.meta = createMeta();
    fx.hudChanged();
    fx.toast('Saved knowledge wiped. The Ledger pretends not to mind.');
  });

  const foot = document.createElement('div');
  foot.className = 'cheatFoot';
  foot.textContent = 'the Ledger is watching; grades will be weird.';
  panel.appendChild(foot);

  wrap.append(panel, button);

  const api = {
    button,
    open() { panel.style.display = 'block'; },
    close() { panel.style.display = 'none'; },
    toggle() { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; }
  };
  return api;
}
