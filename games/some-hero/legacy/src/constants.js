// Shared constants for the whole engine. No logic lives here.

export const T = 36;            // tile size in world px
export const VH = 480;          // virtual viewport height in world px

export const OVERWORLD = { W: 72, H: 72 };
export const TOMB = { W: 34, H: 34 };

// Tile ids
export const TL = {
  SAND: 0, DUNE: 1, ROCK: 2, WATER: 3, PALM: 4, PAVE: 5,
  RFLOOR: 6, RWALL: 7, WELL: 8, ROAD: 9,
  TF: 10,   // tomb floor
  TW: 11,   // tomb wall
  SD: 12,   // stairs down
  SU: 13,   // stairs up
  PLATE: 14 // pressure plate
};

// Per-tile collision, indexed by tile id
export const SOLID = [
  false, false, true, true, true, false, false, true, true, false,
  false, true, false, false, false
];

// Tile fill colours live on the skins: src/render/skins/*.js (tcol).

// Overworld landmarks (tile coords)
export const VIL = { x: 16, y: 40 };
export const RUIN = { x0: 52, y0: 8, x1: 66, y1: 21 };

// Top-level game states
export const ST = { MENU: 0, PLAY: 1, DIALOG: 2, DEAD: 3, WIN: 4 };

// The final floor: the Origenal Hero guards the cancellation desk here.
// Must be a multiple of 4 so the apocalypse-cancel music track fires
// without any changes to music.js (it already plays at floorNum >= 12).
export const FINAL_FLOOR = 12;
