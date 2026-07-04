# Roadmap Steps 1–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute SPEC.md §8 steps 1–3: extract the prototype's pure logic into shared ESM modules consumed by a Vite single-file build, land golden/replay/validator tests green, and put the winnability solver in CI.

**Architecture:** Pure logic (`shared/`) is plain ESM imported by node tests, node tools, and the page. The page becomes a Vite app (`index.html` + `src/`) built with `vite-plugin-singlefile` into `dist/golem-grid.html`, runnable from `file://` with two tabs. Nothing built is committed.

**Tech Stack:** Node ≥22 (`node --test`), Vite + vite-plugin-singlefile, Python 3 + pytest.

## Global Constraints

- **Worldgen output is frozen.** `genDungeon("plagueis")` must yield theme `salt_counting_house`, 12 rooms, prize depth 34 (SPEC §9, re-verified 2026-07-03). If a golden or canary test fails, the extraction is wrong — fix the extraction; NEVER regenerate a golden to make a test pass.
- **Extraction is verbatim.** Copy code from `golem-grid.html` character-for-character except for `export`/`import` keywords and the reducer's explicit-state refactor defined in Task 3. No reformatting, no renaming, no "improvements".
- **START_LIGHT = 360** (decision 2026-07-03: raised from 240 so every seed is winnable; worst-case budget over the CI seed set is 354). `LIGHT_TIERS = [180,110,55,20]` unchanged. SPEC.md §4 is amended in the same commit (Task 3).
- Reducer is identity-blind and DOM-free; it never reads local identity or module-level mutable state.
- No localStorage for game state (transport shim only).
- `package.json` has `"type": "module"`; `"private": true`.
- Repo root is `/home/noumenon/Documents/gitrepos/golem`. All commands run there.
- Every value written as `Expected:` below was measured against the real prototype code on 2026-07-03 — they are facts, not examples.

## File Structure

```
package.json, package-lock.json    npm scaffold (vite devDeps only)
vite.config.js                     single-file build config
.gitignore                         node_modules/ dist/ work/
index.html                         page markup (was golem-grid.html's body)
src/style.css                      page CSS (was the <style> block)
src/main.js                        impure page code (net, host, render, input, golem stub)
shared/rng.js                      h32, channel, pick, chance, rint
shared/themes.js                   THEMES, TONE_LINE, TONES, ROOM_KINDS
shared/worldgen.js                 GW, GH, genDungeon, serializeDungeon
shared/reducer.js                  START_LIGHT, LIGHT_TIERS, createState, applyEvent, queries, serializeState
shared/solver.js                   solve, shortestPath
shared/dedup.js                    makeDeduper (transport double-delivery guard)
tests/rng.test.js                  hash/channel golden values
tests/worldgen.test.js             canary + golden files + 500-seed harness
tests/reducer.test.js              event-by-event reducer semantics
tests/replay.test.js               log replay byte-equality + dedup
tests/golden/worldgen-*.json       golden dungeons (plagueis, lantern, golem)
tests/golden/replay-log.json       recorded event log fixture
tests/golden/replay-final.json     serialized final delta map
tests/golden/solver-band.json      difficulty band
tools/gen-golden.mjs               (re)generates worldgen goldens — versioning events only
tools/gen-replay-fixture.mjs       (re)generates the replay fixture
tools/solve.js                     10K-seed winnability + band gate
tools/test_validate.py             pytest suite for tools/validate.py
Makefile                           modified: test/solve/html/dev targets
.github/workflows/ci.yml           modified: tests + solver + build jobs
```

`golem-grid.html` is deleted in Task 9 (after the port is verified). `golem-world.html` is never touched.

**Task order note:** Tasks 1→6 are sequential (each imports the previous). Task 7 (pytest) is independent and can run any time. Tasks 8–10 close out.

---

### Task 1: npm scaffold + shared/rng.js

**Files:**
- Create: `package.json`, `vite.config.js`, `.gitignore`, `shared/rng.js`, `tests/rng.test.js`

**Interfaces:**
- Produces: `h32(str)→uint32`, `channel(...parts)→()=>float`, `pick(r,arr)`, `chance(r,p)`, `rint(r,n)` — consumed by every later task.

- [ ] **Step 1: Write the scaffold files**

`package.json`:
```json
{
  "name": "golem-grid",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "node --test tests/"
  },
  "devDependencies": {
    "vite": "^7.3.0",
    "vite-plugin-singlefile": "^2.3.0"
  }
}
```

`vite.config.js`:
```js
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
});
```

`.gitignore`:
```
node_modules/
dist/
work/
__pycache__/
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: creates `package-lock.json` and `node_modules/`; no errors. (If the sandbox blocks network, retry with permission.)

- [ ] **Step 3: Write the failing test**

`tests/rng.test.js` — the expected numbers below were measured from the prototype on 2026-07-03:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { h32, channel, pick, rint } from "../shared/rng.js";

test("h32 golden values (frozen: the hash is a public API)", () => {
  assert.equal(h32("plagueis"), 740258109);
  assert.equal(h32(""), 2019044825);
});

test("channel: same parts → same stream", () => {
  const a = channel("plagueis", "dungeon"), b = channel("plagueis", "dungeon");
  const va = [a(), a(), a()], vb = [b(), b(), b()];
  assert.deepEqual(va, vb);
  assert.equal(va[0], 0.916303388774395);
  assert.equal(va[1], 0.5478345134761184);
  assert.equal(va[2], 0.31257767020724714);
});

test("channel: different parts → different stream", () => {
  assert.notEqual(channel("a", "x")(), channel("a", "y")());
});

test("pick/rint stay in range", () => {
  const r = channel("t");
  for (let i = 0; i < 100; i++) {
    assert.ok(["a", "b", "c"].includes(pick(r, ["a", "b", "c"])));
    const n = rint(r, 5);
    assert.ok(n >= 0 && n < 5 && Number.isInteger(n));
  }
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../shared/rng.js'` (ERR_MODULE_NOT_FOUND).

