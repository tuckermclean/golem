/* ── some-hero Ceremony content — tables (DELTA S1 PR2).
   Hand-transcribed from games/some-hero/legacy/src/** by a human reading
   the legacy source, per docs/superpowers/specs/
   2026-07-07-s1-content-extraction-design.md ("Legacy code untouched" —
   mechanism, same as entities.mjs/PR1). This file imports NOTHING from
   legacy/; every extracted string below carries a `file:line` citation
   to its legacy source and is byte-identical to that source. Tests MAY
   import legacy (games/some-hero/tests/content-review.test.js) — that's
   how the design spec's content-review checklist proves byte-identity;
   this file itself never does.

   Table id note: the design spec's inventory table writes ids with dots
   (e.g. "table:ledger.house_style"), but packages/content/schemas/
   pack.v1.json's TableId pattern is `^table:[a-z][a-z0-9_-]*$` — no dot
   is a legal character. Every id below therefore uses an underscore
   where the spec's prose used a dot (e.g. `table:ledger_house_style`),
   a mechanical rename only; no table's rows or scope changed. (READ
   FIRST item #4's instruction: "match what the compiler actually
   accepts.")

   Litmus (design spec, "Scope boundaries"): a `function` in legacy is
   S2's; a string/const array/object is S1's. Where a string lives
   inside a function (e.g. `sealMsg`'s branches, `nextRiddle`'s question
   text), the STRING is extracted here but not the branching — and where
   a "string" is actually built by runtime concatenation with a variable
   (no single literal spans it), it is treated as logic and left for S2;
   see the riddle.js section below for the one such case.

   Row shapes: RuntimeTable.rows is `JsonValue[]` (packages/content/src/
   types.ts). Where legacy holds a keyed object (CRED_LINES, lootLine's
   map, gradeRemark's map) rather than a bare array, rows here are
   `{key, text}`-shaped (or `{grade, remark}` / `{kind, text}`) preserving
   every legacy string with an explicit label, in legacy's own source
   order — never a bare positional array for keyed data, so nothing
   downstream depends on fragile ordering-as-identity for those cases.
   Regex-driven data (HOUSE_STYLE) is decomposed into plain-string
   `{word, replacement}` pairs (a RegExp instance is not valid JsonValue);
   the `\b`/`gi` matching mechanics themselves are legacy's `ledgerize()`
   *logic* (S2's/already-shipped, not re-implemented here) — only the
   (word, replacement) content pairs are authored data. */

