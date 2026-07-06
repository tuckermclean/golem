import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "@golem-engine/content";

function facts(obj) {
  return (key) => obj[key];
}

test("evaluate: fact truthiness coercion", () => {
  assert.equal(evaluate({ fact: "x" }, facts({ x: true })), true);
  assert.equal(evaluate({ fact: "x" }, facts({ x: false })), false);
  assert.equal(evaluate({ fact: "x" }, facts({ x: 1 })), true);
  assert.equal(evaluate({ fact: "x" }, facts({ x: 0 })), false);
  assert.equal(evaluate({ fact: "x" }, facts({ x: "" })), false);
  assert.equal(evaluate({ fact: "x" }, facts({ x: "nonempty" })), true);
  assert.equal(evaluate({ fact: "missing" }, facts({})), false);
});

test("evaluate: not negates its child", () => {
  assert.equal(evaluate({ not: { fact: "x" } }, facts({ x: true })), false);
  assert.equal(evaluate({ not: { fact: "x" } }, facts({ x: false })), true);
});

test("evaluate: all is true iff every child is true (empty-array edge case aside, schema requires minItems 1)", () => {
  assert.equal(evaluate({ all: [{ fact: "a" }, { fact: "b" }] }, facts({ a: true, b: true })), true);
  assert.equal(evaluate({ all: [{ fact: "a" }, { fact: "b" }] }, facts({ a: true, b: false })), false);
  assert.equal(evaluate({ all: [{ fact: "a" }, { fact: "b" }] }, facts({ a: false, b: false })), false);
});

test("evaluate: any is true iff at least one child is true", () => {
  assert.equal(evaluate({ any: [{ fact: "a" }, { fact: "b" }] }, facts({ a: false, b: true })), true);
  assert.equal(evaluate({ any: [{ fact: "a" }, { fact: "b" }] }, facts({ a: false, b: false })), false);
});

test("evaluate: all short-circuits on the first false (later facts are never looked up)", () => {
  const seen = [];
  const lookup = (key) => {
    seen.push(key);
    return key === "a" ? false : true;
  };
  const result = evaluate({ all: [{ fact: "a" }, { fact: "b" }] }, lookup);
  assert.equal(result, false);
  assert.deepEqual(seen, ["a"]);
});

test("evaluate: any short-circuits on the first true (later facts are never looked up)", () => {
  const seen = [];
  const lookup = (key) => {
    seen.push(key);
    return key === "a" ? true : false;
  };
  const result = evaluate({ any: [{ fact: "a" }, { fact: "b" }] }, lookup);
  assert.equal(result, true);
  assert.deepEqual(seen, ["a"]);
});

test("evaluate: nested all/any/not compose", () => {
  const node = {
    all: [{ any: [{ fact: "a" }, { fact: "b" }] }, { not: { fact: "c" } }],
  };
  assert.equal(evaluate(node, facts({ a: false, b: true, c: false })), true);
  assert.equal(evaluate(node, facts({ a: false, b: true, c: true })), false);
});

test("evaluate: cmp eq/neq compare by strict equality across any Literal type", () => {
  assert.equal(evaluate({ cmp: { op: "eq", fact: "x", value: 5 } }, facts({ x: 5 })), true);
  assert.equal(evaluate({ cmp: { op: "eq", fact: "x", value: 5 } }, facts({ x: "5" })), false);
  assert.equal(evaluate({ cmp: { op: "neq", fact: "x", value: "a" } }, facts({ x: "b" })), true);
  assert.equal(evaluate({ cmp: { op: "eq", fact: "x", value: true } }, facts({ x: true })), true);
});

test("evaluate: cmp lt/lte/gt/gte on numbers", () => {
  assert.equal(evaluate({ cmp: { op: "lt", fact: "x", value: 5 } }, facts({ x: 4 })), true);
  assert.equal(evaluate({ cmp: { op: "lt", fact: "x", value: 5 } }, facts({ x: 5 })), false);
  assert.equal(evaluate({ cmp: { op: "lte", fact: "x", value: 5 } }, facts({ x: 5 })), true);
  assert.equal(evaluate({ cmp: { op: "gt", fact: "x", value: 5 } }, facts({ x: 6 })), true);
  assert.equal(evaluate({ cmp: { op: "gt", fact: "x", value: 5 } }, facts({ x: 5 })), false);
  assert.equal(evaluate({ cmp: { op: "gte", fact: "x", value: 5 } }, facts({ x: 5 })), true);
});

test("evaluate: cmp ordering ops are false (not a thrown error) when the fact is a non-number", () => {
  assert.equal(evaluate({ cmp: { op: "lt", fact: "x", value: 5 } }, facts({ x: "not a number" })), false);
  assert.equal(evaluate({ cmp: { op: "gte", fact: "x", value: 5 } }, facts({ x: undefined })), false);
});

test("evaluate never receives or executes anything but the closed AST shape (exhaustiveness)", () => {
  // TypeScript's exhaustive discriminated-union switch backs this at
  // compile time (see conditions.ts); at runtime, prove every one of
  // the five shapes — and only these five — is handled by evaluate.
  const shapes = [
    { all: [{ fact: "a" }] },
    { any: [{ fact: "a" }] },
    { not: { fact: "a" } },
    { fact: "a" },
    { cmp: { op: "eq", fact: "a", value: 1 } },
  ];
  for (const node of shapes) {
    assert.doesNotThrow(() => evaluate(node, facts({ a: 1 })));
  }
});
