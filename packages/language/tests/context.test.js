/* context.test.js — L7 context compiler (docs/superpowers/specs/
 * 2026-07-07-l7-context-compiler-design.md, "Test plan"). Covers all
 * five items: purity/determinism, no-invention, closed-world complement,
 * the structural-containment invariant (incl. adversarial near-misses),
 * and an exhaustive rendered-reply scan. Mirrors ground.test.js's style
 * (plain node:test, imports from ../dist). */
import test from "node:test";
import assert from "node:assert/strict";
import { compileEnvelope, envelopeToControlString, renderStubReply } from "../dist/index.js";

/** Whole-token comparison, NOT naive substring search — the whole point
 *  of the structural-containment tests below is that a doesNotKnow
 *  token sharing a substring/word-stem with a knows token (e.g.
 *  "cavern" vs "cavernous_hall") must NOT be treated as "present" just
 *  because String.includes would say so. Underscore is kept as a word
 *  character since slug tokens are themselves underscore-joined
 *  ("crypt_theme") — splitting on it would fabricate a false match. */
function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .filter(Boolean);
}

// ── 1. Purity/determinism ─────────────────────────────────────────────
test("compileEnvelope: same inputs -> deep-equal, non-mutated, referentially-fresh output", () => {
  const knowledge = { knows: ["hall", "crypt_theme", "rat"] };
  const universe = ["hall", "crypt_theme", "rat", "cavern", "silver_key"];
  const events = [{ seq: 1, t: "TAKE", summary: "lantern" }];

  const before = JSON.parse(JSON.stringify({ knowledge, universe, events }));

  const a = compileEnvelope(knowledge, universe, events);
  const b = compileEnvelope(knowledge, universe, events);

  assert.deepEqual(a, b);
  assert.notEqual(a, b, "outputs must be referentially fresh, not cached/shared");
  assert.notEqual(a.knows, b.knows);
  assert.notEqual(a.doesNotKnow, b.doesNotKnow);
  assert.notEqual(a.recentEvents, b.recentEvents);

  // inputs must not have been mutated
  assert.deepEqual({ knowledge, universe, events }, before);
});

test("compileEnvelope: no module-level mutable state — repeated calls with DIFFERENT inputs never bleed into each other", () => {
  const a = compileEnvelope({ knows: ["a"] }, ["a", "b"]);
  const b = compileEnvelope({ knows: ["x", "y"] }, ["x", "y", "z"]);
  const a2 = compileEnvelope({ knows: ["a"] }, ["a", "b"]);
  assert.deepEqual(a, a2, "an unrelated intervening call must not change a later call's result");
  assert.deepEqual(b.knows, ["x", "y"]);
});

test("envelopeToControlString: same inputs -> identical string, every call", () => {
  const envelope = compileEnvelope({ knows: ["hall", "rat"] }, ["hall", "rat", "cavern"]);
  const s1 = envelopeToControlString(envelope, "room", "What is this place?");
  const s2 = envelopeToControlString(envelope, "room", "What is this place?");
  assert.equal(s1, s2);
});

test("renderStubReply: same (envelope, topic, question, seed, npcId) -> identical string, every call", () => {
  const envelope = compileEnvelope({ knows: ["hall", "rat"] }, ["hall", "rat", "cavern"]);
  const r1 = renderStubReply(envelope, "room", "What is this place?", "42", "npc-1");
  const r2 = renderStubReply(envelope, "room", "What is this place?", "42", "npc-1");
  assert.equal(r1, r2);
});

// ── 2. No-invention ────────────────────────────────────────────────────
test("compileEnvelope().knows is always a subset of the input Knowledge.knows", () => {
  const inputs = [
    { knows: [] },
    { knows: ["a"] },
    { knows: ["a", "b", "a", "c"] }, // dupes
    { knows: ["z", "y", "x"] },
  ];
  for (const knowledge of inputs) {
    const universe = [...knowledge.knows, "outsider-1", "outsider-2"];
    const envelope = compileEnvelope(knowledge, universe);
    const inputSet = new Set(knowledge.knows);
    for (const token of envelope.knows) {
      assert.ok(inputSet.has(token), `${token} was not in the input Knowledge.knows`);
    }
  }
});

test("compileEnvelope().knows is never altered/emptied by an unrelated factUniverse (never invented, never dropped)", () => {
  const envelope = compileEnvelope({ knows: ["hall", "rat"] }, ["cavern", "silver_key"]);
  // factUniverse has no overlap with knows at all -- knows must still
  // equal the (deduped) input, untouched by the universe.
  assert.deepEqual(envelope.knows, ["hall", "rat"]);
});

// ── 3. Closed-world complement ────────────────────────────────────────
test("doesNotKnow === factUniverse minus knows, order-stable over factUniverse's own order", () => {
  const knowledge = { knows: ["b", "d"] };
  const universe = ["a", "b", "c", "d", "e"];
  const envelope = compileEnvelope(knowledge, universe);
  assert.deepEqual(envelope.doesNotKnow, ["a", "c", "e"]);
});

test("closed-world complement holds over many (knows, universe) pairs", () => {
  const cases = [
    { knows: [], universe: ["a", "b", "c"] },
    { knows: ["a", "b", "c"], universe: ["a", "b", "c"] },
    { knows: ["a"], universe: [] },
    { knows: ["c", "a"], universe: ["a", "b", "c", "d"] },
    { knows: ["x", "x", "y"], universe: ["y", "x", "z", "y"] },
  ];
  for (const { knows, universe } of cases) {
    const envelope = compileEnvelope({ knows }, universe);
    const knowsSet = new Set(envelope.knows);
    const expectedDoesNotKnow = [...new Set(universe)].filter((t) => !knowsSet.has(t));
    assert.deepEqual(envelope.doesNotKnow, expectedDoesNotKnow);
    // and the two sets are disjoint
    for (const t of envelope.doesNotKnow) assert.ok(!knowsSet.has(t));
  }
});

