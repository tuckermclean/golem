// Drinking a potion: +6 hp, only while playing, only if hurt and stocked.
// Refusals get a reason — the button should never feel dead.

import { ST } from '../constants.js';
import { burst } from '../entities/particles.js';

export function usePotion(game, fx) {
  const p = game.player;
  if (game.state !== ST.PLAY) return false;
  if (p.potions <= 0) {
    fx.toast('Out of Glurp. The vending machine remembers you.');
    return false;
  }
  if (p.hp >= p.maxhp) {
    fx.toast('You are insufficiently hurt, sad, cursed, or dead-ish. (See label.)');
    return false;
  }
  p.potions--;
  p.hp = Math.min(p.maxhp, p.hp + 6);
  game.runStats.glurpsDrunk++;
  fx.sfx('glurp');   // the wet *glurp* from the end of the jingle
  burst(game.parts, p.x, p.y, 10, '#74c4b8', game.rng);
  fx.hudChanged();
  return true;
}
