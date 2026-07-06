/* Hand-picked unit cases for classifyIntent (design doc §"Model choice"
 * + §"Calibrated confidence"): fast feedback on label/confidence-bucket
 * behavior, distinct from calibration.test.js's aggregate accuracy/ECE
 * bars over the full heldout split. */
import test from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "../dist/classify.js";

const LABELS = ["move", "take", "look", "read", "say", "party", "whisper", "emote", "unknown"];

test("classifyIntent returns a probability simplex over all 9 labels", () => {
  const r = classifyIntent("could you head north");
  assert.deepEqual(Object.keys(r.probs).sort(), [...LABELS].sort());
  const sum = Object.values(r.probs).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `probs should sum to 1, got ${sum}`);
});

test("confidence is the max probability, and label is its argmax (or 'unknown' under the floor)", () => {
  const r = classifyIntent("could you grab the lantern please");
  const max = Math.max(...Object.values(r.probs));
  assert.ok(Math.abs(r.confidence - max) < 1e-9);
  if (r.label !== "unknown") {
    assert.ok(Math.abs(r.probs[r.label] - max) < 1e-9);
  }
});

test("a naturalistic move phrasing (not in L1's tables) classifies as move with high confidence", () => {
  const r = classifyIntent("could you head north for me");
  assert.equal(r.label, "move");
  assert.ok(r.confidence >= 0.9, `expected high confidence, got ${r.confidence}`);
});

test("a naturalistic take phrasing classifies as take", () => {
  const r = classifyIntent("can you get me the lantern");
  assert.equal(r.label, "take");
});

test("a naturalistic whisper phrasing (leading name) classifies as whisper", () => {
  const r = classifyIntent("aria come here for a second");
  assert.equal(r.label, "whisper");
});

test("gibberish classifies as unknown (or is floored to unknown)", () => {
  const r = classifyIntent("xqzplk gtrwmn vbzzq");
  assert.equal(r.label, "unknown");
});

test("the hard 0.50 confidence floor: no label is ever returned below floor", () => {
  // Whatever classifyIntent decides for a batch of varied inputs, if the
  // returned label isn't "unknown" its confidence must clear the floor.
  const samples = [
    "could you head north",
    "asdkjfh qqzzxxcv",
    "aria wait up please",
    "!!! ??? 12345",
  ];
  for (const s of samples) {
    const r = classifyIntent(s);
    if (r.label !== "unknown") {
      assert.ok(r.confidence >= 0.5, `"${s}" -> label ${r.label} with confidence ${r.confidence} < 0.50 floor`);
    }
  }
});
