// Honest fallback for play.smoke.mjs (DELTA C4 PR3): this sandbox has no
// working Chromium — `ldd` against the cached Playwright chromium-1223
// binary reports 23 missing shared libraries (libglib-2.0, libnss3,
// libX11, libgbm, libcairo, libpango, ...), there is no root/sudo, and
// `apt-get` has no package lists configured (`apt-get download` fails
// with "unable to locate package" for even libglib2.0-0). Installing a
// full GTK/X11 desktop stack without root in this container is out of
// scope for this task — this is a genuine environment limitation, not
// a shortcut. Per the PR3 brief's own escape hatch ("If Playwright/
// browser truly can't run... fall back to a jsdom or headless assertion
// that at least proves render + input wiring — do NOT claim playability
// you didn't observe"), THIS script is that fallback. It does NOT stand
// in for play.smoke.mjs's real-browser proof (that script is still the
// canonical DoD evidence and should be run in any environment with a
// working Chromium — `node games/topdown-puzzle/tests/e2e/play.smoke.mjs`
// after building).
//
// What this script proves, by directly driving the REAL production
// modules under plain Node (no jsdom, no reimplementation of any game
// logic):
//   - src/host.js + src/client.js have ZERO DOM dependencies, so running
//     them under Node is not a simulation of the browser path — it IS
//     the browser path (same JS, same setInterval, same validate/reduce
//     calls the browser tab would make). This proves the LEVEL_LOADED
//     boot, a real "move" command, and the fixed-step TICK_MS clock
//     (via a REAL setInterval, not a synthetic tick) advancing a baddie
//     autonomously — the actual DoD claims a browser smoke would check.
//   - src/render.js and src/input.js DO touch the DOM/canvas (by
//     design — that's their whole job), so this script hands them
//     minimal fake `canvas`/`document` objects (recording calls, not a
//     browser) rather than skipping them — proving the real draw()/
//     input-handling CODE runs correctly against real world/state data,
//     even though no pixel was ever actually composited by a GPU.
//
//   node games/topdown-puzzle/tests/e2e/play.smoke.fallback.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveWorldFromPack } from "../../shared/module.js";
import { createState } from "../../shared/reducer.js";
import { createHost, TICK_MS } from "../../src/host.js";
import { createClient } from "../../src/client.js";
import { createRenderer } from "../../src/render.js";
import { createInput } from "../../src/input.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_PATH = join(HERE, "..", "..", "content", "pack.json");
const LEVEL_ID = "001"; // same level src/main.js loads

const transcript = [];
function log(line) {
  transcript.push(line);
  console.log(line);
}

function fail(msg) {
  console.error("play.smoke.fallback: FAIL —", msg);
  process.exitCode = 1;
}

