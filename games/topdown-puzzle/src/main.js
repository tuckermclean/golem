/* ── MAIN: composition root. Mirrors games/golem-grid/src/main.js's role
   (wire state + host + client + render + input), minus the NET/golem-
   prose sections golem-grid needs and topdown-puzzle doesn't (single-
   player, no chat, no ▶GOLEM-PLUG◀ seam here — the golem is golem-grid's
   integration point, not this game's).

   The one topdown-puzzle-specific wrinkle (design doc's "deriveWorld —
   and the sync/async problem"): getting content/pack.json's bytes onto
   `deriveWorldFromPack` is platform-specific — the Node-side convenience
   wrapper (games/topdown-puzzle/shared/pack-loader.js) uses node:fs,
   which doesn't exist in a browser bundle. This file takes the browser's
   own path instead: it imports content/pack.json as a plain Vite JSON
   module (bundled into the single-file build, same discipline as
   golem-grid's file:// deliverable — zero external references) and
   calls `deriveWorldFromPack(pack, levelId)` directly — the same pure
   function shared/module.js exports and every other consumer (Node
   tests, shared/pack-loader.js) calls too. `validate`/`reduce` (used by
   src/host.js/src/client.js) have no filesystem dependency at all, so
   shared/module.js itself stays safely importable from this bundle —
   see that file's header comment for why the split matters. ───────── */
import "./style.css";
import pack from "../content/pack.json";
import { deriveWorldFromPack } from "../shared/module.js";
import { createState } from "../shared/reducer.js";
import { createTouchControls } from "@golem-engine/clients";
import { createHost, TICK_MS } from "./host.js";
import { createClient } from "./client.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";

/* Level selection: `?level=NNN` (falls back to 001) so all six shipped
   levels are playable from the built client — the topbar picker just sets
   this query param and reloads. Level ids come straight from the compiled
   pack's map ids (`map:tdp_00N` → `00N`). */
const AVAILABLE_LEVELS = Object.keys(pack.maps)
  .map((id) => id.replace(/^map:tdp_/, ""))
  .sort();
const requestedLevel = new URLSearchParams(location.search).get("level");
const LEVEL_ID = AVAILABLE_LEVELS.includes(requestedLevel)
  ? requestedLevel
  : AVAILABLE_LEVELS.includes("001")
    ? "001"
    : AVAILABLE_LEVELS[0];

const ME = "player";

/* ── STATE: page identity + reducer state — same S-is-a-mutable-box
   pattern as golem-grid's main.js, just without a network peer id. ──── */
const S = { world: deriveWorldFromPack(pack, LEVEL_ID), me: ME, st: createState() };

const canvas = document.getElementById("cv");
const Render = createRenderer(S, { canvas });
Render.sizeCanvas(S.world);

const statusEls = {
  hp: document.getElementById("tb-hp"),
  diamonds: document.getElementById("tb-diamonds"),
  tick: document.getElementById("tb-tick"),
  banner: document.getElementById("banner"),
};
/* Level picker: populate the topbar <select>; changing it reloads into the
   chosen level via ?level=. */
const levelSelect = document.getElementById("tb-level-select");
for (const id of AVAILABLE_LEVELS) {
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = id;
  if (id === LEVEL_ID) opt.selected = true;
  levelSelect.appendChild(opt);
}
levelSelect.addEventListener("change", () => {
  const p = new URLSearchParams(location.search);
  p.set("level", levelSelect.value);
  location.search = p.toString();
});

/* ── Solution panel: on game over reveal the outcome; on a WIN show the
   recorded command sequence with copy/download so it drops straight into
   the fixture toolchain (tests/solutions/<level>.moves.json). onGameOver is
   a hoisted declaration — the Host's onCommit closure above calls it. ──── */
const solutionPanel = document.getElementById("solution-panel");
const solOutcomeEl = document.getElementById("sol-outcome");
const solTextEl = document.getElementById("sol-text");

function onGameOver() {
  const won = S.st.outcome === "WIN";
  const payload = JSON.stringify(solution);
  console.log(
    `[tdp] level ${LEVEL_ID}: ${S.st.outcome} in ${solution.length} commands` +
      (won ? " — solution below (also at window.__tdp.getSolution()):" : ""),
  );
  if (won) console.log(payload);
  solOutcomeEl.textContent = won
    ? `WIN — level ${LEVEL_ID} solved in ${solution.length} commands. Copy or download this solution:`
    : `LOSE — level ${LEVEL_ID}. Hit Retry to try again.`;
  solTextEl.value = payload;
  solTextEl.hidden = !won;
  document.getElementById("sol-copy").hidden = !won;
  document.getElementById("sol-download").hidden = !won;
  solutionPanel.hidden = false;
}

