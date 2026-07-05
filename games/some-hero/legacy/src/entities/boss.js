// Boss factory. The Reenactor (overworld) and floor Wardens share one shape
// and one state machine; stats, name, and the telegraph line differ — the
// announcement IS the boss-fight readability.

export function mkBoss(x, y, { hp = 40, dmg = 2, name = 'the Warden', telegraph = '' } = {}) {
  return {
    x, y, w: 42, h: 46,
    hp, maxhp: hp,
    state: 'sleep',   // sleep -> idle -> tele -> dash -> idle ...
    timer: 0, vx: 0, vy: 0,
    flash: 0, kb: 0, kbx: 0, kby: 0,
    dead: false, dmg, name, telegraph
  };
}

/** Warden stats for tomb floor f. Floor 4 is the Middle Manager himself. */
export function wardenStats(f) {
  return {
    hp: Math.ceil(40 * (1 + f * 0.18)),
    dmg: 2 + (f >> 3),
    name: f === 4 ? 'the Middle Manager' : 'the Warden',
    telegraph: f === 4
      ? '"Let\'s circle back." — and he means it physically.'
      : '"PERFORMANCE REVIEW," it intones. The review is physical.'
  };
}
