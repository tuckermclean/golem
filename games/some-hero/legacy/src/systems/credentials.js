// The Door Golem of Credential Verification requires three things of any
// adventurer entering the Downstairs:
//   (a) a sword       — any sword-shaped object passes (tier >= 1; an open
//                       hand does not count, and the golem will check).
//   (b) a tragic backstory — notarized. The Ledger writes it (florid,
//                       house spelling); Clerk Hespeth stamps it.
//   (c) crippling debt — one purchase on credit from the gift shop suffices.
//
// Backstory and debt are knowledge (meta, permanent); the sword is whatever
// is currently in your hand.

/** Which credentials are still missing? */
export function missingCredentials(meta, swordLv = 1) {
  const m = [];
  if (swordLv < 1) m.push('sword');
  if (!meta.credentials.backstory) m.push('backstory');
  if (!meta.credentials.debt) m.push('debt');
  return m;
}

export function grantBackstory(meta) {
  meta.credentials.backstory = true;
  return meta;
}

export function grantDebt(meta) {
  meta.credentials.debt = true;
  return meta;
}

/** The golem's verdict on whatever sword-shaped object you're holding. */
export function swordVerdict(swordLv) {
  if (swordLv >= 4) return 'Sword: sun-steel. Extremely sword-shaped. The golem is moved.';
  if (swordLv === 3) return 'Sword: engineered composite. The golem has read the materials data sheet. Approved, reluctantly, on page nine.';
  if (swordLv === 2) return 'Sword: a DIRK!\u2122. "Basically a sword." The golem has read the case law. It counts.';
  if (swordLv === 1) return 'Sword: technically. The golem has seen swordfish pass this checkpoint. Approved.';
  return 'Sword: an open hand. The golem has checked both. It does not count.';
}
