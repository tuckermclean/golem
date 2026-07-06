#!/usr/bin/env node
/* ── tools/lang/gen_utterances.js — L2's synthetic data pipeline (design
 * doc §"Synthetic data pipeline"). First-cut: deterministic, seeded
 * templates, no teacher model (none is reachable in this sandbox — see
 * the design doc's "Deferred" note). Harvests the REAL grammar L1
 * already ships (tables.ts's VERB_ALIASES/DIRECTION_ALIASES, the
 * lantern/sign/door/Aria/Bram affordance fixture L1's own corpus
 * already uses) and produces two committed fixtures:
 *
 *   packages/language/tests/fixtures/classifier-corpus.json
 *   packages/language/tests/fixtures/adversarial-suite.json
 *
 * ALL randomness goes through @golem-engine/random's channel(...),
 * seeded by fixed strings — never Math.random/Date.now (DELTA §0.3,
 * CLAUDE.md doctrine, tools/check-bans.mjs now scans this directory).
 * Re-running this script on an unchanged repo is expected to reproduce
 * both files byte-for-byte (the CI "corpus/weights drift check", design
 * doc §"DoD as machine-checkable CI" #4, kept per the orchestrator's
 * lock even though the weights-diff half of that check was dropped). */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { channel, pick, rint } from "@golem-engine/random";
import { parse } from "../../packages/language/dist/index.js";
import { affordances } from "../../packages/language/tests/fixtures/affordances.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_CORPUS = join(__dirname, "../../packages/language/tests/fixtures/classifier-corpus.json");
const OUT_ADVERSARIAL = join(__dirname, "../../packages/language/tests/fixtures/adversarial-suite.json");

// ── Harvest (design doc §"Synthetic data pipeline", step 1) ──────────
// Directions: a naturalistic subset of DIRECTION_ALIASES' keys (the
// arrow glyphs are a UI affordance, not something anyone types).
const DIRS = ["north", "south", "east", "west", "up", "down", "left", "right"];

// Nouns: the take/look affordance names L1's own fixture already
// harvests (packages/language/tests/fixtures/affordances.js), plus a
// small hand-authored extra set for lexical variety beyond that single
// fixture (commented, per the design doc's "small authored noun/name
// vocabulary standing in for real affordances" carve-out).
const HARVESTED_NOUNS = [...new Set(affordances.map((a) => a.name.toLowerCase()))];
const EXTRA_NOUNS = ["torch", "key", "gem", "scroll", "shield", "map", "coin", "banner", "chest", "idol"];
const NOUNS = [...HARVESTED_NOUNS, ...EXTRA_NOUNS];

// Names: the two "look"-affordance player stand-ins the L1 fixture
// already ships (Aria, Bram) — harvested, not invented.
const NAMES = [...new Set(affordances.filter((a) => /^[A-Z]/.test(a.name)).map((a) => a.name))];

