/* ── DEMO NPC (L7 DoD: "one demo NPC conversing in golem-grid") — see
   docs/superpowers/specs/2026-07-07-l7-context-compiler-design.md. One
   stationary NPC, always at the dungeon's own anchor room (rooms[0] —
   always reachable; the same anchor tools/harvest.js's Task D uses for
   its own "distant, genuinely outside the envelope" construction).
   Knowledge/factUniverse are small and hand-authored from the real
   dungeon (the anchor room's own kind + theme are known; the single
   farthest room's kind is NOT known — the same shape as harvest.js's
   own KNOWS/DOESNT_KNOW construction, so this demo's control string is
   literally interchangeable with L3's training encoding).

   Fully client-local — no sendCmd, no wire message, no event, zero
   reduce/validate/module.js footprint (see
   games/golem-grid/tests/npc-not-in-callgraph.test.js, mirroring
   entities-not-in-callgraph.test.js's precedent). Plain ESM JS, no TS
   build step (games/ may use plain JS per DELTA §0.3). The ONLY
   integration point for prose stays main.js's ▶GOLEM-PLUG◀ golemLine —
   this module returns { reply, trace } and never touches the DOM. ──── */
import { compileEnvelope, envelopeToControlString, renderStubReply } from "@golem-engine/language";

export const NPC_ID = "npc:crypt-keeper";
export const NPC_NAME = "the keeper";

// Same slug() convention as tools/harvest.js (trim + underscore-join,
// no case change — every value fed through it here is already
// lowercase at the source: shared/themes.js's ROOM_KINDS/THEMES keys).
function slug(name) {
  return name.trim().replace(/\s+/g, "_");
}

/** The NPC sits at the dungeon's anchor room (rooms[0] — always a
 *  legal, reachable tile; the same anchor harvest.js's Task D uses as
 *  `anchorRoom`). */
export function npcPosition(dun) {
  const anchor = dun.rooms[0];
  return { x: anchor.cx, y: anchor.cy };
}

/** This NPC's Knowledge component (C3's `{knows: string[]}` shape,
 *  structurally duplicated per the L7 design doc's kernel-type
 *  decision) for one dungeon: the anchor room's own kind + the
 *  dungeon's theme — small and hand-authored, per the design doc. */
export function npcKnowledge(dun) {
  const anchor = dun.rooms[0];
  return { knows: [anchor.kind, dun.theme] };
}

/** The closed-world fact universe this demo bounds itself to: what the
 *  NPC knows, plus one genuinely-distant fact — the single farthest
 *  room's kind (or, mirroring harvest.js's own `safeDistantFact`
 *  fallback, the prize's name, if the farthest room happens to share
 *  the anchor's own kind). */
export function npcFactUniverse(dun) {
  const anchor = dun.rooms[0];
  let distantRoom = dun.rooms[0];
  for (const rm of dun.rooms) {
    if (dun.dist[rm.cy][rm.cx] > dun.dist[distantRoom.cy][distantRoom.cx]) distantRoom = rm;
  }
  const distantFact = distantRoom.kind === anchor.kind ? slug(dun.T.prize) : distantRoom.kind;
  return [...npcKnowledge(dun).knows, distantFact];
}

/** askNpc(dun, seed, question) -> { reply, trace }. Runs the full L7
 *  pipeline (compileEnvelope -> renderStubReply) for THIS one NPC, and
 *  also returns the control string (envelopeToControlString) as
 *  `trace` so callers can surface it exactly like every other
 *  ▶GOLEM-PLUG◀ trace line (main.js's `golemLine(text, trace)`). Never
 *  touches the DOM/golemLine itself — that stays main.js's job, per
 *  doctrine #4 (the golem is the only mouth). */
export function askNpc(dun, seed, question) {
  const envelope = compileEnvelope(npcKnowledge(dun), npcFactUniverse(dun));
  const topic = "room";
  return {
    reply: renderStubReply(envelope, topic, question, seed, NPC_ID),
    trace: envelopeToControlString(envelope, topic, question),
  };
}
