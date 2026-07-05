// Keyboard: WASD/arrows to move, space/J/E/Enter to attack-or-confirm, K for potion.

export function makeKeyboard({ onConfirm, onPotion }) {
  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'j' || e.key.toLowerCase() === 'e') onConfirm();
    if (e.key.toLowerCase() === 'k') onPotion();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  return {
    keys,
    /** Movement intent from held keys, or null if none. */
    moveVector() {
      let mx = 0, my = 0;
      if (keys['a'] || keys['arrowleft']) mx = -1;
      if (keys['d'] || keys['arrowright']) mx = 1;
      if (keys['w'] || keys['arrowup']) my = -1;
      if (keys['s'] || keys['arrowdown']) my = 1;
      return { mx, my };
    }
  };
}
