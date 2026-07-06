import test from "node:test";
import assert from "node:assert/strict";
import { groundNoun } from "../dist/ground.js";
import { affordances } from "./fixtures/affordances.js";

test("exact name match -> single grounded target (score 3)", () => {
  const r = groundNoun("lantern", "take", affordances);
  assert.deepEqual(r, { ok: true, target: "lantern" });
});

test("exact alias match -> single grounded target (score 3)", () => {
  const r = groundNoun("lamp", "take", affordances);
  assert.deepEqual(r, { ok: true, target: "lantern" });
});

test("substring match -> single grounded target (score 2)", () => {
  const r = groundNoun("sign", "look", affordances);
  assert.equal(r.ok, true);
  assert.equal(r.target, "sign");
});

test("case-insensitive match against a naturally-cased name", () => {
  const r = groundNoun("bram", "look", affordances);
  assert.deepEqual(r, { ok: true, target: "bram" });
});

test("no relation at all -> unknown", () => {
  const r = groundNoun("gremlin", "take", affordances);
  assert.deepEqual(r, { ok: false, reason: "unknown" });
});

test("verb filter excludes affordances for a different verb", () => {
  // "door" only has a look affordance, not take
  const r = groundNoun("door", "take", affordances);
  assert.deepEqual(r, { ok: false, reason: "unknown" });
});

test("tie at max score > 0 -> ambiguous, with both targets as candidates", () => {
  const r = groundNoun("sword", "take", affordances);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "ambiguous");
  assert.deepEqual(new Set(r.candidates), new Set(["sword-a", "sword-b"]));
});

test("enabled:false affordances are filtered out before matching", () => {
  const withDisabled = [
    { verb: "take", target: "trap-lantern", name: "lantern", enabled: false },
    ...affordances,
  ];
  const r = groundNoun("lantern", "take", withDisabled);
  assert.deepEqual(r, { ok: true, target: "lantern" });
});

test("empty affordance list -> unknown", () => {
  const r = groundNoun("lantern", "take", []);
  assert.deepEqual(r, { ok: false, reason: "unknown" });
});
