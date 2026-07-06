import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "@golem-engine/content";

const FIXTURES = new URL("./fixtures/", import.meta.url);

function loadFixture(name) {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));
}

test("compile() round-trips the hand-written sample pack to the committed golden RuntimePack", () => {
  const source = loadFixture("sample-pack.json");
  const golden = loadFixture("sample-pack.golden.json");

  const result = compile(source);

  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.pack, golden);
});

test("compile() is deterministic: compiling the same source twice yields identical output", () => {
  const source = loadFixture("sample-pack.json");

  const first = compile(source);
  const second = compile(source);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.pack, second.pack);
});
