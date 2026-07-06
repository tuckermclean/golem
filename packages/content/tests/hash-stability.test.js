import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile, canonicalize, hashPack } from "@golem-engine/content";

const FIXTURES = new URL("./fixtures/", import.meta.url);

function loadFixture(name) {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));
}

// Committed golden hex constant for the sample pack — same golden-file
// religion CLAUDE.md mandates for worldgen. Regenerate deliberately (and
// call it out) if sample-pack.json ever changes; a silent diff here
// means the hash function's output changed underneath a fixture, which
// is exactly the class of bug this test exists to catch.
const GOLDEN_HASH = "384aff3b1864e58e570b11990f5a588b3c930570643634cef40c7c8a05a69ef8";

test("hashPack: same-process double-hash equality", () => {
  const golden = loadFixture("sample-pack.golden.json");
  const first = hashPack(golden.entities, golden.tables, golden.maps);
  const second = hashPack(golden.entities, golden.tables, golden.maps);
  assert.equal(first, second);
});

test("hashPack: exact-match golden hex for the sample pack", () => {
  const source = loadFixture("sample-pack.json");
  const result = compile(source);
  assert.equal(result.ok, true);
  assert.equal(result.pack.hash, GOLDEN_HASH);
});

test("hashPack: hash survives a JSON round-trip (proxy for cross-machine stability)", () => {
  const golden = loadFixture("sample-pack.golden.json");
  const roundTripped = JSON.parse(JSON.stringify({ entities: golden.entities, tables: golden.tables, maps: golden.maps }));
  const before = hashPack(golden.entities, golden.tables, golden.maps);
  const after = hashPack(roundTripped.entities, roundTripped.tables, roundTripped.maps);
  assert.equal(before, after);
});

test("canonicalize: key order does not affect output", () => {
  const a = canonicalize({ b: 1, a: 2 });
  const b = canonicalize({ a: 2, b: 1 });
  assert.equal(a, b);
});

test("canonicalize: array element order IS preserved (arrays are ordered data, not sorted)", () => {
  const a = canonicalize([1, 2, 3]);
  const b = canonicalize([3, 2, 1]);
  assert.notEqual(a, b);
});

test("canonicalize: throws on undefined", () => {
  assert.throws(() => canonicalize(undefined), TypeError);
});

test("canonicalize: throws on function", () => {
  assert.throws(() => canonicalize(() => {}), TypeError);
});

test("canonicalize: throws on symbol", () => {
  assert.throws(() => canonicalize(Symbol("x")), TypeError);
});

test("canonicalize: throws on NaN (bare JSON.stringify would silently coerce to \"null\")", () => {
  assert.throws(() => canonicalize({ v: NaN }), TypeError);
});

test("canonicalize: throws on +Infinity", () => {
  assert.throws(() => canonicalize({ v: Infinity }), TypeError);
});

test("canonicalize: throws on -Infinity", () => {
  assert.throws(() => canonicalize({ v: -Infinity }), TypeError);
});

test("canonicalize: NaN would otherwise be indistinguishable from an explicit null (the bug this guard prevents)", () => {
  // Without the NaN guard, JSON.stringify({v: NaN}) === JSON.stringify({v: null})
  // ("null"), which would make two semantically different packs hash
  // identically. Prove the naive (unguarded) behavior really would collide,
  // to justify why the guard exists.
  assert.equal(JSON.stringify({ v: NaN }), JSON.stringify({ v: null }));
  // ...and that canonicalize() itself refuses to produce that collision:
  assert.throws(() => canonicalize({ v: NaN }));
  assert.doesNotThrow(() => canonicalize({ v: null }));
});

test("canonicalize: an own-enumerable property literally named __proto__ is preserved in the output", () => {
  const withProto = JSON.parse('{"__proto__": 1, "a": 2}');
  // Sanity: JSON.parse already gives us a genuine own property here (not
  // a prototype hijack) — Object.keys must see it.
  assert.deepEqual(Object.keys(withProto).sort(), ["__proto__", "a"]);

  const out = canonicalize(withProto);
  const reparsed = JSON.parse(out);
  assert.deepEqual(Object.keys(reparsed).sort(), ["__proto__", "a"]);
  assert.equal(reparsed.__proto__, 1);
  // And it must be a genuine own property of the re-parsed object, not
  // (as the bug this guards against would produce) silently dropped or
  // turned into an actual prototype reassignment.
  assert.equal(Object.prototype.hasOwnProperty.call(reparsed, "__proto__"), true);
});

test("canonicalize: a pack with an own __proto__ key hashes differently from one without it (injectivity)", () => {
  // NOTE: `{ a: 1, __proto__: 2 }` as an OBJECT LITERAL is special-cased
  // by the JS spec (a literal, non-computed "__proto__" key sets
  // [[Prototype]] instead of creating an own property, and since 2 is
  // not an object/null the assignment is simply ignored) — that would
  // NOT exercise the case this test is about. JSON.parse, by contrast,
  // uses CreateDataProperty and always produces a genuine own property,
  // which is the realistic path a content pack's "__proto__" key would
  // actually take (packs are parsed JSON, never JS object literals).
  const withProto = canonicalize(JSON.parse('{"a":1,"__proto__":2}'));
  const without = canonicalize({ a: 1 });
  assert.notEqual(withProto, without);
});

test("canonicalize: naive {} + bracket-assign would have swallowed __proto__ (the bug this file avoids)", () => {
  // Demonstrates the exact failure mode described in hash.ts's header:
  // building the sorted object via a plain object literal and assigning
  // sorted["__proto__"] = x invokes Object.prototype's accessor instead
  // of creating an own property.
  const naive = {};
  naive["__proto__"] = 2;
  assert.equal(Object.prototype.hasOwnProperty.call(naive, "__proto__"), false);

  // canonicalize()'s Object.create(null)-based construction does NOT
  // have this problem (proven above), which is the whole point.
});
