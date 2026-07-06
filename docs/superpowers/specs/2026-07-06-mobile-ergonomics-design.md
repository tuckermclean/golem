# Mobile ergonomics for the kernel clients — Design

**Date:** 2026-07-06
**Status:** Approved (design nod: "the real McCoy" + "any improvement is better")
**Topic:** Make the kernel-based clients (golem-grid first, then topdown-puzzle)
comfortably playable on a phone — matching the ergonomics of the some-hero
legacy game — via a shared, reusable touch-controls layer.

## Problem

The kernel clients are **basically useless on mobile today.** The acute cause:
golem-grid's client has a text command input (`games/golem-grid/src/input.js`'s
`cmdEl`, the IRC-style `say`/`take`/`read`/… field). On a phone, focusing it
**pops the soft keyboard**, which covers half the screen and makes the game
unplayable. Beyond that, there are **no touch controls at all** — movement is
keyboard arrows, actions are a mouse-click context menu; neither exists on
touch. Meanwhile the some-hero legacy game *is* comfy on mobile, so the bar and
the recipe already exist in this repo.

"Any improvement is better" — this ships incremental value; it does not need to
be perfect to be worth landing.

## Goals

1. **Never summon the soft keyboard during normal play.** All core actions
   (move, take, read, look) reachable by touch. Text input (chat/`say`) becomes
   **opt-in behind a toggle**, and never auto-focuses on touch devices.
2. **Comfy touch movement** for discrete tile games: a **swipe + floating
   hold-stick hybrid** → one step per swipe, auto-repeat while the stick is held.
3. **The some-hero mobile recipe** applied: zoom-locked viewport, `touch-action`
   /overscroll/tap-highlight/select suppressed, `env(safe-area-inset-*)`
   placement, `clamp()` sizing, `prefers-reduced-motion` honored.
4. **Zero game-logic fork** — the touch layer is an *input adapter* that funnels
   through the same `sendCmd("move dx dy")` / command grammar the keyboard uses.
5. **Desktop unaffected** — keyboard + mouse keep working exactly as today; the
   existing golem-grid smokes stay green; builds stay single-file/self-contained.

## Non-goals (YAGNI — flag as follow-ups)

- PWA installability / web app manifest.
- Haptics / vibration.
- Reworking the some-hero legacy client itself (it's already comfy; it's the
  reference, not a target).

## Approach (approved)

