/* ── MODULE: the adventure GameModule (DELTA A3 PR2 — docs/superpowers/
   specs/2026-07-07-a3-pr2-module-terminal-design.md). Generic,
   declarative-component-driven mechanics ONLY — every verb below is
   implemented by reading a pack component (Exits/Lock/Portable/
   Interactable/OnUse/Toggle/Spawns/Knowledge) and evaluating it through
   @golem-engine/content's `evaluate()`; there is no per-NPC/per-item
   bespoke code anywhere in this file. Mirrors games/some-hero/shared/
   module.js's KernelCore split (deriveWorld/validate/reduce/observe/
   affordances/narrativeFacts, sim-and-inspect for derived events).

   ── THE "has_<item>" GENERIC FACT CONVENTION (the one non-obvious
   design decision this file makes) ──
   Every Lock.unlockCondition in the content pack that gates on
   possessing an item uses a fact literally named `has_<item's id
   suffix>` (door_back_door: "has_odd_key" -> entity:item_odd_key;
   door_front_door: "has_sparkling_fish" -> entity:item_sparkling_fish;
   door_basement_door: "has_basement_key" -> entity:item_basement_key;
   door_tower_door: "has_tower_key" -> entity:item_tower_key; the
   wizard's own Spawns.when: "has_rare_mushroom" ->
   entity:item_rare_mushroom). This is not a coincidence — it is
   DECISION-LOG.md's own framing ("unlockCondition re-expressed as
   'player holds that key'") applied UNIFORMLY, as one generic rule
   rather than four+ special cases: `factLookup` below resolves any
   fact matching `^has_(.+)$` to "does state.inventory contain
   entity:item_<suffix>", falling back to plain `state.facts`
   membership for every other fact (mushroom_insight/potion_insight/
   mutant/big_ol_hippy/wizard_gave_key/...). One evaluate() call site
   (this file's `factLookup`) therefore correctly gates EVERY Lock/
   OnUse.when/Spawns.when in the pack — keyed doors, the condition-only
   secret portal, and the wizard's inventory-gated handoff alike —
   without the Lock.key ref ever needing to be read for legality (it is
   still carried on `lockedBy.key` for a friendlier denial message, but
   evaluate()'s uniform factLookup is what actually decides passage,
   exactly as the design spec's "evaluate() against a factLookup over
   state.facts+inventory" phrasing describes). */
import { evaluate } from "@golem-engine/content";
import { reduce, createState, serializeState, toggleFactName, spawnedFact } from "./reducer.js";

export { reduce, createState, serializeState };

/** Recursively collect every literal `fact`/`cmp.fact` string appearing
 *  in a ConditionNode — used only to build `World.factUniverse` (the
 *  twin's closed-world "doesNotKnow" complement, @golem-engine/
 *  language's compileEnvelope). Not used for legality (evaluate()
 *  itself walks the tree for that); this is a one-time deriveWorld-time
 *  scan. */
function collectConditionFacts(node, out) {
  if (!node || typeof node !== "object") return;
  if ("fact" in node) {
    out.add(node.fact);
    return;
  }
  if ("not" in node) return collectConditionFacts(node.not, out);
  if ("all" in node) return node.all.forEach((c) => collectConditionFacts(c, out));
  if ("any" in node) return node.any.forEach((c) => collectConditionFacts(c, out));
  if ("cmp" in node) out.add(node.cmp.fact);
}

/** deriveWorld(worldState, pack) → World. `worldState` is accepted for
 *  signature parity with every other kernel-driven derive function in
 *  the monorepo (some-hero's deriveWorldFromPack(pack, worldState),
 *  golem-grid's own dun-from-seed) but is not read: the whole adventure
 *  world graph is static, pack-derived content (doctrine #1 — a pure
 *  function of the FROZEN pack, no per-session world-instance state
 *  exists for this game the way some-hero's {zone,floorNum,mapId}
 *  does). Pure, synchronous, no IO.

   Builds:
   - `rooms[region] = {name, description, exits:[{to, lockedBy?}],
     items:[id], npcs:[id]}` — one entry per room entity
     (RegionMembership present). `exits` starts from the room's own
     unlocked `Exits` (entityRef -> region, resolved via a first-pass
     entityId->region map) and gets a `lockedBy` entry pushed onto BOTH
     endpoints for every door entity (Lock+Exits present, NO
     RegionMembership — the structural test that distinguishes a door
     from a room). `items`/`npcs` are each room's INITIAL placement,
     read off its own `Contains.items`/`Contains.characters` — the
     pack's own item/character split, not a name-prefix guess.
   - `items`/`npcs` — id -> component data, for EVERY non-room,
     non-door entity in the pack (not just ones some room's Contains
     happens to reference — the wizard's odd key and the sarcophagus's
     rusty sword are spawn-only, per DECISION-LOG.md, and still need an
     entry here for SPAWNED/take/use to ever find them). An entity is
     classified "npc" if some room's Contains.characters names it, or
     (for the two never-placed spawn-only entities) if it carries a
     Knowledge component; everything else is an "item". This is a
     structural classification driven entirely by the pack's own
     Contains split — never a per-entity special case.
   - `factUniverse` — every literal fact string named anywhere
     (OnUse.setFact/clearFact/when, Spawns.when, Lock.unlockCondition,
     Knowledge.knows), sorted. Feeds the twin's closed-world complement
     only; never consulted by validate/affordances legality checks. */
