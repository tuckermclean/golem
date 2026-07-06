/* ── LANGUAGE ADAPTER (L1): the golem-grid-specific glue between the
 * game-agnostic @golem-engine/language parser and this game's actual
 * wire grammar (games/golem-grid/shared/module.js's `validate`) /
 * client-local golem prose (`lookAt`, main.js's ▶GOLEM-PLUG◀). See
 * docs/superpowers/specs/2026-07-06-l1-language-parser-design.md for
 * the full design — this file implements its "Output shape" and
 * "Wiring into golem-grid chat" sections.
 *
 * `computeAffordances(S, x, y)` is a DOM-free generalization of
 * src/input.js's inline handleTap affordance-building (itemAt/
 * dun.lore/prizeCarrier) — same reducer functions, same reach rules,
 * factored out so it can also run for the chat path (the player's own
 * tile) and not only a clicked tile. Per the design's decision #5, the
 * caller (input.js) always calls this with the PLAYER'S OWN (x, y) —
 * reach is therefore restricted to same-tile (take/prize, matching
 * module.js's `take` which only ever acts on the actor's own tile) and
 * the same 3x3 neighborhood `read` already auto-detects lore in
 * (matching module.js's `read` adjacency check exactly). No behavior
 * change to the existing click menu: handleTap still builds its own
 * action list inline, untouched.
 *
 * `target` is deliberately verb-specific and opaque (per the Affordance
 * interface's own contract — "the caller hands back to itself"):
 *   - take/prize affordances use the item/prize NAME, because
 *     module.js's wire `take <item>` only ever needs a bare substring,
 *     never coordinates.
 *   - look affordances use the tile's own "x,y" coordinate key, because
 *     `look` has no wire command at all (doctrine #4/#10 — perception
 *     is client-local) and `lookAt(x,y)` narrates whatever is AT a
 *     specific tile; grounding a look target one tile away (e.g. lore
 *     in the 3x3 neighborhood, not necessarily the player's exact tile)
 *     must still be able to point `lookAt` at THAT tile, not just the
 *     player's own. dispatchIntent (below) parses this back out. */
import { itemAt, prizeCarrier } from "../shared/reducer.js";

const COORD_RE = /^(-?\d+),(-?\d+)$/;

export function computeAffordances(S, x, y) {
  if (!S.dun) return [];
  const out = [];

  const it = itemAt(S.st, S.dun, x, y);
  if (it) {
    out.push({ verb: "take", target: it, name: it });
    out.push({ verb: "look", target: `${x},${y}`, name: it });
  }

  if (!prizeCarrier(S.st) && S.dun.prize.x === x && S.dun.prize.y === y) {
    const prizeName = S.dun.T.prize; // e.g. "the Quiet Bell"
    const bare = prizeName.replace(/^the\s+/i, ""); // "Quiet Bell", for a name-only grounding hit
    out.push({ verb: "take", target: prizeName, name: prizeName, aliases: [bare] });
    out.push({ verb: "look", target: `${x},${y}`, name: prizeName, aliases: [bare] });
  }

  // read's own 3x3-neighborhood reach (module.js: Math.abs(lx-p.x)<=1 &&
  // Math.abs(ly-p.y)<=1) — mirrored here for `look`'s grounding only;
  // `read` itself never grounds (see @golem-engine/language's parse.ts).
  for (const [k] of S.dun.lore) {
    const [lx, ly] = k.split(",").map(Number);
    if (Math.abs(lx - x) <= 1 && Math.abs(ly - y) <= 1) {
      out.push({
        verb: "look",
        target: `${lx},${ly}`,
        name: "inscription",
        aliases: ["sign", "writing", "stone"],
      });
    }
  }

  return out;
}

/** toCommand(intent): the switch from the design doc's "Output shape"
 * section, byte-identical in spirit — `look` has no wire command
 * (returns null; the caller handles it locally via lookAt). */
export function toCommand(intent) {
  switch (intent.type) {
    case "move":
      return `move ${intent.dx} ${intent.dy}`;
    case "take":
      return intent.item ? `take ${intent.item}` : "take";
    case "read":
      return "read";
    case "say":
      return `say ${intent.text}`;
    case "party":
      return `party ${intent.text}`;
    case "whisper":
      return `whisper ${intent.to} ${intent.text}`;
    case "emote":
      return `emote ${intent.text}`;
    case "look":
      return null;
    default:
      return null;
  }
}

/** dispatchIntent(intent, deps) -> sendCmd(toCommand(...)) for every
 * wire-backed intent, or lookAt(...) for "look" (client-local, never
 * touches the wire — doctrine #4/#10). `deps` = { sendCmd, lookAt, me }
 * where `me` is the actor's own { x, y } (used when a bare "look" has
 * no grounded target to fall back on). */
export function dispatchIntent(intent, deps) {
  const { sendCmd, lookAt, me } = deps;
  const cmd = toCommand(intent);
  if (cmd !== null) return sendCmd(cmd);
  const m = intent.target && COORD_RE.exec(intent.target);
  const [lx, ly] = m ? [Number(m[1]), Number(m[2])] : [me && me.x, me && me.y];
  return lookAt(lx, ly);
}
