/* ── Transport dedup — moved to packages/net in K4. This file is now a
   re-export (rng.js/K1 pattern) so every relative "./dedup.js" import
   keeps working unchanged. ──────────────────────────────────────────── */
export { makeDeduper } from "@golem-engine/net";