document.getElementById("sol-copy").addEventListener("click", () => {
  if (navigator.clipboard) navigator.clipboard.writeText(solTextEl.value);
});
document.getElementById("sol-download").addEventListener("click", () => {
  const blob = new Blob([solTextEl.value], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${LEVEL_ID}.moves.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
document.getElementById("sol-retry").addEventListener("click", () => location.reload());

function renderFrame() {
  Render.draw(S.world, S.st);
  Render.updateStatusBar(S.world, S.st, statusEls);
}

/* ── HOST: validate → seq-stamp → commit (src/host.js), plus the
   TICK_MS fixed-step clock driving movers/baddies. ───────────────────── */
/* ── SOLUTION RECORDER (C4 PR4 enablement): capture the exact LEGAL
   command stream — your moves AND the clock's ticks, in the order the host
   processed them — so clearing a level yields a bit-identical, replayable
   solution log with no eyeballing and no manual tick-timing. Recording
   stops at game over (post-decision ticks aren't part of the solution). ── */
const solution = [];
let finished = false;

const Host = createHost(S, {
  onCommit: () => {
    renderFrame();
    if (!finished && S.st.over) {
      finished = true;
      Host.stopClock(); // no more ticks once the level is decided
      onGameOver();
    }
  },
  onDenyLocal: () => {}, // no chat/feed UI; a denied move just leaves the
  // board as-is, visible on the very next frame.
  onCmd: (cmd) => {
    // Fires (in host.js) before the command's events commit, so `over` is
    // still false for the deciding command — it IS recorded; the tick that
    // would follow a win is not (over is true by then).
    if (!S.st.over) solution.push(cmd);
  },
});

/* ── CLIENT: applyRemoteEvent/applySnapshot — unused by this single-
   player composition root today (design doc: "keep the shape for
   parity/testability"), constructed here so it's wired exactly the way
   a future multiplayer/replay consumer would find it. ────────────────── */
const Client = createClient(S);
void Client;

function sendCmd(cmd) {
  Host.hostCmd(S.me, cmd);
}

createInput(S, { sendCmd, isOver: () => S.st.over });

/* ── TOUCH: @golem-engine/clients' shared touch layer (mobile-ergonomics
   PR2 — movement-only, per the design doc's §5 "topdown-puzzle" section).
   topdown-puzzle has no text input at all (no chat, no context menu), so
   this is the whole wiring: onDir funnels through the same sendCmd("move
   dx dy") the keyboard uses. Inert on mouse-only desktops (createTouchControls
   shows nothing unless a touch/coarse-pointer signal arrives), so keyboard
   input stays byte-for-byte unaffected. ──────────────────────────────── */
createTouchControls({
  target: canvas,
  onDir: (dx, dy) => sendCmd(`move ${dx} ${dy}`),
});

/* ── boot: LEVEL_LOADED seeds entities/diamondsRemaining from `world`
   (design doc's State model — no redundant copy of the level layout in
   the event itself), then the fixed-step clock starts. ─────────────── */
Host.hostCommit({ t: "LEVEL_LOADED" });
Host.startClock(S.me);

let raf = null;
function loop() {
  renderFrame();
  raf = requestAnimationFrame(loop);
}
loop();

/* ── testability hook (PR3 brief: "a state hook you expose on window is
   permitted... do it in main.js/src, not shared/"). Read-only surface
   for games/topdown-puzzle/tests/e2e/play.smoke.mjs — never written to
   by shared/reducer.js/module.js/tick.js, which stay identity-blind and
   DOM-free. ──────────────────────────────────────────────────────────── */
window.__tdp = {
  getState: () => S.st,
  getWorld: () => S.world,
  // Plain-data snapshot (no Map/Set) — safe to hand back across a
  // Playwright page.evaluate() boundary without a serialization dance
  // at every call site.
  getSnapshot: () => ({
    tick: S.st.tick,
    over: S.st.over,
    outcome: S.st.outcome,
    diamondsRemaining: S.st.diamondsRemaining,
    entities: [...S.st.entities.values()].map((e) => ({
      id: e.id,
      kind: e.components.Actor && e.components.Actor.kind,
      x: e.components.GridPosition && e.components.GridPosition.x,
      y: e.components.GridPosition && e.components.GridPosition.y,
      moveDir: e.components.Actor && e.components.Actor.moveDir,
      hp: e.components.Health && e.components.Health.hp,
    })),
  }),
  sendCmd,
  TICK_MS,
  level: LEVEL_ID,
  availableLevels: AVAILABLE_LEVELS,
  // The recorded legal command stream so far (moves + ticks) — a
  // bit-identical, replayable solution once the level is WON.
  getSolution: () => [...solution],
};
