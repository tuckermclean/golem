/* ── REDUCER: deterministic, identity-blind pure fold for some-hero's
   kernel port (DELTA S2 PR2 — see docs/superpowers/specs/
   2026-07-07-s2b-state-tick-design.md). Mirrors games/topdown-puzzle/
   shared/reducer.js's discipline exactly: fresh top-level object, copied
   tier objects on write, no mutation of the state/world handed in, and
   `seq` always set from the event's own `seq` field (validate never
   stamps it — that's a host-adapter concern, src/host.js).

   State is the design spec's LOCKED five-tier mapping (the "five-tier
   State (locked mapping)" section) — NOT topdown-puzzle's Entity/Map
   representation. some-hero has exactly one embodiment (no multiplayer,
   no NPC entities modeled yet), so `character.pos` is a plain {x,y}
   field on the State, not a GridPosition component on an ECS entity:

     - `world`     — which world-instance is active ({zone, floorNum,
                     mapId}), NOT the derived World (doctrine #1: the
                     world itself is never stored — deriveWorld(state.
                     world) computes it fresh, in shared/module.js).
     - `run`       — per-descent state, reset only by NEW_RUN/ENTER_TOMB
                     (PR3/S2c territory — full zone-transition events;
                     this PR only defines the shape). `runStats` reuses
                     rules/ledger.js's own `newRunStats()` byte-for-byte
                     (S2a's already-ported shape), not a re-literalized
                     copy.
     - `character` — the current embodiment: hp/maxhp/potions/inv/atkT/
                     gold/swordLv/pos{x,y}. Initial numeric values mirror
                     games/some-hero/legacy/src/entities/player.js:7-8's
                     createPlayer() (hp:10, maxhp:10, potions:0,
                     swordLv:0, inv:0, atkT:0, gold:0) — legacy's pixel
                     x/y/w/h/vx/vy/fx/fy/speed/tk fields are dropped
                     (movement is canonicalized to grid-cardinal, the
                     design spec's flagged divergence; see shared/
                     module.js's header).
     - `knowledge` — meta's permanent facts as a PLAIN OBJECT, 1:1 with
                     rules/meta.js's own `createMeta()` (imported
                     directly below, not re-literalized — one source of
                     truth). Deliberately NOT forced through
                     @golem-engine/kernel's Knowledge{knows:string[]}
                     component (reserved for L7 per the design spec).
     - `profile`   — cross-session tier. No PR2 test exercises it; an
                     inert empty slot (structural completeness only,
                     same posture as C4's unexercised channel wiring).

   `seq`/`tick` are sequencing plumbing, not game-domain data, so they
   sit beside the five tiers (not nested in any of them) — same posture
   as topdown-puzzle's own `state.seq`/`state.tick` fields living beside
   `entities`. */
import { createMeta } from "../rules/meta.js";
import { newRunStats } from "../rules/ledger.js";

export function createState() {
  return {
    world: { zone: null, floorNum: 0, mapId: null },
    run: {
      runStats: newRunStats(),
    },
    character: {
      hp: 10,
      maxhp: 10,
      potions: 0,
      inv: 0,
      atkT: 0,
      gold: 0,
      swordLv: 0,
      pos: { x: 0, y: 0 },
    },
    knowledge: createMeta(),
    profile: {},
    tick: 0,
    seq: 0,
  };
}

/* Pure fold: (state, world, event) → a NEW state. No mutation of `state`
   or `world` — a fresh top-level object, copied tier objects on write;
   untouched tiers are structurally shared (same reference), same idiom
   games/golem-grid/shared/reducer.js documents for its own `D` Map.
   One case per event kind — this is games/some-hero's KernelCore.reduce
   (see shared/module.js). */
export function reduce(state, world, ev) {
  switch (ev.t) {
    case "FLOOR_ENTERED": {
      // The doctrinal "how did State come to have a valid character
      // position" bootstrap event — the some-hero analog of topdown-
      // puzzle's LEVEL_LOADED / golem-grid's JOIN (both precedents put
      // the very first content-populating step INSIDE the committed
      // event log, as a normal seq'd event, rather than a side-channel
      // argument to createState()). NOT a zone-transition ceremony: no
      // Door Golem check, no gating, no run/knowledge reset — those stay
      // PR3/S2c's job (design spec's "Scope boundaries"). Only copies
      // `{zone,floorNum,mapId}` from the event and the matching derived
      // World's `spawn` into `character.pos`.
      return {
        ...state,
        world: { zone: ev.zone, floorNum: ev.floorNum, mapId: ev.mapId },
        character: { ...state.character, pos: { ...world.spawn } },
        seq: ev.seq,
      };
    }
    case "MOVED": {
      return {
        ...state,
        character: { ...state.character, pos: { x: ev.x, y: ev.y } },
        seq: ev.seq,
      };
    }
    case "TICK_ADVANCED":
      return { ...state, tick: ev.tick, seq: ev.seq };
    default:
      return { ...state, seq: ev.seq };
  }
}

/* Canonical byte-form of state — replay/fixture/determinism tests hash
   this. No Map involved (unlike topdown-puzzle's `entities`), so plain
   JSON.stringify is already deterministic: every code path builds these
   tier objects via the same literal key order every time. */
export function serializeState(state) {
  return JSON.stringify({
    world: state.world,
    run: state.run,
    character: state.character,
    knowledge: state.knowledge,
    profile: state.profile,
    tick: state.tick,
    seq: state.seq,
  });
}
