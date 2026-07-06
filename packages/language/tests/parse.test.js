/* Hand-picked unit cases for fast feedback during dev — the exhaustive
 * ≥200-case sweep lives in corpus.test.js/corpus.json (the DoD). */
import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "../dist/index.js";
import { affordances } from "./fixtures/affordances.js";

test("empty utterance -> reason 'empty'", () => {
  assert.deepEqual(parse(""), { ok: false, reason: "empty" });
  assert.deepEqual(parse("   "), { ok: false, reason: "empty" });
});

test("bare direction word -> move", () => {
  assert.deepEqual(parse("north"), { ok: true, intent: { type: "move", dx: 0, dy: -1 } });
});

test("bare single-letter direction -> move (the DoD's literal 'n' example)", () => {
  assert.deepEqual(parse("n"), { ok: true, intent: { type: "move", dx: 0, dy: -1 } });
});

test("correction A: bare 'w' moves west, not whisper", () => {
  assert.deepEqual(parse("w"), { ok: true, intent: { type: "move", dx: -1, dy: 0 } });
});

test("correction B: 'go up' moves north", () => {
  assert.deepEqual(parse("go up"), { ok: true, intent: { type: "move", dx: 0, dy: -1 } });
});

test("'walk north' resolves to move", () => {
  assert.deepEqual(parse("walk north"), { ok: true, intent: { type: "move", dx: 0, dy: -1 } });
});

test("bare 'go' with no direction -> unknown", () => {
  assert.deepEqual(parse("go"), { ok: false, reason: "unknown" });
});

test("'pick up the lantern' -> take (multi-word verb alias + grounding)", () => {
  const r = parse("pick up the lantern", { affordances });
  assert.deepEqual(r, { ok: true, intent: { type: "take", item: "lantern" } });
});

test("bare 'take' with no item -> take with no item (module.js auto-detects)", () => {
  assert.deepEqual(parse("take"), { ok: true, intent: { type: "take" } });
});

test("'take' with an unmatched noun -> unknown (no oversell)", () => {
  const r = parse("take the gremlin", { affordances });
  assert.deepEqual(r, { ok: false, reason: "unknown" });
});

test("'take sword' with two matching items -> ambiguous", () => {
  const r = parse("take the sword", { affordances });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "ambiguous");
  assert.deepEqual(new Set(r.candidates), new Set(["sword-a", "sword-b"]));
});

test("bare 'look' -> look with no target", () => {
  assert.deepEqual(parse("look"), { ok: true, intent: { type: "look" } });
});

test("'look at the sign' grounds to the sign", () => {
  const r = parse("look at the sign", { affordances });
  assert.deepEqual(r, { ok: true, intent: { type: "look", target: "sign" } });
});

test("'examine' aliases to look", () => {
  const r = parse("examine the door", { affordances });
  assert.deepEqual(r, { ok: true, intent: { type: "look", target: "door" } });
});

test("bare 'read' -> read, args ignored entirely", () => {
  assert.deepEqual(parse("read"), { ok: true, intent: { type: "read" } });
  assert.deepEqual(parse("read the whole thing carefully"), { ok: true, intent: { type: "read" } });
});

test("plain sentence with no verb match -> unknown (chat fallback is the caller's job)", () => {
  assert.deepEqual(parse("hello everyone down here"), { ok: false, reason: "unknown" });
});

test("'say' preserves exact words, including filler-like tokens", () => {
  assert.deepEqual(parse("say the lantern is over there"), {
    ok: true,
    intent: { type: "say", text: "the lantern is over there" },
  });
});

test("'party' text is preserved verbatim", () => {
  assert.deepEqual(parse("party regroup at the stair"), {
    ok: true,
    intent: { type: "party", text: "regroup at the stair" },
  });
});

test("'whisper' with target + text", () => {
  assert.deepEqual(parse("whisper bram over here"), {
    ok: true,
    intent: { type: "whisper", to: "bram", text: "over here" },
  });
});

test("'tell' aliases to whisper", () => {
  assert.deepEqual(parse("tell aria wait up"), {
    ok: true,
    intent: { type: "whisper", to: "aria", text: "wait up" },
  });
});

test("whisper with no target at all -> unknown", () => {
  assert.deepEqual(parse("whisper"), { ok: false, reason: "unknown" });
});

test("'emote' and 'me' both produce emote text", () => {
  assert.deepEqual(parse("emote waves"), { ok: true, intent: { type: "emote", text: "waves" } });
  assert.deepEqual(parse("me does a little dance"), {
    ok: true,
    intent: { type: "emote", text: "does a little dance" },
  });
});

test("mid-sentence direction/verb words do not false-positive a command", () => {
  // first token ("i") is not a verb alias, so this whole thing is chat
  const r = parse("i think the north wall looks different");
  assert.deepEqual(r, { ok: false, reason: "unknown" });
});

test("default affordances is an empty list when opts is omitted", () => {
  assert.deepEqual(parse("take the lantern"), { ok: false, reason: "unknown" });
});
