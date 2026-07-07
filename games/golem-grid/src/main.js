import "./style.css";
import { h32, channel, pick } from "../shared/rng.js";
import { TONE_LINE } from "../shared/themes.js";
import { genDungeon } from "../shared/worldgen.js";
import { createState,
         players as rPlayers, getP as rGetP,
         light as rLight, itemAt as rItemAt, prizeCarrier as rPrizeCarrier,
         radius as rRadius } from "../shared/reducer.js";
import { createAutoTransport } from "@golem-engine/net";
import { createTouchControls, isCoarsePointer } from "@golem-engine/clients";
import { createHost } from "./host.js";
import { createClient } from "./client.js";
import { createPerception } from "./perceive.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { askNpc as askDemoNpc } from "./npc.js";

/* ── STATE: page identity + reducer state. Pure logic lives in shared/
   and src/{host,client}.js; these aliases bind it to this page's state
   so the v0.2 code reads the same as it always did. ─────────────────── */
const S={seed:null,dun:null,me:null,isHost:false,st:createState()};
const players=()=>rPlayers(S.st);
const getP=id=>rGetP(S.st,id);
const light=()=>rLight(S.st);
const itemAt=(x,y)=>rItemAt(S.st,S.dun,x,y);
const prizeCarrier=()=>rPrizeCarrier(S.st);
const radius=()=>rRadius(S.st);

/* ── NET: layered transport (BroadcastChannel + storage bridge) — the
   five-message protocol, transports, and dedup live in @golem-engine/
   net (K4); this page just picks the channel name/storage key that
   were previously hardcoded inline. ─────────────────────────────────── */
const NET=createAutoTransport("golem-grid-1","golem-grid-net");

/* ── PERCEPTION: client-local seen/lit (src/perceive.js — doctrine:
   perception is per-viewer, never in the reducer). ──────────────────── */
const Perception=createPerception(S);

/* ── RENDER: canvas grid + feed routing + status bar (src/render.js). ── */
const Render=createRenderer(S,{
  getP,light,radius,itemAt,prizeCarrier,players,
  seenT:Perception.seenT,litT:Perception.litT,
});

/* ── GOLEM ▶GOLEM-PLUG◀ — a participant in the chat, cannot lie. The
   only integration point for prose (doctrine #4): everything the golem
   says routes through `golemLine`, sourced only from `proseFor`/
   `roomBeat`/`lookAt` below — deterministic per (seed, eventSeq/tile). ─ */
