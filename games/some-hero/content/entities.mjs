/* ── some-hero Ceremony content — entities (DELTA S1 PR1).
   Hand-transcribed from games/some-hero/legacy/src/** by a human reading
   the legacy source (docs/superpowers/specs/
   2026-07-07-s1-content-extraction-design.md, "Legacy code untouched" —
   mechanism). This file imports NOTHING from legacy/; every extracted
   string/number below carries a `file:line` citation to its legacy
   source and is byte-identical to that source (design spec, "Every
   extracted string/number...").

   Component names are exactly packages/kernel/src/components.ts's C3
   vocabulary (Identity/Interactable/Lock/Credential/Portable/Health) plus
   an opaque `Actor{...}` stat bag for enemies — the same "C1 does not
   validate component shape" latitude games/topdown-puzzle/content/
   entities.mjs already relies on (that file's own header comment), used
   here per the design spec's locked decision #6.

   Scope: PR1 only. No tables (Ledger/golem/riddle copy) yet — that's
   PR2. No riddle/seal-puzzle entities yet — the design spec's "Enemy
   floor" + "Door Golem"/"credentials" inventory items only, per the PR1
   DoD ("this PR proves the Door-Golem/Credential/Lock/enemy content
   actually fits C1's schema before the transcription labor"). */

