// Floating virtual stick (left side of the screen).

export function makeStick(baseEl, knobEl) {
  const stick = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };

  function start(e) {
    stick.active = true; stick.id = e.pointerId;
    stick.ox = e.clientX; stick.oy = e.clientY;
    stick.dx = 0; stick.dy = 0;
    baseEl.style.display = 'block'; knobEl.style.display = 'block';
    baseEl.style.left = (e.clientX - 48) + 'px'; baseEl.style.top = (e.clientY - 48) + 'px';
    knobEl.style.left = (e.clientX - 22) + 'px'; knobEl.style.top = (e.clientY - 22) + 'px';
  }

  function move(e) {
    if (!stick.active || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const m = Math.hypot(dx, dy), max = 44;
    if (m > max) { dx = dx / m * max; dy = dy / m * max; }
    stick.dx = Math.abs(dx) < 7 ? 0 : dx / max;
    stick.dy = Math.abs(dy) < 7 ? 0 : dy / max;
    knobEl.style.left = (stick.ox + dx - 22) + 'px';
    knobEl.style.top = (stick.oy + dy - 22) + 'px';
  }

  function end(e) {
    if (!stick.active || e.pointerId !== stick.id) return;
    stick.active = false; stick.dx = 0; stick.dy = 0;
    baseEl.style.display = 'none'; knobEl.style.display = 'none';
  }

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  return { stick, start };
}