// ── 4. Structural containment invariant ───────────────────────────────
// Over many (knows, universe) pairs -- including adversarial near-misses
// where a doesNotKnow token shares a substring/word-stem with a knows
// token (harvest.js's own documented worry, e.g. "cavern" vs
// "cavernous_hall") -- the KNOWS/TOPIC/QUESTION portion of the control
// string (i.e. everything EXCEPT the DOESNT_KNOW field, which is
// EXPECTED/by-design to carry the doesNotKnow tokens verbatim for
// negative training -- see the TruthEnvelope doc comment: "for negative
// testing/training only") must never independently surface a
// doesNotKnow token that isn't also, separately, a knows token.
const CONTAINMENT_CASES = [
  { knows: ["hall"], universe: ["hall", "cavern"] },
  { knows: ["crypt_theme", "rat"], universe: ["crypt_theme", "rat", "cavern", "silver_key"] },
  // adversarial: doesNotKnow "cavern" is a substring of knows "cavernous_hall"
  { knows: ["cavernous_hall"], universe: ["cavernous_hall", "cavern"] },
  // adversarial: doesNotKnow "rat" is a substring of knows "ratking"
  { knows: ["ratking"], universe: ["ratking", "rat"] },
  // adversarial: shared word-stem via underscore-joined compound tokens
  { knows: ["crypt_theme"], universe: ["crypt_theme", "crypt"] },
  { knows: ["silver_key"], universe: ["silver_key", "silver", "key"] },
  // adversarial: knows token is a substring of a doesNotKnow token (reverse direction)
  { knows: ["key"], universe: ["key", "silver_key"] },
  { knows: [], universe: ["cavern", "silver_key"] },
];

const CONTROL_FIELD_RE = /^TASK:(\S+) KNOWS:(\S+) DOESNT_KNOW:(\S+) TOPIC:(\S+) QUESTION:(.*)$/;

for (const { knows, universe } of CONTAINMENT_CASES) {
  test(`structural containment holds: knows=${JSON.stringify(knows)} universe=${JSON.stringify(universe)}`, () => {
    const envelope = compileEnvelope({ knows }, universe);
    const control = envelopeToControlString(envelope, "room", "What lies deeper in?");

    const m = CONTROL_FIELD_RE.exec(control);
    assert.ok(m, `control string did not match the expected TASK:D field layout: ${control}`);
    const [, task, knowsField, , topicField, questionField] = m;

    // Everything EXCEPT the DOESNT_KNOW field's own value -- that field
    // is allowed (and required) to carry doesNotKnow tokens verbatim.
    const nonDnkTokens = new Set(tokenize(`${task} ${knowsField} ${topicField} ${questionField}`));
    const knowsSet = new Set(envelope.knows);

    for (const dnkToken of envelope.doesNotKnow) {
      if (knowsSet.has(dnkToken)) continue; // independently known -- not a leak
      assert.ok(
        !nonDnkTokens.has(dnkToken),
        `control string's KNOWS/TOPIC/QUESTION portion leaked doesNotKnow token "${dnkToken}" (not independently in knows): ${control}`,
      );
    }

    // and the KNOWS field itself is exactly (a "+"-joined restatement
    // of) envelope.knows -- never the raw universe, never anything else.
    assert.equal(knowsField, envelope.knows.length ? envelope.knows.join("+") : "none");
  });
}

// ── 5. Rendered-reply scan (runtime analogue of validate.py's
// violations_d, as a node:test — never touches tools/validate.py) ─────
const DEMO_TOPICS = ["room", "distant"];
const DEMO_QUESTIONS = [
  "What is this place?",
  "Is anything dangerous nearby?",
  "What lies deeper in?",
  "What's in the deepest chamber?",
];
const DEMO_SEEDS = ["1", "42", "999"];
const DEMO_NPC_IDS = ["npc-crypt-keeper"];

test("exhaustive rendered-reply scan: no reply ever contains a doesNotKnow token (whole-token comparison)", () => {
  const violations = [];
  for (const { knows, universe } of CONTAINMENT_CASES) {
    const envelope = compileEnvelope({ knows }, universe);
    if (envelope.doesNotKnow.length === 0) continue;
    const knowsSet = new Set(envelope.knows);
    for (const topic of DEMO_TOPICS) {
      for (const question of DEMO_QUESTIONS) {
        for (const seed of DEMO_SEEDS) {
          for (const npcId of DEMO_NPC_IDS) {
            const reply = renderStubReply(envelope, topic, question, seed, npcId);
            const replyTokens = new Set(tokenize(reply));
            for (const dnkToken of envelope.doesNotKnow) {
              if (knowsSet.has(dnkToken)) continue; // independently known; not a leak
              if (replyTokens.has(dnkToken)) {
                violations.push({ knows, universe, topic, question, seed, npcId, reply, dnkToken });
              }
            }
          }
        }
      }
    }
  }
  assert.deepEqual(violations, [], `rendered replies leaked doesNotKnow tokens:\n${JSON.stringify(violations, null, 2)}`);
});

test("renderStubReply never mutates its envelope argument", () => {
  const envelope = compileEnvelope({ knows: ["hall", "rat"] }, ["hall", "rat", "cavern"]);
  const before = JSON.parse(JSON.stringify(envelope));
  renderStubReply(envelope, "room", "What is this place?", "7", "npc-1");
  assert.deepEqual(envelope, before);
});
