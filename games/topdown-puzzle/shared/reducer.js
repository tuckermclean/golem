/* ── REDUCER: deterministic, identity-blind pure fold for topdown-puzzle's
   kernel port (DELTA C4 PR1 — see docs/superpowers/specs/
   2026-07-06-c4-topdown-port-design.md). Mirrors games/golem-grid/shared/
   reducer.js's discipline exactly: fresh Map, copied entity objects on
   write, no mutation of the state/world handed in, and `seq` always set
   from the event's own `seq` field (validate never stamps it — that's a
   host-adapter concern, PR3's src/host.js).

   Entities ARE topdown-puzzle's real state representation here (the
   design doc's "structural decision #2"): no parallel stringly-keyed
   delta map the way golem-grid's `st.D` is — walls and memory holes never
   change, so they live in `world`, not `state`, exactly mirroring
   golem-grid's own dun.grid/st.D split. ─────────────────────────────── */

export function createState() {
  return {
    entities: new Map(),
    diamondsRemaining: 0,
    tick: 0,
    seq: 0,
    over: false,
    outcome: null,
  };
}

/** The single, fixed-id player entity — see shared/module.js's
 *  deriveWorld for where "entity:player" is assigned. */
export function player(state) {
  return state.entities.get("entity:player");
}

/** Linear scan — fine at this puzzle's scale (a level never has more than
 *  a few dozen entities). Returns the first entity whose GridPosition
 *  matches (x, y), or undefined. topdown-puzzle's push-chain code (see
 *  shared/push.js) only ever looks for block/diamond/moving_block
 *  occupants this way; baddies are deliberately excluded from that
 *  filter, never from this generic accessor. */
export function entityAt(state, x, y) {
  for (const e of state.entities.values()) {
    const pos = e.components.GridPosition;
    if (pos && pos.x === x && pos.y === y) return e;
  }
  return undefined;
}

function cloneEntity(e) {
  const components = {};
  for (const [name, data] of Object.entries(e.components)) {
    components[name] = data && typeof data === "object" ? { ...data } : data;
  }
  return { id: e.id, components };
}

/* Pure fold: (state, world, event) → a NEW state. No mutation of `state`
   or `world` — a fresh Map, copied entity objects on write. One case per
   event kind, each a pure "copy these resulting fields onto that entity"
   fold (design doc's `reduce(state, world, event)` table) — this is
   games/topdown-puzzle's KernelCore.reduce (see shared/module.js).
   TICK_ADVANCED / HURT are PR2 additions (shared/tick.js's resolveTick
   is their only producer). */
export function reduce(state, world, ev) {
  switch (ev.t) {
    case "LEVEL_LOADED": {
      const entities = new Map();
      for (const e of world.initialEntities) entities.set(e.id, cloneEntity(e));
      return {
        entities,
        diamondsRemaining: world.diamondTotal,
        tick: 0,
        seq: ev.seq,
        over: false,
        outcome: null,
      };
    }
    case "MOVED": {
      const entities = new Map(state.entities);
      const e = entities.get(ev.id);
      if (e) {
        const next = cloneEntity(e);
        next.components.GridPosition = { x: ev.x, y: ev.y };
        if (ev.moveDir !== undefined) {
          next.components.Actor = { ...next.components.Actor, moveDir: ev.moveDir };
        }
        entities.set(ev.id, next);
      }
      return { ...state, entities, seq: ev.seq };
    }
    case "COLLECTED": {
      const entities = new Map(state.entities);
      entities.delete(ev.id);
      return { ...state, entities, diamondsRemaining: state.diamondsRemaining - 1, seq: ev.seq };
    }
    case "DESTROYED": {
      const entities = new Map(state.entities);
      const e = entities.get(ev.id);
      entities.delete(ev.id);
      const wasCollectible = !!(e && e.components.Actor && e.components.Actor.collectible);
      return {
        ...state,
        entities,
        diamondsRemaining: state.diamondsRemaining - (wasCollectible ? 1 : 0),
        seq: ev.seq,
      };
    }
    case "HURT": {
      const entities = new Map(state.entities);
      const e = entities.get(ev.id);
      if (e) {
        const next = cloneEntity(e);
        next.components.Health = { ...next.components.Health, hp: ev.hp };
        entities.set(ev.id, next);
      }
      return { ...state, entities, seq: ev.seq };
    }
    case "TICK_ADVANCED":
      return { ...state, tick: ev.tick, seq: ev.seq };
    case "WIN":
      return { ...state, over: true, outcome: "WIN", seq: ev.seq };
    case "LOSE":
      return { ...state, over: true, outcome: "LOSE", seq: ev.seq };
    default:
      return { ...state, seq: ev.seq };
  }
}

/* Canonical byte-form of state — replay/fixture tests hash this. Mirrors
   games/golem-grid/shared/reducer.js's serializeState exactly: an
   explicit sort by entity id (Map insertion order is otherwise the only
   alternative, which the design doc does not promise is comparably
   stable across independent deriveWorld() calls, so this sorts rather
   than relying on it). */
export function serializeState(state) {
  return JSON.stringify({
    entities: [...state.entities.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    diamondsRemaining: state.diamondsRemaining,
    tick: state.tick,
    seq: state.seq,
    over: state.over,
    outcome: state.outcome,
  });
}