try {
  // ---- boot: the exact sequence src/main.js runs, minus the DOM ----
  const pack = JSON.parse(readFileSync(PACK_PATH, "utf8"));
  const world = deriveWorldFromPack(pack, LEVEL_ID);

  const S = { world, me: "player", st: createState() };
  const commits = [];
  const Host = createHost(S, {
    onCommit: (ev) => commits.push(ev),
    onDenyLocal: (reason) => commits.push({ t: "DENY", reason }),
  });
  const Client = createClient(S);
  void Client; // wired for parity, same as src/main.js — see that file's comment

  Host.hostCommit({ t: "LEVEL_LOADED" });
  const player0 = S.st.entities.get("entity:player");
  assert.ok(player0, "expected entity:player after LEVEL_LOADED");
  const baddies0 = [...S.st.entities.values()].filter((e) => e.components.Actor?.kind === "baddie");
  assert.ok(baddies0.length >= 1, "expected at least one baddie in level 001");
  log(
    `LEVEL_LOADED: player at (${player0.components.GridPosition.x},${player0.components.GridPosition.y}), ` +
      `${baddies0.length} baddie(s), ${S.st.diamondsRemaining} diamonds remaining`,
  );

  // ---- a real "move" command through the SAME host.hostCmd the
  // browser's sendCmd() calls (src/main.js's sendCmd is a one-line
  // wrapper over exactly this) ----
  const p0 = player0.components.GridPosition;
  Host.hostCmd(S.me, "move 0 -1");
  const player1 = S.st.entities.get("entity:player");
  const p1 = player1.components.GridPosition;
  assert.equal(p1.x, p0.x, "move 0 -1 should not change x");
  assert.equal(p1.y, p0.y - 1, "move 0 -1 should move the player one tile north");
  log(`"move 0 -1" moved the player from (${p0.x},${p0.y}) to (${p1.x},${p1.y}) via the real host.hostCmd -> validate -> reduce path`);

  // ---- the REAL fixed-step clock: a real setInterval, not a
  // synthetic/manual tick call — this is what proves the tick BRIDGE
  // (not just resolveTick's pure logic, already covered by
  // tests/tick.test.js) actually drives autonomously with no player
  // input, exactly as src/main.js's Host.startClock(me) does. ----
  const baddieId = baddies0[0].id;
  const baddieBefore = S.st.entities.get(baddieId).components.Actor;
  const tickBefore = S.st.tick;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timed out waiting for a real tick after ${TICK_MS * 10}ms`)), TICK_MS * 10);
    Host.startClock(S.me);
    const check = setInterval(() => {
      if (S.st.tick > tickBefore) {
        clearInterval(check);
        clearTimeout(timeout);
        Host.stopClock();
        resolve();
      }
    }, 20);
  });
  const baddieAfterEntity = S.st.entities.get(baddieId);
  assert.ok(S.st.tick > tickBefore, "expected state.tick to advance from the REAL host clock");
  if (baddieAfterEntity) {
    const baddieAfter = baddieAfterEntity.components.Actor;
    const baddiePos = baddieAfterEntity.components.GridPosition;
    const baddiePos0 = baddies0[0].components.GridPosition;
    const moved = baddiePos.x !== baddiePos0.x || baddiePos.y !== baddiePos0.y || baddieAfter.moveDir !== baddieBefore.moveDir;
    assert.ok(moved, "expected the baddie to have moved or reflected by the first real tick");
    log(`real setInterval clock (TICK_MS=${TICK_MS}) advanced tick ${tickBefore} -> ${S.st.tick}; baddie ${baddieId} moved/reflected with NO player input`);
  } else {
    log(`real setInterval clock (TICK_MS=${TICK_MS}) advanced tick ${tickBefore} -> ${S.st.tick}; baddie ${baddieId} was destroyed (memory hole) by the first tick`);
  }

  // ---- render.js: a fake canvas/2D-context (records calls; not a
  // browser), driving the REAL createRenderer/draw()/updateStatusBar
  // against real world/state data. ----
  const drawCalls = [];
  const fakeCtx = {
    fillRect: (...args) => drawCalls.push(["fillRect", ...args]),
    fillText: (...args) => drawCalls.push(["fillText", ...args]),
    set fillStyle(v) {
      drawCalls.push(["fillStyle", v]);
    },
    set font(v) {},
    set textAlign(v) {},
    set textBaseline(v) {},
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeCtx };
  globalThis.matchMedia = () => ({ matches: false });
  const Render = createRenderer(S, { canvas: fakeCanvas });
  Render.sizeCanvas(world);
  assert.equal(fakeCanvas.width, world.cols * 24, "sizeCanvas should size the canvas to cols*TILE");
  assert.equal(fakeCanvas.height, world.rows * 24, "sizeCanvas should size the canvas to rows*TILE");
  drawCalls.length = 0;
  Render.draw(world, S.st);
  const fillRects = drawCalls.filter((c) => c[0] === "fillRect");
  assert.ok(fillRects.length > 0, "expected draw() to issue fillRect calls for the level's geometry/entities");
  assert.ok(fillRects.length >= world.walls.size, "expected at least one fillRect per wall tile");
  log(`render.js's real draw() issued ${fillRects.length} fillRect calls against level "${LEVEL_ID}"'s real world/state (non-empty — proves render wiring)`);

  const statusEls = {
    hp: { textContent: "" },
    diamonds: { textContent: "" },
    tick: { textContent: "" },
    banner: { textContent: "", style: {}, className: "" },
  };
  Render.updateStatusBar(world, S.st, statusEls);
  assert.equal(statusEls.tick.textContent, String(S.st.tick));
  assert.equal(statusEls.diamonds.textContent, String(S.st.diamondsRemaining));
  log(`render.js's real updateStatusBar() wrote hp=${statusEls.hp.textContent} diamonds=${statusEls.diamonds.textContent} tick=${statusEls.tick.textContent}`);

  // ---- input.js: a fake `document` capturing the capture-phase
  // keydown listener, driving the REAL createInput's handler. ----
  let capturedHandler = null;
  const fakeDocument = {
    addEventListener: (type, handler, capture) => {
      if (type === "keydown" && capture === true) capturedHandler = handler;
    },
  };
  const prevDocument = globalThis.document;
  globalThis.document = fakeDocument;
  const sentCommands = [];
  let over = false;
  createInput(S, { sendCmd: (c) => sentCommands.push(c), isOver: () => over });
  assert.ok(capturedHandler, "expected input.js to register a capture-phase keydown listener");
  let prevented = false;
  capturedHandler({ key: "ArrowUp", preventDefault: () => (prevented = true), stopPropagation: () => {} });
  assert.deepEqual(sentCommands, ["move 0 -1"], "expected ArrowUp to sendCmd('move 0 -1')");
  assert.ok(prevented, "expected ArrowUp to call preventDefault (capture-phase, arrows are feet doctrine)");
  over = true;
  sentCommands.length = 0;
  capturedHandler({ key: "ArrowUp", preventDefault: () => {}, stopPropagation: () => {} });
  assert.deepEqual(sentCommands, [], "expected input to be ignored once state.over");
  globalThis.document = prevDocument;
  log("input.js's real capture-phase handler sent 'move 0 -1' on ArrowUp, and ignored input once over — matches golem-grid's 'arrows are feet' doctrine");

  log("play.smoke.fallback: PASS (real browser unavailable in this sandbox — see header comment; this proves host/client/render/input wiring against the real production modules)");
} catch (e) {
  fail(e.stack || e.message);
}

if (process.exitCode) process.exit(process.exitCode);
