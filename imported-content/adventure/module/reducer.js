/* ── ADVENTURE REDUCER — the pure fold half of the adventure GameModule
   (DELTA A3 PR2 — docs/superpowers/specs/
   2026-07-07-a3-pr2-module-terminal-design.md's "The state model").
   Mirrors games/some-hero/shared/reducer.js's discipline: a fresh
   top-level object per call, copied tier objects on write, no mutation
   of the `state`/`world` handed in, `seq` always taken from the event's
   own `seq` field (validate never stamps it — module.js's job, or a
   host adapter's).

   THE LOCKED STATE SHAPE, AND ONE DOCUMENTED ADDITION:
   The design spec locks `State = {region, inventory, facts, seq}`. Every
   one of those four fields is here, unchanged in meaning. But `take`/
   `drop`/`SPAWNED` need to know WHICH items currently sit in WHICH room
   (an item taken from room A and dropped in room B must reappear in B,
   not silently vanish) — the locked four-field shape has nowhere to put
   that. This is the exact same category of necessary, documented
   addition A3 PR1's content/entities.mjs header calls out for its own
   `Contains` component ("not spelled out in the design spec's bullet
   list, but necessary... added deliberately, documented here"): a fifth
   field, `roomItems: Record<region, string[]>` — which items are
   CURRENTLY (not just initially) sitting in each room. Initialized from
   the derived World's static `rooms[region].items` (A3 PR1's `Contains`
   data, read at deriveWorld time) and mutated by TOOK/DROPPED/SPAWNED
   below; `inventory` and `facts` still carry every bit of meaning the
   spec assigns them.

   TOGGLE STATE PIGGYBACKS ON `facts`, ON PURPOSE: rather than inventing
   a sixth field for the one Toggle-bearing item in this pack (the
   flashlight), a toggle's on/off value is stored as the presence/absence
   of a synthetic fact string `"<itemId>:on"` in the SAME `facts` array
   OnUse's setFact/clearFact already writes to. `facts` is already
   documented as "the closed-world truth the conditions/affordances
   read" — a boolean switch is exactly that kind of truth, so this reuses
   the one generic bag rather than adding component-specific state. */

/** The synthetic fact name a Toggle's on/off state piggybacks on (see
 *  header). Exported so module.js's "use" case (which must READ the
 *  current on/off value before flipping it) and the terminal narration
 *  layer never have to re-derive this string convention independently —
 *  one source of truth for the `"<itemId>:on"` shape. */
export const toggleFactName = (itemId) => `${itemId}:on`;
/** The idempotency guard fact for a Spawns — set by the SPAWNED case,
 *  checked by module.js's validate so a Spawns fires at most once. */
export const spawnedFact = (entity) => `spawned_${entity}`;

/** createState(world) — starts the player in the derived World's entry
   room (module.js's deriveWorld: "the first room in pack.entities'
   insertion order", the design spec's "start in the entry room"). Takes
   `world` (not zero-arg, as the spec's shorthand literally reads)
   because there is no bootstrap event in this pack's event list
   (MOVED/TOOK/DROPPED/USED/SPAWNED/TOGGLED — no ROOM_ENTERED/JOIN) to
   populate `region` after the fact the way some-hero's FLOOR_ENTERED or
   golem-grid's JOIN do; the entry room has to come from somewhere pure,
   and `deriveWorld`'s output is the only pure source of it. `roomItems`
   is seeded from `world.rooms[*].items` (a fresh copy per region array —
   never aliasing the World's own arrays, so later mutation here can
   never leak back into the frozen World). */
export function createState(world) {
  const roomItems = {};
  for (const [region, room] of Object.entries(world.rooms)) {
    roomItems[region] = [...room.items];
  }
  return {
    region: world.startRegion,
    inventory: [],
    roomItems,
    facts: [],
    seq: 0,
  };
}

/** Pure fold: (state, world, event) → a NEW state. `world` is accepted
   for KernelCore/GameModule signature parity (some-hero's own `reduce`
   takes it too) but this fold never actually reads it — every case only
   ever needs the event's own fields plus the current state, per the
   "event carries all necessary fields" discipline SPAWNED's `region`
   field below follows. */
export function reduce(state, world, ev) {
  void world;
  switch (ev.t) {
    case "MOVED":
      return { ...state, region: ev.to, seq: ev.seq };

    case "TOOK": {
      const here = state.roomItems[state.region] || [];
      return {
        ...state,
        inventory: [...state.inventory, ev.item],
        roomItems: { ...state.roomItems, [state.region]: here.filter((id) => id !== ev.item) },
        seq: ev.seq,
      };
    }

    case "DROPPED": {
      const here = state.roomItems[state.region] || [];
      return {
        ...state,
        inventory: state.inventory.filter((id) => id !== ev.item),
        roomItems: { ...state.roomItems, [state.region]: [...here, ev.item] },
        seq: ev.seq,
      };
    }

    case "USED": {
      let facts = state.facts;
      if (ev.setFact && !facts.includes(ev.setFact)) facts = [...facts, ev.setFact];
      if (ev.clearFact && facts.includes(ev.clearFact)) facts = facts.filter((f) => f !== ev.clearFact);
      return { ...state, facts, seq: ev.seq };
    }

    case "TOGGLED": {
      const factName = toggleFactName(ev.item);
      let facts = state.facts;
      const has = facts.includes(factName);
      if (ev.on && !has) facts = [...facts, factName];
      if (!ev.on && has) facts = facts.filter((f) => f !== factName);
      return { ...state, facts, seq: ev.seq };
    }

    case "SPAWNED": {
      const guard = spawnedFact(ev.entity);
      // Idempotent: once an entity has spawned, its guard fact stays set
      // forever, so it can never spawn a second time — even after the
      // player takes the first copy out of the room (which the old
      // room-membership-only check missed → unbounded duplication).
      if (state.facts.includes(guard)) return { ...state, seq: ev.seq };
      const there = state.roomItems[ev.region] || [];
      return {
        ...state,
        roomItems: { ...state.roomItems, [ev.region]: there.includes(ev.entity) ? there : [...there, ev.entity] },
        facts: [...state.facts, guard],
        seq: ev.seq,
      };
    }

    default:
      // Unknown event kinds are a no-op besides the seq bump — same
      // permissive-fold posture some-hero's reduce() default case takes
      // for events it doesn't itself define a case for.
      return { ...state, seq: ev.seq };
  }
}

/** serializeState — a canonical, order-independent JSON string (sorted
   `inventory`/`facts`, and `roomItems` sorted both by region key and by
   each region's item list) suitable for hashing via @golem-engine/
   random's h32 at the call site (h32(serializeState(state))) — the same
   two-step "serialize then hash externally" split games/some-hero/
   shared/reducer.js's own serializeState uses, not a hash computed
   inside this module. */
export function serializeState(state) {
  const roomItems = {};
  for (const region of Object.keys(state.roomItems).sort()) {
    roomItems[region] = [...state.roomItems[region]].sort();
  }
  return JSON.stringify({
    region: state.region,
    inventory: [...state.inventory].sort(),
    roomItems,
    facts: [...state.facts].sort(),
    seq: state.seq,
  });
}
