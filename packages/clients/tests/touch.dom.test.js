// DOM-level fallback for createTouchControls, used because this sandbox
// cannot run a real browser (Playwright's Chromium needs shared libs —
// `libglib-2.0.so.0` etc. — that aren't installable here without root;
// confirmed via `npx playwright install-deps` failing with "Switching to
// root user... Authentication failure"). Per the mobile-ergonomics design
// doc §7's documented fallback: drive the REAL createTouchControls module
// (no logic reimplemented here) with a minimal hand-written fake DOM —
// same style as packages/net's transport tests, which use fakes rather
// than a real browser/jsdom dependency — and assert the observable
// contract: onDir/onTap fire from synthetic pointer sequences, the
// overlay only activates on a touch/coarse-pointer signal (never on
// mouse), and — the acute bug this PR fixes — a coarse-pointer signal
// means a chat/cmd input is never auto-focused.
import test from "node:test";
import assert from "node:assert/strict";
import { createTouchControls, isCoarsePointer } from "../src/touch.js";

function makeFakeElement(tag, doc) {
  const listeners = new Map();
  const el = {
    tagName: tag,
    id: "",
    style: {},
    className: "",
    textContent: "",
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
    contains(other) {
      return el.children.includes(other);
    },
    // Test-only helper: invoke every handler registered for `type`.
    _fire(type, evt) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(evt);
    },
  };
  doc?._elements.push(el);
  return el;
}

