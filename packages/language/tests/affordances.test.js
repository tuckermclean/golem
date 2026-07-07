/* affordances.test.js — A1 PR3: the tutorial-hint (nextHint) and
 * twin-grounding (affordancesToFacts) affordance-consumer helpers, plus
 * the integration proof that affordancesToFacts() composes correctly as
 * compileEnvelope()'s factUniverse (context.ts, L7). Plain node:test,
 * imports from ../dist, same posture as ground.test.js/context.test.js
 * next to it. */
import test from "node:test";
import assert from "node:assert/strict";
import { nextHint, affordancesToFacts, compileEnvelope } from "../dist/index.js";

// ── nextHint ─────────────────────────────────────────────────────────
test("nextHint: returns the first enabled affordance, in input order", () => {
  const affordances = [
    { verb: "take", target: "lantern", name: "lantern" },
    { verb: "look", target: "sign", name: "stone sign" },
  ];
  assert.deepEqual(nextHint(affordances), affordances[0]);
});

test("nextHint: skips disabled affordances and returns the first enabled one after them", () => {
  const affordances = [
    { verb: "take", target: "trap", name: "trap", enabled: false },
    { verb: "look", target: "sign", name: "stone sign", enabled: false },
    { verb: "take", target: "lantern", name: "lantern" },
    { verb: "look", target: "door", name: "door" },
  ];
  assert.deepEqual(nextHint(affordances), affordances[2]);
});

test("nextHint: null when every affordance is disabled", () => {
  const affordances = [
    { verb: "take", target: "trap", name: "trap", enabled: false },
    { verb: "look", target: "sign", name: "stone sign", enabled: false },
  ];
  assert.equal(nextHint(affordances), null);
});

test("nextHint: null on an empty affordance list", () => {
  assert.equal(nextHint([]), null);
});

test("nextHint: deterministic -- same input, same output, every call", () => {
  const affordances = [
    { verb: "take", target: "lantern", name: "lantern" },
    { verb: "look", target: "door", name: "door" },
  ];
  const a = nextHint(affordances);
  const b = nextHint(affordances);
  assert.deepEqual(a, b);
});

// ── affordancesToFacts ───────────────────────────────────────────────
test("affordancesToFacts: enabled affordances -> can-<verb>:<slug> tokens", () => {
  const affordances = [
    { verb: "take", target: "lantern", name: "lantern" },
    { verb: "look", target: "sign", name: "stone sign" },
  ];
  assert.deepEqual(affordancesToFacts(affordances), ["can-take:lantern", "can-look:stone_sign"]);
});

test("affordancesToFacts: lower-cases naturally-cased names into the slug", () => {
  const affordances = [{ verb: "look", target: "bram", name: "Bram" }];
  assert.deepEqual(affordancesToFacts(affordances), ["can-look:bram"]);
});

test("affordancesToFacts: disabled affordances are excluded -- not asserted as capabilities", () => {
  const affordances = [
    { verb: "take", target: "trap-lantern", name: "lantern", enabled: false },
    { verb: "look", target: "door", name: "door" },
  ];
  assert.deepEqual(affordancesToFacts(affordances), ["can-look:door"]);
});

test("affordancesToFacts: deduped, order-stable over first occurrence", () => {
  const affordances = [
    { verb: "take", target: "lantern-a", name: "lantern" },
    { verb: "look", target: "door", name: "door" },
    { verb: "take", target: "lantern-b", name: "lantern" }, // same verb+name -> same fact token
  ];
  assert.deepEqual(affordancesToFacts(affordances), ["can-take:lantern", "can-look:door"]);
});

test("affordancesToFacts: empty list -> empty facts", () => {
  assert.deepEqual(affordancesToFacts([]), []);
});

test("affordancesToFacts: deterministic -- same input, same output, every call", () => {
  const affordances = [{ verb: "take", target: "lantern", name: "lantern" }];
  assert.deepEqual(affordancesToFacts(affordances), affordancesToFacts(affordances));
});

// ── integration: affordancesToFacts() as compileEnvelope()'s
// factUniverse (the twin-grounding seam, the real point of A1 PR3) ────
test("affordances -> facts -> compileEnvelope: an enabled affordance the NPC knows never lands in doesNotKnow", () => {
  const affordances = [
    { verb: "take", target: "lantern", name: "lantern" },
    { verb: "look", target: "sign", name: "stone sign" },
    { verb: "open", target: "door", name: "door" },
  ];
  const facts = affordancesToFacts(affordances);
  assert.deepEqual(facts, ["can-take:lantern", "can-look:stone_sign", "can-open:door"]);

  // The NPC personally knows about the lantern (one of the facts) but
  // nothing else.
  const npcKnowledge = { knows: ["can-take:lantern"] };
  const envelope = compileEnvelope(npcKnowledge, facts);

  assert.ok(envelope.knows.includes("can-take:lantern"));
  assert.ok(
    !envelope.doesNotKnow.includes("can-take:lantern"),
    "an enabled affordance the NPC actually knows must never appear in doesNotKnow",
  );
});

test("affordances -> facts -> compileEnvelope: an enabled affordance NOT in npcKnowledge.knows lands in doesNotKnow", () => {
  const affordances = [
    { verb: "take", target: "lantern", name: "lantern" },
    { verb: "look", target: "sign", name: "stone sign" },
  ];
  const facts = affordancesToFacts(affordances);
  const npcKnowledge = { knows: ["can-take:lantern"] };
  const envelope = compileEnvelope(npcKnowledge, facts);

  assert.ok(envelope.doesNotKnow.includes("can-look:stone_sign"));
});

test("affordances -> facts -> compileEnvelope: a disabled affordance never enters the universe, so it can never appear in either knows or doesNotKnow", () => {
  const affordances = [
    { verb: "take", target: "trap-lantern", name: "trap lantern", enabled: false },
    { verb: "look", target: "door", name: "door" },
  ];
  const facts = affordancesToFacts(affordances);
  const npcKnowledge = { knows: ["can-take:trap_lantern"] }; // NPC "knows" a fact that was never offered as a capability
  const envelope = compileEnvelope(npcKnowledge, facts);

  assert.ok(!envelope.doesNotKnow.includes("can-take:trap_lantern"));
  // compileEnvelope never invents -- npcKnowledge.knows still passes
  // through untouched even though it references a non-universe fact.
  assert.ok(envelope.knows.includes("can-take:trap_lantern"));
});
