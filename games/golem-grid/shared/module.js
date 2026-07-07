/* ── MODULE: golem-grid's KernelCore (deriveWorld/validate/reduce) —
   see @golem-engine/kernel's GameModule shape. `validate` is a pure port
   of src/main.js's pre-K2 `hostCmd`: same legality checks in the same
   order, same denial strings, same emitted event shapes/ordering
   (including hostCommit's derived LIGHT_WARN/WIN/LOSE events). Unlike
   hostCmd, `validate` never mutates ctx.st and never stamps `seq` — seq
   assignment stays a host-adapter concern (main.js's hostCommit). ───── */
import { GW, GH, genDungeon } from "./worldgen.js";
import {
  LIGHT_TIERS, reduce,
  getP, light, itemAt, prizeCarrier, players,
} from "./reducer.js";
import { affordances } from "./affordances.js";

export function deriveWorld(seed){ return genDungeon(seed); }

export { reduce };

/* hostCommit used to apply a MOVE for real, then compare light before/
   after (and post-move position) to decide on derived LIGHT_WARN/WIN/
   LOSE events, recursively committing each. validate can't mutate ctx.st,
   so it simulates the same "after" state with a throwaway pure `reduce`
   call — the state is discarded, only its light/position/over fields
   are read, exactly mirroring what hostCommit read off the real (already
   mutated) state at each step. */
function moveDerivedEvents(st,dun,moveEv){
  const before=light(st);
  const sim=reduce(st,dun,{...moveEv,seq:st.seq+1});
  const after=light(sim);
  const events=[];
  for(const t of LIGHT_TIERS)
    if(before>t&&after<=t)events.push({t:"LIGHT_WARN",pid:moveEv.pid,tier:t});
  if(after<=0&&!sim.over){
    events.push({t:"LOSE",pid:moveEv.pid});
  }else{
    const p=getP(sim,moveEv.pid);
    if(prizeCarrier(sim)===moveEv.pid&&p.x===dun.stairs.x&&p.y===dun.stairs.y&&!sim.over)
      events.push({t:"WIN",pid:moveEv.pid});
  }
  return events;
}

export function validate(ctx,cmd){
  const{st,dun,from}=ctx;
  if(st.over)return{deny:"The delve is over. Host a new world."};
  const p=getP(st,from);if(!p)return[];
  const[verb,...rest]=cmd.trim().split(/\s+/);const arg=rest.join(" ");
  switch(verb){
    case"move":{const dx=+rest[0],dy=+rest[1];
      if(Math.abs(dx)+Math.abs(dy)!==1)return[];
      const nx=p.x+dx,ny=p.y+dy;
      if(nx<0||ny<0||nx>=GW||ny>=GH||dun.grid[ny][nx]==="#")
        return{deny:"Stone does not negotiate."};
      const moveEv={t:"MOVE",pid:from,x:nx,y:ny};
      return[moveEv,...moveDerivedEvents(st,dun,moveEv)];}
    case"take":{
      if(!prizeCarrier(st)&&p.x===dun.prize.x&&p.y===dun.prize.y)
        return[{t:"TAKE_PRIZE",pid:from}];
      const it=itemAt(st,dun,p.x,p.y);
      if(!it)return{deny:"Your fingers close on empty air."};
      if(arg&&!it.includes(arg))return{deny:`No ${arg} here — but there is a ${it}.`};
      return[{t:"TAKE",pid:from,item:it,x:p.x,y:p.y}];}
    case"read":{
      for(const[k,tier]of dun.lore){const[lx,ly]=k.split(",").map(Number);
        if(Math.abs(lx-p.x)<=1&&Math.abs(ly-p.y)<=1)
          return[{t:"READ",pid:from,tier,x:lx,y:ly}];}
      return{deny:"Nothing here is written for you."};}
    case"say":return[{t:"SAY",pid:from,text:arg.slice(0,240),
                       x:p.x,y:p.y,scope:"room"}];
    case"party":return[{t:"SAY",pid:from,text:arg.slice(0,240),scope:"party"}];
    case"whisper":{const[to,...msg]=rest;
      const target=players(st).find(q=>q.name.toLowerCase()===String(to).toLowerCase());
      if(!target)return{deny:`No one called ${to} is down here.`};
      return[{t:"WHISPER",pid:from,to:target.id,text:msg.join(" ").slice(0,240)}];}
    case"emote":return[{t:"EMOTE",pid:from,text:arg.slice(0,160),x:p.x,y:p.y}];
    default:return{deny:`The world does not know the verb "${verb}".`};
  }
}

/** Satisfies @golem-engine/kernel's KernelCore<World, State, Cmd> shape
 *  (deriveWorld/validate/reduce) — see packages/kernel/src/index.ts.
 *  No runtime dependency on the kernel package: this object just
 *  happens to structurally match its KernelCore type. `affordances`
 *  (A1 PR2) rides beside it — imported FROM ./affordances.js, never
 *  implemented here, so this file never references the C3 entity
 *  overlay directly (tests/entities-not-in-callgraph.test.js's ban)
 *  while still exposing the full kernel hook to callers (src/input.js,
 *  src/language-adapter.js). */
export const module={deriveWorld,validate,reduce,affordances};
