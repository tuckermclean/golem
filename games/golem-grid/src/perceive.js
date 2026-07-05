/* ── PERCEPTION: fog of war is your partial log, literally. Client-local
   only — perception (seen/lit) is derived per-viewer, never in the
   reducer (doctrine #3's corollary). No network. `perceive()` returns
   the list of room indices newly entered this call (0 or 1 in
   practice) instead of narrating them directly — narration
   (`roomBeat`) stays golem-side, in main.js's ▶GOLEM-PLUG◀ section, so
   this module never touches the DOM or the golem. `litT` is mutated
   in place (`.clear()` + refill, not reassigned) so callers that hold
   a reference to it (render.js, input.js) keep seeing live contents —
   behaviorally identical to the old reassign-per-call version, since
   nothing observes it mid-call. ─────────────────────────────────────── */
import { GW, GH } from "../shared/worldgen.js";
import { getP as rGetP, radius as rRadius } from "../shared/reducer.js";

export function los(dun,x0,y0,x1,y1){let dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),
  sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx-dy,x=x0,y=y0;
  while(!(x===x1&&y===y1)){
    if(!(x===x0&&y===y0)&&dun.grid[y][x]==="#")return false;
    const e2=2*err;if(e2>-dy){err-=dy;x+=sx;}if(e2<dx){err+=dx;y+=sy;}}
  return true;}

export function createPerception(S){
  const seenT=new Set(),litT=new Set(),visitedRooms=new Set();
  function perceive(){const me=rGetP(S.st,S.me);if(!me)return[];
    litT.clear();const R=rRadius(S.st);
    for(let y=Math.max(0,me.y-R);y<=Math.min(GH-1,me.y+R);y++)
      for(let x=Math.max(0,me.x-R);x<=Math.min(GW-1,me.x+R);x++)
        if(Math.max(Math.abs(x-me.x),Math.abs(y-me.y))<=R&&los(S.dun,me.x,me.y,x,y)){
          litT.add(x+","+y);seenT.add(x+","+y);}
    const ri=S.dun.tileRoom[me.y][me.x],entered=[];
    if(ri>=0&&!visitedRooms.has(ri)){visitedRooms.add(ri);entered.push(ri);}
    return entered;}
  return{perceive,seenT,litT};
}
