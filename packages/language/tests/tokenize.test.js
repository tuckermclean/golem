import test from "node:test";
import assert from "node:assert/strict";
import { normalize, tokenize, matchVerbPhrase, stripFillerWords } from "../dist/tokenize.js";

test("normalize lowercases, trims, strips one trailing punctuation, collapses whitespace", () => {
  assert.equal(normalize("Go   NORTH!"), "go north");
  assert.equal(normalize("  north  "), "north");
  assert.equal(normalize("Walk East?"), "walk east");
  assert.equal(normalize("head West."), "head west");
  // only ONE trailing punctuation mark is stripped
  assert.equal(normalize("wait!!"), "wait!");
});

test("tokenize splits on whitespace; empty string -> []", () => {
  assert.deepEqual(tokenize("go north"), ["go", "north"]);
  assert.deepEqual(tokenize(""), []);
});

test("matchVerbPhrase: two-token match wins over one-token", () => {
  const m = matchVerbPhrase(["pick", "up", "the", "lantern"]);
  assert.deepEqual(m, { verb: "take", rest: ["the", "lantern"] });
});

test("matchVerbPhrase: falls back to one token when no two-token phrase matches", () => {
  const m = matchVerbPhrase(["go", "north"]);
  assert.deepEqual(m, { verb: "move", rest: ["north"] });
});

test("matchVerbPhrase: 'look at' consumes both tokens as the verb phrase", () => {
  const m = matchVerbPhrase(["look", "at", "the", "sign"]);
  assert.deepEqual(m, { verb: "look", rest: ["the", "sign"] });
});

test("matchVerbPhrase: no match -> null", () => {
  assert.equal(matchVerbPhrase(["blorp", "zzz"]), null);
  assert.equal(matchVerbPhrase([]), null);
});

test("matchVerbPhrase: single unmatched token -> null", () => {
  assert.equal(matchVerbPhrase(["hello"]), null);
});

test("stripFillerWords removes filler tokens only", () => {
  assert.deepEqual(stripFillerWords(["the", "lantern"]), ["lantern"]);
  assert.deepEqual(stripFillerWords(["up"]), ["up"]); // correction B: "up" is not filler
  assert.deepEqual(stripFillerWords(["there", "here", "thing", "item"]), []);
});
