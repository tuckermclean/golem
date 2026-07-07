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
                     copy. PR4 (docs/superpowers/specs/
                     2026-07-07-s2c-pr4-combat-design.md) adds
                     `run.enemies: [{id,kind,pos:{x,y},hp}]` beside
                     `runStats`/`puzzle` — the run-scoped entity tier
                     (per-descent: wiped on every ENTERED_TOMB, gone on
                     exit/death). Seeded from the derived spawn list
                     carried on the ENTERED_TOMB event (`ev.enemies` —
                     shared/module.js's enteredTombEvent(), the same
                     "carried on the event, not read off `world`"
                     posture that placeholder already uses for `spawn`).
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
   `entities`.

   PR3 (docs/superpowers/specs/2026-07-07-s2b-pr3-ceremony-machine-
   design.md) adds two more plumbing-not-game-domain fields, beside `seq`/
   `tick` for the same reason: `pending` (the unified two-step slot —
   null | {kind:"ceremony"} | {kind:"resurrection",cause}, consumed by
   the "proceed"/"resurrect" verbs) and `run.puzzle` (a minimal
   {type,solved,attempts} shape, just enough to drive the riddle-ask
   branch — the full puzzle system stays S2c/S3). */
import { createMeta, recordDeath, recordDepth } from "../rules/meta.js";
import { newRunStats, gradeRun } from "../rules/ledger.js";
import { accrueInterest, makeDeathPayment } from "../rules/credit.js";

