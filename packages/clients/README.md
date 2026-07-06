# @golem-engine/clients

Renderers: canvas (some-hero's renderer behind an adapter) and terminal/chat.

## Mobile touch-controls layer (PR1 of mobile-ergonomics)

Plain ES modules, no build step — `exports: "."` points straight at
`src/index.js`.

- `src/gesture.js` — pure gesture engine (no DOM, no Math.random/Date.now).
  Consumes pointer samples (`{x,y,t,phase}`) and emits `{kind:"step",dx,dy}`
  / `{kind:"tap",x,y}`: a swipe + floating hold-stick hybrid seeded from
  some-hero's stick numbers (96px base / 44px radius / 7px deadzone), plus
  `SWIPE_MIN`/`SWIPE_MS`/`REPEAT_MS`/`TAP_MAX`/`TAP_MS` as the tuning
  surface. `node --test tests/gesture.test.js` is the primary verification
  — see the file header for the exact swipe/hold/tap disambiguation rules.
- `src/touch.js` — the DOM layer: `createTouchControls({target, onDir,
  onTap, actions, chat}) -> {destroy}`. Injects a scoped overlay + the
  some-hero mobile CSS recipe (viewport/touch-action/safe-area/clamp/
  tap-highlight/prefers-reduced-motion), shows only on touch/coarse-pointer,
  and is inert on mouse-only desktops. Also exports `isCoarsePointer()` so
  a game's own auto-focus decisions (e.g. golem-grid's chat input) can use
  the same signal this module uses for its own visibility.

Consumed by `games/golem-grid` (movement, tap-context menu, the chat
toggle that keeps the soft keyboard from popping on touch); topdown-puzzle
wiring is a later PR.
