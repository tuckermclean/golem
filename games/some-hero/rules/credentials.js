// The Door Golem of Credential Verification. missingCredentials/
// swordVerdict/grantBackstory/grantDebt ported from
// games/some-hero/legacy/src/systems/credentials.js; entryLines/
// approvalLines ported from games/some-hero/legacy/src/content/golem.js
// (per the S2a design spec's explicit grouping: "credentials.js ->
// rules/credentials.js: ... entryLines, approvalLines (the last two
// consume table:door_golem_*)"). Backstory and debt are knowledge (meta,
// permanent); the sword is whatever is currently in your hand — read
// live off game.player.swordLv, never persisted.

import { tableRows } from "./pack.js";

/** Which credentials are still missing? (credentials.js:13-19) */
export function missingCredentials(meta, swordLv = 1) {
  const m = [];
  if (swordLv < 1) m.push("sword");
  if (!meta.credentials.backstory) m.push("backstory");
  if (!meta.credentials.debt) m.push("debt");
  return m;
}

/** (credentials.js:21-24) */
export function grantBackstory(meta) {
  meta.credentials.backstory = true;
  return meta;
}

/** (credentials.js:26-29) */
export function grantDebt(meta) {
  meta.credentials.debt = true;
  return meta;
}

/** The golem's verdict on whatever sword-shaped object you're holding.
 *  Not table-fed: S1's tables.mjs does not extract these (not in its
 *  16-table inventory), so they stay literal, faithful to
 *  credentials.js:32-38. */
export function swordVerdict(swordLv) {
  if (swordLv >= 4) return "Sword: sun-steel. Extremely sword-shaped. The golem is moved.";
  if (swordLv === 3) return "Sword: engineered composite. The golem has read the materials data sheet. Approved, reluctantly, on page nine.";
  if (swordLv === 2) return 'Sword: a DIRK!™. "Basically a sword." The golem has read the case law. It counts.';
  if (swordLv === 1) return "Sword: technically. The golem has seen swordfish pass this checkpoint. Approved.";
  return "Sword: an open hand. The golem has checked both. It does not count.";
}

// table:door_golem_credential_lines — [{key, text}], golem.js:10-12.
const CRED_LINES = tableRows("table:door_golem_credential_lines");

function credLine(key) {
  const row = CRED_LINES.find(r => r.key === key);
  return row.text;
}

// table:door_golem_entry_lines — [HALT line, DENIED line], golem.js:18,22.
const ENTRY_LINES = tableRows("table:door_golem_entry_lines");

/** Blocked at the dungeon mouth: list verdicts, slowly. Table-fed. (golem.js:15-24) */
export function entryLines(game, missing) {
  const lines = [ENTRY_LINES[0], swordVerdict(game.player.swordLv)];
  for (const m of missing) lines.push(credLine(m));
  lines.push(ENTRY_LINES[1]);
  return lines;
}

// table:door_golem_approval_lines — 10 static lines (row[0] is the shared
// HALT line, rows[1..9] are the rest); swordVerdict's dynamic result is
// spliced in at index 1, exactly where golem.js:30 puts it. golem.js:27-41.
const APPROVAL_LINES = tableRows("table:door_golem_approval_lines");

/** The stamp ceremony. The pause is sacred; do not cut the pause. Table-fed. (golem.js:26-41) */
export function approvalLines(game) {
  return [APPROVAL_LINES[0], swordVerdict(game.player.swordLv), ...APPROVAL_LINES.slice(1)];
}