- [ ] **Step 5: Extract shared/rng.js**

Copy lines 124–131 of `golem-grid.html` verbatim, adding only `export`:
```js
/* ── RNG — pure, seeded, shared by page and tooling. The hash is a public
   API: changing any of this invalidates every seed in the wild. ────────── */
export function h32(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){
  h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
  h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;
  h=Math.imul(h,3266489917);h^=h>>>16;return h>>>0;}
export function channel(...parts){let s=h32(parts.join("\u001f"))||1;
  return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
export const pick=(r,a)=>a[(r()*a.length)|0], chance=(r,p)=>r()<p,
      rint=(r,n)=>(r()*n)|0;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.js .gitignore shared/rng.js tests/rng.test.js
git commit -m "feat: npm scaffold + shared/rng.js extracted verbatim (golden hash values)"
```

---

### Task 2: shared/themes.js + shared/worldgen.js

**Files:**
- Create: `shared/themes.js`, `shared/worldgen.js`, `tests/worldgen.test.js`

**Interfaces:**
- Consumes: `shared/rng.js` (`channel`, `pick`, `chance`, `rint`).
- Produces: `THEMES`, `TONE_LINE`, `TONES`, `ROOM_KINDS`; `GW=48`, `GH=30`, `genDungeon(seed)→{grid,tileRoom,rooms,stairs,prize,lore,items,mobs,dist,theme,T}`, `serializeDungeon(dun)→plain object` (Maps → sorted objects, grid rows → strings, `T` dropped as derivable from `theme`).

- [ ] **Step 1: Write the failing test**

`tests/worldgen.test.js` (golden-file tests are added in Task 5; this task lands the canary and determinism):
```js
import test from "node:test";
import assert from "node:assert/strict";
import { genDungeon, serializeDungeon, GW, GH } from "../shared/worldgen.js";

test("plagueis canary (SPEC §9 — frozen facts)", () => {
  const d = genDungeon("plagueis");
  assert.equal(d.theme, "salt_counting_house");
  assert.equal(d.rooms.length, 12);
  assert.equal(d.dist[d.prize.y][d.prize.x], 34);
  assert.equal(d.grid[d.stairs.y][d.stairs.x], "<");
  assert.equal(d.lore.size, 3);
});

test("serializeDungeon is deterministic and JSON-stable", () => {
  const a = JSON.stringify(serializeDungeon(genDungeon("plagueis")));
  const b = JSON.stringify(serializeDungeon(genDungeon("plagueis")));
  assert.equal(a, b);
  assert.equal(GW, 48);
  assert.equal(GH, 30);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/worldgen.test.js`
Expected: FAIL — `Cannot find module '../shared/worldgen.js'`.

- [ ] **Step 3: Extract shared/themes.js**

Copy lines 134–166 of `golem-grid.html` verbatim (the `THEMES`, `TONE_LINE` object literals — preserve key order exactly: `drowned_monastery`, `salt_counting_house`, `deep_mine`; theme selection indexes `Object.keys(THEMES)`), adding `export`:
```js
/* ── THEMES: the history layer. Key order is load-bearing: theme choice
   is pick(rng, Object.keys(THEMES)). Reordering = worldgen MAJOR bump. ── */
export const THEMES={
  drowned_monastery:{label:"the drowned monastery",prize:"the Quiet Bell",
    loot:["wax stub","offering bowl","salt-crusted rosary","verdigris censer"],
    mob:"pale eel",adjs:["water-stained","hushed","candle-blackened","weeping"],
    lore:["The Order of the Quiet Bell raised these halls over the spring, {A}.",
          "They began ringing the bell for the living, {A}. The water listened.",
          "The drowned came up the cistern stair to answer the last ringing, {A}."],
    loreSlots:["to count the hours of the dead","in the wet year","when the abbot went below",
               "against all writ","and none forbade it"]},
  salt_counting_house:{label:"the salt counting house",prize:"the Final Ledger",
    loot:["green coin","cracked seal","brass stylus","tally stick"],
    mob:"clerk-thing",adjs:["ledger-lined","dust-dry","ink-stained","airless"],
    lore:["The Counting House was dug deep to keep the salt-debts cool, {A}.",
          "The clerks began recording debts before they were owed, {A}.",
          "On the last page someone wrote a sum that has not finished being paid, {A}."],
    loreSlots:["by royal writ","in the ninth audit","against the factor's word",
               "the year of the short harvest","and sealed it twice"]},
  deep_mine:{label:"the deep mine",prize:"the First Lode",
    loot:["slag ingot","cold lantern","split pick-haft","vein of fool's gold"],
    mob:"ember wisp",adjs:["soot-caked","props-groaning","hot-aired","narrow"],
    lore:["They followed the seam down past the marked depth, {A}.",
          "The foreman ordered the singing shaft sealed, {A}. Digging continued.",
          "What they struck at the bottom struck back, {A}."],
    loreSlots:["against the surveyor's oath","in the dry season","for the third charter",
               "when the canaries went quiet","and told no one above"]},
};
export const TONE_LINE={
  ominous:["Something here does not want company.","The dark has a texture, like held breath."],
  still:["Nothing has moved here for a very long time.","Your footsteps sound apologetic."],
  cold:["The cold gets into your teeth.","Breath hangs before you like a small ghost."],
  watchful:["You have the strong sense of being counted.","Attention turns toward you, somewhere."]};
export const TONES=Object.keys(TONE_LINE);
export const ROOM_KINDS=["hall","gallery","vault","stairwell","chapel","store"];
```