export const TABLE_DEFS = [
  // ── games/some-hero/legacy/src/systems/ledger.js ───────────────────

  // HOUSE_STYLE substitution pairs — ledger.js:11-14. `word` is the
  // literal token \bWORD\b matches (case-insensitive, word-boundaried
  // by ledgerize()'s own regex — that mechanism is not re-encoded here);
  // `replacement` is byte-identical to each pair's second element.
  {
    id: "table:ledger_house_style",
    rows: [
      { word: "original", replacement: "origenal" }, // ledger.js:11
      { word: "definitely", replacement: "definately" }, // ledger.js:12
      { word: "victorious", replacement: "victoreous" }, // ledger.js:13
      { word: "nemesis", replacement: "nemisis" }, // ledger.js:14
    ],
  },

  // CAUSE_REPORTS — only the four reachable causes on the Ceremony route
  // (skeleton/mailbat/consultant fightable, `unknown` the fallback);
  // the retired desert roster / pigeon / goose / veteran / reenactor /
  // cabinet entries are excluded per the design spec's locked scope.
  // One table per cause (spec: "table:ledger.cause_reports_skeleton" /
  // "_mailbat" / "_consultant" / "_unknown"), each row a plain string,
  // in legacy's own array order.
  {
    id: "table:ledger_cause_reports_skeleton",
    rows: [
      "Cause of death: skeleton. Contributing factor: hubris. Recommended action: less hubris.", // ledger.js:29
      "Deceased was outperformed by a member of Local 206. The union has filed this under wins.", // ledger.js:30
      "Cause of death: skeleton. He was on break. He clocked back in for you.", // ledger.js:31
    ],
  },
  {
    id: "table:ledger_cause_reports_mailbat",
    rows: [
      "Cause of death: mailbat. The memo was marked URGENT. So, it turns out, was the mailbat.", // ledger.js:34
      "Employee failed to sign for a delivery. Delivery insisted.", // ledger.js:35
      "Cause of death: mailbat. Return to sender was not an option. You were the address.", // ledger.js:36
    ],
  },
  {
    id: "table:ledger_cause_reports_consultant",
    rows: [
      "Cause of death: consultant. Walls are for employees. It is not an employee. It billed for the hour anyway.", // ledger.js:39
      "Employee was restructured. The consultant has identified further efficiencies.", // ledger.js:40
      "Cause of death: consultant. Invoice attached. The invoice is also attached to you.", // ledger.js:41
    ],
  },
  {
    id: "table:ledger_cause_reports_unknown",
    rows: [
      'Cause of death: unclear. The form does not have a box for this. We made a box. It says "?".', // ledger.js:96
      "Employee died of causes. Investigation ongoing. (It is not ongoing.)", // ledger.js:97
      "Cause of death: the Downstairs. Broadly.", // ledger.js:98
    ],
  },

  // GRADES (ledger.js:116) + gradeRemark's remark strings (ledger.js:
  // 146-153), one row per grade, in GRADES' own F->S order.
  {
    id: "table:ledger_grade_remarks",
    rows: [
      { grade: "F", remark: "The Ledger is not angry. The Ledger is documenting." }, // ledger.js:152
      { grade: "D", remark: "The Ledger has written this page in pencil, out of mercy." }, // ledger.js:151
      { grade: "C", remark: "Our hero strode boldly into the— FINE. Walked. The grade stands." }, // ledger.js:150
      { grade: "B", remark: "Adequate. The king would be proud, which should worry you." }, // ledger.js:149
      { grade: "A", remark: "The Ledger is prepared to call this heroism, with reservations." }, // ledger.js:148
      { grade: "S", remark: "The Ledger has used its BEST pen." }, // ledger.js:147
    ],
  },

  // lootLine's 3 strings (ledger.js:158-160) — included even though none
  // drops on floor 1 (design spec locked decision #4: authored-but-not-
  // yet-reachable, pinned by ledger-text.ceremony.test.js as frozen
  // behavior).
  {
    id: "table:ledger_loot_lines",
    rows: [
      {
        kind: "sword",
        text: "SUN-STEEL. AN ACTUAL SWORD. EXTREMELY THE GOOD KIND. The Ledger is pressing very hard with the pen.", // ledger.js:158
      },
      { kind: "maxheart", text: "CONSTITUTION INCREASE. The Ledger has underlined it twice." }, // ledger.js:159
      {
        kind: "amulet",
        text: "TICKET #44,107: STAMPED. The Ledger is doing a voice. It is the same voice.", // ledger.js:160
      },
    ],
  },

  // union206Line / internLine (ledger.js:167, :172) — the two standalone
  // Ledger one-liners with no shared object grouping in legacy.
  {
    id: "table:ledger_misc",
    rows: [
      "The deceased was a dues-paying member of Rattling Brotherhood Local 206. The union has been notified. The union has a newsletter.", // ledger.js:167 (union206Line)
      "It was an intern. It was TECHNICALLY doing its best. The Ledger has noted this. The Ledger will keep noting it.", // ledger.js:172 (internLine)
    ],
  },

  // ── games/some-hero/legacy/src/content/golem.js ────────────────────

  // CRED_LINES (golem.js:10-12) — the credential-missing lines, keyed by
  // the exact push token missingCredentials()/entryLines() use
  // ('sword'/'backstory'/'debt' — legacy/src/systems/credentials.js:
  // 15-17, same fact-key naming entities.mjs's door_golem Lock uses).
  {
    id: "table:door_golem_credential_lines",
    rows: [
      {
        key: "sword",
        text: "Sword-shaped object: NOT DETECTED. The golem has checked both of your hands. Twice. A man in the west meadow has… inventory.", // golem.js:10
      },
      {
        key: "backstory",
        text: "Tragic backstory: NOT ON FILE. Must be notarized. Clerk Hespeth stamps; the Ledger writes. The Ledger is… available. Unfortunately.", // golem.js:11
      },
      {
        key: "debt",
        text: "Crippling debt: NONE DETECTED. The golem is concerned. Adventurers without debt have options. Options are dangerous. The gift shop extends credit.", // golem.js:12
      },
    ],
  },

  // entryLines()'s blocked-entry copy (golem.js:18, :22) — the array's
  // static lines only; swordVerdict(...)'s dynamic call result (golem.js:
  // 19, imported from systems/credentials.js) is logic, not extracted,
  // and the per-`missing` CRED_LINES loop (golem.js:21) is already its
  // own table above. The opening HALT line duplicates entities.mjs's
  // door_golem Interactable.prompt (golem.js:18 is shared by both
  // entryLines() and approvalLines()) — kept here too so this table is
  // entryLines()'s full static copy, byte-identical, not a paraphrase.
  {
    id: "table:door_golem_entry_lines",
    rows: [
      "HALT. Credential verification. The golem will now verify. Credentials.", // golem.js:18
      "ENTRY: DENIED. The golem takes no pleasure in this. The golem takes no pleasure in anything. It is a compliance feature.", // golem.js:22
    ],
  },

  // approvalLines()'s granted copy (golem.js:29, 31-39) — same rule:
  // every static line, excluding only swordVerdict(...)'s dynamic call
  // result (golem.js:30).
  {
    id: "table:door_golem_approval_lines",
    rows: [
      "HALT. Credential verification. The golem will now verify. Credentials.", // golem.js:29
      "Tragic backstory: notarized. The golem read it. The golem does not wish to discuss page two.", // golem.js:31
      "Crippling debt: verified. Congratulations.", // golem.js:32
      "The golem will now stamp your ticket.", // golem.js:33
      "…", // golem.js:34
      "…", // golem.js:35
      "(He is lining it up.)", // golem.js:36
      "…", // golem.js:37
      "*stamp*", // golem.js:38
      "It is crooked. The golem knows it is crooked. Proceed. PROCEED.", // golem.js:39
    ],
  },

  // ── games/some-hero/legacy/src/systems/puzzles.js ──────────────────

  // sealMsg's STRINGS only (puzzles.js:19-28), not the type-dispatch
  // branching. Four branches are fully static single-piece messages
  // (warden/final/key/riddle); three (plates/traps/torch — torch is the
  // function's final catch-all default, the only other puzzle type in
  // the system per updateTorches/igniteBraziers' `pz.type === 'torch'`
  // checks elsewhere in this file) interpolate `puzzle.done`/`puzzle.
  // need`/`puzzle.n`. Each row's `parts` is the sequence of literal
  // string fragments around those interpolation points, byte-identical
  // to the concatenation operands in source — reconstructing the full
  // message (parts joined with the run-time values in between) is S2's
  // job, same as `numberOptions`.
  {
    id: "table:seal_messages",
    rows: [
      { type: "warden", parts: ["The seal holds — slay the Warden."] }, // puzzles.js:20
      { type: "final", parts: ["The cancellation desk is here. The Hero stands between you and it."] }, // puzzles.js:21
      { type: "key", parts: ["Sealed. A bronze key lies on this floor."] }, // puzzles.js:22
      {
        type: "plates",
        // 'Sealed. Push the blocks onto the glowing plates (' + puzzle.done + '/' + puzzle.need + ').'
        parts: ["Sealed. Push the blocks onto the glowing plates (", "/", ")."], // puzzles.js:23
      },
      { type: "riddle", parts: ["Sealed. The door has a question. The door has been waiting."] }, // puzzles.js:24
      {
        type: "traps",
        // 'Sealed. INCIDENT COUNTER: ' + puzzle.done + '/' + puzzle.need + '. The traps ran out of darts years ago. Nobody told the counter. Step on them.'
        parts: [
          "Sealed. INCIDENT COUNTER: ",
          "/",
          ". The traps ran out of darts years ago. Nobody told the counter. Step on them.",
        ], // puzzles.js:25-26
      },
      {
        type: "torch",
        // 'Sealed. All ' + puzzle.n + ' braziers must burn at once.' — the function's default/catch-all branch.
        parts: ["Sealed. All ", " braziers must burn at once."], // puzzles.js:27
      },
    ],
  },

  // ── games/some-hero/legacy/src/systems/riddle.js ───────────────────

  // The door's question templates (nextRiddle, riddle.js:41-83) — STRINGS
  // only, in the function's own attempts-descending branch order.
  // Excluded: the `attempts === 0` branch with `kinds.length` (riddle.js:
  // 71-78) — that question is built by runtime string concatenation
  // interpolating a kind name resolved through KIND_NAMES (riddle.js:
  // 11-17), so no single byte-identical literal spans it; per this
  // file's header litmus that is logic (a templated construction, same
  // exclusion rationale as `numberOptions`), left for S2. The other four
  // branches' question text has NO interpolation at all (only the
  // `options` arrays are parameterized, via `numberOptions` — already
  // excluded) so all four are extracted whole.
  {
    id: "table:riddle_questions",
    rows: [
      'The door sighs. A long one. "What’s… what’s your name."', // riddle.js:47 (attempts >= 3, "shame" question)
      '"Fine. What floor is this." (It is written on the door. The door knows you won’t check.)', // riddle.js:59 (attempts === 2)
      '"Easier, then. How many Glurps has our hero consumed this run?" (See label.)', // riddle.js:66 (attempts === 1)
      '"How many foes has our hero dispatched this run? Counting is heroic. Probably."', // riddle.js:80 (attempts === 0, no kills-by-kind fallback)
    ],
  },

  // The shame-path's 3 answer options (riddle.js:49-53) — the a>=3
  // branch's `options` array, verbatim (every option is `correct: true`;
  // the door accepts anything once it's asking your name).
  {
    id: "table:riddle_shame_options",
    rows: [
      { label: "Some Hero", correct: true }, // riddle.js:50
      { label: "TICKET #44,107", correct: true }, // riddle.js:51
      { label: "The new hire", correct: true }, // riddle.js:52
    ],
  },

  // doorSigh's 3 escalating disappointment lines (riddle.js:109-111),
  // indexed by Math.min(attempts - 1, 2) in legacy — that indexing/clamp
  // is logic, left in place; the 3 lines themselves are the content.
  {
    id: "table:riddle_door_sighs",
    rows: [
      '"…No." The door exhales through a keyhole it does not have.', // riddle.js:109
      '"That is— no. Again, no." The hinges creak in a way that means something.', // riddle.js:110
      '"I learned riddles for this." A pause you can stand in.', // riddle.js:111
    ],
  },

  // ── games/some-hero/legacy/src/content/floors.js ───────────────────

  // FRONT_OFFICE[1] only — the floor-1 descent line (design spec: "floor-
  // 1 descent line; adjacent floors optional"; floors 2-4 and the
  // generic `f % 4 === 0` / plain-number fallback are out of scope for
  // the Ceremony route, which never leaves floor 1).
  {
    id: "table:floors_descent_lines",
    rows: [
      "Floor 1 — Reception. Please take a number. The numbers are also bones.", // floors.js:6
    ],
  },
];
