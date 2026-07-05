// Clerk Hespeth processes your deaths. Her dialogue tracks the count.
// Bit: stamps things that don't need stamping; the stamp is named
// Stampathy and is the only thing she loves.
// Wrong belief: that you will eventually stop dying.

const MILESTONES = [
  [0,  'Welcome to the Guild. Body bin\'s where it always is. You\'ll learn where that is.'],
  [1,  'Oh no.'],
  [2,  'Twice. Well. Stampathy says everyone gets a second one free.'],
  [3,  'Three. I\'ve started a column.'],
  [5,  'Five. I\'ve laminated the column.'],
  [10, 'Ten! Double digits. Stampathy made a little noise. It was not a proud noise.'],
  [15, 'Fifteen. The body bin has a plaque with your name now. We expense these things.'],
  [20, 'Twenty. You\'re past the deductible threshold where I\'m supposed to recommend a hobby. This is me recommending a hobby.'],
  [30, 'Stampathy and I were just talking about you.'],
  [40, 'Forty. I\'ve stopped stamping the forms. They know.'],
  [50, 'I\'m not going to say the number. We both know the number. Body bin\'s where it always is.']
];

/** Hespeth's line for a given lifetime death count. */
export function hespethLine(deaths) {
  let line = MILESTONES[0][1];
  for (const [n, l] of MILESTONES) {
    if (deaths >= n) line = l;
  }
  return line;
}

/** Resurrection-desk flavor for the death screen, itemized when the
 *  account is involved. garnish = { due, paid, fee, missed } or null. */
export function resurrectionNote(deductible, garnish = null) {
  let note = deductible > 0
    ? 'Resurrection plan: standard. Deductible applied: ' + deductible + ' g. *stamp*'
    : 'Resurrection plan: standard. Deductible applied: nothing, because you had nothing. *stamp* (sympathy stamp)';
  if (garnish) {
    note += ' Account minimum: ' + garnish.paid + ' of ' + garnish.due + ' g.';
    if (garnish.fee > 0) note += ' Convenience fee for paying by death: ' + garnish.fee + ' g.';
    if (garnish.missed) note += ' Short. Noted. (Your score felt that.)';
    note += ' *stamp*';
  }
  note += ' Complimentary Glurp: discontinued. (Budget.)';
  return note;
}
