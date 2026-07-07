/* ── PACK-LOADER: the Node-side half of the "deriveWorld(worldState) —
   and the sync-vs-async problem" bridge (mirrors games/topdown-puzzle/
   shared/pack-loader.js exactly; see that file's own header for the full
   rationale). shared/module.js's `deriveWorld(pack, worldState, seed?)`
   (S3 PR4's dispatcher over the original `deriveWorldFromPack(pack,
   worldState)`) is the one pure derivation function every consumer
   shares; getting the committed content/pack.json's bytes onto it is
   platform-specific, so that concern lives HERE instead of in shared/
   module.js — deliberately, so shared/module.js (validate/reduce/
   deriveWorldFromPack/deriveWorld) stays importable by a future browser
   client bundle with zero node:fs/node:path/node:url in its import
   graph.

   This file is Node-only — imported by tests and fixture tooling, NEVER
   by a browser client (which would load content/pack.json via its own
   bundler JSON import + call deriveWorld() directly instead). The read
   is lazy + memoized (first call to deriveWorld() pays it, once). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveWorld as deriveWorldCore, validate, reduce, narrativeFacts } from "./module.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_PATH = join(HERE, "..", "content", "pack.json");

let _pack;
function loadPack() {
  if (_pack === undefined) {
    _pack = JSON.parse(readFileSync(PACK_PATH, "utf8"));
  }
  return _pack;
}

/** The production entry point: deriveWorld(worldState, seed?) against
 *  the committed content/pack.json, for Node callers — a pure function
 *  of (committed pack, worldState[, seed]), same non-negotiable
 *  determinism doctrine #1 asks for. `seed` is optional and additive
 *  (S3 PR4) — omitting it reproduces every pre-S3 call exactly, since
 *  shared/module.js's own dispatcher only ever reads the generation
 *  seed out of a "tomb:" mapId, never out of this parameter. */
export function deriveWorld(worldState, seed) {
  return deriveWorldCore(loadPack(), worldState, seed);
}

/** The full KernelCore + narrativeFacts (`{deriveWorld,validate,reduce,
 *  narrativeFacts}`) — structurally satisfies @golem-engine/kernel's
 *  GameModule shape (minus observe/affordances, not yet built). Node-
 *  side only, for the same reason deriveWorld() above is. */
export const module = { deriveWorld, validate, reduce, narrativeFacts };
