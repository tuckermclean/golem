/* ── RNG — pure, seeded, shared by page and tooling. The hash is a public
   API: changing any of this invalidates every seed in the wild. ────────── */
/* Moved to packages/random in K1 — this file is now a re-export so every
   relative "./rng.js" import in worldgen/reducer/solver/themes keeps
   working unchanged. */
export { h32, channel, pick, chance, rint } from "@golem-engine/random";
