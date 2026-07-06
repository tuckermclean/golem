import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "@golem-engine/content";

const MALFORMED = new URL("./fixtures/malformed/", import.meta.url);

function loadMalformed(name) {
  return JSON.parse(readFileSync(new URL(name, MALFORMED), "utf8"));
}

// One fixture-and-test pair per failure mode (design doc Test plan
// table). Each entry asserts on the ACTUAL path/message text of at
// least one reported error, not just "is an error".
const CASES = [
  {
    file: "missing-required-field.json",
    expectPath: "(root)",
    expectMessage: /required property 'version'/,
  },
  {
    file: "additional-properties-violation.json",
    expectPath: "(root)",
    expectMessage: /additional properties/,
  },
  {
    file: "unknown-condition-operator.json",
    expectPath: "entities.entity:door_golem.components.Interactable.enabledWhen",
    expectMessage: /not a valid condition/,
  },
  {
    file: "dangling-ref.json",
    expectPath: "entities.entity:door_golem.components.Lock.key.$ref",
    expectMessage: /does not resolve.*entity:door_golem/s,
  },
  {
    file: "unknown-map-token.json",
    expectPath: "maps.map:guild_hall_entry.cells[1][1]",
    expectMessage: /unknown map legend token 'X'/,
  },
  {
    file: "duplicate-entity-id.json",
    expectPath: "entities[1].id",
    expectMessage: /duplicate id 'entity:door_golem'/,
  },
];

for (const { file, expectPath, expectMessage } of CASES) {
  test(`compile() rejects malformed pack: ${file}`, () => {
    const source = loadMalformed(file);
    const result = compile(source);

    assert.equal(result.ok, false, `expected ${file} to fail compilation`);
    assert.ok(result.errors.length > 0, `expected at least one error for ${file}`);

    const match = result.errors.find(
      (e) => e.path === expectPath && expectMessage.test(e.message),
    );
    assert.ok(
      match,
      `expected an error at path '${expectPath}' matching ${expectMessage} for ${file}, got:\n${JSON.stringify(result.errors, null, 2)}`,
    );
  });
}

test("compile() reports EVERY schema violation, not just the first (allErrors)", () => {
  const source = { name: "two-problems" }; // missing version, entities, tables, maps
  const result = compile(source);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 4, `expected >= 4 errors, got ${result.errors.length}`);
});

test("compile() short-circuits: a schema-invalid pack does not also run reference/duplicate-id checks", () => {
  // Combines TWO problems: missing 'version' (schema) AND a duplicate
  // entity id (a later-stage check). Only the schema error should
  // surface — later stages are skipped once stage 1 has already failed,
  // since ref-walking/duplicate-checking a schema-invalid tree is
  // meaningless (design doc, Compiler pipeline section).
  const source = {
    name: "short-circuit",
    entities: [
      { id: "entity:x", components: {} },
      { id: "entity:x", components: {} },
    ],
    tables: [],
    maps: [],
  };
  const result = compile(source);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /version/.test(e.message)));
  assert.ok(!result.errors.some((e) => /duplicate id/.test(e.message)));
});
