/* ── PACK-LOADER: the Node-side half of the "deriveWorld(seed) — and the
   sync-vs-async problem" bridge (docs/superpowers/specs/
   2026-07-06-c4-topdown-port-design.md). shared/module.js's
   `deriveWorldFromPack(pack, levelId)` is the one pure derivation
   function every consumer shares; getting the committed content/
   pack.json's bytes onto it is platform-specific, so that concern lives
   HERE instead of in shared/module.js — deliberately, so shared/
   module.js (validate/reduce/deriveWorldFromPack) stays importable by
   the PR3 browser client bundle with zero node:fs/node:path/node:url in
   its import graph (see shared/module.js's header comment for why even
   a lazily-called, never-invoked reference to one of those builtins'
   named exports fails a Vite client build outright).

   This file is Node-only — imported by tests and packages/testkit's
   fixture tooling, NEVER by games/topdown-puzzle/src/*.js (the browser
   client loads content/pack.json via its own bundler JSON import + calls
   deriveWorldFromPack() directly instead; see src/main.js). The read is
   lazy + memoized (first call to deriveWorld() pays it, once). ──────── */
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

/** The production entry point: deriveWorld(levelId) against the
 *  committed content/pack.json, for Node callers (tests, fixture
 *  tooling) — a pure function of (committed pack, levelId), same
 *  non-negotiable determinism doctrine #1 asks for, just a different
 *  world-DNA source than golem-grid's RNG-seeded worldgen. */
export function deriveWorld(levelId) {
  return deriveWorldFromPack(loadPack(), levelId);
}

/** The full KernelCore (`{deriveWorld,validate,reduce}`) — structurally
 *  satisfies @golem-engine/kernel's GameModule shape, same posture as
 *  games/golem-grid/shared/module.js's own `module` export. Node-side
 *  only, for the same reason deriveWorld() above is. */
export const module = { deriveWorld, validate, reduce };
