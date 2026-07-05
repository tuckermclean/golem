import { GW, GH } from "./worldgen.js";
import { START_LIGHT } from "./reducer.js";

/* ── SOLVER: is entrance→prize→entrance affordable inside the light pool?
   budget = depth×1 (walk in) + depth×2 (carry out; the prize is heavy).
   Strict '<': landing on the stair at exactly 0 light is a LOSE (the host
   checks the lose predicate before the win predicate). ─────────────────── */
export function solve(dun){
  const dist=bfs(dun,dun.stairs);
  const depth=dist[dun.prize.y][dun.prize.x];
  if(depth<0)return{winnable:false,depth,budget:Infinity};
  const budget=3*depth;
  return{winnable:budget<START_LIGHT,depth,budget};
}

function bfs(dun,from){
  const dist=Array.from({length:GH},()=>Array(GW).fill(-1));
  const q=[[from.x,from.y]];dist[from.y][from.x]=0;
  while(q.length){const[cx,cy]=q.shift();
    for(const[dx,dy]of[[0,1],[0,-1],[1,0],[-1,0]]){
      const nx=cx+dx,ny=cy+dy;
      if(nx>=0&&ny>=0&&nx<GW&&ny<GH&&dun.grid[ny][nx]!=="#"&&dist[ny][nx]<0){
        dist[ny][nx]=dist[cy][cx]+1;q.push([nx,ny]);}}}
  return dist;
}

/* Shortest walkable path from→to as [x,y] steps (start excluded), or null. */
export function shortestPath(dun,from,to){
  const key=(x,y)=>x+","+y;
  const prev=new Map([[key(from.x,from.y),null]]);
  const q=[[from.x,from.y]];
  while(q.length){const[cx,cy]=q.shift();
    if(cx===to.x&&cy===to.y)break;
    for(const[dx,dy]of[[0,1],[0,-1],[1,0],[-1,0]]){
      const nx=cx+dx,ny=cy+dy;
      if(nx<0||ny<0||nx>=GW||ny>=GH||dun.grid[ny][nx]==="#"||prev.has(key(nx,ny)))continue;
      prev.set(key(nx,ny),[cx,cy]);q.push([nx,ny]);}}
  if(!prev.has(key(to.x,to.y)))return null;
  const path=[];let cur=[to.x,to.y];
  while(cur&&!(cur[0]===from.x&&cur[1]===from.y)){
    path.unshift(cur);cur=prev.get(key(cur[0],cur[1]));}
  return path;
}