export function createState() {
  return {
    world: { zone: null, floorNum: 0, mapId: null },
    run: {
      runStats: newRunStats(),
      // Minimal puzzle slot (design spec: "Add a minimal run.puzzle =
      // {type,solved,attempts} field") — only enough shape to drive the
      // riddle-ask branch (shared/module.js's "move" case). null outside
      // the tomb / before any seal is authored on a floor; the full
      // puzzle system (plates/traps/torch/warden/final, real generation)
      // is S2c/S3's job. Reset to null on every ENTERED_TOMB.
      puzzle: null,
      // The run-scoped enemy entity tier (PR4's design spec: "The new
      // design surface: an entity tier"). Empty outside the tomb / before
      // any ENTERED_TOMB seeds it; wiped fresh on every new descent.
      enemies: [],
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
    // The unified two-step slot (design spec's "The unified two-step
    // slot (locked)"): null | {kind:"ceremony"} | {kind:"resurrection",
    // cause}. "seq"/"tick" plumbing-not-game-domain category — sits
    // beside the five tiers, not nested in any one of them.
    pending: null,
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

    // ── PR3: the ceremony state machine (docs/superpowers/specs/
    // 2026-07-07-s2b-pr3-ceremony-machine-design.md's "Events + reducer
    // cases"). Every case below is deliberately as small as the design
    // locks it to be — see each case's comment for its exact citation.

    case "GOLEM_DENIED":
      // BITE: the gate is read-only on denial — a pure no-op besides the
      // seq bump (mirrors door-golem.ceremony.test.js:93-104's "the gate
      // is read-only on denial").
      return { ...state, seq: ev.seq };

    case "GOLEM_APPROVED":
      // Ceremony played; descent waits for "proceed" (the pending
      // slot). Does NOT touch `world` — the verdict must not reveal
      // descent early (door-golem.ceremony.test.js:63-83).
      return {
        ...state,
        knowledge: { ...state.knowledge, golemApproved: true },
        pending: { kind: "ceremony" },
        seq: ev.seq,
      };

    case "ENTERED_TOMB": {
      // `ev.{zone,floorNum,mapId,spawn}` are supplied by shared/
      // module.js's enteredTombEvent() (the SYNTHETIC_TOMB_FLOOR_1
      // placeholder — see that file's own comment on why: this reduce()
      // call still runs against the STALE ow `world` param, per the
      // design spec's "The real novelty" section, so the tomb's own
      // spawn cannot be read off `world` here and is carried on the
      // event instead). PR4 adds `ev.enemies` to that same carried-on-
      // the-event list — the derived spawn list (deep-copied per enemy,
      // never the event's own array/objects, per the copy-on-write
      // discipline); defaults to `[]` for any ENTERED_TOMB that doesn't
      // carry one (defensive, not expected in practice).
      const knowledge = {
        ...state.knowledge,
        runs: state.knowledge.runs + 1,
        day: state.knowledge.day + 1,
        credit: { ...state.knowledge.credit },
      };
      accrueInterest(knowledge); // one excursion = one month (credit.js's own doc comment); mutates the FRESH knowledge.credit clone only.
      const enemies = (ev.enemies || []).map((e) => ({ ...e, pos: { ...e.pos } }));
      return {
        ...state,
        world: { zone: ev.zone, floorNum: ev.floorNum, mapId: ev.mapId },
        run: { runStats: newRunStats(), puzzle: null, enemies },
        character: { ...state.character, pos: { ...ev.spawn } },
        knowledge,
        pending: null,
        seq: ev.seq,
      };
    }

    case "EXITED_TOMB": {
      // Voluntary ascent: grade the run (died:false — a voluntary exit
      // is never a death), record depth, then swap back to the ow world
      // `ev` carries (shared/module.js's exitedTombEvent(), computed via
      // the REAL map:guild_hall pack — see that function's own comment).
      // `run.runStats` is deliberately NOT reset (design spec: "does NOT
      // reset run.runStats"; only a NEW run — ENTERED_TOMB — resets it).
      const grade = gradeRun(state.knowledge, { ...state.run.runStats, died: false });
      const knowledge = { ...state.knowledge, grades: [...state.knowledge.grades, grade], credit: { ...state.knowledge.credit } };
      recordDepth(knowledge, state.run.runStats.depth);
      return {
        ...state,
        world: { zone: ev.zone, floorNum: ev.floorNum, mapId: ev.mapId },
        character: { ...state.character, pos: { ...ev.spawn } },
        knowledge,
        seq: ev.seq,
      };
    }

    case "RIDDLE_ASKED":
      // The sealed riddle door: ask, never toast, never a zone
      // transition (seal-stairs.ceremony.test.js:137-151). A legal
      // event with no state effect beyond the seq bump — answering it
      // (answerRiddle) is the full puzzle system, out of scope (design
      // spec's "Scope boundaries").
      return { ...state, seq: ev.seq };

    case "HURT":
      return {
        ...state,
        character: { ...state.character, hp: state.character.hp - ev.amount },
        seq: ev.seq,
      };

    case "DIED":
      // Sets the resurrection half of the pending slot; the actual
      // respawn effects wait for "resurrect" (RESURRECTED, below) —
      // mirrors hurtPlayer's own state:=DEAD / respawnAtGuild split
      // (death-respawn-persistence.ceremony.test.js:106-114).
      return { ...state, pending: { kind: "resurrection", cause: ev.cause }, seq: ev.seq };

    case "RESURRECTED": {
      // The exact field list is LOCKED (design spec's "RESURRECTED
      // reducer — the exact field list"). Mirrors rules/meta.js's
      // respawnAtGuild ← legacy/src/systems/respawn.js:21-58, adapted:
      // position uses the derived World's `spawn` (`ev.spawn`, only
      // present when climbing out of the tomb), NOT legacy's VIL pixel
      // constant (meaningless against S1's 6x7 map:guild_hall).
      const knowledge = { ...state.knowledge, credit: { ...state.knowledge.credit } };
      recordDeath(knowledge, ev.cause); // deaths++/lastCause/repeatCause. Nothing else in knowledge.

      const p = state.character;
      const deductible = Math.ceil(p.gold / 2);
      let gold = p.gold - deductible;
      // Legacy order pinned by the BITE test: deductible FIRST, then
      // min-payment+fee from what's left (death-respawn-persistence.
      // ceremony.test.js:126-133).
      const garnish = makeDeathPayment(knowledge, gold);
      if (garnish) gold -= garnish.paid + garnish.fee;

      const character = {
        ...p,
        gold,
        potions: Math.min(p.potions, 1),
        hp: p.maxhp,
        inv: 0,
        atkT: 0,
        // swordLv untouched — equipment, not consumable (persists through death).
        pos: ev.spawn ? { ...ev.spawn } : p.pos,
      };

      // world: if zone was "tomb" -> back to ow (ev.world is present);
      // if already ow, leave state.world exactly as-is (same reference).
      const world = ev.world ? { ...ev.world } : state.world;

      // Spread-merge, do NOT replace runStats (the "runStats only resets
      // on new run, not death" invariant — death-respawn-persistence.
      // ceremony.test.js:116-124). Died runs are never graded: no
      // gradeRun call here, ever (legacy grades only in the voluntary
      // exitTomb path) — preserve 1:1, do not "fix" this.
      const run = { ...state.run, runStats: { ...state.run.runStats, died: true } };

      return { ...state, knowledge, character, world, run, pending: null, seq: ev.seq };
    }

    // ── PR4: combat + pickups + the enemy entity tier (docs/superpowers/
    // specs/2026-07-07-s2c-pr4-combat-design.md's "Events + reducer
    // cases"). Every case below is copy-on-write over `run.enemies`
    // (a fresh array; unmatched enemies are the SAME object reference,
    // matched ones are fresh objects) — no mutation of `state`/`ev`.

    case "ENEMY_MOVED":
      // shared/tick.js's resolveTick — one enemy steps one grid cell.
      return {
        ...state,
        run: {
          ...state.run,
          enemies: state.run.enemies.map((e) => (e.id === ev.id ? { ...e, pos: { x: ev.x, y: ev.y } } : e)),
        },
        seq: ev.seq,
      };

    case "ENEMY_HURT":
      // The player attack verb's damage half (shared/module.js's
      // "attack" case) — hp<=0 is checked by the CALLER (sim-and-inspect,
      // same idiom as HURT/DIED) which then appends ENEMY_KILLED; this
      // case never removes the enemy itself.
      return {
        ...state,
        run: {
          ...state.run,
          enemies: state.run.enemies.map((e) => (e.id === ev.id ? { ...e, hp: e.hp - ev.amount } : e)),
        },
        seq: ev.seq,
      };

    case "ENEMY_KILLED": {
      // Removes the enemy from run.enemies and feeds the Ledger (the
      // riddle's kills-by-kind question + gradeRun's killsByKind.slime
      // penalty — rules/ledger.js's own gradeRun/newRunStats shape).
      const killsByKind = { ...state.run.runStats.killsByKind };
      killsByKind[ev.kind] = (killsByKind[ev.kind] || 0) + 1;
      return {
        ...state,
        run: {
          ...state.run,
          enemies: state.run.enemies.filter((e) => e.id !== ev.id),
          runStats: { ...state.run.runStats, kills: state.run.runStats.kills + 1, killsByKind },
        },
        seq: ev.seq,
      };
    }

    case "COLLECTED":
      // Tile-entry pickup (shared/module.js's "move" case, sim-and-
      // inspect over `world.pickupAt`). `kind` selects which character
      // field the amount lands on: "gold"/"potion" are named fields;
      // anything else is a generic inventory count (`inv`) — minimal, no
      // full inventory system (design spec's "Scope boundaries").
      return {
        ...state,
        character: {
          ...state.character,
          ...(ev.kind === "gold"
            ? { gold: state.character.gold + ev.amount }
            : ev.kind === "potion"
              ? { potions: state.character.potions + ev.amount }
              : { inv: state.character.inv + ev.amount }),
        },
        seq: ev.seq,
      };

    default:
      return { ...state, seq: ev.seq };
  }
}

/* Canonical byte-form of state — replay/fixture/determinism tests hash
   this. No Map involved (unlike topdown-puzzle's `entities`), so plain
   JSON.stringify is already deterministic: every code path builds these
   tier objects via the same literal key order every time. The one
   exception is `run.enemies` (PR4): its array ORDER is an implementation
   detail of insertion (spawn order today; ENEMY_KILLED's filter always
   preserves relative order, but nothing pins that as a permanent
   contract), so it is sorted by `id` here — a stable, deterministic sort
   key every enemy always has — before hashing, guaranteeing the hash is
   a pure function of the SET of enemies-and-their-fields, not of
   whatever order they happen to sit in the array. */
export function serializeState(state) {
  const enemies = [...state.run.enemies].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify({
    world: state.world,
    run: { ...state.run, enemies },
    character: state.character,
    knowledge: state.knowledge,
    profile: state.profile,
    pending: state.pending,
    tick: state.tick,
    seq: state.seq,
  });
}
