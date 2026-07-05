import "./style.css";
import { h32, channel, pick } from "../shared/rng.js";
import { TONE_LINE } from "../shared/themes.js";
import { GW, GH, genDungeon } from "../shared/worldgen.js";
import { START_LIGHT, LIGHT_TIERS, createState,
         applyEvent as rApplyEvent, players as rPlayers, getP as rGetP,
         light as rLight, itemAt as rItemAt, prizeCarrier as rPrizeCarrier,
         radius as rRadius } from "../shared/reducer.js";
import { makeDeduper } from "../shared/dedup.js";

/* ── STATE: page identity + reducer state. Pure logic lives in shared/;
   these aliases bind it to this page's state so the v0.2 code reads the
   same as it always did. ─────────────────────────────────────────────── */
const S={seed:null,dun:null,me:null,isHost:false,st:createState()};
const players=()=>rPlayers(S.st);
const getP=id=>rGetP(S.st,id);
const light=()=>rLight(S.st);
const itemAt=(x,y)=>rItemAt(S.st,S.dun,x,y);
const prizeCarrier=()=>rPrizeCarrier(S.st);
const radius=()=>rRadius(S.st);
const applyEvent=ev=>rApplyEvent(S.st,S.dun,ev);

/* ── GOLEM ▶GOLEM-PLUG◀ — a participant in the chat, cannot lie ────────── */
function golemLine(text,trace){
  if(trace)feedLine(`▸ ${trace}`,"trace");
  const d=document.createElement("div");d.className="golem";
  const n=document.createElement("span");n.className="nick";
  n.textContent="[☉ golem] ";d.appendChild(n);
  const t=document.createElement("span");d.appendChild(t);
  feedAppend(d);teletype(t,text);
}
function roomBeat(idx){                       // deterministic per room per seed
  const rm=S.dun.rooms[idx],T=S.dun.T,
        g=channel(S.seed,"prose","room",String(idx));
  const lines=[`A ${pick(g,T.adjs)} ${rm.kind}. ${pick(g,TONE_LINE[rm.tone])}`];
  for(const[k,m]of S.dun.mobs)
    if(S.dun.tileRoom[+k.split(",")[1]][+k.split(",")[0]]===idx)
      lines.push(`A ${m} ${pick(g,["stirs","waits","regards you","keeps its own counsel"])}.`);
  if(idx===S.dun.prize.room&&!prizeCarrier())
    lines.push(`${T.prize} rests here, and the air rests around it.`);
  golemLine(lines.join(" "),
    `ROOM:${rm.kind} TONE:${rm.tone} THEME:${S.dun.theme} DEPTH:${S.dun.dist[rm.cy][rm.cx]}`);
}
function proseFor(ev){                        // deterministic per event seq
  const g=channel(S.seed,"prose",String(ev.seq)),T=S.dun.T,p=getP(ev.pid);
  switch(ev.t){
    case"JOIN":return`${ev.name} ${pick(g,["steps down into the dark","arrives, blinking","is suddenly simply here"])}.`;
    case"TAKE":return`${p.name} ${pick(g,["lifts","prises free","pockets"])} the ${ev.item}.`;
    case"TAKE_PRIZE":return`${p.name} takes up ${T.prize}. It is heavier than it has any right to be, and the dark leans in to watch.`;
    case"READ":{const frag=T.lore[ev.tier]
        .replace("{A}",pick(g,T.loreSlots));
      return`${p.name} reads: “${frag}”`;}
    case"LIGHT_WARN":return pick(g,[
      "The light is thinner than it was. The walls step closer.",
      "The torch gutters, remembering it is finite.",
      "Shadows get ambitious at the edges of the light."]);
    case"WIN":{const carrier=getP(prizeCarrier());
      return`Up the last stair and out. Of the ${players().length} who went down after ${T.prize}, `+
        `${players().length} climbed back into daylight — ${carrier?carrier.name:"someone"} carrying it, `+
        `${light()} breaths of light to spare. ${T.label} keeps the rest of its story. — THE DELVE IS WON —`;}
    case"LOSE":return`The last light goes out. ${T.label} is very patient, and now it is very dark. — THE DELVE IS LOST —`;
  }
  return"";
}

