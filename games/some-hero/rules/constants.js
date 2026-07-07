// A handful of plain engine constants ported from
// games/some-hero/legacy/src/constants.js (T:3, VIL:29, ST:33). These are
// structural (tile size, a landmark tile coordinate, state-machine ids) —
// not narrative content — so, per S1's own table-vs-logic litmus
// (games/some-hero/content/tables.mjs's header), they are not table
// candidates and are ported as plain literals.

export const T = 36; // legacy/src/constants.js:3 — tile size in world px

export const VIL = { x: 16, y: 40 }; // legacy/src/constants.js:29 — Guild Hall (village) landmark, tile coords

export const ST = { MENU: 0, PLAY: 1, DIALOG: 2, DEAD: 3, WIN: 4 }; // legacy/src/constants.js:33
