/* ── SHARED TOUCH MODULE (DOM layer) ─────────────────────────────────────
 * createTouchControls({target, onDir, onTap, actions, chat}) -> {destroy}
 *
 * The DOM half of the mobile-ergonomics design (packages/clients — see
 * docs/superpowers/specs/2026-07-06-mobile-ergonomics-design.md §2/§4):
 * injects a control overlay + scoped CSS (the some-hero mobile recipe),
 * feeds pointer samples for the ACTIVE touch into the pure gesture.js
 * engine, and calls back into the game's own command dispatch — this
 * module never knows about "move dx dy" strings, dungeons, or chat
 * grammar; it only emits onDir(dx,dy)/onTap(x,y) and renders whatever
 * `actions`/`chat` buttons the caller hands it.
 *
 * Shows only on touch/coarse-pointer (matchMedia("(pointer: coarse)"),
 * with a first-touchstart fallback for devices that misreport it);
 * inert (hidden, no listeners fire meaningfully) on mouse-only desktops
 * — mouse pointer events are ignored outright so desktop click/keyboard
 * paths are never touched by this module.
 *
 * No Math.random, no Date.now (both banned) — the only clock read is
 * requestAnimationFrame's own timestamp, threaded straight into
 * gesture.js's tick(now).
 */
import { createGesture, STICK_BASE, STICK_RADIUS } from "./gesture.js";

const STYLE_ID = "gtc-style";

/** Best-effort touch/coarse-pointer detection, exported so callers (e.g.
 * golem-grid's main.js) can make the same "don't auto-focus text input"
 * call this module makes for its own overlay visibility. */
export function isCoarsePointer() {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  // The some-hero recipe (design doc §4): tap-highlight/select suppressed,
  // touch-action:none on interactive controls, env(safe-area-inset-*)
  // placement, clamp() sizing, prefers-reduced-motion disables the only
  // transition this layer has (the stick knob following the finger).
  style.textContent = `
.gtc-overlay{position:fixed;inset:0;pointer-events:none;z-index:9000;touch-action:none}
.gtc-stick-base{position:absolute;width:${STICK_BASE}px;height:${STICK_BASE}px;
  border-radius:50%;border:2px solid rgba(255,255,255,.35);
  background:rgba(0,0,0,.25);display:none;pointer-events:none}
.gtc-stick-knob{position:absolute;width:${STICK_RADIUS}px;height:${STICK_RADIUS}px;
  border-radius:50%;background:rgba(255,255,255,.55);display:none;
  pointer-events:none;transition:left .04s linear,top .04s linear}
.gtc-btn{pointer-events:auto;position:absolute;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font:inherit;font-size:clamp(.7rem,1.8vmin,1rem);font-weight:bold;
  letter-spacing:.06em;color:#f0ead6;background:rgba(0,0,0,.55);
  border:2px solid rgba(255,255,255,.5);-webkit-tap-highlight-color:transparent;
  user-select:none;touch-action:none}
.gtc-btn:active{background:rgba(217,107,75,.6)}
.gtc-actions{position:absolute;right:max(16px,env(safe-area-inset-right));
  bottom:max(20px,env(safe-area-inset-bottom));display:flex;
  flex-direction:column-reverse;gap:12px;pointer-events:none}
.gtc-actions .gtc-btn{position:static;width:clamp(52px,15vmin,72px);
  height:clamp(52px,15vmin,72px)}
.gtc-chat{left:max(16px,env(safe-area-inset-left));
  bottom:max(20px,env(safe-area-inset-bottom));
  width:clamp(48px,13vmin,60px);height:clamp(48px,13vmin,60px)}
@media (prefers-reduced-motion: reduce){
  .gtc-stick-knob{transition:none}
}
`;
  document.head.appendChild(style);
}

/**
 * @param {{
 *   target: Element,                       // play surface to read gestures from
 *   onDir?: (dx:number, dy:number) => void, // one call per discrete step
 *   onTap?: (x:number, y:number) => void,   // a tap that wasn't a swipe/hold
 *   actions?: {label:string, glyph?:string, onPress:() => void}[],
 *   chat?: {onOpen: () => void},
 * }} opts
 */