export function deriveWorld(worldState, pack) {
  void worldState;

  const entityRegion = {};
  for (const [id, entity] of Object.entries(pack.entities)) {
    const rm = entity.components.RegionMembership;
    if (rm) entityRegion[id] = rm.region;
  }

  const rooms = {};
  let startRegion;
  for (const [id, entity] of Object.entries(pack.entities)) {
    const c = entity.components;
    if (!c.RegionMembership) continue;
    const region = c.RegionMembership.region;
    if (startRegion === undefined) startRegion = region; // first room in pack insertion order — the entry room
    const exits = (c.Exits || []).map((e) => ({ to: entityRegion[e.to.$ref] }));
    rooms[region] = {
      name: c.Identity && c.Identity.name,
      description: c.Identity && c.Identity.description,
      exits,
      items: (c.Contains && c.Contains.items ? c.Contains.items : []).map((r) => r.$ref),
      npcs: (c.Contains && c.Contains.characters ? c.Contains.characters : []).map((r) => r.$ref),
    };
  }
  if (startRegion === undefined) {
    throw new Error("deriveWorld: pack has no room entities (RegionMembership) to start in");
  }

  // Doors: Lock + Exits present, no RegionMembership. Bridges two rooms
  // that do NOT list each other in their own Exits (see content/
  // entities.mjs's own DOOR_DEFS header) — push a lockedBy exit onto
  // BOTH endpoints.
  for (const [id, entity] of Object.entries(pack.entities)) {
    const c = entity.components;
    if (c.RegionMembership || !c.Lock || !c.Exits) continue;
    const [a, b] = c.Exits;
    const regionA = entityRegion[a.to.$ref];
    const regionB = entityRegion[b.to.$ref];
    const lockedBy = {
      name: c.Identity && c.Identity.name,
      unlockCondition: c.Lock.unlockCondition,
      key: c.Lock.key ? c.Lock.key.$ref : undefined,
    };
    rooms[regionA].exits.push({ to: regionB, lockedBy });
    rooms[regionB].exits.push({ to: regionA, lockedBy });
  }

  // Which entities are placed as "items" vs "characters" by SOME room's
  // own Contains (the pack's own classification — see header).
  const placedKind = {};
  for (const room of Object.values(rooms)) {
    for (const itemId of room.items) placedKind[itemId] = "item";
    for (const npcId of room.npcs) placedKind[npcId] = "npc";
  }

  const items = {};
  const npcs = {};
  const factSet = new Set();

  for (const [id, entity] of Object.entries(pack.entities)) {
    const c = entity.components;
    if (c.RegionMembership) continue; // room, already handled
    if (c.Lock && c.Exits) continue; // door, already handled

    const kind = placedKind[id] || (c.Knowledge ? "npc" : "item");
    if (kind === "npc") {
      npcs[id] = {
        id,
        name: c.Identity && c.Identity.name,
        description: c.Identity && c.Identity.description,
        knowledge: { knows: c.Knowledge && c.Knowledge.knows ? [...c.Knowledge.knows] : [] },
        interactable: c.Interactable || null,
        spawns: c.Spawns || null,
      };
      if (c.Knowledge && c.Knowledge.knows) for (const k of c.Knowledge.knows) factSet.add(k);
    } else {
      items[id] = {
        id,
        name: c.Identity && c.Identity.name,
        description: c.Identity && c.Identity.description,
        portable: !!c.Portable,
        interactable: c.Interactable || null,
        onUse: c.OnUse || null,
        toggle: c.Toggle || null,
        spawns: c.Spawns || null,
        itemStats: c.ItemStats || null,
      };
    }

    if (c.OnUse) {
      if (c.OnUse.setFact) factSet.add(c.OnUse.setFact);
      if (c.OnUse.clearFact) factSet.add(c.OnUse.clearFact);
      if (c.OnUse.when) collectConditionFacts(c.OnUse.when, factSet);
    }
    if (c.Spawns && c.Spawns.when) collectConditionFacts(c.Spawns.when, factSet);
  }

  // Door lock conditions also feed the universe (e.g. "has_tower_key").
  for (const entity of Object.values(pack.entities)) {
    const lock = entity.components.Lock;
    if (lock && lock.unlockCondition) collectConditionFacts(lock.unlockCondition, factSet);
  }

  return { startRegion, rooms, items, npcs, factUniverse: [...factSet].sort() };
}

