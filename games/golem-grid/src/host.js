/* ── HOST: validate → sequence → broadcast. Owns hostCommit's seq
   stamping only. The derived LIGHT_WARN/WIN/LOSE events are produced by
   shared/module.js's validate() (K2) and arrive already inside the array
   hostCmd iterates — hostCommit must NOT re-derive them. It used to (a
   leftover recursion from the pre-K2 main.js), which double-committed and
   double-broadcast every derived event on each MOVE that crossed a light
   tier / won / lost. Pinned by tests/host.test.js: hostCmd commits exactly
   the events validate() decided, nothing more. No DOM: local render/feed
   side effects are the composition root's job, reached here only through
   the `hooks` callbacks main.js supplies. ──────────────────────────────── */
import { applyEvent as rApplyEvent } from "../shared/reducer.js";
import { validate } from "../shared/module.js";

export function createHost(S, NET, hooks){
  const{onCommit,onDenyLocal}=hooks;
  function hostCommit(ev){ev.seq=S.st.seq+1;
    rApplyEvent(S.st,S.dun,ev);onCommit(ev);NET.send({k:"EVENT",ev});}
  function hostDeny(pid,reason){if(pid===S.me)onDenyLocal(reason);
    else NET.send({k:"DENY",to:pid,reason});}
  function hostCmd(from,cmd){
    const r=validate({st:S.st,dun:S.dun,from},cmd);
    if(!Array.isArray(r))return hostDeny(from,r.deny);
    for(const ev of r)hostCommit(ev);
  }
  return{hostCommit,hostDeny,hostCmd};
}
