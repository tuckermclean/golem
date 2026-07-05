/* ── RENDER: canvas grid + feed routing + status bar. DOM/canvas only —
   no state mutation outside dispatched commands (this module never
   calls sendCmd/hostCommit; it only reads S and the accessors/sets it's
   handed). Moved verbatim from the old main.js RENDER section. ──────── */
import { START_LIGHT } from "../shared/reducer.js";
import { GW, GH } from "../shared/worldgen.js";
import { h32 } from "../shared/rng.js";

export function createRenderer(S,deps){
  const{getP,light,radius,itemAt,prizeCarrier,players,seenT,litT}=deps;
  const cv=document.getElementById("cv"),cx2=cv.getContext("2d");
  const TS=18;cv.width=GW*TS;cv.height=GH*TS;
  const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let C={};function loadColors(){C={floor:css("--floor"),wall:css("--wall"),
    dark:css("--dark"),seen:css("--seen"),gold:css("--gold"),lore:css("--lore"),
    mob:css("--mob"),stairs:css("--stairs"),amber:css("--amber"),deny:css("--deny"),
    ps:[css("--p1"),css("--p2"),css("--p3"),css("--p4"),css("--p5"),css("--p6")]};}
  loadColors();
  const pcolor=p=>C.ps[h32(p.id)%C.ps.length];
  const instant=matchMedia("(prefers-reduced-motion: reduce)").matches;
  function drawGrid(){if(!S.dun)return;
    const me=getP(S.me),frac=light()/START_LIGHT,R=radius();
    /* the flame is steady when fed, restless when starved */
    let jitter=0;
    if(!instant&&frac<0.5&&!S.st.over)jitter=(Math.random()-0.5)*(0.5-frac)*0.9;
    const dim=Math.max(0.25,0.55+0.45*frac+jitter);
    cx2.fillStyle=C.dark;cx2.fillRect(0,0,cv.width,cv.height);
    cx2.font="15px "+css("--mono");cx2.textAlign="center";cx2.textBaseline="middle";
    const glyph=(x,y,ch,col)=>{cx2.fillStyle=col;
      cx2.fillText(ch,x*TS+TS/2,y*TS+TS/2+1);};
    for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
      const k=x+","+y,lit=litT.has(k),seen=seenT.has(k);
      if(!seen)continue;
      const t=S.dun.grid[y][x];
      /* memory is the FLOOR of visibility: every seen tile gets the flat
         grey baseline first — light may only add on top of it */
      cx2.globalAlpha=1;
      if(t==="#")glyph(x,y,"#",C.seen);
      else{cx2.fillStyle=C.seen;cx2.fillRect(x*TS+1,y*TS+1,TS-2,TS-2);
        if(t==="<")glyph(x,y,"<",C.seen);}
      if(!lit)continue;
      /* lit: the warm layer, radial falloff, composited over the baseline */
      const d=me?Math.max(Math.abs(x-me.x),Math.abs(y-me.y)):0;
      let a=dim*(1-Math.pow(d/(R+1),2));
      /* when the light is dying, the rim gutters first */
      if(!instant&&frac<0.35&&!S.st.over&&d>=R&&Math.random()<(0.35-frac))a*=0.2;
      cx2.globalAlpha=Math.max(0,Math.min(1,a));
      if(t==="#")glyph(x,y,"#",C.wall);
      else{cx2.fillStyle=C.floor;cx2.fillRect(x*TS+1,y*TS+1,TS-2,TS-2);
        if(t==="<")glyph(x,y,"<",C.stairs);
        if(S.dun.lore.has(k))glyph(x,y,"≡",C.lore);
        if(itemAt(x,y))glyph(x,y,"*",C.gold);
        if(S.dun.mobs.has(k))glyph(x,y,S.dun.T.mob[0],C.mob);
        if(!prizeCarrier()&&S.dun.prize.x===x&&S.dun.prize.y===y)
          glyph(x,y,"♪",C.gold);}}
    for(const p of players()){const k=p.x+","+p.y;
      if(!litT.has(k))continue;
      const d=me?Math.max(Math.abs(p.x-me.x),Math.abs(p.y-me.y)):0;
      cx2.globalAlpha=Math.max(0.25,dim*(1-Math.pow(d/(R+1),2)));
      const col=p.id===S.me?(frac<0.15?C.deny:C.amber):pcolor(p);
      glyph(p.x,p.y,prizeCarrier()===p.id?"♪":(p.id===S.me?"@":"☺"),col);}
    cx2.globalAlpha=1;
    /* the whole world cools toward ember as the pool drains */
    if(frac<0.6){cx2.fillStyle=`rgba(120,30,10,${(0.6-frac)*0.28})`;
      cx2.fillRect(0,0,cv.width,cv.height);}}
  const feedEl=document.getElementById("feed");
  function feedAppend(el){feedEl.appendChild(el);
    feedEl.scrollTop=feedEl.scrollHeight;
    while(feedEl.children.length>400)feedEl.firstChild.remove();}
  function feedLine(text,cls){const d=document.createElement("div");
    d.className=cls||"sys";d.textContent=text;feedAppend(d);}
  function chatLine(p,text,cls){const d=document.createElement("div");
    d.className="chat "+(cls||"");const n=document.createElement("span");
    n.className="nick";n.style.color=pcolor(p);
    n.textContent=`[${p.name}] `;d.appendChild(n);
    d.appendChild(document.createTextNode(text));feedAppend(d);}
  const ttq=[];let ttBusy=false;
  function teletype(el,text){ttq.push([el,text]);if(!ttBusy)ttPump();}
  function ttPump(){const nx=ttq.shift();if(!nx){ttBusy=false;return;}
    ttBusy=true;const[el,text]=nx;
    if(instant){el.textContent=text;feedEl.scrollTop=feedEl.scrollHeight;return ttPump();}
    let i=0;(function tick(){el.textContent=text.slice(0,++i);
      feedEl.scrollTop=feedEl.scrollHeight;
      i<text.length?setTimeout(tick,8):ttPump();})();}
  function topbar(){
    document.getElementById("tb-seed").textContent=S.seed??"—";
    document.getElementById("tb-theme").textContent=S.dun?S.dun.T.label:"";
    const r=document.getElementById("tb-role");
    r.textContent=S.isHost?"HOST":"PEER";r.className=S.isHost?"role-host":"";
    document.getElementById("tb-party").textContent=players().length;
    const f=document.getElementById("lightfill");
    const frac=light()/START_LIGHT;f.style.transform=`scaleX(${frac})`;
    f.style.background=frac>.4?css("--amber"):frac>.15?"#ff7b3d":css("--deny");}
  return{drawGrid,feedAppend,feedLine,chatLine,teletype,topbar,instant};
}
