import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "@golem-engine/content";

const FIXTURES = new URL("./fixtures/", import.meta.url);

function loadFixture(name) {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));
}

test("resolveReferences: a valid $ref (Lock.key -> entity:credential_stamp) resolves with no errors", () => {
  const source = loadFixture("sample-pack.json");
  const result = compile(source);
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.errors, null, 2));
  assert.equal(
    result.pack.entities["entity:door_golem"].components.Lock.key.$ref,
    "entity:credential_stamp",
  );
});

test("resolveReferences: a valid map legend 'entity' reference resolves with no errors", () => {
  const source = loadFixture("sample-pack.json");
  const result = compile(source);
  assert.equal(result.ok, true);
  assert.equal(result.pack.maps["map:guild_hall_entry"].legend.G.entity, "entity:door_golem");
});

test("resolveReferences: a dangling $ref reports the full candidate list of that reference kind", () => {
  const source = loadFixture("malformed/dangling-ref.json");
  const result = compile(source);
  assert.equal(result.ok, false);
  const err = result.errors.find((e) => e.path === "entities.entity:door_golem.components.Lock.key.$ref");
  assert.ok(err, `expected an error at the Lock.key.$ref path, got:\n${JSON.stringify(result.errors, null, 2)}`);
  assert.match(err.message, /\$ref 'entity:credential_stamp_missing' does not resolve/);
  assert.match(err.message, /This pack declares entities: entity:door_golem\./);
});

test("resolveReferences: a dangling map legend 'entity' reference is also reported (not just $ref objects)", () => {
  const source = {
    name: "dangling-legend-entity",
    version: 1,
    entities: [],
    tables: [],
    maps: [
      {
        id: "map:m",
        floor: ".",
        legend: { G: { entity: "entity:nonexistent" } },
        cells: ["G"],
      },
    ],
  };
  const result = compile(source);
  assert.equal(result.ok, false);
  const err = result.errors.find((e) => e.path === "maps.map:m.legend.G.entity");
  assert.ok(err, JSON.stringify(result.errors, null, 2));
  assert.match(err.message, /entity 'entity:nonexistent' does not resolve/);
  assert.match(err.message, /This pack declares entities: \(none declared\)\./);
});

test("resolveReferences: a $ref's kind is read from ITS OWN prefix, not the field it sits in — a $ref to a real table id resolves fine even from a generic component field", () => {
  // References are untyped-by-field (design doc: content stays opaque
  // about component shapes, decision #4) — resolution only asks "does
  // this <kind>:<name> string name something this pack declares",
  // regardless of which component field holds it.
  const source = {
    name: "kind-by-prefix",
    version: 1,
    entities: [{ id: "entity:a", components: { key: { $ref: "table:t" } } }],
    tables: [{ id: "table:t", rows: [] }],
    maps: [],
  };
  const result = compile(source);
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.errors, null, 2));
});

test("resolveReferences: a $ref whose prefix names no known kind is reported as not a valid reference", () => {
  const source = {
    name: "bad-prefix",
    version: 1,
    entities: [{ id: "entity:a", components: { key: { $ref: "widget:not_a_kind" } } }],
    tables: [],
    maps: [],
  };
  const result = compile(source);
  assert.equal(result.ok, false);
  const err = result.errors.find((e) => e.path === "entities.entity:a.components.key.$ref");
  assert.ok(err, JSON.stringify(result.errors, null, 2));
  assert.match(err.message, /is not a valid reference/);
});

test("duplicate id detection also covers tables and maps (not just entities)", () => {
  const source = {
    name: "dup-table",
    version: 1,
    entities: [],
    tables: [
      { id: "table:x", rows: [] },
      { id: "table:x", rows: [] },
    ],
    maps: [],
  };
  const result = compile(source);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "tables[1].id" && /duplicate id 'table:x'/.test(e.message)));
});