// ── Templates (design doc §"Synthetic data pipeline", step 2): 15-30
// naturalistic phrasings per label, deliberately NOT table-matching L1
// (questions, politeness wrapping, indirect requests, typos). Every
// template is validated below (assertL1Miss) against the REAL L1
// parse() before being accepted into the corpus — a template that
// accidentally table-matches (e.g. leading with a verb alias, or a
// noun phrase ground.ts's substring scoring would accidentally hit) is
// a generator bug, not acceptable training data, and fails the build
// loudly rather than silently poisoning the corpus. ───────────────────
const TEMPLATES = {
  move: [
    "could you head {dir}",
    "would you mind going {dir}",
    "can we go {dir} please",
    "lets walk toward the {dir}",
    "i think we should head {dir}",
    "please move {dir} now",
    "can you shift {dir} a bit",
    "mind heading {dir} for me",
    "swing {dir} for a second",
    "scoot {dir} please",
    "try heading {dir} instead",
    "maybe go {dir} next",
    "we ought to travel {dir}",
    "i want to walk {dir}",
    "start moving {dir} now",
    "just go {dir} already",
    "why dont we head {dir}",
    "lets try going {dir}",
    "could we shift {dir}",
    "time to move {dir}",
  ],
  take: [
    "could you grab the {noun}",
    "can you get me the {noun}",
    "i need the {noun}",
    "would you mind grabbing the {noun}",
    "please pick up that {noun}",
    "mind snagging the {noun} for me",
    "we should grab that {noun}",
    "i want the {noun} please",
    "can somebody take the {noun}",
    "lets get the {noun} quickly",
    "someone grab the {noun}",
    "cn u tak the {noun}",
    "could we snag a {noun}",
    "i really need that {noun}",
    "would you grab me the {noun}",
    "please fetch the {noun}",
    "can you nab the {noun}",
    "time to grab the {noun}",
    "i should probably take the {noun}",
    "quick grab the {noun} please",
  ],
  look: [
    "could you check out the {noun}",
    "what does the {noun} look like",
    "i want to see the {noun}",
    "can we examine the {noun}",
    "peek at the {noun} please",
    "mind looking at the {noun}",
    "lets inspect the {noun}",
    "can you check the {noun}",
    "i want a closer look at the {noun}",
    "whats on the {noun}",
    "can somebody examine the {noun}",
    "id like to inspect the {noun}",
    "can you have a look at the {noun}",
    "mind checking the {noun} for me",
    "whats that {noun} look like",
    "could you peek at the {noun}",
    "we should check the {noun}",
    "i wonder what the {noun} looks like",
    "can you glance at the {noun}",
    "lets check out that {noun}",
  ],
  read: [
    "could you read that for us",
    "what does it say",
    "can you read the inscription out loud",
    "id like to hear what it says",
    "can someone read this",
    "whats written here",
    "please read it aloud",
    "can you make out the words",
    "what does the writing say",
    "mind reading that out loud",
    "can you tell me whats written",
    "lets hear what it says",
    "could someone read this for me",
    "whats the inscription say",
    "can you read that sign for us",
    "can we get a reading of that",
    "whats that inscription about",
    "please tell us what it says",
    "could you decipher that writing",
    "what does the stone say",
  ],
  say: [
    "just wanted to mention the {noun} looks interesting",
    "quick thought about heading {dir}",
    "just saying this place feels off",
    "wanted to let you all know i found a {noun}",
    "gonna mention the {noun} is glowing",
    "just chiming in about the {dir} path",
    "figured id say hi to everyone",
    "just noting the {noun} seems important",
    "wanted to say the {dir} route looks safer",
    "just thought id mention the {noun}",
    "gonna say this dungeon is huge",
    "just letting you know about the {noun}",
    "figured id mention we found a {noun}",
    "just wanted to say good luck everyone",
    "wanted to note the {dir} side looks clear",
    "just a quick word about the {noun}",
    "gonna chime in about the {dir} direction",
    "just saying hello to the group",
    "wanted to mention something about the {noun}",
    "just thought everyone should know about the {noun}",
  ],
  party: [
    "hey team we should regroup",
    "guys we should regroup near the {noun}",
    "team lets head {dir} together",
    "everyone should meet by the {noun}",
    "hey group lets stick together",
    "team wait up for me",
    "guys lets go {dir} as a group",
    "hey everyone lets meet at the {noun}",
    "team we need to regroup near the {dir} side",
    "guys hold up lets stay together",
    "hey squad lets meet up",
    "everyone gather near the {noun}",
    "team lets take the {dir} path together",
    "guys can we regroup for a second",
    "hey party members lets stick close",
    "team should we head {dir} together",
    "everyone meet me by the {noun}",
    "guys lets stay close together",
    "hey team check in please",
    "team lets not split up near the {noun}",
  ],
  whisper: [
    "{name} come here for a second",
    "{name} wait up please",
    "{name} check this out quietly",
    "{name} i need to tell you something",
    "{name} over here for a moment",
    "{name} keep this between us",
    "{name} did you see that",
    "{name} hold on a second",
    "{name} can you come closer",
    "{name} i found something quietly",
    "{name} dont tell the others yet",
    "{name} meet me over here",
    "{name} quick question for you",
    "{name} just between the two of us",
    "{name} come take a look",
    "{name} i need a word with you",
    "{name} psst over here",
    "{name} quietly follow me",
    "{name} can we talk privately",
    "{name} one moment please",
  ],
  emote: [
    "does a little happy dance",
    "shrugs at the group",
    "waves at everyone nearby",
    "looks around nervously",
    "sighs heavily",
    "grins mischievously",
    "bows deeply to the party",
    "claps excitedly",
    "rolls their eyes",
    "stretches and yawns",
    "gives a thumbs up",
    "laughs quietly to themself",
    "taps their foot impatiently",
    "crosses their arms",
    "does a dramatic bow",
    "nods slowly",
    "scratches their head confused",
    "does a victory pose",
    "waves goodbye to the group",
    "does a spooky gesture",
  ],
};

