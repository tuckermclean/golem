// Enemy archetypes and factory.
//
// Behavior flags:
//   ghost      — phases through walls
//   passive    — never chases, never contact-hurts; ambient (the intern)
//   retaliates — harmless until struck; then it (and its kind nearby) commits
//   still      — does not wander while unprovoked (furniture)
//
// The desert roster (scarab/jackal/spirit/mummy) is retired but kept — the
// classic skin may want it back someday, and the Ledger never forgets a cause.

export const ENEMY_TYPES = {
  // ---- the Front Office (dungeon Stratum I) ----
  skeleton:   { hp: 4,  spd: 62,  dmg: 1, xp: 6,  r: 11, col: '#e8e2d0', aggro: 150 },
  mailbat:    { hp: 6,  spd: 118, dmg: 1, xp: 10, r: 12, col: '#5a5a6e', aggro: 210 },
  consultant: { hp: 9,  spd: 54,  dmg: 2, xp: 16, r: 12, col: '#9bb0c4', aggro: 240, ghost: true },
  cabinet:    { hp: 14, spd: 40,  dmg: 2, xp: 22, r: 13, col: '#8a8f98', aggro: 260, retaliates: true, still: true },
  slime:      { hp: 3,  spd: 18,  dmg: 0, xp: 1,  r: 10, col: '#7fc95f', aggro: 0,  passive: true },

  // ---- Greater Pflum (overworld) ----
  pigeon:     { hp: 4,  spd: 62,  dmg: 1, xp: 6,  r: 11, col: '#9aa0a8', aggro: 150, retaliates: true },
  goose:      { hp: 6,  spd: 118, dmg: 1, xp: 10, r: 12, col: '#f0ede2', aggro: 210 },
  veteran:    { hp: 9,  spd: 54,  dmg: 2, xp: 16, r: 12, col: '#8ca3b8', aggro: 240, ghost: true },

  // ---- retired desert roster (kept for later) ----
  scarab: { hp: 4,  spd: 62,  dmg: 1, xp: 6,  r: 11, col: '#7a4a8f', aggro: 150 },
  jackal: { hp: 6,  spd: 118, dmg: 1, xp: 10, r: 12, col: '#8f5a3a', aggro: 210 },
  spirit: { hp: 9,  spd: 54,  dmg: 2, xp: 16, r: 12, col: '#74c4b8', aggro: 240, ghost: true },
  mummy:  { hp: 14, spd: 40,  dmg: 2, xp: 22, r: 13, col: '#c9b08a', aggro: 260 }
};

export function mkEnemy(kind, x, y) {
  const base = ENEMY_TYPES[kind];
  return {
    kind, x, y, w: base.r * 2, h: base.r * 2,
    hp: base.hp, maxhp: base.hp, spd: base.spd, dmg: base.dmg,
    xpv: base.xp, col: base.col, aggro: base.aggro, ghost: !!base.ghost,
    passive: !!base.passive, retaliates: !!base.retaliates, still: !!base.still,
    provoked: false, provokeT: 0,
    wx: 0, wy: 0, wt: 0, kb: 0, kbx: 0, kby: 0, flash: 0, dead: false
  };
}

/** Which enemy kind to spawn on tomb floor f. Cabinets are not spawned —
 *  they are furniture, placed in rows along walls by the generator. */
export function pickTombKind(f, rng = Math.random) {
  const r = rng();
  if (r < .25) return 'consultant';
  if (r < .55) return 'mailbat';
  return 'skeleton';
}
