// Player factory + reset.

export function createPlayer() {
  return {
    x: 0, y: 0, w: 18, h: 18, vx: 0, vy: 0,
    fx: 1, fy: 0,                 // facing
    hp: 10, maxhp: 10, lv: 1, xp: 0, gold: 0,
    potions: 0, swordLv: 0,   // no sword, no Glurp. the Guild does not issue things.
    inv: 0,                       // invulnerability seconds remaining
    atkT: 0,                      // attack cooldown
    speed: 150,
    tk: ''                        // last tile key "tx,ty" (stairs edge-trigger)
  };
}

export function resetPlayer(p) {
  p.hp = 10; p.maxhp = 10; p.lv = 1; p.xp = 0; p.gold = 0;
  p.potions = 0; p.swordLv = 0; p.inv = 0; p.atkT = 0;
  p.fx = 1; p.fy = 0;
  return p;
}
