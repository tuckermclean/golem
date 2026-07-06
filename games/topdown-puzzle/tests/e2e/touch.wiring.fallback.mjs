// Honest fallback proof for the mobile-ergonomics PR2 touch wiring
// (games/topdown-puzzle/src/main.js's `createTouchControls({target: canvas,
// onDir: (dx,dy) => sendCmd(...)})`). Same real-Chromium limitation
// documented in play.smoke.fallback.mjs (missing shared libraries, no
// root) applies here too — this is not a stand-in for a real touch-
// emulation Playwright smoke, just the honest fallback the design doc's
// §7 anticipates ("else the PR3 fallback pattern... drive the real
// module with synthetic pointer events, assert onDir/onTap fire").
//
// What this proves, by driving the REAL production modules (no
// reimplementation of touch.js, gesture.js, host.js, or module.js):
//   - @golem-engine/clients' real createTouchControls, fed a synthetic
//     swipe pointer sequence on a fake `target` element (same fake-DOM
//     style as packages/clients/tests/touch.dom.test.js), fires a real
//     onDir(dx,dy).
//   - That onDir is topdown-puzzle's OWN sendCmd wrapper — literally
//     `(dx,dy) => sendCmd(\`move ${dx} ${dy}\`)`, reproduced here
//     verbatim from src/main.js (not a separate implementation) since
//     main.js itself is a composition root that also wires a live
//     canvas 2D context too heavy for this fake DOM — and sendCmd
//     drives the REAL src/host.js's hostCmd -> validate -> reduce path.
//   - The player entity's GridPosition actually moves one tile as a
//     result — i.e. the touch layer reaches real game state, not just a
//     mock callback.
//
//   node games/topdown-puzzle/tests/e2e/touch.wiring.fallback.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createTouchControls } from "@golem-engine/clients";
import { deriveWorldFromPack } from "../../shared/module.js";
import { createState } from "../../shared/reducer.js";
import { createHost } from "../../src/host.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_PATH = join(HERE, "..", "..", "content", "pack.json");
const LEVEL_ID = "001"; // same level src/main.js loads

function fail(msg) {
  console.error("touch.wiring.fallback: FAIL —", msg);
  process.exitCode = 1;
}

// ---- minimal fake DOM (same shape as packages/clients/tests/touch.dom.test.js,
// reused rather than reimplemented differently) ----
function makeFakeElement(tag) {
  const listeners = new Map();
  const el = {
    tagName: tag,
    id: "",
    style: {},
    className: "",
    children: [],
    parentNode: null,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    appendChild(child) {
      el.children.push(child);
      child.parentNode = el;
      return child;
    },
    append(...kids) {
      for (const k of kids) el.appendChild(k);
    },
    remove() {
      if (el.parentNode) el.parentNode.children = el.parentNode.children.filter((c) => c !== el);
    },
    setAttribute() {},
    getAttribute() {
      return null;
    },
    _fire(type, evt) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(evt);
    },
  };
  return el;
}
function makeFakeDocument() {
  const elements = [];
  const doc = { head: makeFakeElement("head"), body: makeFakeElement("body") };
  doc.createElement = (tag) => {
    const el = makeFakeElement(tag);
    elements.push(el);
    return el;
  };
  doc.getElementById = (id) => elements.find((e) => e.id === id) ?? null;
  return doc;
}
function makeFakeWindow() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    _fire(type, evt) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(evt);
    },
  };
}
function pointerEvent({ x, y, id = 1, type = "touch", t = 0 }) {
  return { clientX: x, clientY: y, pointerId: id, pointerType: type, timeStamp: t };
}

try {
  const savedDocument = globalThis.document;
  const savedWindow = globalThis.window;
  const savedMatchMedia = globalThis.matchMedia;
  const savedRAF = globalThis.requestAnimationFrame;
  const savedCAF = globalThis.cancelAnimationFrame;

  const doc = makeFakeDocument();
  const win = makeFakeWindow();
  globalThis.document = doc;
  globalThis.window = win;
  globalThis.matchMedia = () => ({ matches: true }); // coarse-pointer signal present
  globalThis.requestAnimationFrame = () => 0; // hold-stick repeat cadence is
  // gesture.test.js's job; this proof only needs the swipe path, which
  // fires synchronously on pointerup.
  globalThis.cancelAnimationFrame = () => {};

  // ---- boot the REAL host, exactly as src/main.js does, minus render/input ----
  const pack = JSON.parse(readFileSync(PACK_PATH, "utf8"));
  const world = deriveWorldFromPack(pack, LEVEL_ID);
  const S = { world, me: "player", st: createState() };
  const Host = createHost(S, { onCommit: () => {}, onDenyLocal: () => {} });
  Host.hostCommit({ t: "LEVEL_LOADED" });

  function sendCmd(cmd) {
    Host.hostCmd(S.me, cmd);
  }

  const player0 = S.st.entities.get("entity:player");
  assert.ok(player0, "expected entity:player after LEVEL_LOADED");
  const p0 = { ...player0.components.GridPosition };

  // ---- the REAL createTouchControls, wired exactly as src/main.js wires
  // it: target = the canvas element, onDir = sendCmd("move dx dy"). ----
  const target = doc.createElement("canvas");
  const { destroy } = createTouchControls({
    target,
    onDir: (dx, dy) => sendCmd(`move ${dx} ${dy}`),
  });

  // ---- synthetic swipe: down then up with no intermediate move sample
  // (the release-time swipe path, same fixture shape as touch.dom.test.js) —
  // a 40px upward flick within SWIPE_MS. ----
  target._fire("pointerdown", pointerEvent({ x: 100, y: 100, t: 0 }));
  win._fire("pointerup", pointerEvent({ x: 100, y: 60, t: 50 }));

  const player1 = S.st.entities.get("entity:player");
  const p1 = player1.components.GridPosition;
  assert.equal(p1.x, p0.x, "an upward swipe should not change x");
  assert.equal(p1.y, p0.y - 1, "an upward swipe should move the player one tile north, via sendCmd('move 0 -1')");
  console.log(
    `touch.wiring.fallback: a synthetic upward swipe on the real createTouchControls moved the ` +
      `player from (${p0.x},${p0.y}) to (${p1.x},${p1.y}) via src/main.js's real onDir -> sendCmd('move dx dy') -> ` +
      `host.hostCmd -> validate -> reduce path (no game logic reimplemented).`,
  );

  destroy();
  globalThis.document = savedDocument;
  globalThis.window = savedWindow;
  globalThis.matchMedia = savedMatchMedia;
  globalThis.requestAnimationFrame = savedRAF;
  globalThis.cancelAnimationFrame = savedCAF;

  console.log("touch.wiring.fallback: PASS (real browser unavailable in this sandbox — see header comment)");
} catch (e) {
  fail(e.stack || e.message);
}

if (process.exitCode) process.exit(process.exitCode);
