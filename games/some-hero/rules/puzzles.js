// The tomb's seal puzzles — ported from
// games/some-hero/legacy/src/systems/puzzles.js. Pure slice only:
// stairsOpen/sealMsg. checkPlates/checkTraps/updateTorches/igniteBraziers
// (puzzles.js:31-109) mutate live zone state (game.plates/traps/torches,
// fx.sfx/toast/burst side effects tied to a real tomb floor) — real
// zone/tick logic, out of S2a's pure-helpers scope (design spec "Scope
// boundaries"); deferred to S2b/S2c.

import { tableRows } from "./pack.js";

// table:seal_messages — content/tables.mjs, transcribed from puzzles.js:
// 19-28's STRING fragments only (the type-dispatch branching below is
// S2a's, per tables.mjs's own litmus comment).
const SEAL_MESSAGES = tableRows("table:seal_messages");

function sealPartsFor(type) {
  const row = SEAL_MESSAGES.find(r => r.type === type);
  if (!row) throw new Error(`sealMsg: unknown puzzle type ${type}`);
  return row.parts;
}

/** May the player take the down-stairs on this floor? (puzzles.js:9-16) */
export function stairsOpen(game) {
  const pz = game.puzzle;
  if (!pz) return true;
  if (pz.type === "warden") return game.boss ? game.boss.dead : true;
  if (pz.type === "final") return false; // no down-stairs on the final floor
  if (pz.type === "key") return pz.have;
  return !!pz.solved;
}

/** Message shown when bumping sealed stairs. Table-fed (puzzles.js:19-28). */
export function sealMsg(puzzle) {
  if (puzzle.type === "warden") return sealPartsFor("warden")[0];
  if (puzzle.type === "final") return sealPartsFor("final")[0];
  if (puzzle.type === "key") return sealPartsFor("key")[0];
  if (puzzle.type === "plates") {
    const p = sealPartsFor("plates");
    return p[0] + puzzle.done + p[1] + puzzle.need + p[2];
  }
  if (puzzle.type === "riddle") return sealPartsFor("riddle")[0];
  if (puzzle.type === "traps") {
    const p = sealPartsFor("traps");
    return p[0] + puzzle.done + p[1] + puzzle.need + p[2];
  }
  // torch is the function's final catch-all/default branch (puzzles.js:27)
  const p = sealPartsFor("torch");
  return p[0] + puzzle.n + p[1];
}
