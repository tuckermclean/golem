// Random / noise primitives. Everything is injectable so tests are deterministic.

/** Deterministic PRNG. Returns a function compatible with Math.random. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2-D hash in [0,1), seeded by (seedX, seedY). Same formula as the original game. */
export function makeHash2(seedX, seedY) {
  return function h2(x, y) {
    const n = Math.sin((x + seedX) * 127.1 + (y + seedY) * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
}

/** Smooth value noise built on a hash2 function. Output in [0,1). */
export function makeNoise(h2) {
  return function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return h2(xi, yi) * (1 - u) * (1 - v)
         + h2(xi + 1, yi) * u * (1 - v)
         + h2(xi, yi + 1) * (1 - u) * v
         + h2(xi + 1, yi + 1) * u * v;
  };
}
