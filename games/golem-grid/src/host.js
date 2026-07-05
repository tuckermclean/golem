/* ── HOST: validate → sequence → broadcast; win/lose predicates. Owns
   hostCommit's seq stamping and the derived LIGHT_WARN/WIN/LOSE
   recursion (moved verbatim from the old main.js). No DOM: local
   render/feed side effects are the composition root's job, reached
   here only through the `hooks` callbacks main.js supplies. ─────────── */
import { LIGHT_TIERS, applyEvent as rApplyEvent, getP as rGetP,
         light as rLight, prizeCarrier as rPrizeCarrier } from "../shared/reducer.js";
import { validate } from "../shared/module.js";

export function createHost(S, NET, hooks){
  const{onCommit,onDenyLocal}=hooks;
  function hostCommit(ev){ev.seq=S.st.seq+1;
    const before=rLight(S.st);
    rApplyEvent(S.st,S.dun,ev);onCommit(ev);NET.send({k:"EVENT",ev});
    if(ev.t==="MOVE"){
      const after=rLight(S.st);
      for(const t of LIGHT_TIERS)if(before>t&&after<=t)
        hostCommit({t:"LIGHT_WARN",pid:ev.pid,tier:t});
      if(after<=0&&!S.st.over)hostCommit({t:"LOSE",pid:ev.pid});
      else{const p=rGetP(S.st,ev.pid);
        if(rPrizeCarrier(S.st)===ev.pid&&p.x===S.dun.stairs.x&&p.y===S.dun.stairs.y&&!S.st.over)
          hostCommit({t:"WIN",pid:ev.pid});}}}
  function hostDeny(pid,reason){if(pid===S.me)onDenyLocal(reason);
    else NET.send({k:"DENY",to:pid,reason});}
  function hostCmd(from,cmd){
    const r=validate({st:S.st,dun:S.dun,from},cmd);
    if(!Array.isArray(r))return hostDeny(from,r.deny);
    for(const ev of r)hostCommit(ev);
  }
  return{hostCommit,hostDeny,hostCmd};
}
