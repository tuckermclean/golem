/* ── Transport dedup: BroadcastChannel and the storage bridge BOTH
 * deliver every message when both are active, so whichever arrives
 * second must be dropped, or every event would apply twice. Ported
 * verbatim (same eviction semantics, including the >600 branch) from
 * games/golem-grid/shared/dedup.js during K4 — that file is now a
 * one-line re-export of this. */
export function makeDeduper(cap = 600): (id: string | undefined) => boolean {
  const seen = new Set<string>();
  return (id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    if (seen.size > cap) {
      let i = 0;
      for (const k of seen) {
        seen.delete(k);
        if (++i >= cap / 2) break;
      }
    }
    return true;
  };
}
