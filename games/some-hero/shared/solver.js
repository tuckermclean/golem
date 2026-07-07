/* ── SOLVER — S3 PR5 reachability/connectivity checker (design spec:
   docs/superpowers/specs/2026-07-07-s3-pr5-fuzz-solver-design.md).
   Mirrors games/golem-grid/shared/solver.js in size/ambition: ONE BFS
   plus a small set of checks. This is NOT a search-based solver (no
   combat/economy/credentials simulation, no path-planning around
   enemies) — it answers "is every gate-relevant tile reachable from
   spawn, and does the generator's own connected-floor invariant hold?"
   Pure; no Math.random/Date.now/eval; imports nothing from legacy/.

   Operates directly on games/some-hero/shared/floorgen.js's
   `generateFloor(seed, floorNum)` output — no deriveWorld needed (S3
   PR5's DoD). ─────────────────────────────────────────────────────── */

function key(x, y) {
  return `${x},${y}`;
}

/**
 * 4-directional BFS over a floor's walkable tiles.
 *
 * A tile is walkable iff it is in-bounds (`0 <= x < gridW`,
 * `0 <= y < gridH`) and not in `floor.walls` (a Set of `"x,y"` keys —
 * see shared/floorgen.js's `cellKey`/`walls` construction).
 *
 * @param {{gridW:number,gridH:number,walls:Set<string>}} floor
 * @param {{x:number,y:number}} from BFS origin (must itself be walkable)
 * @returns {Map<string,number>} tile-key -> distance-from-`from`, for
 *   every tile reached. Tiles not present in the map are unreached
 *   (unreachable, or the tile itself is a wall).
 */
export function bfs(floor, from) {
  const { gridW, gridH, walls } = floor;
  const dist = new Map();
  const startKey = key(from.x, from.y);
  dist.set(startKey, 0);
  const queue = [[from.x, from.y]];
  let head = 0;
  while (head < queue.length) {
    const [cx, cy] = queue[head++];
    const d = dist.get(key(cx, cy));
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
      const k = key(nx, ny);
      if (walls.has(k) || dist.has(k)) continue;
      dist.set(k, d + 1);
      queue.push([nx, ny]);
    }
  }
  return dist;
}

/**
 * Reachability/connectivity check for one generated floor.
 *
 * Checks, in order (first failure wins — `reason` localizes it):
 *   1. Connectivity: BFS from `floor.spawn` reaches `floor.stairsAt`,
 *      every `floor.rooms[i]` center, and every `floor.pinnedRooms[i]`
 *      center (the "always connected" invariant floorgen.js's corridor
 *      chain is supposed to guarantee).
 *   2. No stairs in a pinned room: `floor.stairsAt` does not fall inside
 *      any `floor.pinnedRooms[i]` bounding box (floorgen.js:72's
 *      "pinned rooms hold story content, not stairs" rule, mirrored by
 *      @golem-engine/world's `featureEligibleRooms`).
 *   3. Seal-gate reachability, keyed off `floor.puzzle.type`, for
 *      whatever exact gating positions `generateFloor`'s output exposes:
 *        - "key": every `pickups` entry with `kind: "key"`.
 *        - "plates": every `puzzle.plates[i]` and its pushable
 *          `puzzle.blocks[i]`.
 *        - "traps": every `puzzle.traps[i]`.
 *        - "torch": every `puzzle.torches[i]`.
 *        - "warden" / "final": the boss tile (`floor.boss.{x,y}`).
 *        - "riddle": no gating tile exists in the generator's output
 *          (a riddle is answered, not walked to) — connectivity (check
 *          1, spawn -> exit) is the sound winnability proxy here, per
 *          the design spec's ruling. Documented, not an oversight.
 *
 * @param {object} floor a games/some-hero/shared/floorgen.js `generateFloor` result
 * @returns {{winnable:boolean, reason?:string}}
 */
export function solve(floor) {
  const dist = bfs(floor, floor.spawn);
  const reached = (x, y) => dist.has(key(x, y));

  // 1. Connectivity: exit + every room/pinned-room center.
  if (!reached(floor.stairsAt.x, floor.stairsAt.y)) {
    return {
      winnable: false,
      reason: `stairsAt (${floor.stairsAt.x},${floor.stairsAt.y}) is unreachable from spawn (${floor.spawn.x},${floor.spawn.y})`,
    };
  }
  for (const r of floor.rooms) {
    if (!reached(r.cx, r.cy)) {
      return { winnable: false, reason: `room center (${r.cx},${r.cy}) is unreachable from spawn` };
    }
  }
  for (const pr of floor.pinnedRooms) {
    if (!reached(pr.cx, pr.cy)) {
      return {
        winnable: false,
        reason: `pinned room "${pr.tag}" center (${pr.cx},${pr.cy}) is unreachable from spawn`,
      };
    }
  }

  // 2. No stairs inside any pinned-room bbox.
  for (const pr of floor.pinnedRooms) {
    const insideX = floor.stairsAt.x >= pr.x && floor.stairsAt.x < pr.x + pr.w;
    const insideY = floor.stairsAt.y >= pr.y && floor.stairsAt.y < pr.y + pr.h;
    if (insideX && insideY) {
      return {
        winnable: false,
        reason: `stairsAt (${floor.stairsAt.x},${floor.stairsAt.y}) falls inside pinned room "${pr.tag}"`,
      };
    }
  }

  // 3. Seal-gate reachability, per puzzle.type (whatever exact gating
  // positions the floor exposes; connectivity above is the proxy where
  // it doesn't).
  const puzzle = floor.puzzle;
  if (puzzle) {
    switch (puzzle.type) {
      case "key": {
        for (const pk of floor.pickups) {
          if (pk.kind !== "key") continue;
          if (!reached(pk.x, pk.y)) {
            return { winnable: false, reason: `key pickup (${pk.x},${pk.y}) is unreachable from spawn` };
          }
        }
        break;
      }
      case "plates": {
        for (const plate of puzzle.plates || []) {
          if (!reached(plate.x, plate.y)) {
            return { winnable: false, reason: `plate (${plate.x},${plate.y}) is unreachable from spawn` };
          }
        }
        for (const block of puzzle.blocks || []) {
          if (!reached(block.x, block.y)) {
            return { winnable: false, reason: `plate block (${block.x},${block.y}) is unreachable from spawn` };
          }
        }
        break;
      }
      case "traps": {
        for (const trap of puzzle.traps || []) {
          if (!reached(trap.x, trap.y)) {
            return { winnable: false, reason: `trap (${trap.x},${trap.y}) is unreachable from spawn` };
          }
        }
        break;
      }
      case "torch": {
        for (const torch of puzzle.torches || []) {
          if (!reached(torch.x, torch.y)) {
            return { winnable: false, reason: `torch (${torch.x},${torch.y}) is unreachable from spawn` };
          }
        }
        break;
      }
      case "warden":
      case "final": {
        if (floor.boss && !reached(floor.boss.x, floor.boss.y)) {
          return { winnable: false, reason: `boss (${floor.boss.x},${floor.boss.y}) is unreachable from spawn` };
        }
        break;
      }
      case "riddle":
      default:
        // No gating tile in the generator's output for "riddle" (or any
        // future puzzle kind this switch doesn't yet know) — connectivity
        // (check 1) is the sound proxy, per the design spec's ruling.
        break;
    }
  }

  return { winnable: true };
}
