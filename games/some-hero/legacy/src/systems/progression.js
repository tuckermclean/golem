// Experience and levelling. The curve is quadratic — early levels move,
// mid-game wants bosses and depth — and a level-up grants capacity, not a
// free reset: you keep your wounds. Glurp is how you close the gap.
// (See label. See also: the label's price.)

import { burst } from '../entities/particles.js';

export function xpNeed(player) {
  return 20 + player.lv * player.lv * 8;
}

/** Grant XP; handles multi-level-ups (+2 max HP, +2 HP — no full heal). */
export function gainXp(game, n, fx) {
  const p = game.player;
  p.xp += n;
  while (p.xp >= xpNeed(p)) {
    p.xp -= xpNeed(p);
    p.lv++;
    p.maxhp += 2;
    p.hp = Math.min(p.maxhp, p.hp + 2);
    fx.sfx('level');
    burst(game.parts, p.x, p.y, 18, '#f2d27a', game.rng);
  }
  fx.hudChanged();
}
