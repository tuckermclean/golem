/* ── PACK-LOADER: the Node-side half of the "deriveWorld(worldState) —
   and the sync-vs-async problem" bridge (mirrors games/topdown-puzzle/
   shared/pack-loader.js exactly; see that file's own header for the full
   rationale). shared/module.js's `deriveWorldFromPack(pack, worldState)`
   is the one pure derivation function every consumer shares; getting the
   committed content/pack.json's bytes onto it is platform-specific, so
   that concern lives HERE instead of in shared/module.js — deliberately,
   so shared/module.js (validate/reduce/deriveWorldFromPack) stays
   importable by a future browser client bundle with zero node:fs/
   node:path/node:url in its import graph.

   This file is Node-only — imported by tests and fixture tooling, NEVER
   by a browser client (which would load content/pack.json via its own
   bundler JSON import + call deriveWorldFromPack() directly instead).
   The read is lazy + memoized (first call to deriveWorld() pays it,
   once). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveWorldFromPack, validate, reduce } from "./module.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_PATH = join(HERE, "..", "content", "pack.json");

let _pack;
function loadPack() {
  if (_pack === undefined) {
    _pack = JSON.parse(readFileSync(PACK_PATH, "utf8"));
  }
  return _pack;
}

/** The production entry point: deriveWorld(worldState) against the
 *  committed content/pack.json, for Node callers — a pure function of
 *  (committed pack, worldState), same non-negotiable determinism
 *  doctrine #1 asks for. */
export function deriveWorld(worldState) {
  return deriveWorldFromPack(loadPack(), worldState);
}

/** The full KernelCore (`{deriveWorld,validate,reduce}`) — structurally
 *  satisfies @golem-engine/kernel's GameModule shape. Node-side only,
 *  for the same reason deriveWorld() above is. */
export const module = { deriveWorld, validate, reduce };