const LABELS = Object.keys(TEMPLATES);
const REPEATS_PER_TEMPLATE = 10;

function fillTemplate(tmpl, rng) {
  return tmpl
    .replace(/\{dir\}/g, () => pick(rng, DIRS))
    .replace(/\{noun\}/g, () => pick(rng, NOUNS))
    .replace(/\{name\}/g, () => pick(rng, NAMES));
}

/** Build-time safety net (not part of the routing contract, this
 * script's own responsibility): every labeled row must be an L1 MISS,
 * because route()/L2 only ever runs on l1.reason === "unknown". A
 * template that accidentally table-matches (leading verb alias, or a
 * noun phrase that substring-matches an affordance name the way
 * ground.ts scores it) would silently be untestable/unreachable
 * training data. */
function assertL1Miss(utterance, context) {
  const r = parse(utterance, { affordances });
  if (r.ok) {
    throw new Error(
      `gen_utterances: generated utterance "${utterance}" (${context}) unexpectedly table-matches L1 ` +
        `(${JSON.stringify(r)}) — L2 never sees anything L1 resolves. Fix the template.`,
    );
  }
}

// ── Negatives/gibberish -> the "unknown" class (design doc step 3) ────
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const KEY_NEIGHBORS = {
  q: "wa", w: "qeas", e: "wrsd", r: "edft", t: "rfgy", y: "tghu", u: "yhji", i: "ujko", o: "iklp", p: "ol",
  a: "qwsz", s: "awedxz", d: "serfcx", f: "drtgvc", g: "ftyhbv", h: "gyujnb", j: "huikmn", k: "jiolm", l: "kop",
  z: "asx", x: "zsdc", c: "xdfv", v: "cfgb", b: "vghn", n: "bhjm", m: "njk",
};

function randomChars(rng, len) {
  let s = "";
  for (let i = 0; i < len; i++) s += LOWER[rint(rng, LOWER.length)];
  return s;
}

function keyboardMash(rng, len) {
  let cur = LOWER[rint(rng, LOWER.length)];
  let s = cur;
  for (let i = 1; i < len; i++) {
    const neighbors = KEY_NEIGHBORS[cur] || LOWER;
    cur = neighbors[rint(rng, neighbors.length)];
    s += cur;
  }
  return s;
}

const PUNCT = "!@#$%^&*()_+-=[]{}<>?/.,;:'\"";
function numericPunctNoise(rng, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += rng() < 0.5 ? String(rint(rng, 10)) : PUNCT[rint(rng, PUNCT.length)];
  }
  return s;
}

function repeatedCharSpam(rng) {
  const ch = LOWER[rint(rng, LOWER.length)];
  const len = 8 + rint(rng, 33);
  return ch.repeat(len);
}

const GIBBERISH_KINDS = ["chars", "mash", "noise", "spam"];

function genGibberish(rng, kind, i) {
  const len = 4 + rint(rng, 10);
  switch (kind) {
    case "chars":
      return randomChars(rng, len);
    case "mash":
      return keyboardMash(rng, len);
    case "noise":
      return numericPunctNoise(rng, len);
    case "spam":
      return repeatedCharSpam(rng);
    default:
      throw new Error(`unknown gibberish kind ${kind}`);
  }
}

const GIBBERISH_PER_KIND = 50;