export function createTouchControls({ target, onDir, onTap, actions = [], chat } = {}) {
  if (!target) throw new Error("createTouchControls: target is required");

  injectStyle();

  const overlay = document.createElement("div");
  overlay.className = "gtc-overlay";
  overlay.style.display = "none"; // hidden until a touch/coarse-pointer signal arrives

  const stickBase = document.createElement("div");
  stickBase.className = "gtc-stick-base";
  const stickKnob = document.createElement("div");
  stickKnob.className = "gtc-stick-knob";
  overlay.append(stickBase, stickKnob);

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "gtc-actions";
  for (const a of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gtc-btn";
    btn.textContent = a.glyph ?? a.label ?? "?";
    btn.setAttribute("aria-label", a.label ?? "action");
    // The "#btnA pattern" (some-hero): pointerdown + stopPropagation so a
    // button press never leaks through to the play-surface gesture.
    btn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      a.onPress?.();
    });
    actionsWrap.appendChild(btn);
  }
  overlay.appendChild(actionsWrap);

  let chatBtn = null;
  if (chat) {
    chatBtn = document.createElement("button");
    chatBtn.type = "button";
    chatBtn.className = "gtc-btn gtc-chat";
    chatBtn.textContent = "\u{1F4AC}"; // 💬 — the chat toggle: the ONLY
    // touch affordance allowed to summon the keyboard (design doc §1).
    chatBtn.setAttribute("aria-label", "chat");
    chatBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      chat.onOpen?.();
    });
    overlay.appendChild(chatBtn);
  }

  document.body.appendChild(overlay);

  const gesture = createGesture();
  let rafId = null;
  let visible = false;
  let activeId = null;
  let originX = 0;
  let originY = 0;

  function show() {
    if (visible) return;
    visible = true;
    overlay.style.display = "";
  }

  function positionStick(x, y) {
    stickBase.style.left = x - STICK_BASE / 2 + "px";
    stickBase.style.top = y - STICK_BASE / 2 + "px";
    stickBase.style.display = "block";
    stickKnob.style.left = x - STICK_RADIUS / 2 + "px";
    stickKnob.style.top = y - STICK_RADIUS / 2 + "px";
    stickKnob.style.display = "block";
  }
  function moveKnob(dx, dy) {
    const m = Math.hypot(dx, dy);
    let kx = dx;
    let ky = dy;
    if (m > STICK_RADIUS) {
      kx = (dx / m) * STICK_RADIUS;
      ky = (dy / m) * STICK_RADIUS;
    }
    stickKnob.style.left = originX + kx - STICK_RADIUS / 2 + "px";
    stickKnob.style.top = originY + ky - STICK_RADIUS / 2 + "px";
  }
  function hideStick() {
    stickBase.style.display = "none";
    stickKnob.style.display = "none";
  }

  function dispatch(events) {
    for (const ev of events) {
      if (ev.kind === "step") onDir?.(ev.dx, ev.dy);
      else if (ev.kind === "tap") onTap?.(ev.x, ev.y);
    }
  }

  function loop(now) {
    if (activeId === null) {
      rafId = null;
      return;
    }
    dispatch(gesture.tick(now));
    rafId = requestAnimationFrame(loop);
  }

  function onPointerDown(e) {
    if (e.pointerType === "mouse") return; // mouse stays on the existing click path
    show();
    activeId = e.pointerId;
    originX = e.clientX;
    originY = e.clientY;
    positionStick(originX, originY);
    dispatch(gesture.feed({ x: e.clientX, y: e.clientY, t: e.timeStamp, phase: "down" }));
    if (rafId === null) rafId = requestAnimationFrame(loop);
  }
  function onPointerMove(e) {
    if (e.pointerId !== activeId) return;
    moveKnob(e.clientX - originX, e.clientY - originY);
    dispatch(gesture.feed({ x: e.clientX, y: e.clientY, t: e.timeStamp, phase: "move" }));
  }
  function onPointerUp(e) {
    if (e.pointerId !== activeId) return;
    dispatch(gesture.feed({ x: e.clientX, y: e.clientY, t: e.timeStamp, phase: "up" }));
    activeId = null;
    hideStick();
  }

  target.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  // Coarse-pointer detection up front; first-touchstart is the fallback
  // for browsers/devices that misreport `pointer: coarse`.
  if (isCoarsePointer()) show();
  function onFirstTouch() {
    show();
    target.removeEventListener("touchstart", onFirstTouch);
  }
  target.addEventListener("touchstart", onFirstTouch, { passive: true });

  function destroy() {
    target.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    target.removeEventListener("touchstart", onFirstTouch);
    if (rafId !== null) cancelAnimationFrame(rafId);
    overlay.remove();
  }

  return { destroy };
}