- [ ] **Step 4: Extract shared/worldgen.js**

Lines 169–229 of `golem-grid.html` verbatim inside the function, plus imports, exports, and `serializeDungeon`:
```js
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/worldgen.test.js`
Expected: PASS — 2 tests. The canary values (salt_counting_house / 12 / 34) are frozen facts; if any mismatch, diff your extraction against `golem-grid.html` lines 124–229 — do NOT touch the assertions.

- [ ] **Step 6: Commit**

```bash
git add shared/themes.js shared/worldgen.js tests/worldgen.test.js
git commit -m "feat: extract themes + worldgen verbatim; plagueis canary green"
```

---

### Task 3: shared/reducer.js (explicit state; START_LIGHT=360)

**Files:**
- Create: `shared/reducer.js`, `tests/reducer.test.js`
- Modify: `SPEC.md` (§4 light-economy line)

**Interfaces:**
- Consumes: nothing (pure module; dungeon passed in).
- Produces: `START_LIGHT=360`, `LIGHT_TIERS=[180,110,55,20]`, `createState()→{D:Map,log:[],seq:0,over:false}`, `applyEvent(st,dun,ev)`, `players(st)`, `getP(st,id)`, `light(st)`, `itemAt(st,dun,x,y)`, `prizeCarrier(st)`, `radius(st)`, `serializeState(st)→string`. This is THE refactor of the plan: the prototype's reducer read module-global `S`; here all state is explicit arguments. Everything else stays verbatim.

- [ ] **Step 1: Write the failing test**

`tests/reducer.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { genDungeon } from "../shared/worldgen.js";
import { START_LIGHT, createState, applyEvent, players, getP, light,
         itemAt, prizeCarrier, radius, serializeState } from "../shared/reducer.js";

const dun = genDungeon("plagueis");
const join = (st, pid, name) => applyEvent(st, dun, { t: "JOIN", pid, name, seq: st.seq + 1 });

test("JOIN places the player at the stairs with empty inventory", () => {
  const st = createState();
  join(st, "p1", "Ash");
  const p = getP(st, "p1");
  assert.deepEqual({ x: p.x, y: p.y, inv: p.inv }, { x: dun.stairs.x, y: dun.stairs.y, inv: [] });
  assert.equal(players(st).length, 1);
});

test("MOVE burns 1; carrier burns 2; light floors at 0", () => {
  const st = createState();
  join(st, "p1", "Ash");
  assert.equal(light(st), START_LIGHT);
  applyEvent(st, dun, { t: "MOVE", pid: "p1", x: 1, y: 1, seq: 2 });
  assert.equal(light(st), START_LIGHT - 1);
  applyEvent(st, dun, { t: "TAKE_PRIZE", pid: "p1", seq: 3 });
  applyEvent(st, dun, { t: "MOVE", pid: "p1", x: 2, y: 1, seq: 4 });
  assert.equal(light(st), START_LIGHT - 3);            // the prize is heavy
  st.D.set("light", 1);
  applyEvent(st, dun, { t: "MOVE", pid: "p1", x: 3, y: 1, seq: 5 });
  assert.equal(light(st), 0);                           // floored, not negative
});

test("TAKE marks the tile and fills the inventory; itemAt hides taken items", () => {
  const st = createState();
  join(st, "p1", "Ash");
  const [k, item] = [...dun.items.entries()][0];
  const [x, y] = k.split(",").map(Number);
  assert.equal(itemAt(st, dun, x, y), item);
  applyEvent(st, dun, { t: "TAKE", pid: "p1", item, x, y, seq: 2 });
  assert.equal(itemAt(st, dun, x, y), null);
  assert.deepEqual(getP(st, "p1").inv, [item]);
});

test("WIN/LOSE set gameover and over", () => {
  const st = createState();
  applyEvent(st, dun, { t: "WIN", pid: "p1", seq: 1 });
  assert.equal(st.D.get("gameover"), "WIN");
  assert.equal(st.over, true);
});

test("radius tiers at exact boundaries", () => {
  const st = createState();
  for (const [L, R] of [[360, 6], [181, 6], [180, 5], [111, 5], [110, 4], [56, 4], [55, 3], [21, 3], [20, 2], [0, 2]]) {
    st.D.set("light", L);
    assert.equal(radius(st), R, `light=${L}`);
  }
});

test("reducer is identity-blind: same events, any observer → same serialized state", () => {
  const a = createState(), b = createState();
  const evs = [
    { t: "JOIN", pid: "p1", name: "Ash", seq: 1 },
    { t: "JOIN", pid: "p2", name: "Brine", seq: 2 },
    { t: "MOVE", pid: "p2", x: 1, y: 1, seq: 3 },
    { t: "SAY", pid: "p1", text: "hello", x: 0, y: 0, scope: "room", seq: 4 },
  ];
  for (const ev of evs) applyEvent(a, dun, ev);
  for (const ev of evs) applyEvent(b, dun, ev);
  assert.equal(serializeState(a), serializeState(b));
  assert.equal(a.seq, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/reducer.test.js`
Expected: FAIL — `Cannot find module '../shared/reducer.js'`.

- [ ] **Step 3: Write shared/reducer.js**

