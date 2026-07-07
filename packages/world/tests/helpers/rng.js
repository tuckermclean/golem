/* Test-only deterministic PRNG (mulberry32) — @golem-engine/world stays
 * dependency-free (no @golem-engine/random import) so its own tests
 * don't reach for it either; this is a small, well-known, seedable
 * generator used ONLY to exercise the package's rng-shaped (`() =>
 * number` in [0,1)) contract in tests, not a runtime dependency of the
 * package itself. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
