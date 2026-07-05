// Particle system: spawn bursts, age and cull.

export function burst(parts, x, y, n, col, rng = Math.random) {
  for (let i = 0; i < n; i++) {
    parts.push({
      x, y,
      vx: (rng() - .5) * 180,
      vy: (rng() - .5) * 180,
      l: .8, col
    });
  }
}

/** Advance particles; returns the surviving array. */
export function updateParticles(parts, dt) {
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt * 1.4; }
  return parts.filter(p => p.l > 0);
}