Bodies verbatim from `golem-grid.html` lines 232–260 except: `S` → explicit `st` parameter, `S.dun` → `dun` parameter, and `START_LIGHT` 240 → **360**:
```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/reducer.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Amend SPEC.md §4**

In `SPEC.md`, the light-economy paragraph currently reads:
```
Light economy: START_LIGHT=240, burn 1/move (2 while carrying prize),
```
Change to:
```
Light economy: START_LIGHT=360 (solver-derived 2026-07-03: worst-case
entrance→prize→entrance budget over the 10K CI seed set is 354; was 240),
burn 1/move (2 while carrying prize),
```

- [ ] **Step 6: Run the full suite**

Run: `node --test tests/`
Expected: PASS — all tests from Tasks 1–3.

- [ ] **Step 7: Commit**

```bash
git add shared/reducer.js tests/reducer.test.js SPEC.md
git commit -m "feat: extract reducer with explicit state; wire START_LIGHT=360 to solver worst case"
```

---

### Task 4: shared/solver.js

**Files:**
- Create: `shared/solver.js`, `tests/solver.test.js`

**Interfaces:**
- Consumes: `GW`, `GH` from worldgen; `START_LIGHT` from reducer.
- Produces: `solve(dun)→{winnable,depth,budget}` (budget = 3×depth: walk in ×1, carry out ×2; winnable requires `budget < START_LIGHT` — strict, because at light 0 the LOSE predicate fires before the WIN check); `shortestPath(dun,from,to)→[[x,y],…]|null` (steps excluding start — used by the replay fixture generator and later by tools).

- [ ] **Step 1: Write the failing test**

`tests/solver.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { genDungeon } from "../shared/worldgen.js";
import { solve, shortestPath } from "../shared/solver.js";

test("plagueis: depth 34, budget 102, winnable", () => {
  const r = solve(genDungeon("plagueis"));
  assert.deepEqual(r, { winnable: true, depth: 34, budget: 102 });
});

test("shortestPath stairs→prize has length == depth and ends at the prize", () => {
  const d = genDungeon("plagueis");
  const path = shortestPath(d, d.stairs, { x: d.prize.x, y: d.prize.y });
  assert.equal(path.length, 34);
  assert.deepEqual(path[path.length - 1], [d.prize.x, d.prize.y]);
  for (const [x, y] of path) assert.notEqual(d.grid[y][x], "#");
});

