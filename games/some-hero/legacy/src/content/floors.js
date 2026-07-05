// Stratum I — The Front Office (Floors 1–4). The Ledger reads the
// directory aloud on the way down. Deeper floors get plain numbers,
// except performance reviews, which are forever.

const FRONT_OFFICE = {
  1: 'Floor 1 — Reception. Please take a number. The numbers are also bones.',
  2: 'Floor 2 — Gift Shop. (UNSTAFFED SINCE THE INCIDENT.)',
  3: 'Floor 3 — Orientation. MIND THE GAP.',
  4: 'Floor 4 — Middle Management. (performance review approaching.)'
};

/** The descent toast for a floor. */
export function floorLine(f) {
  if (FRONT_OFFICE[f]) return FRONT_OFFICE[f];
  return f % 4 === 0
    ? 'Floor ' + f + ' — performance review approaching.'
    : 'Floor ' + f;
}
