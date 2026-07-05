/* ── RNG — pure, seeded, shared across the engine. The hash is a public
   API: changing any of this invalidates every seed in the wild.
   Ported verbatim from games/golem-grid/shared/rng.js (K1): same
   operations, same order, same >>>0 coercions, same \u001f (unit
   separator) joiner, same ||1 seed guard, same /4294967296
   normalization. ─────────────────────────────────── */

export function h32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return h >>> 0;
}

export function channel(...parts: string[]): () => number {
  let s = h32(parts.join("\u001f")) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function pick<T>(r: () => number, a: readonly T[]): T {
  return a[(r() * a.length) | 0];
}

export function chance(r: () => number, p: number): boolean {
  return r() < p;
}

export function rint(r: () => number, n: number): number {
  return (r() * n) | 0;
}