test("shortestPath to a wall tile is null", () => {
  const d = genDungeon("plagueis");
  assert.equal(shortestPath(d, d.stairs, { x: 0, y: 0 }), null); // border is wall
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/solver.test.js`
Expected: FAIL — `Cannot find module '../shared/solver.js'`.

- [ ] **Step 3: Write shared/solver.js**

Independent BFS (deliberately not reusing `dun.dist`, so the solver cross-checks worldgen's own depth map):
```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/solver.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/solver.js tests/solver.test.js
git commit -m "feat: winnability solver (independent BFS, light-budget model)"
```

---

### Task 5: Worldgen golden files + 500-seed harness

**Files:**
- Create: `tools/gen-golden.mjs`, `tests/golden/worldgen-plagueis.json`, `tests/golden/worldgen-lantern.json`, `tests/golden/worldgen-golem.json`
- Modify: `tests/worldgen.test.js` (append tests)

**Interfaces:**
- Consumes: `genDungeon`, `serializeDungeon`, `solve`.
- Produces: the golden files. Seed set covers all three themes (measured 2026-07-03): `plagueis`=salt_counting_house/depth 34, `lantern`=drowned_monastery/depth 45, `golem`=deep_mine/depth 28.

- [ ] **Step 1: Append the failing tests to tests/worldgen.test.js**

```js
import { readFileSync } from "node:fs";
import { solve } from "../shared/solver.js";

const GOLDEN_SEEDS = ["plagueis", "lantern", "golem"];
for (const seed of GOLDEN_SEEDS)
  test(`golden worldgen: ${seed} (exact match — diff = MAJOR version bump)`, () => {
    const got = JSON.stringify(serializeDungeon(genDungeon(seed)), null, 1) + "\n";
    const want = readFileSync(new URL(`./golden/worldgen-${seed}.json`, import.meta.url), "utf8");
    assert.equal(got, want);
  });

test("500-seed harness: determinism + winnability", () => {
  for (let i = 0; i < 500; i++) {
    const seed = "harness" + i;
    const a = JSON.stringify(serializeDungeon(genDungeon(seed)));
    const b = JSON.stringify(serializeDungeon(genDungeon(seed)));
    assert.equal(a, b, `nondeterministic: ${seed}`);
    const r = solve(genDungeon(seed));
    assert.ok(r.winnable, `unwinnable: ${seed} (budget ${r.budget})`);
  }
});
```
(Merge the imports with the existing import lines at the top of the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/worldgen.test.js`
Expected: FAIL — ENOENT on `tests/golden/worldgen-plagueis.json`. (The 500-seed harness should already PASS — measured max harness budget is 282 < 360.)

- [ ] **Step 3: Write tools/gen-golden.mjs and generate**

```js
#!/usr/bin/env node
/* Regenerating goldens is a VERSIONING EVENT (worldgen MAJOR bump), never a
   test fix. If a golden test fails, the extraction/refactor is wrong. */
import { writeFileSync, mkdirSync } from "node:fs";
import { genDungeon, serializeDungeon } from "../shared/worldgen.js";

const SEEDS = ["plagueis", "lantern", "golem"]; // one per theme
mkdirSync(new URL("../tests/golden/", import.meta.url), { recursive: true });
for (const seed of SEEDS) {
  const out = new URL(`../tests/golden/worldgen-${seed}.json`, import.meta.url);
  writeFileSync(out, JSON.stringify(serializeDungeon(genDungeon(seed)), null, 1) + "\n");
  console.log("wrote", out.pathname);
}
```

Run: `node tools/gen-golden.mjs`
Expected: three `wrote …/tests/golden/worldgen-*.json` lines.

Sanity-check the themes really differ: `grep -h '"theme"' tests/golden/worldgen-*.json`
Expected: `deep_mine`, `drowned_monastery`, `salt_counting_house` (one each; grep order is golem, lantern, plagueis).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/worldgen.test.js`
Expected: PASS — 6 tests (canary, serialize, 3 goldens, harness). The harness test takes a few seconds (1000 generations).

- [ ] **Step 5: Commit**

```bash
git add tools/gen-golden.mjs tests/golden/ tests/worldgen.test.js
git commit -m "test: worldgen golden files (3 themes) + 500-seed determinism/winnability harness"
```

---

### Task 6: Replay fixture + replay tests + shared/dedup.js

**Files:**
- Create: `shared/dedup.js`, `tools/gen-replay-fixture.mjs`, `tests/replay.test.js`, `tests/golden/replay-log.json`, `tests/golden/replay-final.json`

**Interfaces:**
- Consumes: `genDungeon`, `shortestPath`, reducer exports.
- Produces: `makeDeduper(cap=600)→(id)=>boolean` (true = fresh, apply it; false = duplicate/absent id, drop it) — Task 9's NET uses this exact function.

- [ ] **Step 1: Write shared/dedup.js**

Semantics verbatim from the prototype's NET.deliver (lines 306–309): absent id → drop; seen id → drop; cap at 600, evict oldest 300.
```js
/* ── Transport dedup: BroadcastChannel and the storage bridge BOTH deliver
   every message; whichever arrives second must be dropped, or every event
   would apply twice. Shared so tests replay the exact page behavior. ───── */
export function makeDeduper(cap=600){
  const seen=new Set();
  return id=>{
    if(!id||seen.has(id))return false;
    seen.add(id);
    if(seen.size>cap){let i=0;
      for(const k of seen){seen.delete(k);if(++i>=cap/2)break;}}
    return true;};
}
```

- [ ] **Step 2: Write the failing test**

`tests/replay.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { genDungeon } from "../shared/worldgen.js";
import { createState, applyEvent, serializeState, light } from "../shared/reducer.js";
import { makeDeduper } from "../shared/dedup.js";

const log = JSON.parse(readFileSync(new URL("./golden/replay-log.json", import.meta.url), "utf8"));
const want = readFileSync(new URL("./golden/replay-final.json", import.meta.url), "utf8");
const dun = genDungeon("plagueis");

test("replay: recorded log → byte-identical delta map", () => {
  const st = createState();
  for (const ev of log) applyEvent(st, dun, ev);
  assert.equal(serializeState(st) + "\n", want);
  assert.equal(st.D.get("gameover"), "WIN");
  assert.ok(light(st) > 0);
});

test("transport dedup: double delivery must not double-apply", () => {
  const st = createState();
  const fresh = makeDeduper();
  let applied = 0;
  for (const ev of log) {
    const m = { k: "EVENT", _id: "m" + ev.seq, ev };
    for (const copy of [m, m])          // BC + storage bridge both fire
      if (copy && fresh(copy._id)) { applyEvent(st, dun, copy.ev); applied++; }
  }
  assert.equal(applied, log.length);
  assert.equal(serializeState(st) + "\n", want);
});

test("dedup drops messages with no id", () => {
  const fresh = makeDeduper();
  assert.equal(fresh(undefined), false);
  assert.equal(fresh("a"), true);
  assert.equal(fresh("a"), false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/replay.test.js`
Expected: FAIL — ENOENT on `tests/golden/replay-log.json`.

- [ ] **Step 4: Write tools/gen-replay-fixture.mjs and generate**

A full scripted playthrough of `plagueis`: two players join, chatter, p1 walks to the prize taking any loot on the way, carries it back, wins. Events mirror what the host would commit (structurally valid, sequential seqs).
```js
#!/usr/bin/env node
/* Regenerates tests/golden/replay-{log,final}.json. Only rerun this if the
   event schema itself changes — that is a versioning event, say so. */
import { writeFileSync } from "node:fs";
import { genDungeon } from "../shared/worldgen.js";
import { shortestPath } from "../shared/solver.js";
import { createState, applyEvent, serializeState, itemAt, light } from "../shared/reducer.js";

const seed = "plagueis";
const dun = genDungeon(seed);
const st = createState();
const log = [];
let seq = 0;
const emit = ev => { ev.seq = ++seq; log.push(ev); applyEvent(st, dun, ev); };

emit({ t: "JOIN", pid: "p1", name: "Ash" });
emit({ t: "JOIN", pid: "p2", name: "Brine" });
emit({ t: "SAY", pid: "p1", text: "down we go", x: dun.stairs.x, y: dun.stairs.y, scope: "room" });
for (const [x, y] of shortestPath(dun, dun.stairs, { x: dun.prize.x, y: dun.prize.y })) {
  emit({ t: "MOVE", pid: "p1", x, y });
  const it = itemAt(st, dun, x, y);
  if (it) emit({ t: "TAKE", pid: "p1", item: it, x, y });
}
emit({ t: "TAKE_PRIZE", pid: "p1" });
emit({ t: "SAY", pid: "p1", text: "got it — heavy", scope: "party" });
for (const [x, y] of shortestPath(dun, { x: dun.prize.x, y: dun.prize.y }, dun.stairs))
  emit({ t: "MOVE", pid: "p1", x, y });
emit({ t: "WIN", pid: "p1" });

writeFileSync(new URL("../tests/golden/replay-log.json", import.meta.url),
  JSON.stringify(log, null, 1) + "\n");
writeFileSync(new URL("../tests/golden/replay-final.json", import.meta.url),
  serializeState(st) + "\n");
console.log(`replay fixture: ${log.length} events, final light ${light(st)}`);
```

Run: `node tools/gen-replay-fixture.mjs`
Expected: `replay fixture: <N> events, final light 258` — final light MUST be 258 (360 − 34×1 − 34×2); N is 74 + the number of loot tiles that happen to sit on the path (≥74).

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/replay.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add shared/dedup.js tools/gen-replay-fixture.mjs tests/replay.test.js tests/golden/replay-log.json tests/golden/replay-final.json
git commit -m "test: reducer replay byte-equality + transport dedup; shared dedup module"
```

---

### Task 7: Validator pytest suite

**Files:**
- Create: `tools/test_validate.py`

**Interfaces:**
- Consumes: `violations(control, prose)` and `parse_control(c)` from `tools/validate.py` (unchanged — its control-token schema is corpus-versioned; do NOT edit it in this plan).

**Known limitation to document, not fix:** `parse_control` splits the control string on spaces, so multi-word item/mob names ("green coin", "pale eel") cannot round-trip through `ITEMS:`/`MOB:` today. That is a step-4 (corpus format) concern. Tests here use single-token names and a comment flags the gap.

- [ ] **Step 1: Check pytest exists**

Run: `python -m pytest --version`
If missing: `pip install --user --break-system-packages pytest` (Arch); re-run the version check.

- [ ] **Step 2: Write the tests**

`tools/test_validate.py`:
```python
"""Unit tests for the grounding validator — the golem's conscience.

NOTE (step-4 flag, do not fix here): parse_control splits the control
string on spaces, so multi-word item/mob names ("green coin", "pale eel")
cannot be expressed yet. The corpus format work (SPEC §8 step 4) must
either encode spaces or restrict names to single tokens. Tests below use
single-token names deliberately.
"""
from validate import violations, parse_control

MOVE = "EVENT:move ROOM:hall THEME:deep_mine EXITS:n,e ITEMS:none MOB:none"


def test_parse_control():
    fields, items, exits = parse_control(MOVE)
    assert fields["EVENT"] == "move"
    assert items == [] and exits == ["n", "e"]


def test_clean_move_pair_passes():
    assert violations(MOVE, "A narrow hall. Dust holds its breath. Ways out: n, e.") == []


def test_missing_exits_line():
    assert "exits-line-format" in violations(MOVE, "A narrow hall of dust.")


def test_exits_line_mismatch():
    assert "exits-line-mismatch" in violations(MOVE, "A hall. Ways out: n, e, s.")


def test_exits_line_order_does_not_matter():
    assert violations(MOVE, "A hall. Ways out: e, n.") == []


def test_phantom_exit_in_body():
    v = violations(MOVE, "A door gapes to the south. Ways out: n, e.")
    assert "phantom-exit:s" in v


def test_real_exit_direction_in_body_is_allowed():
    assert violations(MOVE, "Cold air drifts from the north. Ways out: n, e.") == []


def test_adversarial_northern_is_not_north():
    # \bnorth\b must not fire inside "northern"
    assert violations(MOVE, "The northern-style arch sags. Ways out: n, e.") == []


def test_missing_item():
    ctrl = "EVENT:take THEME:deep_mine ITEMS:stylus MOB:none"
    assert "missing-item:stylus" in violations(ctrl, "You take nothing of note.")


def test_item_matched_by_last_word():
    ctrl = "EVENT:take THEME:deep_mine ITEMS:stylus MOB:none"
    assert violations(ctrl, "The stylus is cold in your hand.") == []


def test_multiple_items_all_required():
    ctrl = "EVENT:take THEME:x ITEMS:coin+stylus MOB:none"
    v = violations(ctrl, "You lift the coin and nothing else.")
    assert "missing-item:stylus" in v and "missing-item:coin" not in v


def test_phantom_creature():
    ctrl = "EVENT:look ITEMS:none MOB:none"
    assert "phantom-creature" in violations(ctrl, "Something alive shifts beyond the light.")


def test_missing_mob():
    ctrl = "EVENT:look ITEMS:none MOB:eel"
    assert "missing-mob:eel" in violations(ctrl, "The pool is empty and still.")


def test_mob_present_passes():
    # EVENT:take — 'look' is subject to the exits-line contract, which would
    # add exits-line-format noise to an otherwise-clean pair
    ctrl = "EVENT:take ITEMS:none MOB:eel"
    assert violations(ctrl, "A pale eel regards you without hurry.") == []


def test_banned_register():
    ctrl = "EVENT:look ITEMS:none MOB:none"
    assert "banned-register" in violations(ctrl, "An eldritch hum rises.")


def test_too_long():
    ctrl = "EVENT:look ITEMS:none MOB:none"
    prose = "It is dark. " * 5
    assert "too-long" in violations(ctrl, prose)


def test_four_sentences_is_fine():
    ctrl = "EVENT:take ITEMS:none MOB:none"  # take: exits contract not in play
    prose = "It is dark. " * 4
    assert violations(ctrl, prose.strip()) == []


def test_non_move_event_skips_exits_contract():
    ctrl = "EVENT:take ITEMS:coin MOB:none"
    assert violations(ctrl, "You pocket the coin.") == []
```

- [ ] **Step 3: Run the suite**

Run: `python -m pytest tools/test_validate.py -q`
Expected: `18 passed`. If any assertion fails, first re-read `tools/validate.py` — the test encodes its ACTUAL behavior; fix the test's understanding, not validate.py.

- [ ] **Step 4: Commit**

```bash
git add tools/test_validate.py
git commit -m "test: grounding validator unit suite incl. adversarial phrasings"
```

---

### Task 8: tools/solve.js + difficulty band + make solve

**Files:**
- Create: `tools/solve.js`, `tests/golden/solver-band.json`
- Modify: `Makefile` (add `solve` target only — full Makefile rewrite happens in Task 10)

**Interfaces:**
- Consumes: `genDungeon`, `solve`, `START_LIGHT`.
- Produces: exit-code gate for CI. Band facts (measured over seeds `seed0…seed9999`, frozen with worldgen): min 63, p50 126, p90 162, p99 210, max 354.

- [ ] **Step 1: Write tests/golden/solver-band.json**

Measured values ±10% (band exists to catch drift if the seed set or worldgen ever changes deliberately):
```json
{
  "p50": [113, 139],
  "p90": [146, 178],
  "p99": [189, 231],
  "max": [319, 389]
}
```

- [ ] **Step 2: Write tools/solve.js**

```js
#!/usr/bin/env node
/* Winnability + difficulty gate. SPEC §8.3: fail on unwinnable seeds or
   difficulty-band drift. START_LIGHT is wired to the worst case here. */
import { readFileSync } from "node:fs";
import { genDungeon } from "../shared/worldgen.js";
import { solve } from "../shared/solver.js";
import { START_LIGHT } from "../shared/reducer.js";

const args = process.argv.slice(2);
const n = +(args[args.indexOf("--seeds") + 1] || 10000);
const report = args.includes("--report");

const budgets = [];
const losers = [];
let worst = { seed: null, budget: -1 };
for (let i = 0; i < n; i++) {
  const seed = "seed" + i;
  const r = solve(genDungeon(seed));
  if (!r.winnable) losers.push({ seed, ...r });
  budgets.push(r.budget);
  if (r.budget > worst.budget) worst = { seed, budget: r.budget };
}
budgets.sort((a, b) => a - b);
const pct = p => budgets[Math.floor(p / 100 * (budgets.length - 1))];
const stats = { seeds: n, START_LIGHT, min: budgets[0], p50: pct(50),
                p90: pct(90), p99: pct(99), max: worst.budget, worstSeed: worst.seed };
console.log(JSON.stringify(stats, null, 2));
if (report) process.exit(0);

if (losers.length) {
  console.error(`UNWINNABLE: ${losers.length}/${n} seeds, e.g.`, losers.slice(0, 5));
  process.exit(1);
}
const band = JSON.parse(readFileSync(new URL("../tests/golden/solver-band.json", import.meta.url), "utf8"));
for (const k of Object.keys(band)) {
  const [lo, hi] = band[k];
  if (stats[k] < lo || stats[k] > hi) {
    console.error(`difficulty drift: ${k}=${stats[k]} outside [${lo},${hi}]`);
    process.exit(1);
  }
}
console.log(`solver: ${n} seeds winnable, difficulty band OK`);
```

- [ ] **Step 3: Run it**

Run: `node tools/solve.js --seeds 10000`
Expected: stats JSON with exactly `min 63, p50 126, p90 162, p99 210, max 354, worstSeed` set, then `solver: 10000 seeds winnable, difficulty band OK`; exit 0. These numbers are deterministic — any deviation means worldgen or the solver was mis-extracted.

- [ ] **Step 4: Add the Makefile target**

Append to `Makefile` (keep everything else as-is for now):
```make
solve:
	node tools/solve.js --seeds 10000
```
And add `solve` to the `.PHONY` line.

Run: `make solve`
Expected: same output as Step 3.

- [ ] **Step 5: Commit**

```bash
git add tools/solve.js tests/golden/solver-band.json Makefile
git commit -m "feat: 10K-seed winnability + difficulty-band gate (make solve)"
```

---

### Task 9: Vite port of the page (index.html + src/), delete golem-grid.html

**Files:**
- Create: `index.html`, `src/style.css`, `src/main.js`
- Delete: `golem-grid.html` (same commit, only after verification)

**Interfaces:**
- Consumes: every `shared/` export. The page NEVER re-implements pure logic.

**Porting rules (this task is transcription, not authorship):**
1. `src/style.css` = the entire `<style>` block of `golem-grid.html` (lines 8–79), verbatim.
2. `index.html` = the original HTML skeleton and body markup (lines 1–113) with the `<style>` block removed and, in place of the old inline `<script>`, exactly:
   `<script type="module" src="/src/main.js"></script>`
3. `src/main.js` = the original inline script (lines 116–619) minus the extracted sections (RNG 124–131, THEMES/TONE_LINE/TONES/ROOM_KINDS 134–166, worldgen 169–229, state-queries/reducer 232–260), with the header below, and these mechanical substitutions applied everywhere:
   - `S.seq` → `S.st.seq`; `S.log` → `S.st.log`; `S.over` → `S.st.over`
   - NET's dedup (`const seen=new Set()` … `seen.add` block in `deliver`) → `const fresh=makeDeduper();` and `function deliver(m){if(!m||!fresh(m._id))return;handler(m);}`
   - nothing else changes: hostCmd, hostCommit, perception, render, input, boot, and the ▶GOLEM-PLUG◀ stub stay line-for-line.

`src/main.js` header (replaces the extracted sections; the aliases keep every downstream call site verbatim):
```js
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
```

- [ ] **Step 1: Create the three files per the porting rules above**

- [ ] **Step 2: Verify all tests still pass (the page must not fork logic)**

Run: `node --test tests/`
Expected: PASS — everything from Tasks 1–6.

- [ ] **Step 3: Dev-server smoke**

Run: `(npx vite --port 5199 &) && sleep 2 && curl -s http://localhost:5199/ | grep -c 'src/main.js'; curl -s http://localhost:5199/src/main.js | head -c 200; kill %1 2>/dev/null || pkill -f 'vite --port 5199'`
Expected: `1` and the main.js header text; no 404s.

- [ ] **Step 4: Single-file build**

Run: `npx vite build && mv dist/index.html dist/golem-grid.html && ls -la dist/ && grep -c '<script type="module" src=' dist/golem-grid.html || true`
Expected: build succeeds; `dist/golem-grid.html` exists (roughly 40–60 KB); the grep count is `0` (no external script refs — everything inlined; `vite-plugin-singlefile` inlines JS+CSS).

- [ ] **Step 5: Manual demo-path verification (the CLAUDE.md invariant)**

Open `dist/golem-grid.html` from `file://` in a browser, two tabs:
- Tab 1: HOST with seed `plagueis` → world opens as "the salt counting house".
- Tab 2: JOIN → snapshot arrives, same world, both players visible.
- Arrows move; `/take`, `/read`, `/w`, `/party` work; golem prose identical in both tabs for shared events; light bar drains.
If no browser is available in this environment, STOP and ask the human to run this check before the deletion commit.

- [ ] **Step 6: Delete the superseded prototype and commit**

```bash
git rm golem-grid.html
git add index.html src/style.css src/main.js
git commit -m "feat: port page to Vite app over shared modules; single-file build replaces committed prototype"
```

---

### Task 10: Makefile + CI + final verification

**Files:**
- Modify: `Makefile`, `.github/workflows/ci.yml`, `CLAUDE.md` (Commands section), `README.md` (Local entry points)

- [ ] **Step 1: Rewrite the Makefile's local-loop targets**

Replace the `test:` recipe and add `html`/`dev` (leave `data-batch`, `train-local`, `wasm`, `infra-*` untouched — they belong to roadmap steps 4–6):
```make
# Local mirrors of the pipeline stages. CI runs the same commands.

.PHONY: test solve html dev data-batch train-local wasm infra-plan infra-apply

test:
	node --test tests/
	python -m pytest tools/test_validate.py -q

solve:
	node tools/solve.js --seeds 10000

html:
	npx vite build
	mv dist/index.html dist/golem-grid.html
	@echo "single-file deliverable: dist/golem-grid.html (open from file://, two tabs)"

dev:
	npx vite
```

- [ ] **Step 2: Update ci.yml**

Replace the `determinism` job's two test steps with one (`node --test tests/` now covers rng/worldgen/reducer/replay/solver), keep the validator job, add solver and build jobs:
```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]

jobs:
  determinism:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }

      # The architecture's superpower: everything is a golden-file test.
      # A golden diff means the world function changed and every existing
      # seed just broke: that is a MAJOR version bump, not a bugfix.
      - name: determinism tests (worldgen goldens, reducer replay, solver)
        run: node --test tests/

  solver:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - name: 10K-seed winnability + difficulty band
        run: node tools/solve.js --seeds 10000

  validator:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - name: grounding validator unit tests
        run: python -m pytest tools/test_validate.py -q

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: single-file build
        run: npx vite build && mv dist/index.html dist/golem-grid.html
      - uses: actions/upload-artifact@v4
        with:
          name: golem-grid-html
          path: dist/golem-grid.html
```

- [ ] **Step 3: Update CLAUDE.md Commands + README Local entry points**

CLAUDE.md `## Commands` gains two lines (keep the rest):
```
- `make solve` — 10K-seed winnability + difficulty band
- `make html` — build the single-file dist/golem-grid.html (file:// demo)
- `make dev` — Vite dev server
```
CLAUDE.md `## Current status` becomes:
```
Roadmap steps 1–3 are DONE: shared modules under shared/, Vite single-file
build (make html), tests green (make test), solver gate (make solve).
The golem is still the stub at ▶GOLEM-PLUG◀. Next: step 4 (data tools).
```
README.md "Local entry points" block gains the same `make solve` / `make html` lines.

- [ ] **Step 4: Full verification**

Run each and confirm:
- `make test` → all node tests pass AND `18 passed` from pytest.
- `make solve` → `solver: 10000 seeds winnable, difficulty band OK`.
- `make html` → `dist/golem-grid.html` produced.
- `git status` → clean except intended changes.

- [ ] **Step 5: Commit**

```bash
git add Makefile .github/workflows/ci.yml CLAUDE.md README.md
git commit -m "ci: wire tests, solver gate, and single-file build; document new targets"
```

---

## Completion checklist (map back to the spec)

- Roadmap 1 repo-ify: Tasks 1–4, 9 (shared modules; Vite; prototype retired).
- Roadmap 2 tests green: Tasks 2, 3, 5, 6, 7 (`make test`).
- Roadmap 3 solver in CI: Tasks 4, 8, 10 (`make solve`, ci.yml).
- SPEC §9 requirements covered: golden seeds ✓ (Task 5), replay byte-equality ✓ (6), solver winnability+band ✓ (8), validator adversarial ✓ (7), transport dedup ✓ (6), prose determinism — stub's prose channels are seeded by (seed, seq) construction; explicit prose tests arrive with the corpus work (step 4); reduced-motion — preserved verbatim in the port (Task 9), manual check in 9.5.
