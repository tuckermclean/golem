/* ── CLIENT: applies EVENTs and SNAPSHOTs. `applyRemoteEvent` reuses the
   exact same single logic path as the host (reducer.js's `applyEvent`
   in-place adapter over the pure `reduce` — no fork). `applySnapshot`
   is the K5 acceptance hook: it folds a joining peer's initial log
   through @golem-engine/kernel's pure `replay()`, driving
   shared/module.js's KernelCore (`{deriveWorld,validate,reduce}` — only
   `.reduce` is read, exactly the shape kernel's `replay` expects) —
   the extraction loop's SNAPSHOT path runs on the kernel build, not a
   reimplementation of it. No DOM, no network I/O. ───────────────────── */
import { replay } from "@golem-engine/kernel";
import { module as gridModule } from "../shared/module.js";
import { createState, applyEvent as rApplyEvent } from "../shared/reducer.js";

export function createClient(S){
  function applySnapshot(dun,log){
    S.st=replay(gridModule,dun,log,createState());
  }
  function applyRemoteEvent(ev){
    rApplyEvent(S.st,S.dun,ev);
  }
  return{applySnapshot,applyRemoteEvent};
}