A shared **`@golem-engine/clients`** package (DELTA's `packages/clients` slot):
a self-contained touch module that injects its own control overlay + the mobile
CSS recipe, runs a pure gesture engine, and calls back into the game's existing
command dispatch. Both clients consume it; the gesture "feel" lives in one place.

Rejected: per-client copies (forks the gesture engine + CSS across clients —
violates "no logic forked between clients"); porting some-hero's `stick.js`
verbatim (it's coupled to continuous movement + some-hero's loop — adapting to
discrete tiles is a rewrite; better to write a clean shared module *informed by*
its numbers: 96px base, 44px radius, 7px deadzone).

## Design

### 1. The keyboard fix (first-class, golem-grid)

- On touch/coarse-pointer devices, `cmdEl` **must not auto-focus** and is
  **collapsed behind a "chat" toggle button** in the control layer. The keyboard
  appears *only* when the user explicitly taps chat to type a `say`/`/command`.
- Core verbs get touch affordances so the text field is never needed for play:
  - **move** → the stick/swipe hybrid.
  - **take / read / look** → golem-grid already has a **tap-a-tile → context
    menu** path (the existing click handler); wire it to touch `onTap` and make
    its buttons thumb-sized. Optionally a single always-visible **action button**
    for the most common verb (take).
- Desktop keeps the text field visible and focusable as today.

### 2. Shared touch module — `packages/clients/src/touch.js`

`createTouchControls({ target, onDir, onTap, actions, chat }) -> { destroy }`
- `onDir(dx, dy)` — fires once per discrete step (from swipe or held stick).
- `onTap(clientX, clientY)` — a tap that isn't a swipe (→ context menu / tile pick).
- `actions: [{ label, glyph, onPress }]` — renders thumb buttons (safe-area
  placed), each using the "#btnA pattern" (`pointerdown` + `stopPropagation` so a
  button tap doesn't leak to the world).
- `chat?: { onOpen }` — renders the chat toggle (the keyboard-gated affordance).
- Injects a control overlay `<div>` + a scoped `<style>` (the recipe in §4).
- Shows only on touch/coarse-pointer (`matchMedia('(pointer: coarse)')` or a
  touch-start); inert on mouse-only desktops.

### 3. Gesture engine (pure) — `packages/clients/src/gesture.js`

**No DOM.** Consumes pointer samples `{x, y, t, phase}` and emits
`{kind:"step", dx, dy}` / `{kind:"tap", x, y}`. This is the "feel", made
**unit-testable without a browser** (essential — the sandbox can't run one):
- **Swipe:** on pointer-up, if total travel > `SWIPE_MIN` (px) within
  `SWIPE_MS`, emit one `step` in the dominant cardinal (`|dx|` vs `|dy|`).
- **Hold-stick:** while held, once the vector exceeds the 7px deadzone, snap to
  the dominant cardinal and emit a `step`; then **auto-repeat every
  `REPEAT_MS`** (~150ms) while held past the deadzone, re-reading direction each
  tick so the player can curve the walk. (some-hero's radius/deadzone numbers.)
- **Tap:** pointer-up under `TAP_MAX` px and `TAP_MS` → `tap`.
- Diagonal input snaps to the dominant axis (one key, one meaning).

### 4. Mobile CSS / viewport recipe (from some-hero)

Applied to each client's `index.html` + injected by the module:
`<meta viewport … maximum-scale=1, user-scalable=no>`; `html,body{overflow:hidden;
touch-action:none; overscroll-behavior:none}`; `-webkit-tap-highlight-color:
transparent; user-select:none`; controls placed with `max(px, env(safe-area-inset-*))`;
font/size via `clamp()`; `@media (prefers-reduced-motion:reduce)` disables the
stick's spring. Audio-unlock hook only if a client has sound (neither does yet).

### 5. Per-game wiring

- **golem-grid (priority):** `onDir → sendCmd("move dx dy")`; `onTap →` the
  existing tile context-menu (take/read/look) enlarged for thumbs; a `take`
  action button; the chat toggle gating `cmdEl`/keyboard. Keyboard + mouse
  unchanged on desktop.
- **topdown-puzzle:** movement-only (`onDir → sendCmd("move dx dy")`); no chat,
  no context menu. Trivial once the module exists.

### 6. Coexistence & safety

- Keyboard arrows + desktop mouse paths untouched.
- golem-grid's `two-tab.smoke.mjs` / `visual.smoke.mjs` must stay green (the
  touch overlay is hidden on mouse-only; the deterministic canvas capture is
  unaffected).
- Both builds stay single-file/self-contained (`make html`, tdp `build`).

### 7. Testing

- **Pure `gesture.js` unit tests** (`node:test`): swipe threshold/direction,
  stick→cardinal snapping + auto-repeat cadence, tap disambiguation, diagonal
  snapping. This verifies the feel with no browser.
- A **Playwright touch-emulation smoke** where the sandbox allows (`hasTouch`,
  synthesized swipes); else the PR3 fallback pattern (drive the real module with
  synthetic pointer events, assert `onDir`/`onTap` fire and no keyboard focus).
- `freeze:verify` + full `npm test` unchanged; `check-bans` clean.

## Decomposition (revised — golem-grid first, since that's the acute pain)

- **PR1:** `packages/clients` (touch + gesture + CSS recipe) + **wire golem-grid**
  (touch movement, tap-context actions, chat toggle / keyboard suppression) +
  pure gesture unit tests + a smoke. This is the "useless on mobile → playable"
  fix.
- **PR2:** wire **topdown-puzzle** (movement-only) onto the same module + its smoke.

## Orchestrator notes

- The gesture constants (`SWIPE_MIN/MS`, `REPEAT_MS`, `TAP_MAX/MS`, deadzone,
  radius) are the tuning surface; seed them from some-hero's numbers and expose
  them as named constants so the feel is adjustable without touching logic.
- The module owns its DOM/CSS so a third client is one `createTouchControls`
  call — that reuse is the whole point of putting it in `packages/clients`.
