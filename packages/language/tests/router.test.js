/* router.test.js — route()'s L1+L2 composition (design doc §"Routing").
 * Covers: L1-hit passthrough, L1-unknown -> L2, ambiguous/empty
 * passthrough (both UNCHANGED from L1's own answer), threshold-boundary
 * consistency, and the orchestrator-locked fillSlot edge-case category
 * (decision #6: two direction words / a noun phrase that also contains
 * an unrelated affordance name). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "../dist/index.js";
import { route } from "../dist/index.js";
import { fillSlot } from "../dist/router.js";
import { classifyIntent } from "../dist/classify.js";
import { affordances } from "./fixtures/affordances.js";

// ── L1-hit passthrough: L2 never gets a vote once L1 resolves ok:true ─
test("route() returns L1's own answer, byte-identical, when L1 resolves ok:true", () => {
  assert.deepEqual(route("go north"), parse("go north"));
  assert.deepEqual(
    route("take the lantern", { affordances }),
    parse("take the lantern", { affordances }),
  );
  assert.deepEqual(route("n"), { ok: true, intent: { type: "move", dx: 0, dy: -1 } });
});

// ── "ambiguous"/"empty" pass through unchanged — L2 never runs ────────
test("route() passes 'ambiguous' through unchanged (L1 already found the verb + tied slot)", () => {
  const r = route("take the sword", { affordances });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "ambiguous");
  assert.deepEqual(new Set(r.candidates), new Set(["sword-a", "sword-b"]));
});

test("route() passes 'empty' through unchanged", () => {
  assert.deepEqual(route(""), { ok: false, reason: "empty" });
  assert.deepEqual(route("   "), { ok: false, reason: "empty" });
});

// ── L1-unknown -> L2: naturalistic phrasings L1's own tables never
// match, resolved via the classifier + fillSlot instead. ──────────────
test("L1-unknown -> L2: a naturalistic move phrasing resolves via the classifier", () => {
  const r = route("could you head north for me");
  assert.deepEqual(r, { ok: true, intent: { type: "move", dx: 0, dy: -1 } });
});

test("L1-unknown -> L2: a naturalistic take phrasing grounds against real affordances", () => {
  const r = route("can you get me the lantern", { affordances });
  assert.deepEqual(r, { ok: true, intent: { type: "take", item: "lantern" } });
});

test("L1-unknown -> L2: a naturalistic look phrasing grounds against real affordances", () => {
  const r = route("could you check out the door", { affordances });
  assert.deepEqual(r, { ok: true, intent: { type: "look", target: "door" } });
});

test("L1-unknown -> L2: a naturalistic read phrasing needs no slot", () => {
  const r = route("what does it say");
  assert.deepEqual(r, { ok: true, intent: { type: "read" } });
});

test("L1-unknown -> L2: a naturalistic whisper phrasing (leading name)", () => {
  const r = route("aria come here for a second");
  assert.equal(r.ok, true);
  assert.equal(r.intent.type, "whisper");
  assert.equal(r.intent.to, "aria");
});

test("L1-unknown -> L2: a naturalistic party phrasing executes at >=0.65 (orchestrator decision #4)", () => {
  const r = route("hey team we should regroup");
  assert.equal(r.ok, true);
  assert.equal(r.intent.type, "party");
});

test("L1-unknown -> L2: a naturalistic say phrasing executes at >=0.65 (orchestrator decision #4)", () => {
  const r = route("just wanted to say good luck everyone");
  assert.equal(r.ok, true);
  assert.equal(r.intent.type, "say");
});

test("L1-unknown -> L2: a naturalistic emote phrasing executes at >=0.65 (orchestrator decision #4)", () => {
  const r = route("shrugs at the group");
  assert.equal(r.ok, true);
  assert.equal(r.intent.type, "emote");
});

test("L1-unknown -> L2: gibberish resolves to unknown, not a guessed command", () => {
  assert.deepEqual(route("xqzplk gtrwmn vbzzq"), { ok: false, reason: "unknown" });
});

test("take with an ungrounded noun via L2 still refuses to guess", () => {
  const r = route("could you grab the gremlin", { affordances });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unknown");
});

// ── Threshold-band consistency: whatever classifyIntent actually
// reports, route()'s decision must follow the documented policy exactly
// (design doc §"Routing" pseudocode) — this is an integration check on
// route()'s wiring of classifyIntent + fillSlot + the 0.65/0.90 bands,
// run over a real sample of L1-miss utterances (the heldout split of
// the committed corpus fixture) rather than one or two hand-picked
// cases. ───────────────────────────────────────────────────────────────
const corpusPath = fileURLToPath(new URL("./fixtures/classifier-corpus.json", import.meta.url));
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const heldout = corpus.filter((r) => r.split === "heldout");

test("route()'s threshold bands match classifyIntent + fillSlot exactly, over the heldout corpus", () => {
  for (const { utterance } of heldout) {
    const l1 = parse(utterance, { affordances });
    if (l1.ok || l1.reason !== "unknown") continue; // route() never reaches L2 here — not this test's concern
    const cls = classifyIntent(utterance);
    const r = route(utterance, { affordances });
    if (cls.label === "unknown" || cls.confidence < 0.65) {
      assert.deepEqual(r, { ok: false, reason: "unknown" }, `"${utterance}"`);
      continue;
    }
    const filled = fillSlot(cls.label, utterance, affordances);
    if (cls.confidence >= 0.9) {
      const expected = filled.ok ? { ok: true, intent: filled.intent } : filled;
      assert.deepEqual(r, expected, `"${utterance}" (>=0.90 band)`);
    } else {
      const expected = filled.ok ? { ok: true, intent: filled.intent } : { ok: false, reason: "unknown" };
      assert.deepEqual(r, expected, `"${utterance}" (0.65-0.90 band)`);
    }
  }
});

// ── fillSlot edge cases (orchestrator decision #6): the permissive
// whole-utterance scan, locked down with tests rather than discovered
// in play. ─────────────────────────────────────────────────────────────
test("fillSlot('move', ...): two direction words in one utterance -> first hit (in token order) wins", () => {
  const r = fillSlot("move", "could you please head north then also south", []);
  assert.deepEqual(r, { ok: true, intent: { type: "move", dx: 0, dy: -1 } });
});

test("fillSlot('move', ...): reversed order picks the other direction first — proves it's positional, not alphabetical", () => {
  const r = fillSlot("move", "could you please head south then also north", []);
  assert.deepEqual(r, { ok: true, intent: { type: "move", dx: 0, dy: 1 } });
});

test("fillSlot('take', ...): a noun phrase containing an unrelated affordance name as a substring grounds permissively", () => {
  // "lanternfish" is not a real affordance, but ground.ts's containment
  // scoring (scoreCandidate: name.includes(phrase) || phrase.includes(name))
  // matches "lantern" as a substring of the whole remaining phrase, once
  // filler-stripped. This is the documented, intentional permissiveness
  // (design doc §"Routing", Open Question 6) — locked here, not
  // discovered later.
  const r = fillSlot("take", "could you grab the lanternfish", affordances);
  assert.deepEqual(r, { ok: true, intent: { type: "take", item: "lantern" } });
});

test("fillSlot('take', ...): nothing left after filler-stripping the whole utterance -> the bare intent", () => {
  assert.deepEqual(fillSlot("take", "the a an", []), { ok: true, intent: { type: "take" } });
});

test("fillSlot('whisper', ...): no non-filler/non-verb token at all -> unknown", () => {
  assert.deepEqual(fillSlot("whisper", "the a an", []), { ok: false, reason: "unknown" });
});