/* ── NET: layered transport (BroadcastChannel + storage bridge) ────────── */
const NET=(()=>{let handler=()=>{};const fresh=makeDeduper();
  function deliver(m){if(!m||!fresh(m._id))return;handler(m);}
  let bc=null;try{bc=new BroadcastChannel("golem-grid-1");
    bc.onmessage=e=>deliver(e.data);}catch(e){}
  let ls=false;try{localStorage.setItem("gg-probe","1");
    localStorage.removeItem("gg-probe");ls=true;
    addEventListener("storage",e=>{if(e.key==="golem-grid-net"&&e.newValue){
      try{deliver(JSON.parse(e.newValue));}catch(_){}}});}catch(e){}
  let n=0;return{ok:!!bc||ls,
    label:bc&&ls?"BroadcastChannel + storage bridge":bc?"BroadcastChannel":ls?"storage bridge":"none (solo)",
    send:m=>{m._id=Date.now()+"-"+(n++)+"-"+Math.random().toString(36).slice(2,7);
      if(bc)bc.postMessage(m);
      if(ls){try{localStorage.setItem("golem-grid-net",JSON.stringify(m));}catch(_){}}},
    onmsg:fn=>{handler=fn;}};})();

/* ── HOST: validate → sequence → broadcast; win/lose predicates ────────── */
function hostCommit(ev){ev.seq=S.st.seq+1;
  const before=light();
  applyEvent(ev);render(ev);NET.send({k:"EVENT",ev});
  if(ev.t==="MOVE"){
    const after=light();
    for(const t of LIGHT_TIERS)if(before>t&&after<=t)
      hostCommit({t:"LIGHT_WARN",pid:ev.pid,tier:t});
    if(after<=0&&!S.st.over)hostCommit({t:"LOSE",pid:ev.pid});
    else{const p=getP(ev.pid);
      if(prizeCarrier()===ev.pid&&p.x===S.dun.stairs.x&&p.y===S.dun.stairs.y&&!S.st.over)
        hostCommit({t:"WIN",pid:ev.pid});}}}
function hostDeny(pid,reason){if(pid===S.me)feedLine(reason,"deny");
  else NET.send({k:"DENY",to:pid,reason});}
function hostCmd(from,cmd){
  if(S.st.over)return hostDeny(from,"The delve is over. Host a new world.");
  const p=getP(from);if(!p)return;
  const[verb,...rest]=cmd.trim().split(/\s+/);const arg=rest.join(" ");
  switch(verb){
    case"move":{const dx=+rest[0],dy=+rest[1];
      if(Math.abs(dx)+Math.abs(dy)!==1)return;
      const nx=p.x+dx,ny=p.y+dy;
      if(nx<0||ny<0||nx>=GW||ny>=GH||S.dun.grid[ny][nx]==="#")
        return hostDeny(from,"Stone does not negotiate.");
      return hostCommit({t:"MOVE",pid:from,x:nx,y:ny});}
    case"take":{
      if(!prizeCarrier()&&p.x===S.dun.prize.x&&p.y===S.dun.prize.y)
        return hostCommit({t:"TAKE_PRIZE",pid:from});
      const it=itemAt(p.x,p.y);
      if(!it)return hostDeny(from,"Your fingers close on empty air.");
      if(arg&&!it.includes(arg))return hostDeny(from,`No ${arg} here — but there is a ${it}.`);
      return hostCommit({t:"TAKE",pid:from,item:it,x:p.x,y:p.y});}
    case"read":{
      for(const[k,tier]of S.dun.lore){const[lx,ly]=k.split(",").map(Number);
        if(Math.abs(lx-p.x)<=1&&Math.abs(ly-p.y)<=1)
          return hostCommit({t:"READ",pid:from,tier,x:lx,y:ly});}
      return hostDeny(from,"Nothing here is written for you.");}
    case"say":return hostCommit({t:"SAY",pid:from,text:arg.slice(0,240),
                                 x:p.x,y:p.y,scope:"room"});
    case"party":return hostCommit({t:"SAY",pid:from,text:arg.slice(0,240),scope:"party"});
    case"whisper":{const[to,...msg]=rest;
      const target=players().find(q=>q.name.toLowerCase()===String(to).toLowerCase());
      if(!target)return hostDeny(from,`No one called ${to} is down here.`);
      return hostCommit({t:"WHISPER",pid:from,to:target.id,text:msg.join(" ").slice(0,240)});}
    case"emote":return hostCommit({t:"EMOTE",pid:from,text:arg.slice(0,160),x:p.x,y:p.y});
    default:return hostDeny(from,`The world does not know the verb "${verb}".`);
  }
}

