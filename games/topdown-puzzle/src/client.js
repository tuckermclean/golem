/* ── CLIENT: applies EVENTs and SNAPSHOTs. Mirrors games/golem-grid/src/
   client.js's shape for parity/testability even though topdown-puzzle is
   single-player and has no wire transport wired up (design doc: "keep
   the shape for parity/testability" is the explicit instruction —
   PR4/future work may still want a recorded-log "snapshot" replay path
   without inventing a new one).

   `applyRemoteEvent` re-applies a single already-validated event through
   the SAME pure `reduce` the host uses — no fork. `applySnapshot` is the
   K5-style acceptance hook: it folds a whole log through
   @golem-engine/kernel's pure `replay()`, driving shared/module.js's
   KernelCore (`{deriveWorld,validate,reduce}` — only `.reduce` is read,
   exactly the shape kernel's `replay` expects). No DOM, no network
   I/O. ─────────────────────────────────────────────────────────────── */
import { replay } from "@golem-engine/kernel";
import { module as tdpModule } from "../shared/module.js";
import { createState, reduce as tdpReduce } from "../shared/reducer.js";

export function createClient(S) {
  function applySnapshot(world, log) {
    S.st = replay(tdpModule, world, log, createState());
  }
  function applyRemoteEvent(ev) {
    S.st = tdpReduce(S.st, S.world, ev);
  }
  return { applySnapshot, applyRemoteEvent };
}
