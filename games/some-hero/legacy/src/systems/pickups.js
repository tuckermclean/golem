// Pickups: magnet attraction within 60px, collection within 16px, and the
// per-kind effects — including the amulet, which wins the quest and opens a
// trapdoor under the player.

import { T, TL, ST } from '../constants.js';
import { completeQuest } from './quest.js';
import { lootLine, ledgerize } from './ledger.js';
import { addMenace } from '../core/meta.js';

export const MAGNET_RANGE = 60;
export const COLLECT_RANGE = 16;

export function updatePickups(game, dt, fx) {
  const p = game.player;
  for (const pk of game.pickups) {
    if (pk.got) continue;
    const d = Math.hypot(pk.x - p.x, pk.y - p.y);
    if (d < MAGNET_RANGE) { pk.x += (p.x - pk.x) * 6 * dt; pk.y += (p.y - pk.y) * 6 * dt; }
    if (d < COLLECT_RANGE) {
      pk.got = true;
      collect(game, pk, fx);
      fx.hudChanged();
    }
  }
  game.pickups = game.pickups.filter(pk => !pk.got);
}

function collect(game, pk, fx) {
  const p = game.player;
  switch (pk.kind) {
    case 'gold':
      p.gold += pk.v;
      if (game.zone === 'tomb') game.runStats.goldGained += pk.v;
      fx.sfx('coin'); break;
    case 'heart':
      p.hp = Math.min(p.maxhp, p.hp + pk.v); fx.sfx('heal'); break;
    case 'potion':
      p.potions++; fx.sfx('heal'); break;
    case 'key':
      if (game.puzzle && game.puzzle.type === 'key') game.puzzle.have = true;
      fx.sfx('coin');
      fx.toast('The bronze key! The stairs will yield.');
      break;
    case 'maxheart':
      p.maxhp += 2; p.hp = Math.min(p.maxhp, p.hp + 2);
      fx.sfx('level'); fx.toast(lootLine('maxheart'));
      break;
    case 'sword':
      p.swordLv = Math.max(p.swordLv, 4);
      fx.sfx('level'); fx.toast(lootLine('sword'));
      break;
    case 'guestbook':
      // the gap guestbook (Floor 3 — Orientation). Signing it without
      // falling in is, technically, documented behavior
      addMenace(game.meta, 'Signed the gap guestbook without falling in. Suspicious.');
      fx.sfx('talk');
      fx.toast(ledgerize('Our hero signed the gap guestbook. The previous entry reads "minded it." Our hero wrote something original. The Ledger has corrected the spelling.'));
      break;
    case 'amulet': {
      completeQuest(game.quest);
      fx.questChanged();
      game.state = ST.WIN;
      // a trapdoor grinds open beneath the player...
      const atx = Math.floor(p.x / T), aty = Math.floor(p.y / T);
      game.world.map[aty * game.world.w + atx] = TL.SD;
      p.tk = atx + ',' + aty;  // don't trigger until you step off & back on
      fx.onAmuletFound();
      break;
    }
  }
}
