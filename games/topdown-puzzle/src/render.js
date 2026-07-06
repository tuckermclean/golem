/* ── RENDER: Canvas 2D, NO Phaser import anywhere (design doc's "Thin
   client" section — checkable the same way tools/check-bans.mjs checks
   other bans). Per-frame render reads `state.entities` directly — no
   tweening, no interpolation: entities snap to grid cells. This is
   deliberate, not a placeholder for future animation, and it is what
   makes `prefers-reduced-motion` trivially satisfied — there is no
   motion to reduce. `reducedMotion` is still read explicitly below (per
   the doctrine's "respect prefers-reduced-motion in every effect"
   bullet), even though nothing here branches on it today, so the intent
   is documented in code rather than only in this comment. ──────────── */
const TILE = 24;

// Flat colors keyed off Actor.kind — no textures/sprites, no Phaser.
const COLORS = {
  wall: "#3a3a44",
  memory_hole: "#000000",
  floor: "#181820",
  block: "#8a5a2b",
  diamond: "#39c6c2",
  player: "#f2d43a",
  baddie: "#e0432f",
  moving_block: "#d98a2b",
};

const GLYPHS = {
  player: "@",
  baddie: "x",
  block: "#",
  diamond: "*",
  moving_block: "#",
};

// Facing deltas, shared with shared/tick.js's own FACING_DELTA (N/S/E/W).
const FACING_ARROW = { N: "↑", S: "↓", E: "→", W: "←" };

function baddieFacing(actor) {
  if (actor.axis === "horizontal") return actor.moveDir > 0 ? "E" : "W";
  return actor.moveDir > 0 ? "S" : "N";
}

export function createRenderer(S, deps) {
  const { canvas } = deps;
  const ctx = canvas.getContext("2d");

  // Read once — this app never animates around a light/tween timer, so
  // there's no per-frame branch needed; captured for the doctrine's
  // explicit-handling bullet and in case a future effect needs it.
  const reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function sizeCanvas(world) {
    canvas.width = world.cols * TILE;
    canvas.height = world.rows * TILE;
  }

  function drawTile(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
  }

  function drawGlyph(x, y, ch, color) {
    ctx.fillStyle = color;
    ctx.font = `${TILE - 6}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, x * TILE + TILE / 2, y * TILE + TILE / 2 + 1);
  }

  function drawArrow(x, y, dir, color) {
    const ch = FACING_ARROW[dir];
    if (!ch) return;
    ctx.fillStyle = color;
    ctx.font = `${Math.floor(TILE * 0.55)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, x * TILE + TILE - 7, y * TILE + 7);
  }

  function draw(world, state) {
    if (!world) return;
    // Static geometry first (never in state.entities — mirrors
    // golem-grid's dun.grid/st.D split): floor everywhere, then walls
    // and memory holes on top.
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const key of world.walls) {
      const [x, y] = key.split(",").map(Number);
      drawTile(x, y, COLORS.wall);
    }
    for (const key of world.memoryHoles) {
      const [x, y] = key.split(",").map(Number);
      drawTile(x, y, COLORS.memory_hole);
      drawGlyph(x, y, "o", "#5a2fae");
    }

    // Mutable entities, keyed off Actor.kind — flat rect + glyph, plus a
    // facing arrow for movers/baddies.
    for (const e of state.entities.values()) {
      const actor = e.components.Actor;
      if (!actor) continue;
      const pos = e.components.GridPosition;
      if (!pos) continue;
      const color = COLORS[actor.kind] || "#ffffff";
      drawTile(pos.x, pos.y, color);
      const glyph = GLYPHS[actor.kind];
      if (glyph) drawGlyph(pos.x, pos.y, glyph, "#0b0b0f");
      if (actor.kind === "moving_block" && actor.facing) {
        drawArrow(pos.x, pos.y, actor.facing, "#0b0b0f");
      }
      if (actor.kind === "baddie") {
        drawArrow(pos.x, pos.y, baddieFacing(actor), "#0b0b0f");
      }
    }
  }

  function statusText(world, state) {
    const p = state.entities.get("entity:player");
    const hp = p && p.components.Health ? p.components.Health.hp : "-";
    let banner = "";
    if (state.over) banner = state.outcome === "WIN" ? "WIN" : "LOSE";
    return {
      hp,
      diamondsRemaining: state.diamondsRemaining,
      tick: state.tick,
      banner,
    };
  }

  function updateStatusBar(world, state, els) {
    const s = statusText(world, state);
    if (els.hp) els.hp.textContent = String(s.hp);
    if (els.diamonds) els.diamonds.textContent = String(s.diamondsRemaining);
    if (els.tick) els.tick.textContent = String(s.tick);
    if (els.banner) {
      els.banner.textContent = s.banner;
      els.banner.style.display = s.banner ? "flex" : "none";
      els.banner.className = "banner " + (s.banner === "WIN" ? "win" : s.banner === "LOSE" ? "lose" : "");
    }
  }

  return { sizeCanvas, draw, statusText, updateStatusBar, reducedMotion };
}
