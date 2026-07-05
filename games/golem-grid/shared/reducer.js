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

/* Pure fold: (state, dungeon, event) → a NEW state. No mutation of `st`
   — a fresh Map, copied player objects on write, an appended (not
   pushed-in-place) log array; untouched values are structurally shared.
   Identity-blind by construction: nothing here reads "who is asking".
   This is games/golem-grid's KernelCore.reduce (see shared/module.js). */
export function reduce(st,dun,ev){
  const D=new Map(st.D);
  let over=st.over;
  switch(ev.t){
    case"JOIN":D.set("player:"+ev.pid,
      {id:ev.pid,name:ev.name,x:dun.stairs.x,y:dun.stairs.y,inv:[]});break;
    case"MOVE":{const p=getP(st,ev.pid);if(!p)break;
      D.set("player:"+ev.pid,{...p,x:ev.x,y:ev.y});
      const burn=prizeCarrier(st)===ev.pid?2:1;         // the prize is heavy
      D.set("light",Math.max(0,light(st)-burn));break;}
    case"TAKE":{const p=getP(st,ev.pid);if(!p)break;
      D.set("taken:"+ev.x+","+ev.y,true);
      D.set("player:"+ev.pid,{...p,inv:[...p.inv,ev.item]});break;}
    case"TAKE_PRIZE":D.set("prize_by",ev.pid);break;
    case"WIN":case"LOSE":D.set("gameover",ev.t);over=true;break;
    case"SAY":case"WHISPER":case"EMOTE":case"READ":case"LIGHT_WARN":break;
  }
  return{D,log:[...st.log,ev],seq:ev.seq,over};
}

/* In-place adapter over `reduce`, kept for the page and every existing
   test: same single logic path, no fork. */
export function applyEvent(st,dun,ev){
  const ns=reduce(st,dun,ev);
  st.D=ns.D;st.log=ns.log;st.seq=ns.seq;st.over=ns.over;
  return st;
}

/* Canonical byte-form of the delta map — replay tests compare these. */
export function serializeState(st){
  return JSON.stringify({
    D:[...st.D.entries()].sort((a,b)=>a[0]<b[0]?-1:1),
    seq:st.seq,over:st.over,
  });
}