export const ENTITY_DEFS = [
  // ── Door Golem ─────────────────────────────────────────────────────
  // games/some-hero/legacy/src/content/golem.js:1 — "The Door Golem of
  // Credential Verification." Pure narrative/logic in legacy (no world
  // entity there); this is S1's authored `entity:door_golem`, the
  // placement target S2 will wire real gate logic onto (design spec,
  // "What 'the route' concretely is").
  {
    id: "entity:door_golem",
    components: {
      Identity: { name: "Door Golem" }, // legacy/src/content/golem.js:1
      Interactable: {
        // The golem's ritual opening line, verbatim — appears at the
        // start of BOTH entryLines() (blocked) and approvalLines()
        // (granted): legacy/src/content/golem.js:18 and :29.
        prompt: "HALT. Credential verification. The golem will now verify. Credentials.",
      },
      Lock: {
        // The three credentials credentials.js's missingCredentials()
        // checks (swordLv < 1 -> 'sword'; !meta.credentials.backstory ->
        // 'backstory'; !meta.credentials.debt -> 'debt' — legacy/src/
        // systems/credentials.js:14-18). Fact keys below are S1-authored
        // plumbing naming each gate after that push value (not
        // legacy-literal strings themselves, since legacy never composes
        // a "credential_sword" identifier — only the bare 'sword' token);
        // see design spec locked decision #2.
        unlockCondition: {
          all: [
            { fact: "credential_sword" }, // legacy/src/systems/credentials.js:15
            { fact: "credential_backstory" }, // legacy/src/systems/credentials.js:16
            { fact: "credential_debt" }, // legacy/src/systems/credentials.js:17
          ],
        },
        // The stamp ceremony that concludes a successful verification —
        // legacy/src/content/golem.js:33 ("The golem will now stamp your
        // ticket.") through :38 ('*stamp*'). Modeled as the Lock's key,
        // referencing the credential_stamp entity below (mirrors
        // packages/content/tests/fixtures/sample-pack.json's own
        // door_golem/credential_stamp Lock.key shape exactly).
        key: { $ref: "entity:credential_stamp" },
      },
    },
  },

  // ── The three credentials ──────────────────────────────────────────
  // legacy/src/systems/credentials.js:1-10 — a sword-shaped object, a
  // notarized tragic backstory, and crippling debt. Backstory/debt are
  // permanent meta knowledge (games/some-hero/legacy/src/core/meta.js:
  // 16-19's `credentials: { backstory, debt }`); sword is whatever's
  // currently in hand. C3's Credential{tier:number} doesn't model three
  // independent boolean gates, so each is its own presence-marker entity
  // (design spec locked decision #2) rather than one shared shape.
  {
    id: "entity:credential_sword",
    components: {
      // 'sword' is the exact push value missingCredentials() uses for
      // this gate: legacy/src/systems/credentials.js:15.
      Identity: { name: "sword" },
      Credential: { tier: 1 },
    },
  },
  {
    id: "entity:credential_backstory",
    components: {
      // 'backstory': legacy/src/systems/credentials.js:16.
      Identity: { name: "backstory" },
      Credential: { tier: 1 },
    },
  },
  {
    id: "entity:credential_debt",
    components: {
      // 'debt': legacy/src/systems/credentials.js:17.
      Identity: { name: "debt" },
      Credential: { tier: 1 },
    },
  },

  // ── The stamp ───────────────────────────────────────────────────────
  // The physical artifact of the stamp ceremony (legacy/src/content/
  // golem.js:33-38, "The golem will now stamp your ticket." ... '*stamp*').
  // Named "Ceremony Stamp" following packages/content/tests/fixtures/
  // sample-pack.json's own precedent for this exact concept (that
  // fixture's `entity:credential_stamp`) — an authored label, not a
  // legacy-literal string (legacy never names the stamp object itself).
  {
    id: "entity:credential_stamp",
    components: {
      Identity: { name: "Ceremony Stamp" },
      Portable: {},
    },
  },

  // ── Tomb floor 1 enemies ────────────────────────────────────────────
  // games/some-hero/legacy/src/entities/enemy.js:12-18's ENEMY_TYPES —
  // the four kinds fightable on floor 1 (design spec's "Enemy floor":
  // skeleton/mailbat/consultant fightable, slime "the interns" passive;
  // `cabinet` spawns floors 3+ and is excluded). Stats are transcribed
  // verbatim into an opaque Actor{} bag per design spec locked decision
  // #6 (no C3 combat component exists yet); Health{hp,max} mirrors
  // mkEnemy()'s own `hp: base.hp, maxhp: base.hp` (enemy.js:36).
  {
    id: "entity:enemy_skeleton",
    components: {
      Identity: { name: "skeleton" },
      // hp:4, spd:62, dmg:1, xp:6, r:11, col:'#e8e2d0', aggro:150 —
      // legacy/src/entities/enemy.js:14.
      Health: { hp: 4, max: 4 },
      Actor: { spd: 62, dmg: 1, xp: 6, r: 11, col: "#e8e2d0", aggro: 150 },
    },
  },
  {
    id: "entity:enemy_mailbat",
    components: {
      Identity: { name: "mailbat" },
      // hp:6, spd:118, dmg:1, xp:10, r:12, col:'#5a5a6e', aggro:210 —
      // legacy/src/entities/enemy.js:15.
      Health: { hp: 6, max: 6 },
      Actor: { spd: 118, dmg: 1, xp: 10, r: 12, col: "#5a5a6e", aggro: 210 },
    },
  },
  {
    id: "entity:enemy_consultant",
    components: {
      Identity: { name: "consultant" },
      // hp:9, spd:54, dmg:2, xp:16, r:12, col:'#9bb0c4', aggro:240,
      // ghost:true — legacy/src/entities/enemy.js:16.
      Health: { hp: 9, max: 9 },
      Actor: { spd: 54, dmg: 2, xp: 16, r: 12, col: "#9bb0c4", aggro: 240, ghost: true },
    },
  },
  {
    id: "entity:enemy_slime",
    components: {
      Identity: { name: "slime" },
      // hp:3, spd:18, dmg:0, xp:1, r:10, col:'#7fc95f', aggro:0,
      // passive:true — legacy/src/entities/enemy.js:18. ("the interns" —
      // design spec's "Enemy floor" note; passive: never chases, never
      // contact-hurts, per enemy.js:5's flag legend.)
      Health: { hp: 3, max: 3 },
      Actor: { spd: 18, dmg: 0, xp: 1, r: 10, col: "#7fc95f", aggro: 0, passive: true },
    },
  },
];
