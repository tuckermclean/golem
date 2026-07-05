import { channel, pick, chance, rint } from "./rng.js";
import { THEMES, TONES, ROOM_KINDS } from "./themes.js";

/* ── WORLDGEN: finite seeded dungeon — pure f(seed). Output is frozen:
   any diff here is a MAJOR version bump (every seed in the wild breaks). */
export const GW=48, GH=30;
export function genDungeon(seed){
  const r=channel(seed,"dungeon");
  const grid=Array.from({length:GH},()=>Array(GW).fill("#"));
  const tileRoom=Array.from({length:GH},()=>Array(GW).fill(-1));
  const rooms=[];
  for(let tries=0;tries<200&&rooms.length<12;tries++){
    const w=4+rint(r,5),h=3+rint(r,4),
          x=1+rint(r,GW-w-2),y=1+rint(r,GH-h-2);
    if(rooms.some(o=>x<o.x+o.w+1&&o.x<x+w+1&&y<o.y+o.h+1&&o.y<y+h+1))continue;
    rooms.push({x,y,w,h,cx:x+(w>>1),cy:y+(h>>1),
                kind:pick(r,ROOM_KINDS),tone:pick(r,TONES),idx:rooms.length});
  }
  for(const rm of rooms)
    for(let j=rm.y;j<rm.y+rm.h;j++)for(let i=rm.x;i<rm.x+rm.w;i++){
      grid[j][i]=".";tileRoom[j][i]=rm.idx;}
  const carve=(x1,y1,x2,y2)=>{
    let x=x1,y=y1;
    while(x!==x2){grid[y][x]=grid[y][x]==="#"?".":grid[y][x];x+=Math.sign(x2-x);}
    while(y!==y2){grid[y][x]=grid[y][x]==="#"?".":grid[y][x];y+=Math.sign(y2-y);}
    grid[y][x]=grid[y][x]==="#"?".":grid[y][x];};
  for(let i=1;i<rooms.length;i++)
    carve(rooms[i-1].cx,rooms[i-1].cy,rooms[i].cx,rooms[i].cy);
  if(rooms.length>4)carve(rooms[0].cx,rooms[0].cy,
                          rooms[rooms.length-1].cx,rooms[rooms.length-1].cy);
  const stairs={x:rooms[0].cx,y:rooms[0].cy}; grid[stairs.y][stairs.x]="<";
  /* BFS depth from stairs — the dungeon's act structure */
  const dist=Array.from({length:GH},()=>Array(GW).fill(-1));
  const q=[[stairs.x,stairs.y]];dist[stairs.y][stairs.x]=0;
  while(q.length){const[cx,cy]=q.shift();
    for(const[dx,dy]of[[0,1],[0,-1],[1,0],[-1,0]]){
      const nx=cx+dx,ny=cy+dy;
      if(nx>=0&&ny>=0&&nx<GW&&ny<GH&&grid[ny][nx]!=="#"&&dist[ny][nx]<0){
        dist[ny][nx]=dist[cy][cx]+1;q.push([nx,ny]);}}}
  /* prize in the deepest room; the object and the climax share coordinates */
  let deep=rooms[0];for(const rm of rooms)
    if(dist[rm.cy][rm.cx]>dist[deep.cy][deep.cx])deep=rm;
  const prize={x:deep.cx,y:deep.cy,room:deep.idx};
  /* lore fragments at shallow / mid / deep — story buried by depth */
  const byDepth=[...rooms].sort((a,b)=>dist[a.cy][a.cx]-dist[b.cy][b.cx]);
  const lore=new Map();
  [byDepth[1],byDepth[Math.floor(byDepth.length/2)],byDepth[byDepth.length-2]]
    .forEach((rm,tier)=>{if(rm&&rm.idx!==prize.room)
      lore.set(rm.cx+1+","+rm.cy,tier);});
  /* theme + loot + décor mobs */
  const theme=pick(channel(seed,"theme"),Object.keys(THEMES));
  const T=THEMES[theme];
  const items=new Map(), mobs=new Map();
  for(const rm of rooms){
    if(rm.idx===0)continue;
    const rr=channel(seed,"roomfill",String(rm.idx));
    if(chance(rr,.45)){
      const ix=rm.x+rint(rr,rm.w),iy=rm.y+rint(rr,rm.h);
      if(grid[iy][ix]==="."&&!lore.has(ix+","+iy))
        items.set(ix+","+iy,pick(rr,T.loot));}
    if(chance(rr,.22)&&rm.idx!==prize.room){
      const mx=rm.x+rint(rr,rm.w),my=rm.y+rint(rr,rm.h);
      if(grid[my][mx]===".")mobs.set(mx+","+my,T.mob);}
  }
  return{grid,tileRoom,rooms,stairs,prize,lore,items,mobs,dist,theme,T};
}

/* Canonical JSON shape for golden files and hashing. Maps become objects
   with sorted keys; grid rows join to strings; T is dropped (== THEMES[theme]). */
export function serializeDungeon(d){
  const sortedObj=m=>Object.fromEntries([...m.entries()].sort((a,b)=>a[0]<b[0]?-1:1));
  return{
    grid:d.grid.map(row=>row.join("")),
    tileRoom:d.tileRoom,
    rooms:d.rooms,
    stairs:d.stairs,
    prize:d.prize,
    lore:sortedObj(d.lore),
    items:sortedObj(d.items),
    mobs:sortedObj(d.mobs),
    dist:d.dist,
    theme:d.theme,
  };
}
