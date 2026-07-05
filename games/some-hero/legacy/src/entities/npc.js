// Pflumton-upon-Dungeon hub NPCs and proximity query.
// Twinned with Lesser Pflum (legally required).

import { T, VIL } from '../constants.js';

export const TALK_RANGE = 44;

export function villageNpcs() {
  return [
    { name: 'Clerk Hespeth',    x: (VIL.x - 2) * T,   y: (VIL.y - 2) * T,   col: '#3f5d7a', hat: '#3f8f5a' },
    // her radio, on the desk. the light set. the dial is settled law.
    { name: "Hespeth's Radio",  x: (VIL.x - 3.5) * T, y: (VIL.y - 2) * T,   kind: 'radio' },
    // the Glurp man. spawnOverworld relocates him onto the caravan road,
    // where the stand, the big sign, and the radio do the selling
    { name: 'Gift Shop Gnoll',  x: (VIL.x + 5) * T,   y: (VIL.y - 1) * T,   col: '#a07232', hat: '#c0392b', stand: true },
    // the picket line. it's a line now. the chants still don't scan.
    // (west of the resurrection desk's foot traffic — you can spawn
    // without being immediately unionized)
    { name: 'Picketing Hero',   x: (VIL.x - 2.4) * T, y: (VIL.y + 2.6) * T, col: '#4f8f8f', hat: '#c9a227', sign: true },
    { name: 'Picketing Hero',   x: (VIL.x - 1.2) * T, y: (VIL.y + 2.9) * T, col: '#5a7a4f', hat: '#b06a4a', sign: true },
    { name: 'Picketing Hero',   x: (VIL.x) * T,       y: (VIL.y + 2.6) * T, col: '#8f4f6f', hat: '#9aa0a8', sign: true },
    // ambient residents: one bit each, defended forever
    { name: 'Docent Brell',     x: (VIL.x + 4) * T,   y: (VIL.y + 1.5) * T, col: '#7a4a6e', hat: '#c9a227' },
    // the museum tag and skull case are near Brell — petty-crime hotspots
    { name: 'Museum Exhibit Tag', x: (VIL.x + 5.5) * T, y: (VIL.y + 2.5) * T, col: '#9a6a4a', hat: '#c8b99a', kind: 'tag' },
    { name: 'King Pfilbert',    x: (VIL.x - 4) * T,   y: (VIL.y + 1) * T,   col: '#5e3a8f', hat: '#e0b73d' },
    // the royal grass sign: crossing it is technically a crime
    { name: 'Royal Grass Sign', x: (VIL.x - 5) * T,   y: (VIL.y - 0.5) * T, col: '#4a8f4a', hat: '#f5f5dc', kind: 'sign' },
    { name: 'Safety Officer Dimwald', x: (VIL.x - 1.5) * T, y: (VIL.y + 4) * T, col: '#d97b29', hat: '#eeeeee' },
    // away from the group, on purpose, with inventory
    { name: 'Hermit Gorse', x: (VIL.x - 9) * T, y: (VIL.y - 1) * T, col: '#6e6a52', hat: '#8a8f76' },
    // Malgrath's Mother's cottage: northwest of the village. Gregory is a rock.
    // Knowledge-based persistence: both NPCs re-spawn each run; meta carries what you know.
    { name: "Malgrath's Mother", x: (VIL.x - 8) * T, y: (VIL.y - 5) * T, col: '#9a7a5e', hat: '#6a5a7e' },
    { name: 'Gregory',           x: (VIL.x - 7) * T, y: (VIL.y - 5) * T, col: '#8a8a7a', hat: '#6a6a5a', kind: 'rock' },
    // the animate gauntlet: near the cottage, waiting for a résumé worth signing
    { name: "Malgrath's Gauntlet", x: (VIL.x - 8) * T, y: (VIL.y - 4) * T, col: '#5a4a3e', hat: '#4a3a2e' }
  ];
}

/** The NPC within talking range of (x,y), or null. */
export function nearestNpc(npcs, x, y, range = TALK_RANGE) {
  let found = null;
  for (const n of npcs) if (Math.hypot(n.x - x, n.y - y) < range) found = n;
  return found;
}