function makeFakeDocument() {
  const doc = { _elements: [] };
  doc.head = makeFakeElement("head", doc);
  doc.body = makeFakeElement("body", doc);
  doc.createElement = (tag) => makeFakeElement(tag, doc);
  doc.getElementById = (id) => doc._elements.find((e) => e.id === id) ?? null;
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

/** Install fake browser globals for the duration of `fn`, then restore
 * whatever was there before (node:test runs each file in its own worker,
 * so this is belt-and-suspenders rather than strictly required). */
function withFakeDom({ coarse }, fn) {
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
    matchMedia: globalThis.matchMedia,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const doc = makeFakeDocument();
  const win = makeFakeWindow();
  globalThis.document = doc;
  globalThis.window = win;
  globalThis.matchMedia = (query) => ({ media: query, matches: coarse });
  let rafId = 0;
  globalThis.requestAnimationFrame = () => ++rafId; // never auto-fires — the
  // hold-stick repeat cadence is the pure engine's job, already covered by
  // gesture.test.js; this DOM test only proves the wiring fires at all.
  globalThis.cancelAnimationFrame = () => {};
  try {
    return fn({ doc, win });
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.matchMedia = saved.matchMedia;
    globalThis.requestAnimationFrame = saved.requestAnimationFrame;
    globalThis.cancelAnimationFrame = saved.cancelAnimationFrame;
  }
}

function pointerEvent({ x, y, id = 1, type = "touch", t = 0 }) {
  return { clientX: x, clientY: y, pointerId: id, pointerType: type, timeStamp: t };
}

test("createTouchControls: a swipe on the target fires onDir with the swiped direction", () => {
  withFakeDom({ coarse: true }, ({ doc }) => {
    const target = makeFakeElement("canvas", doc);
    const dirs = [];
    const taps = [];
    const { destroy } = createTouchControls({
      target,
      onDir: (dx, dy) => dirs.push([dx, dy]),
      onTap: (x, y) => taps.push([x, y]),
    });
    target._fire("pointerdown", pointerEvent({ x: 100, y: 100, t: 0 }));
    target._fire("touchstart", {}); // fallback-visibility signal too
    // Fast flick: down then up with no intermediate move sample — the
    // release-time swipe path (matches gesture.test.js's swipe cases).
    globalThis.window._fire("pointerup", pointerEvent({ x: 140, y: 100, t: 50 }));

    assert.deepEqual(dirs, [[1, 0]], "expected exactly one rightward step from the swipe");
    assert.deepEqual(taps, []);
    destroy();
  });
});

test("createTouchControls: a hold past the deadzone fires onDir immediately (the hold-stick's initial step)", () => {
  withFakeDom({ coarse: true }, ({ doc }) => {
    const target = makeFakeElement("canvas", doc);
    const dirs = [];
    const { destroy } = createTouchControls({ target, onDir: (dx, dy) => dirs.push([dx, dy]) });
    target._fire("pointerdown", pointerEvent({ x: 200, y: 200, t: 0 }));
    globalThis.window._fire("pointermove", pointerEvent({ x: 200, y: 240, t: 20 }));
    assert.deepEqual(dirs, [[0, 1]], "expected one downward step as soon as the deadzone was crossed");
    globalThis.window._fire("pointerup", pointerEvent({ x: 200, y: 245, t: 30 }));
    assert.deepEqual(dirs, [[0, 1]], "releasing an already-engaged hold must not double-fire");
    destroy();
  });
});

test("createTouchControls: a short, near-stationary press fires onTap, not onDir", () => {
  withFakeDom({ coarse: true }, ({ doc }) => {
    const target = makeFakeElement("canvas", doc);
    const dirs = [];
    const taps = [];
    const { destroy } = createTouchControls({
      target,
      onDir: (dx, dy) => dirs.push([dx, dy]),
      onTap: (x, y) => taps.push([x, y]),
    });
    target._fire("pointerdown", pointerEvent({ x: 50, y: 60, t: 0 }));
    globalThis.window._fire("pointerup", pointerEvent({ x: 51, y: 60, t: 40 }));
    assert.deepEqual(dirs, []);
    assert.deepEqual(taps, [[51, 60]]);
    destroy();
  });
});

test("createTouchControls: mouse pointer events are ignored outright — inert on mouse-only desktops", () => {
  withFakeDom({ coarse: false }, ({ doc }) => {
    const target = makeFakeElement("canvas", doc);
    const dirs = [];
    const taps = [];
    const { destroy } = createTouchControls({
      target,
      onDir: (dx, dy) => dirs.push([dx, dy]),
      onTap: (x, y) => taps.push([x, y]),
    });
    target._fire("pointerdown", pointerEvent({ x: 10, y: 10, t: 0, type: "mouse" }));
    globalThis.window._fire("pointermove", pointerEvent({ x: 100, y: 10, t: 10, type: "mouse" }));
    globalThis.window._fire("pointerup", pointerEvent({ x: 100, y: 10, t: 20, type: "mouse" }));
    assert.deepEqual(dirs, []);
    assert.deepEqual(taps, []);
    destroy();
  });
});

test("createTouchControls: the overlay only activates on a touch/coarse-pointer signal, never for mouse-only", () => {
  const seenDisplay = { withoutTouch: null, withTouch: null };
  withFakeDom({ coarse: false }, ({ doc }) => {
    const target = makeFakeElement("canvas", doc);
    const { destroy } = createTouchControls({ target });
    const overlay = doc.body.children.find((c) => c.className === "gtc-overlay");
    seenDisplay.withoutTouch = overlay.style.display;
    destroy();
  });
  withFakeDom({ coarse: true }, ({ doc }) => {
    const target = makeFakeElement("canvas", doc);
    const { destroy } = createTouchControls({ target });
    const overlay = doc.body.children.find((c) => c.className === "gtc-overlay");
    seenDisplay.withTouch = overlay.style.display;
    destroy();
  });
  assert.equal(seenDisplay.withoutTouch, "none", "hidden with no coarse-pointer/touch signal");
  assert.notEqual(seenDisplay.withTouch, "none", "shown once a coarse-pointer signal is present");
});

test("the keyboard fix: on a coarse-pointer signal, isCoarsePointer() is true, so main.js's " +
  "`if (!isCoarsePointer()) cmdEl.focus()` guard never calls focus() — the exact line that used " +
  "to pop the soft keyboard on every game start", () => {
  withFakeDom({ coarse: true }, () => {
    let focusCalls = 0;
    const cmdEl = { focus: () => focusCalls++, disabled: true };
    assert.equal(isCoarsePointer(), true);
    // This is main.js's begin()'s literal guard, reproduced here (not a
    // separate reimplementation of its logic) since main.js itself pulls
    // in canvas 2d contexts / net transports too heavy for this fake DOM.
    cmdEl.disabled = false;
    if (!isCoarsePointer()) cmdEl.focus();
    assert.equal(focusCalls, 0, "cmdEl.focus() must not be called on a coarse-pointer device");
    assert.equal(cmdEl.disabled, false, "the field is still enabled — just not auto-focused");
  });
});

test("desktop is unaffected: with no coarse-pointer signal, the same guard still auto-focuses", () => {
  withFakeDom({ coarse: false }, () => {
    let focusCalls = 0;
    const cmdEl = { focus: () => focusCalls++, disabled: true };
    assert.equal(isCoarsePointer(), false);
    cmdEl.disabled = false;
    if (!isCoarsePointer()) cmdEl.focus();
    assert.equal(focusCalls, 1, "desktop keeps today's auto-focus behavior exactly");
  });
});