// ── Hand-added adversarial edge cases (design doc §"Synthetic data
// pipeline" step 3 + §"Adversarial suite": emoji-only strings, mixed-
// script nonsense — literal/fixed, not seeded, since they're a small
// hand-authored curated list, not a generative process). ─────────────
const HAND_ADDED_ADVERSARIAL = [
  "\u{1F600}\u{1F47B}\u{1F52E}",
  "\u{1F525}\u{1F525}\u{1F525}\u{1F525}",
  "تجربة 日本語 test тест",
  "ランダムな文字列です",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "!?!?!?!?!?!?!?!?!?!?!?!?!?",
  "1234567890123456789012345678901234567890",
  " ",
  "                                              ...",
  ".",
  "??",
];

function buildCorpus() {
  const rows = [];
  for (const label of LABELS) {
    const templates = TEMPLATES[label];
    templates.forEach((tmpl, ti) => {
      for (let i = 0; i < REPEATS_PER_TEMPLATE; i++) {
        const rng = channel("l2-gen", label, String(ti), String(i));
        const utterance = fillTemplate(tmpl, rng);
        assertL1Miss(utterance, `label=${label} template#${ti} rep#${i}`);
        rows.push({ utterance, label });
      }
    });
  }

  // "unknown" class training rows.
  let gi = 0;
  for (const kind of GIBBERISH_KINDS) {
    for (let i = 0; i < GIBBERISH_PER_KIND; i++) {
      const rng = channel("l2-gen-neg", kind, String(i));
      const utterance = genGibberish(rng, kind, i);
      assertL1Miss(utterance, `label=unknown kind=${kind} #${i}`);
      rows.push({ utterance, label: "unknown" });
      gi++;
    }
  }

  return rows;
}

/** Seeded, per-label (stratified) shuffle + split assignment (design
 * doc §"Synthetic data pipeline" step 4: "assigned by a seeded shuffle
 * (channel('l2-split')), not interleaved by generation order"; splitting
 * per-label rather than globally is this implementation's choice to
 * avoid an unlucky global shuffle starving one label's heldout slice —
 * still one deterministic seeded shuffle per label, never Math.random). */
function assignSplits(rows) {
  const byLabel = new Map();
  for (const r of rows) {
    if (!byLabel.has(r.label)) byLabel.set(r.label, []);
    byLabel.get(r.label).push(r);
  }
  const out = [];
  for (const [label, group] of byLabel) {
    const rng = channel("l2-split", label);
    // Fisher-Yates, seeded.
    const arr = group.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rint(rng, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const nTrain = Math.round(arr.length * 0.7);
    const nCal = Math.round(arr.length * 0.15);
    arr.forEach((r, idx) => {
      const split = idx < nTrain ? "train" : idx < nTrain + nCal ? "calibration" : "heldout";
      out.push({ ...r, split });
    });
  }
  return out;
}

function buildAdversarialSuite(corpusRows) {
  // "a superset of what feeds the unknown training class" (design doc
  // §"DoD as machine-checkable CI" #2): every "unknown"-labeled corpus
  // utterance, across all splits, PLUS a fresh independent sample of
  // gibberish, PLUS the hand-added edge cases.
  const fromCorpus = corpusRows.filter((r) => r.label === "unknown").map((r) => r.utterance);

  const fresh = [];
  for (const kind of GIBBERISH_KINDS) {
    for (let i = 0; i < 20; i++) {
      const rng = channel("l2-adversarial", kind, String(i));
      const utterance = genGibberish(rng, kind, i);
      assertL1Miss(utterance, `adversarial kind=${kind} #${i}`);
      fresh.push(utterance);
    }
  }

  return [...new Set([...fromCorpus, ...fresh, ...HAND_ADDED_ADVERSARIAL])];
}

function main() {
  const rawRows = buildCorpus();
  const rows = assignSplits(rawRows);
  writeFileSync(OUT_CORPUS, JSON.stringify(rows, null, 2) + "\n");

  const adversarial = buildAdversarialSuite(rows);
  writeFileSync(OUT_ADVERSARIAL, JSON.stringify(adversarial, null, 2) + "\n");

  console.log(`gen_utterances: wrote ${rows.length} corpus rows -> ${OUT_CORPUS}`);
  console.log(`gen_utterances: wrote ${adversarial.length} adversarial rows -> ${OUT_ADVERSARIAL}`);
}

main();