/* ── CLIENT: protocol ──────────────────────────────────────────────────── */
NET.onmsg(m=>{switch(m.k){
  case"HELLO":if(S.isHost){
    NET.send({k:"SNAPSHOT",to:m.pid,seed:S.seed,log:S.st.log});
    hostCommit({t:"JOIN",pid:m.pid,name:m.name});}break;
  case"SNAPSHOT":if(!S.isHost&&m.to===S.me&&S.seed===null){
    setSeed(m.seed);for(const ev of m.log)applyEvent(ev);
    feedLine(`— joined "${S.seed}" (${S.dun.T.label}) at event ${S.st.seq} —`,"sys");
    perceive();render();}break;
  case"CMD":if(S.isHost)hostCmd(m.from,m.cmd);break;
  case"EVENT":if(!S.isHost&&S.seed!==null){applyEvent(m.ev);render(m.ev);}break;
  case"DENY":if(m.to===S.me)feedLine(m.reason,"deny");break;}});
function sendCmd(c){S.isHost?hostCmd(S.me,c):NET.send({k:"CMD",from:S.me,cmd:c});}

/* ── PERCEPTION: fog of war is your partial log, literally ─────────────── */
const seenT=new Set();let litT=new Set();
function los(x0,y0,x1,y1){let dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),
  sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx-dy,x=x0,y=y0;
  while(!(x===x1&&y===y1)){
    if(!(x===x0&&y===y0)&&S.dun.grid[y][x]==="#")return false;
    const e2=2*err;if(e2>-dy){err-=dy;x+=sx;}if(e2<dx){err+=dx;y+=sy;}}
  return true;}
const visitedRooms=new Set();
function perceive(){const me=getP(S.me);if(!me)return;
  litT=new Set();const R=radius();
  for(let y=Math.max(0,me.y-R);y<=Math.min(GH-1,me.y+R);y++)
    for(let x=Math.max(0,me.x-R);x<=Math.min(GW-1,me.x+R);x++)
      if(Math.max(Math.abs(x-me.x),Math.abs(y-me.y))<=R&&los(me.x,me.y,x,y)){
        litT.add(x+","+y);seenT.add(x+","+y);}
  const ri=S.dun.tileRoom[me.y][me.x];
  if(ri>=0&&!visitedRooms.has(ri)){visitedRooms.add(ri);roomBeat(ri);}}

/* ── RENDER: canvas grid + feed routing ────────────────────────────────── */
const cv=document.getElementById("cv"),cx2=cv.getContext("2d");
const TS=18;cv.width=GW*TS;cv.height=GH*TS;
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let C={};function loadColors(){C={floor:css("--floor"),wall:css("--wall"),
  dark:css("--dark"),seen:css("--seen"),gold:css("--gold"),lore:css("--lore"),
  mob:css("--mob"),stairs:css("--stairs"),amber:css("--amber"),deny:css("--deny"),
  ps:[css("--p1"),css("--p2"),css("--p3"),css("--p4"),css("--p5"),css("--p6")]};}
loadColors();
const pcolor=p=>C.ps[h32(p.id)%C.ps.length];
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
const instant=matchMedia("(prefers-reduced-motion: reduce)").matches;
const ttq=[];let ttBusy=false;
function teletype(el,text){ttq.push([el,text]);if(!ttBusy)ttPump();}
function ttPump(){const nx=ttq.shift();if(!nx){ttBusy=false;return;}
  ttBusy=true;const[el,text]=nx;
  if(instant){el.textContent=text;feedEl.scrollTop=feedEl.scrollHeight;return ttPump();}
  let i=0;(function tick(){el.textContent=text.slice(0,++i);
    feedEl.scrollTop=feedEl.scrollHeight;
    i<text.length?setTimeout(tick,8):ttPump();})();}
