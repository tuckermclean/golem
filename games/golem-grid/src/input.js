/* ── INPUT: IRC grammar; arrows walk; click for context menu. Moved
   verbatim from the old main.js INPUT section — DOM/canvas + capture-
   phase keys only ("arrows are feet, always"); no state mutation
   outside dispatched commands (everything here funnels through
   `sendCmd`). `lookAt` stays golem prose (main.js's ▶GOLEM-PLUG◀
   section, injected here as a dep) since it calls `golemLine`. ──────── */
import { GW, GH } from "../shared/worldgen.js";

export function createInput(S,deps){
  const{cmdEl,sendCmd,feedLine,players,getP,itemAt,prizeCarrier,seenT,litT,lookAt}=deps;

  /* arrows are feet — always, everywhere, regardless of focus or input
     text. Capture phase so nothing downstream can swallow them. */
  document.addEventListener("keydown",e=>{
    const dirs={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    if(!dirs[e.key]||cmdEl.disabled||!getP(S.me))return;
    e.preventDefault();e.stopPropagation();hideMenu();
    pathQ.length=0;sendCmd(`move ${dirs[e.key][0]} ${dirs[e.key][1]}`);},true);
  cmdEl.addEventListener("keydown",e=>{
    if(e.key!=="Enter")return;
    const raw=cmdEl.value.trim();cmdEl.value="";if(!raw)return;
    if(!raw.startsWith("/"))return sendCmd("say "+raw);
    const[sl,...rest]=raw.slice(1).split(/\s+/);const arg=rest.join(" ");
    switch(sl){
      case"take":sendCmd("take "+arg);break;
      case"read":sendCmd("read");break;
      case"party":sendCmd("party "+arg);break;
      case"w":case"whisper":sendCmd("whisper "+rest[0]+" "+rest.slice(1).join(" "));break;
      case"me":sendCmd("emote "+arg);break;
      case"who":feedLine(players().map(p=>`${p.name}${p.id===S.me?" (you)":""} @ ${p.x},${p.y}`).join("\n"),"sys");break;
      case"help":feedLine("Enter = talk (room) · /party msg · /w name msg · /me does a thing\n/take [item] · /read · /who · arrows walk · click the world for actions","sys");break;
      default:feedLine(`Unknown /${sl} — try /help`,"deny");}});

  /* click → context menu → same commands the keyboard would send */
  const menu=document.getElementById("menu");
  let pathQ=[],pathTimer=null;
  function walkTo(tx,ty){const me=getP(S.me);if(!me)return;
    const prev=new Map(),q=[[me.x,me.y]],key=(x,y)=>x+","+y;
    prev.set(key(me.x,me.y),null);
    while(q.length){const[cx,cy]=q.shift();
      if(cx===tx&&cy===ty)break;
      for(const[dx,dy]of[[0,1],[0,-1],[1,0],[-1,0]]){
        const nx=cx+dx,ny=cy+dy,k=key(nx,ny);
        if(nx<0||ny<0||nx>=GW||ny>=GH)continue;
        if(S.dun.grid[ny][nx]==="#"||!seenT.has(k)||prev.has(k))continue;
        prev.set(k,[cx,cy]);q.push([nx,ny]);}}
    if(!prev.has(key(tx,ty)))return feedLine("No remembered path there.","deny");
    pathQ=[];let cur=[tx,ty];
    while(cur&&!(cur[0]===me.x&&cur[1]===me.y)){pathQ.unshift(cur);cur=prev.get(key(cur[0],cur[1]));}
    clearInterval(pathTimer);
    pathTimer=setInterval(()=>{const me2=getP(S.me),step=pathQ.shift();
      if(!step||S.st.over){clearInterval(pathTimer);return;}
      sendCmd(`move ${step[0]-me2.x} ${step[1]-me2.y}`);},130);}
  const cv=document.getElementById("cv");
  cv.addEventListener("click",e=>{
    if(!S.dun)return;
    const r=cv.getBoundingClientRect(),
          x=Math.floor((e.clientX-r.left)/r.width*GW),
          y=Math.floor((e.clientY-r.top)/r.height*GH);
    if(x<0||y<0||x>=GW||y>=GH||!seenT.has(x+","+y))return hideMenu();
    const me=getP(S.me),k=x+","+y,acts=[];
    const adj=me&&Math.abs(me.x-x)<=1&&Math.abs(me.y-y)<=1;
    const occupants=players().filter(p=>p.x===x&&p.y===y&&p.id!==S.me&&litT.has(k));
    if(S.dun.grid[y][x]!=="#")acts.push(["walk here",()=>walkTo(x,y)]);
    if(litT.has(k))acts.push(["look",()=>lookAt(x,y)]);
    if(adj&&itemAt(x,y))acts.push([`take ${itemAt(x,y)}`,()=>sendCmd("take "+itemAt(x,y))]);
    if(adj&&!prizeCarrier()&&S.dun.prize.x===x&&S.dun.prize.y===y)
      acts.push([`take ${S.dun.T.prize}`,()=>{if(me.x===x&&me.y===y)sendCmd("take");
        else{walkTo(x,y);setTimeout(()=>sendCmd("take"),600);}}]);
    if(adj&&S.dun.lore.has(k))acts.push(["read the inscription",()=>sendCmd("read")]);
    for(const o of occupants)acts.push([`whisper to ${o.name}`,
      ()=>{cmdEl.value=`/w ${o.name} `;cmdEl.focus();}]);
    if(!acts.length)return hideMenu();
    menu.innerHTML="";const mt=document.createElement("div");mt.className="mt";
    mt.textContent=`${x},${y}`;menu.appendChild(mt);
    for(const[label,fn]of acts){const b=document.createElement("button");
      b.textContent=label;b.onclick=()=>{hideMenu();fn();cmdEl.focus();};menu.appendChild(b);}
    menu.style.display="block";
    menu.style.left=Math.min(e.clientX,innerWidth-170)+"px";
    menu.style.top=Math.min(e.clientY,innerHeight-40-acts.length*30)+"px";
    cmdEl.focus();});
  function hideMenu(){menu.style.display="none";}
  addEventListener("click",e=>{if(!menu.contains(e.target)&&e.target!==cv)hideMenu();});

  return{walkTo,hideMenu};
}