/** The generic `has_<item>` + plain-fact FactLookup — see this file's
 *  header. Shared by every evaluate() call site below (go/take/use/
 *  talk), so there is exactly one place that knows this convention. */
const HAS_ITEM_FACT = /^has_(.+)$/;
function factLookup(state, world) {
  return (fact) => {
    if (state.facts.includes(fact)) return true;
    // fact.match(HAS_ITEM_FACT), rather than the RegExp method whose
    // name collides with this package's own local no-dynamic-code
    // scanner's conservative ban list (tests/no-dynamic-code.test.js) —
    // same result, no scanner false positive.
    const m = fact.match(HAS_ITEM_FACT);
    if (m) {
      const itemId = `entity:item_${m[1]}`;
      if (world.items[itemId]) return state.inventory.includes(itemId);
    }
    return false;
  };
}

/** True once `entity` has already spawned — its `spawned_<entity>` guard
 *  fact (set by reducer.js's SPAWNED case) is in state.facts. `spawnedFact`
 *  lives in reducer.js (imported above) so validate + reduce can't drift
 *  on the key format. */
function hasSpawned(state, entity) {
  return state.facts.includes(spawnedFact(entity));
}

/** Sim-and-inspect: fold `events` through a throwaway reduce() (seq-
 *  incrementing from `state.seq`), returning the resulting simulated
 *  State without touching the real one — same idiom games/some-hero/
 *  shared/module.js's own foldThrough uses for its derived-event
 *  checks (here: has a Spawns.when condition become true AFTER this
 *  USED/TOGGLED event lands?). */
function foldThrough(state, world, events) {
  let sim = state;
  let seq = state.seq;
  for (const ev of events) sim = reduce(sim, world, { ...ev, seq: ++seq });
  return sim;
}

function isReachable(state, region, id) {
  return state.inventory.includes(id) || (state.roomItems[region] || []).includes(id);
}

/** validate(ctx, cmd) → Event[] | Denial. `ctx = {state, world}`; `cmd =
 *  {verb, noun}` where `noun` is already a RESOLVED entity/region id
 *  (the terminal client's job is grounding free text to this id — see
 *  packages/clients/src/terminal.js). Six verbs, every one driven
 *  purely by pack component data:
 *    go    — Exits (+ Lock via factLookup/evaluate())
 *    take  — Portable (+ Interactable.enabledWhen, if present)
 *    drop  — inverse of take, no component gate
 *    use   — OnUse | Toggle | bare Interactable, + Spawns.when
 *    look  — no-op (the client renders observe())
 *    talk  — any npc present (+ that npc's own Spawns.when, same as
 *            an item's `use`) */
