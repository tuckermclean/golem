/* ── INPUT: capture-phase arrow keys → sendCmd("move dx dy"). Mirrors
   games/golem-grid/src/input.js's "arrows are feet, always, capture
   phase" bullet verbatim — one key, one meaning, no context-sensitive
   controls (doctrine). Ignores keys once `state.over` (the puzzle ends,
   input stops meaning anything). No DOM state mutation outside
   dispatched commands — this module only ever calls `sendCmd`. ─────── */
const DIRS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

export function createInput(S, deps) {
  const { sendCmd, isOver } = deps;

  function onKeydown(e) {
    const d = DIRS[e.key];
    if (!d) return;
    if (isOver()) return;
    e.preventDefault();
    e.stopPropagation();
    sendCmd(`move ${d[0]} ${d[1]}`);
  }

  document.addEventListener("keydown", onKeydown, true); // capture phase

  return { onKeydown };
}
