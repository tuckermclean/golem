/* ── REDUCER: deterministic, identity-blind. All state is explicit — this
   module must never know who "me" is, and must never touch the DOM. ───── */
export const START_LIGHT=360;   /* solver-derived: worst-case budget over the
                                   10K CI seed set is 354 (see tools/solve.js);
                                   raised from 240 on 2026-07-03 */
export const LIGHT_TIERS=[180,110,55,20];

export function createState(){return{D:new Map(),log:[],seq:0,over:false};}

export function players(st){const o=[];for(const[k,v]of st.D)
  if(k.startsWith("player:"))o.push(v);return o;}
export function getP(st,id){return st.D.get("player:"+id);}
export function light(st){return st.D.has("light")?st.D.get("light"):START_LIGHT;}
export function itemAt(st,dun,x,y){const k=x+","+y;
  if(st.D.get("taken:"+k))return null;return dun.items.get(k)||null;}
export function prizeCarrier(st){return st.D.get("prize_by")||null;}
export function radius(st){const L=light(st);
  return L>180?6:L>110?5:L>55?4:L>20?3:2;}

export function applyEvent(st,dun,ev){
  switch(ev.t){
    case"JOIN":st.D.set("player:"+ev.pid,
      {id:ev.pid,name:ev.name,x:dun.stairs.x,y:dun.stairs.y,inv:[]});break;
    case"MOVE":{const p=getP(st,ev.pid);if(!p)break;
      p.x=ev.x;p.y=ev.y;
      const burn=prizeCarrier(st)===ev.pid?2:1;         // the prize is heavy
      st.D.set("light",Math.max(0,light(st)-burn));break;}
    case"TAKE":{const p=getP(st,ev.pid);if(!p)break;
      st.D.set("taken:"+ev.x+","+ev.y,true);p.inv.push(ev.item);break;}
    case"TAKE_PRIZE":st.D.set("prize_by",ev.pid);break;
    case"WIN":case"LOSE":st.D.set("gameover",ev.t);st.over=true;break;
    case"SAY":case"WHISPER":case"EMOTE":case"READ":case"LIGHT_WARN":break;
  }
  st.seq=ev.seq;st.log.push(ev);
}

/* Canonical byte-form of the delta map — replay tests compare these. */
export function serializeState(st){
  return JSON.stringify({
    D:[...st.D.entries()].sort((a,b)=>a[0]<b[0]?-1:1),
    seq:st.seq,over:st.over,
  });
}