function render(ev){
  if(ev){const me=getP(S.me),actor=getP(ev.pid);
    const near=me&&actor&&Math.abs(me.x-actor.x)<=8&&Math.abs(me.y-actor.y)<=8;
    switch(ev.t){
      case"JOIN":golemLine(proseFor(ev));break;
      case"SAY":
        if(ev.scope==="party"||near)
          chatLine(actor,(ev.scope==="party"?"(party) ":"")+ev.text);break;
      case"WHISPER":
        if(ev.pid===S.me)chatLine(actor,`(to ${getP(ev.to)?.name}) ${ev.text}`,"whis");
        else if(ev.to===S.me)chatLine(actor,`(whisper) ${ev.text}`,"whis");break;
      case"EMOTE":if(near){const d=document.createElement("div");d.className="me";
        d.textContent=`* ${actor.name} ${ev.text}`;feedAppend(d);}break;
      case"TAKE":case"TAKE_PRIZE":case"READ":
        if(ev.pid===S.me||near)golemLine(proseFor(ev),
          ev.pid===S.me?`EVENT:${ev.t.toLowerCase()} THEME:${S.dun.theme}`:null);break;
      case"LIGHT_WARN":golemLine(proseFor(ev),`LIGHT:${ev.tier} EVENT:warn`);break;
      case"WIN":case"LOSE":golemLine(proseFor(ev),
        `EVENT:epilogue THEME:${S.dun.theme} EVENTS:${ev.seq}`);break;}
    if(ev.t==="MOVE"&&ev.pid===S.me)perceive();
    if(ev.t==="JOIN"&&ev.pid===S.me)perceive();}
  drawGrid();topbar();}
function topbar(){
  document.getElementById("tb-seed").textContent=S.seed??"—";
  document.getElementById("tb-theme").textContent=S.dun?S.dun.T.label:"";
  const r=document.getElementById("tb-role");
  r.textContent=S.isHost?"HOST":"PEER";r.className=S.isHost?"role-host":"";
  document.getElementById("tb-party").textContent=players().length;
  const f=document.getElementById("lightfill");
  const frac=light()/START_LIGHT;f.style.transform=`scaleX(${frac})`;
  f.style.background=frac>.4?css("--amber"):frac>.15?"#ff7b3d":css("--deny");}

/* ── INPUT: IRC grammar; arrows walk; click for context menu ───────────── */
const cmdEl=document.getElementById("cmd");
/* arrows are feet — always, everywhere, regardless of focus or input text.
   Capture phase so nothing downstream can swallow them. */
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
function lookAt(x,y){ // local, deterministic per tile — the golem inspects
  const g=channel(S.seed,"look",x+","+y),T=S.dun.T,bits=[];
  const it=itemAt(x,y);if(it)bits.push(`a ${it}, ${pick(g,["half-buried","laid with care","dropped in haste"])}`);
  if(S.dun.mobs.has(x+","+y))bits.push(`the ${S.dun.mobs.get(x+","+y)}, which ${pick(g,["notices you noticing","does not blink","was already looking"])}`);
  if(S.dun.lore.has(x+","+y))bits.push("an inscription, legible if you stand close");
  if(!prizeCarrier()&&S.dun.prize.x===x&&S.dun.prize.y===y)bits.push(`${T.prize} itself`);
  golemLine(bits.length?`You make out ${bits.join("; ")}.`:
    pick(g,["Stone, dust, and the patience of both.","Nothing that will help. Nothing that will hurt. Yet."]),
    `EVENT:look TILE:${x},${y}`);}

/* ── boot ──────────────────────────────────────────────────────────────── */
function setSeed(seed){S.seed=seed;S.dun=genDungeon(seed);}
document.getElementById("st-note").textContent=NET.ok
  ?"transport: "+NET.label+" — open this file in another tab to multiplay"
  :"transport: unavailable — running solo";
document.getElementById("st-name").value="Wanderer"+((Math.random()*90+10)|0);
function begin(asHost){
  const name=document.getElementById("st-name").value.trim()||"Wanderer";
  const seedInput=document.getElementById("st-seed").value.trim();
  S.me="p"+h32(name+Math.random()).toString(36);
  S.isHost=asHost||!NET.ok;
  document.getElementById("start").remove();
  cmdEl.disabled=false;cmdEl.focus();
  setInterval(drawGrid,90);   /* the flame animates even while you stand still */
  if(S.isHost){
    setSeed(seedInput||Math.random().toString(36).slice(2,8));
    feedLine(`— world "${S.seed}" is open: ${S.dun.T.label}. Bring ${S.dun.T.prize} back to the stair. —`,"sys");
    hostCommit({t:"JOIN",pid:S.me,name});
  }else{feedLine("— hailing a host… —","sys");
    NET.send({k:"HELLO",pid:S.me,name});
    setTimeout(()=>{if(S.seed===null)
      feedLine("No host answered. Open a HOST tab first (same browser, same file). Transport: "+NET.label+".","deny");},2500);}
  topbar();}
document.getElementById("bt-host").onclick=()=>begin(true);
document.getElementById("bt-join").onclick=()=>begin(false);