export function validate(ctx, cmd) {
  const { state, world } = ctx;
  const { verb, noun } = cmd || {};
  const room = world.rooms[state.region];
  if (!room) return { deny: `You are nowhere. (unknown region "${state.region}")` };

  switch (verb) {
    case "go": {
      const exit = room.exits.find((e) => e.to === noun);
      if (!exit) return { deny: `You can't go that way from here.` };
      if (exit.lockedBy) {
        const passed = evaluate(exit.lockedBy.unlockCondition, factLookup(state, world));
        if (!passed) return { deny: `The ${exit.lockedBy.name} is locked.` };
      }
      return [{ t: "MOVED", to: exit.to }];
    }

    case "take": {
      const item = world.items[noun];
      if (!item || !(state.roomItems[state.region] || []).includes(noun)) {
        return { deny: `There's nothing like that here to take.` };
      }
      if (!item.portable) return { deny: `You can't take the ${item.name}.` };
      if (item.interactable && item.interactable.enabledWhen) {
        const passed = evaluate(item.interactable.enabledWhen, factLookup(state, world));
        if (!passed) return { deny: `The ${item.name} is beyond your reach for now.` };
      }
      return [{ t: "TOOK", item: noun }];
    }

    case "drop": {
      const item = world.items[noun];
      if (!item || !state.inventory.includes(noun)) {
        return { deny: `You aren't carrying anything like that.` };
      }
      return [{ t: "DROPPED", item: noun }];
    }

    case "use": {
      const item = world.items[noun];
      if (!item || !isReachable(state, state.region, noun)) {
        return { deny: `You don't have access to anything like that here.` };
      }
      const fl = factLookup(state, world);
      if (item.interactable && item.interactable.enabledWhen && !evaluate(item.interactable.enabledWhen, fl)) {
        return { deny: `Nothing happens — not yet, anyway.` };
      }

      const events = [];
      if (item.onUse) {
        const gateOk = !item.onUse.when || evaluate(item.onUse.when, fl);
        events.push({
          t: "USED",
          item: noun,
          ...(gateOk && item.onUse.setFact ? { setFact: item.onUse.setFact } : {}),
          ...(gateOk && item.onUse.clearFact ? { clearFact: item.onUse.clearFact } : {}),
        });
      } else if (item.toggle) {
        const isOn = state.facts.includes(toggleFactName(noun));
        events.push({ t: "TOGGLED", item: noun, on: !isOn });
      } else {
        events.push({ t: "USED", item: noun });
      }

      if (item.spawns) {
        const sim = foldThrough(state, world, events);
        const spawnEntity = item.spawns.entity.$ref || item.spawns.entity;
        // Fire at most ONCE: a `spawned_<id>` guard fact (set by the
        // SPAWNED reducer) makes the spawn idempotent. The room-membership
        // check alone was insufficient — a spawned item the player then
        // TOOK left the room, re-enabling the spawn (unbounded duplication;
        // adversarial-review BLOCKER). Generic, so it doesn't depend on the
        // content's own (dead) guard facts like `wizard_gave_key`.
        if (!hasSpawned(sim, spawnEntity) && evaluate(item.spawns.when, factLookup(sim, world))) {
          events.push({ t: "SPAWNED", entity: spawnEntity, region: sim.region });
        }
      }
      return events;
    }

    case "look":
      return [];

    case "talk": {
      const npc = world.npcs[noun];
      if (!npc || !(room.npcs || []).includes(noun)) {
        return { deny: `There's no one like that here to talk to.` };
      }
      const events = [];
      if (npc.spawns) {
        const fl = factLookup(state, world);
        const spawnEntity = npc.spawns.entity.$ref || npc.spawns.entity;
        // Fire at most ONCE (see the `use` handler's spawn note) — without
        // this, talking to the wizard again after pocketing the odd key
        // spawned a duplicate every time (the `wizard_gave_key` guard the
        // content's `not` clause expects is never set anywhere).
        if (!hasSpawned(state, spawnEntity) && evaluate(npc.spawns.when, fl)) {
          events.push({ t: "SPAWNED", entity: spawnEntity, region: state.region });
        }
      }
      return events;
    }

    default:
      return { deny: `You don't know how to "${verb}".` };
  }
}

/** observe(state, world) → Obs. Full-visibility (no fog — like
 *  some-hero's own observe()): `{region, description, items:[{id,
 *  name}], exits:[{to,locked}], npcs:[{id,name}], inventory:[{id,
 *  name}]}`. `viewer` is not part of this signature — adventure has
 *  exactly one embodiment, same "present only where it matters"
 *  posture some-hero's own single-actor observe() takes (no unused
 *  viewer param invented here just for shape parity). */
export function observe(state, world) {
  const room = world.rooms[state.region];
  const fl = factLookup(state, world);
  return {
    region: state.region,
    description: room.description,
    items: (state.roomItems[state.region] || []).map((id) => ({ id, name: world.items[id] && world.items[id].name })),
    exits: room.exits.map((e) => ({
      to: e.to,
      name: world.rooms[e.to] && world.rooms[e.to].name,
      locked: !!e.lockedBy && !evaluate(e.lockedBy.unlockCondition, fl),
    })),
    npcs: (room.npcs || []).map((id) => ({ id, name: world.npcs[id] && world.npcs[id].name })),
    inventory: state.inventory.map((id) => ({ id, name: world.items[id] && world.items[id].name })),
  };
}

