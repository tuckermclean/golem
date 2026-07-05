// Transient toast messages. Duration scales with reading length; messages
// queue instead of clobbering each other. A queued toast may preempt the
// current one after a minimum display, so feedback never lags far behind
// the game.

const MIN_SHOW = 1.2;                                   // before a preempt
const duration = msg => Math.max(2.4, Math.min(7, msg.length / 14));

export function makeToast(el) {
  let t = 0;          // time left on the current toast
  let shown = 0;      // how long the current toast has been up
  const queue = [];

  function display(msg) {
    el.textContent = msg;
    el.style.opacity = 1;
    t = duration(msg);
    shown = 0;
  }

  return {
    show(msg) {
      if (t <= 0) display(msg);
      else {
        if (queue.length >= 3) queue.shift();           // keep the freshest three
        queue.push(msg);
      }
    },
    tick(dt) {
      if (t <= 0) return;
      t -= dt;
      shown += dt;
      if (queue.length && shown >= MIN_SHOW) display(queue.shift());
      else if (t <= 0) {
        if (queue.length) display(queue.shift());
        else el.style.opacity = 0;
      }
    }
  };
}