function golemLine(text,trace){
  if(trace)Render.feedLine(`▸ ${trace}`,"trace");
  const d=document.createElement("div");d.className="golem";
  const n=document.createElement("span");n.className="nick";
  n.textContent="[☉ golem] ";d.appendChild(n);
  const t=document.createElement("span");d.appendChild(t);
  Render.feedAppend(d);Render.teletype(t,text);
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
function lookAt(x,y){ // local, deterministic per tile — the golem inspects
  const g=channel(S.seed,"look",x+","+y),T=S.dun.T,bits=[];
  const it=itemAt(x,y);if(it)bits.push(`a ${it}, ${pick(g,["half-buried","laid with care","dropped in haste"])}`);
  if(S.dun.mobs.has(x+","+y))bits.push(`the ${S.dun.mobs.get(x+","+y)}, which ${pick(g,["notices you noticing","does not blink","was already looking"])}`);
  if(S.dun.lore.has(x+","+y))bits.push("an inscription, legible if you stand close");
  if(!prizeCarrier()&&S.dun.prize.x===x&&S.dun.prize.y===y)bits.push(`${T.prize} itself`);
  golemLine(bits.length?`You make out ${bits.join("; ")}.`:
    pick(g,["Stone, dust, and the patience of both.","Nothing that will help. Nothing that will hurt. Yet."]),
    `EVENT:look TILE:${x},${y}`);}
function askNpc(question){ // L7 demo NPC — client-local, zero wire/event footprint (src/npc.js)
  const{reply,trace}=askDemoNpc(S.dun,S.seed,question);
  golemLine(reply,trace);}

/* ── render(ev): the composition point between drawing (render.js),
   perception (perceive.js), and golem prose (this file's PLUG section)
   — kept here rather than split further, since a clean 3-way split
   risked scattering a single dispatch decision across modules for no
   behavioral gain (brief's "leave it, note it" clause). ─────────────── */
function doPerceive(){for(const ri of Perception.perceive())roomBeat(ri);}
function render(ev){
  if(ev){const me=getP(S.me),actor=getP(ev.pid);
    const near=me&&actor&&Math.abs(me.x-actor.x)<=8&&Math.abs(me.y-actor.y)<=8;
    switch(ev.t){
      case"JOIN":golemLine(proseFor(ev));break;
      case"SAY":
        if(ev.scope==="party"||near)
          Render.chatLine(actor,(ev.scope==="party"?"(party) ":"")+ev.text);break;
      case"WHISPER":
        if(ev.pid===S.me)Render.chatLine(actor,`(to ${getP(ev.to)?.name}) ${ev.text}`,"whis");
        else if(ev.to===S.me)Render.chatLine(actor,`(whisper) ${ev.text}`,"whis");break;
      case"EMOTE":if(near){const d=document.createElement("div");d.className="me";
        d.textContent=`* ${actor.name} ${ev.text}`;Render.feedAppend(d);}break;
      case"TAKE":case"TAKE_PRIZE":case"READ":
        if(ev.pid===S.me||near)golemLine(proseFor(ev),
          ev.pid===S.me?`EVENT:${ev.t.toLowerCase()} THEME:${S.dun.theme}`:null);break;
      case"LIGHT_WARN":golemLine(proseFor(ev),`LIGHT:${ev.tier} EVENT:warn`);break;
      case"WIN":case"LOSE":golemLine(proseFor(ev),
        `EVENT:epilogue THEME:${S.dun.theme} EVENTS:${ev.seq}`);break;}
    if(ev.t==="MOVE"&&ev.pid===S.me)doPerceive();
    if(ev.t==="JOIN"&&ev.pid===S.me)doPerceive();}
  Render.drawGrid();Render.topbar();}

/* ── HOST: host.js owns commit sequencing + validate; wired here to
   this page's render/feed for local echo. ───────────────────────────── */
const Host=createHost(S,NET,{
  onCommit:ev=>render(ev),
  onDenyLocal:reason=>Render.feedLine(reason,"deny"),
});

/* ── CLIENT: client.js applies EVENTs/SNAPSHOTs (the latter through
   @golem-engine/kernel's replay() — see client.js). ─────────────────── */
const Client=createClient(S);

/* ── protocol wiring: dispatch each of the five wire kinds to host.js/
   client.js, then render/feed locally as the old inline switch did. ─── */
NET.onmsg(m=>{switch(m.k){
  case"HELLO":if(S.isHost){
    NET.send({k:"SNAPSHOT",to:m.pid,seed:S.seed,log:S.st.log});
    Host.hostCommit({t:"JOIN",pid:m.pid,name:m.name});}break;
  case"SNAPSHOT":if(!S.isHost&&m.to===S.me&&S.seed===null){
    setSeed(m.seed);Client.applySnapshot(S.dun,m.log);
    Render.feedLine(`— joined "${S.seed}" (${S.dun.T.label}) at event ${S.st.seq} —`,"sys");
    doPerceive();render();}break;
  case"CMD":if(S.isHost)Host.hostCmd(m.from,m.cmd);break;
  case"EVENT":if(!S.isHost&&S.seed!==null){Client.applyRemoteEvent(m.ev);render(m.ev);}break;
  case"DENY":if(m.to===S.me)Render.feedLine(m.reason,"deny");break;}});
function sendCmd(c){S.isHost?Host.hostCmd(S.me,c):NET.send({k:"CMD",from:S.me,cmd:c});}

/* ── INPUT: capture-phase keys + click context menu (src/input.js). ──── */
const cmdEl=document.getElementById("cmd");
const Input=createInput(S,{
  cmdEl,sendCmd,feedLine:Render.feedLine,players,getP,itemAt,prizeCarrier,
  seenT:Perception.seenT,litT:Perception.litT,lookAt,askNpc,
});

/* ── TOUCH: @golem-engine/clients' shared touch layer (mobile-ergonomics
   PR1) — an input ADAPTER only, no new game logic: onDir funnels through
   the same moveStep() the keyboard uses, onTap funnels through the same
   handleTap() the mouse click listener uses, and the lone action button
   sends the same "take" command a keyboard /take would. Inert on mouse-
   only desktops (createTouchControls shows nothing unless a touch/coarse-
   pointer signal arrives), so keyboard + mouse paths are unaffected. ──── */
createTouchControls({
  target:document.getElementById("cv"),
  onDir:(dx,dy)=>Input.moveStep(dx,dy),
  onTap:(x,y)=>Input.handleTap(x,y),
  actions:[{label:"take",glyph:"TAKE",onPress:()=>sendCmd("take")}],
  chat:{onOpen:()=>cmdEl.focus()},
});

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
  cmdEl.disabled=false;
  /* Keyboard fix (mobile-ergonomics §1): on touch/coarse-pointer devices
     cmdEl must NOT auto-focus — that's exactly what pops the soft
     keyboard and eats half the screen. It's collapsed behind the touch
     layer's chat toggle instead; desktop keeps today's auto-focus. */
  if(!isCoarsePointer())cmdEl.focus();
  setInterval(Render.drawGrid,90);   /* the flame animates even while you stand still */
  if(S.isHost){
    setSeed(seedInput||Math.random().toString(36).slice(2,8));
    Render.feedLine(`— world "${S.seed}" is open: ${S.dun.T.label}. Bring ${S.dun.T.prize} back to the stair. —`,"sys");
    Host.hostCommit({t:"JOIN",pid:S.me,name});
  }else{Render.feedLine("— hailing a host… —","sys");
    NET.send({k:"HELLO",pid:S.me,name});
    setTimeout(()=>{if(S.seed===null)
      Render.feedLine("No host answered. Open a HOST tab first (same browser, same file). Transport: "+NET.label+".","deny");},2500);}
  Render.topbar();}
document.getElementById("bt-host").onclick=()=>begin(true);
document.getElementById("bt-join").onclick=()=>begin(false);