/** affordances(observation, actor) → Affordance[] (A1 canonical shape:
 *  {verb,target,name,enabled,reason?}). `observation = {state, world}`
 *  — the ctx shape validate() itself takes, NOT observe()'s flattened
 *  per-viewer Obs (same divergence some-hero's own affordances()
 *  documents: Obs doesn't carry enough component data — Interactable
 *  verbs/enabledWhen, Lock conditions — to build a real legal-verb
 *  menu from). `actor` is accepted for signature parity but unused
 *  (adventure has one embodiment). One affordance per current-room
 *  item (its own Interactable.verb, or "take" for a bare Portable; a
 *  portable item that ALSO has its own interactable verb — e.g. the
 *  dusty lantern's "light" — gets both), one per exit ("go", enabled
 *  via the same Lock/evaluate() check `go` itself uses), one per npc
 *  present ("talk"). */
export function affordances(observation, actor) {
  void actor;
  const { state, world } = observation;
  const room = world.rooms[state.region];
  const fl = factLookup(state, world);
  const out = [];

  for (const id of state.roomItems[state.region] || []) {
    const item = world.items[id];
    if (!item) continue;
    const verb = item.interactable ? item.interactable.verb : item.portable ? "take" : null;
    if (verb) {
      let enabled = true;
      let reason;
      if (item.interactable && item.interactable.enabledWhen && !evaluate(item.interactable.enabledWhen, fl)) {
        enabled = false;
        reason = `Not yet — something's missing.`;
      }
      out.push({ verb, target: id, name: item.name, enabled, ...(reason ? { reason } : {}) });
    }
    if (item.portable && verb !== "take") {
      // The auto-added "take" for a Portable item whose own Interactable
      // verb is something else (e.g. the fish's "catch") must still honor
      // enabledWhen — validate()'s real `take` handler gates on it, so an
      // unconditionally-enabled affordance here mis-reports an illegal
      // action (adversarial-review find: fed false "can-take" signals to
      // nextHint/affordancesToFacts/terminal).
      let takeEnabled = true;
      let takeReason;
      if (item.interactable && item.interactable.enabledWhen && !evaluate(item.interactable.enabledWhen, fl)) {
        takeEnabled = false;
        takeReason = `Not yet — something's missing.`;
      }
      out.push({ verb: "take", target: id, name: item.name, enabled: takeEnabled, ...(takeReason ? { reason: takeReason } : {}) });
    }
  }

  for (const exit of room.exits) {
    let enabled = true;
    let reason;
    if (exit.lockedBy) {
      enabled = evaluate(exit.lockedBy.unlockCondition, fl);
      if (!enabled) reason = `The ${exit.lockedBy.name} is locked.`;
    }
    const target = world.rooms[exit.to];
    out.push({ verb: "go", target: exit.to, name: (target && target.name) || exit.to, enabled, ...(reason ? { reason } : {}) });
  }

  for (const id of room.npcs || []) {
    const npc = world.npcs[id];
    if (!npc) continue;
    out.push({ verb: "talk", target: id, name: npc.name, enabled: true });
  }

  return out;
}

/** narrativeFacts(state, world, event) → Facts | null. Facts only
 *  (doctrine #4/VISION law 5) — never prose. `state` is the PRE-event
 *  state (same convention as some-hero's own narrativeFacts). */
export function narrativeFacts(state, world, event) {
  void state;
  void world;
  switch (event.t) {
    case "MOVED":
      return { kind: "moved", to: event.to };
    case "TOOK":
      return { kind: "took", item: event.item };
    case "DROPPED":
      return { kind: "dropped", item: event.item };
    case "USED":
      return { kind: "used", item: event.item, setFact: event.setFact, clearFact: event.clearFact };
    case "TOGGLED":
      return { kind: "toggled", item: event.item, on: event.on };
    case "SPAWNED":
      return { kind: "spawned", entity: event.entity, region: event.region };
    default:
      return null;
  }
}

/** The full adventure GameModule — the six hooks @golem-engine/kernel's
 *  GameModule interface names (see packages/kernel/src/index.ts). */
export const module = { deriveWorld, validate, reduce, observe, affordances, narrativeFacts };
