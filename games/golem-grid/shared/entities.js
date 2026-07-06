/* ── ENTITIES — a pure, read-only entity/component overlay over
   golem-grid's existing delta map (`st.D`) and world (`dun`). DELTA
   C3's "the golem-grid re-expression": players/items/prize become
   `Entity { id, components }` values (the same shape as
   @golem-engine/kernel's `Entity<C>` / @golem-engine/content's
   `EntityDef`), computed on demand — never stored in `st`, never
   consulted by `reduce`/`applyEvent`/`validate`/`serializeState`. This
   module is not in any of their call graphs (see
   games/golem-grid/tests/entities-not-in-callgraph.test.js and
   docs/superpowers/specs/2026-07-06-c3-entities-components-design.md,
   "The byte-identity argument"), so its addition cannot change
   `serializeState`'s bytes or any frozen fixture's finalHash.

   Plain ESM JS, no TS build step (games/ may use plain JS per DELTA
   §0.3) — no runtime import of @golem-engine/content, no DOM, no
   network. Reuses reducer.js's existing exports (players/getP/
   prizeCarrier/itemAt) rather than re-deriving their logic. ───────── */
import { players, getP, prizeCarrier, itemAt } from "./reducer.js";

/** state + dungeon -> Entity[]. Pure w.r.t. its two arguments: same
 *  (state, dungeon) in => same entities out. Builds fresh object
 *  literals every call; nothing here mutates `state` or `dungeon`. */
export function entitiesOf(state, dungeon) {
  const out = [];

  for (const p of players(state)) {
    out.push({
      id: "entity:player:" + p.id,
      components: {
        Identity: { name: p.name },
        GridPosition: { x: p.x, y: p.y },
        Inventory: { items: [...p.inv] },
        Actor: { controlledBy: "player" },
      },
    });
  }

  for (const key of dungeon.items.keys()) {
    const [xs, ys] = key.split(",");
    const x = Number(xs), y = Number(ys);
    const name = itemAt(state, dungeon, x, y); // null if taken
    if (name === null) continue;
    out.push({
      id: "entity:item:" + key,
      components: {
        Identity: { name },
        GridPosition: { x, y },
        Portable: {},
      },
    });
  }

  const carrierId = prizeCarrier(state);
  const carrier = carrierId ? getP(state, carrierId) : null;
  const prizePos = carrier ? { x: carrier.x, y: carrier.y } : { x: dungeon.prize.x, y: dungeon.prize.y };
  out.push({
    id: "entity:prize",
    components: {
      Identity: { name: "prize" },
      Portable: {},
      GridPosition: prizePos,
    },
  });

  return out;
}
