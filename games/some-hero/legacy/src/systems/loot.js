// Death loot: 1-3 gold scatter; topside adds a 10% heart. Nothing drops
// Glurp, anywhere — Glurp is sold, not found. That's the whole label.

export function dropLoot(pickups, x, y, rng = Math.random, inDungeon = false) {
  const g = 1 + (rng() * 3 | 0);
  for (let i = 0; i < g; i++) {
    pickups.push({ kind: 'gold', x: x + (rng() - .5) * 22, y: y + (rng() - .5) * 22, v: 1 });
  }
  if (inDungeon) return;
  if (rng() < .10) pickups.push({ kind: 'heart', x, y, v: 2 });
}
