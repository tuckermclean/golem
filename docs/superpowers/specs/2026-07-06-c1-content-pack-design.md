# `packages/content` (C1) — Content-Pack Schema + Compiler — Design

**Date:** 2026-07-06
**Status:** Draft — for orchestrator review before implementation begins
**Topic:** DELTA.md Phase 2, task C1 — content-pack schema, safe condition
language, reference resolution, hashing, frozen runtime pack. This is a
design document only; no code changes are made by it.

## Scope

DELTA §C1, verbatim:

> Content pack = YAML/JSON + ASCII sources → validate (JSON-schema) →
> compile conditions (a restricted expression language: `all`/`any`/`not`/
> `fact`/`cmp` ONLY — a tiny interpreter, NOT eval) → resolve references →
> hash → a frozen runtime pack `{hash, entities, tables, maps}`.
> DoD: the compiler round-trips a hand-written sample pack; the hash is
> stable across machines; malformed packs fail with actionable errors; a
> lint rule proves no dynamic code path exists.

C1 is a pure, synchronous, dependency-light compiler: `unknown` (a parsed
JS value — no file/YAML IO inside the package) in, `RuntimePack` or a list
of actionable errors out. It does **not**:

- validate component data against C3's future component schemas (C3 does
  not exist yet; C1 only guarantees "well-formed JSON, references
  resolve" — see Open Questions #4);
- parse ASCII levels (that is C2 — but C1's `maps` shape is designed so
  C2 only has to produce data in this shape, never invent a new one);
- do any file/YAML loading, multi-file pack merging, or CLI plumbing
  (deferred — see Open Questions #6);
- touch `packages/kernel`, `packages/world`, or any game code.

What exists today: `packages/content/README.md` (one line) and
`packages/content/package.json` (bare `@golem-engine/content` stub, no
`exports`/`scripts`/deps yet). This design proposes filling that package
in, matching the conventions already established by `packages/random`,
`packages/net`, and `packages/kernel` (npm-workspace member, `tsc -p .`
via `prepare`, `node --test` via `test`, TS strict, ESM, `dist/` built,
never committed).

## Why this shape (grounding in VISION + DELTA)

- VISION doctrine #7: "Content is data, compiled... No eval, no exec, no
  code in content, ever again." — the condition language's entire reason
  to exist is to let authors express *logic* without authors (or a
  future LLM-assisted authoring tool) ever writing executable code.
- VISION doctrine #8: "All meaning is authored upstream (tables,
  grammar, corpus)... Improve tables before improving the generator." —
  `tables` is not an afterthought field; it is the primary authoring
  surface for Ledger copy, message pools, drop tables, etc.
- DELTA C2 needs `maps` to hold topdown-puzzle's ASCII vocabulary
  (`# B D @ H V M E/W/N/S` — confirmed by reading
  `games/topdown-puzzle/legacy/src/scenes/KyeScene.js:858-891`: wall,
  block, diamond, player-start, horizontal/vertical baddie, memory hole,
  and four directional movers) without C1 hardcoding any of that
  vocabulary. The design below makes maps a generic
  grid-of-legend-tokens container; C2's entire job becomes authoring one
  `legend` document plus converting `.txt` files into `cells` arrays —
  no change to C1's schema or types.
- DELTA C3 needs `entities` to hold component bags keyed by the
  component names it will define (Identity, GridPosition,
  RegionMembership, Actor, Health, Inventory, Portable, Portal, Lock,
  Credential, Interactable, Perception, Knowledge). C1 does not know
  these names; `components: Record<string, JsonValue>` is deliberately
  opaque at this layer so C3 can land its component vocabulary without
  a C1 schema migration.
- Doctrine #1 ("the world is a pure function of the seed") means content
  packs must **not** mint entity *instances* — a map's `legend` is a
  static blueprint (token → template/component-bag), and turning a grid
  into positioned entity instances with namespaced ids is
  `deriveWorld`'s job (a *different* pure function, `f(contentHash,
  seed) → world`, owned by C3/games, not C1). This is the load-bearing
  design decision that keeps C1 simple: C1 freezes content, it never
  simulates or instantiates.
- `packages/kernel/src/log.ts`'s `canonicalEvent` is the house style for
  "hash must be stable across machines": sorted-key JSON bytes, reject
  `undefined`/`function`/`symbol` by throwing rather than silently
  dropping them. C1 mirrors this discipline exactly (see Hashing below),
  and tightens one edge case kernel's version doesn't handle (see the
  NaN/Infinity note).

## Source pack format

A source pack is one parsed JS value (object) with this top-level shape.
Authors write YAML or JSON; C1's `compile()` accepts the already-parsed
value (loading/parsing is out of scope — see Open Questions #6).

```yaml
# tests/fixtures/sample-pack.yaml — the DoD round-trip fixture
name: sample-pack
version: 1

entities:
  - id: entity:door_golem
    components:
      Identity:
        name: "Door Golem"
      Interactable:
        prompt: "approach the Door Golem"
        enabledWhen:
          all:
            - not: { fact: "door_golem:greeted" }
      Lock:
        unlockCondition:
          all:
            - { fact: "player:has_credential" }
            - cmp: { op: "gte", fact: "player:credential_tier", value: 1 }
        key: { $ref: "entity:credential_stamp" }

  - id: entity:credential_stamp
    components:
      Identity:
        name: "Ceremony Stamp"
      Portable: {}
      Credential:
        tier: 1

tables:
  - id: table:ledger.doorGolemLines
    rows:
      - "The Door Golem regards you and says nothing."
      - "Denied. The stamp is missing."

maps:
  - id: map:guild_hall_entry
    floor: "."
    legend:
      "#": { components: { Identity: { name: "wall" } } }
      "@": { entity: entity:credential_stamp }   # player start marker (example only — see note)
      "G": { entity: entity:door_golem }
      "B": { components: { Portable: {}, Identity: { name: "crate" } } }
    cells:
      - "###"
      - "#G#"
      - "#.#"
```

Top-level keys:

- `name`, `version` — free-form metadata, not hashed (see Hashing).
- `entities: EntitySource[]` — hand-authored, uniquely-`id`'d templates
  (Door Golem, a specific credential, a boss — things that exist once
  or are referenced by name).
- `tables: TableSource[]` — named, ordered content arrays. Row shape is
  deliberately generic (`JsonValue[]`) since VISION's tables are
  heterogeneous (see Open Questions #5).
- `maps: MapSource[]` — grid blueprints: dimensions implied by
  `cells`, a `legend` mapping each non-floor token to either a
  reference to an authored template entity or an inline component bag
  to be instantiated once per occurrence at `deriveWorld` time (owned
  by C3, not C1).

Every `id` is a namespaced string per DELTA §0.3's convention
(`entity:x`, `table:y`, `map:z`), enforced by the JSON-Schema pattern
`^(entity|table|map):[a-z][a-z0-9_-]*$` — the same discipline
`packages/kernel/schemas/events.v1.json`'s `NamespacedId` already uses.

## JSON-Schema validation

`packages/content/schemas/pack.v1.json` — draft 2020-12, version in the
filename, no in-body version field, matching
`packages/kernel/schemas/events.v1.json`'s conventions exactly (same
`$schema`, same `$defs`-heavy style, same `additionalProperties: false`
closing every object shape so a pack cannot silently smuggle in an
unrecognized field).

Sketch (abbreviated — the real file enumerates every field):

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://golem-engine/packages/content/schemas/pack.v1.json",
  "$defs": {
    "EntityId": { "type": "string", "pattern": "^entity:[a-z][a-z0-9_-]*$" },
    "TableId":  { "type": "string", "pattern": "^table:[a-z][a-z0-9_-]*$" },
    "MapId":    { "type": "string", "pattern": "^map:[a-z][a-z0-9_-]*$" },

    "Ref": {
      "type": "object",
      "properties": { "$ref": { "type": "string", "pattern": "^(entity|table|map):[a-z][a-z0-9_-]*$" } },
      "required": ["$ref"],
      "additionalProperties": false
    },

    "ConditionNode": {
      "$comment": "THE closed set. Exactly these 5 shapes, nothing else — this is the structural half of the 'no dynamic code path' proof (see Safe condition language below). Adding a 6th shape here is the only way to add a new operator; there is no escape hatch field name (no 'expr', no 'js', no 'code').",
      "oneOf": [
        { "type": "object", "properties": { "all": { "type": "array", "items": { "$ref": "#/$defs/ConditionNode" }, "minItems": 1 } }, "required": ["all"], "additionalProperties": false },
        { "type": "object", "properties": { "any": { "type": "array", "items": { "$ref": "#/$defs/ConditionNode" }, "minItems": 1 } }, "required": ["any"], "additionalProperties": false },
        { "type": "object", "properties": { "not": { "$ref": "#/$defs/ConditionNode" } }, "required": ["not"], "additionalProperties": false },
        { "type": "object", "properties": { "fact": { "type": "string", "minLength": 1 } }, "required": ["fact"], "additionalProperties": false },
        {
          "type": "object",
          "properties": {
            "cmp": {
              "type": "object",
              "properties": {
                "op": { "enum": ["eq", "neq", "lt", "lte", "gt", "gte"] },
                "fact": { "type": "string", "minLength": 1 },
                "value": { "type": ["string", "number", "boolean"] }
              },
              "required": ["op", "fact", "value"],
              "additionalProperties": false
            }
          },
          "required": ["cmp"],
          "additionalProperties": false
        }
      ]
    },

    "JsonValue": { "$comment": "Recursive any-JSON-value schema (string|number|boolean|null|array|object of JsonValue), used for component/table-row data C1 does not otherwise constrain." }
  },
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "entities": { "type": "array", "items": { "$ref": "#/$defs/EntitySource" } },
    "tables":   { "type": "array", "items": { "$ref": "#/$defs/TableSource" } },
    "maps":     { "type": "array", "items": { "$ref": "#/$defs/MapSource" } }
  },
  "required": ["name", "version", "entities", "tables", "maps"],
  "additionalProperties": false
}
```

Every place a condition is legal in a component (`Lock.unlockCondition`,
`Interactable.enabledWhen`, etc.) `$ref`s `#/$defs/ConditionNode`
directly — the schema pass and the condition-safety proof are the same
pass structurally, which is the strongest possible closure (see below).

**Actionable errors.** `ajv` (already a root `devDependency`, pinned
`8.20.0`, `ajv/dist/2020.js` build — reused exactly as
`packages/testkit/tools/validate-events.mjs` already does, so no new
package-level dependency) is run with `allErrors: true, strict: true` so
one `compile()` call reports every schema violation in the pack, not
just the first. Each ajv error is mapped to
`{ path: instancePath || "(root)", message }`, and `compile.ts` layers
domain-specific messages on top where ajv's generic text is not enough —
in particular for `$ref` resolution failures (own stage, see below),
where the message includes the full list of declared ids of that kind so
a typo is easy to spot (mirrors `validate-events.mjs`'s per-`seq`
per-`t` reporting style).

## The safe condition language

Grammar (this is the *entire* language — DELTA is explicit that these
five shapes are the whole of it, no escape hatch):

```
ConditionNode =
  | { all: ConditionNode[] }        // true iff every child is true
  | { any: ConditionNode[] }        // true iff at least one child is true
  | { not: ConditionNode }          // true iff child is false
  | { fact: string }                // true iff factLookup(key) is truthy
  | { cmp: { op, fact, value } }    // true iff factLookup(fact) `op` value

op ∈ { eq, neq, lt, lte, gt, gte }
value ∈ string | number | boolean
```

TypeScript AST (`packages/content/src/conditions.ts`):

```ts
export type CmpOp = "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
export type Literal = string | number | boolean;

export interface ConditionAll { all: ConditionNode[] }
export interface ConditionAny { any: ConditionNode[] }
export interface ConditionNot { not: ConditionNode }
export interface ConditionFact { fact: string }
export interface ConditionCmp { cmp: { op: CmpOp; fact: string; value: Literal } }

export type ConditionNode =
  | ConditionAll | ConditionAny | ConditionNot | ConditionFact | ConditionCmp;

export type FactLookup = (key: string) => unknown;

/** Pure tree-walking interpreter. No eval, no Function, no indirect
 *  property access beyond calling the caller-supplied factLookup with a
 *  string the AST already carried — there is no way to reach arbitrary
 *  code from pack data through this function. */
export function evaluate(node: ConditionNode, factLookup: FactLookup): boolean {
  if ("all" in node) return node.all.every((c) => evaluate(c, factLookup));
  if ("any" in node) return node.any.some((c) => evaluate(c, factLookup));
  if ("not" in node) return !evaluate(node.not, factLookup);
  if ("fact" in node) return Boolean(factLookup(node.fact));
  const { op, fact, value } = node.cmp;
  const actual = factLookup(fact);
  switch (op) {
    case "eq":  return actual === value;
    case "neq": return actual !== value;
    case "lt":  return typeof actual === "number" && actual < value;
    case "lte": return typeof actual === "number" && actual <= value;
    case "gt":  return typeof actual === "number" && actual > value;
    case "gte": return typeof actual === "number" && actual >= value;
  }
}
```

`factLookup` is supplied by whatever *runtime* system asks "is this
condition true right now" (a future kernel `validate`/`observe`
consumer, not built yet); C1 ships the interpreter as part of its public
API (games and C3 import `evaluate` from `@golem-engine/content`) but
never calls it itself — C1's own "compile conditions" pipeline stage is
a typed re-hydration of the already schema-validated JSON into this AST
shape (effectively a checked identity cast, since the schema already
guarantees the shape), kept as its own stage for testability and as the
place a future optimization (e.g. constant folding) would live.

**Proof that no dynamic code path exists — two independent layers:**

1. **Structural (schema-level).** `ConditionNode`'s `oneOf` +
   `additionalProperties: false` on every branch means a pack author
   cannot express a 6th shape — there is no `"expr"`, `"js"`, or
   `"code"` key anywhere in the grammar to smuggle a string into. A
   pack containing `{"cheat": "process.exit(1)"}` where a condition is
   expected fails schema validation before `compile()` gets anywhere
   near `evaluate` (tested: `tests/fixtures/malformed/unknown-condition-
   operator.json`).
2. **Lint (repo-wide, already in place).** `tools/check-bans.mjs`
   already scans every `packages/*/src` and `packages/*/tools` tree for
   `Math.random(`, `eval(`, and `new Function` — `packages/content/src`
   is in scope automatically, no change to that tool needed. C1 adds one
   local, redundant-by-design test
   (`packages/content/tests/no-dynamic-code.test.js`) that reads its own
   `src/conditions.ts` and `src/compile.ts` source text and asserts none
   of `eval(`, `new Function`, `require("vm")`/`node:vm`,
   `Function.prototype.constructor` appear — belt-and-suspenders local
   to this package, on top of the CI-wide ban.

Together: (1) proves *content data* cannot express code, (2) proves the
*interpreter itself* is not implemented with dynamic code execution.
Neither alone is a full proof (a schema can't stop a badly-written
interpreter; a source-grep on the interpreter can't stop a schema that
accidentally allows a raw string).

## Reference resolution

A reference is exactly `{ "$ref": "<kind>:<name>" }` — a single-key
object, never a bare string (bare strings stay bare strings; this keeps
"is this thing a reference" a structural question, not a heuristic on
string shape, which matters because table rows are free-form strings
that must never be misread as refs).

Resolution algorithm (`packages/content/src/refs.ts`):

1. **Build the symbol table.** One pass over `entities`, `tables`,
   `maps`, collecting every declared id into `Set<EntityId>`,
   `Set<TableId>`, `Set<MapId>` (also the source of "duplicate id"
   errors — two entities sharing an id is a malformed-pack error caught
   here, not by JSON-Schema, since uniqueness across array elements
   isn't expressible in Schema without a much messier `contains`
   trick).
2. **Walk every value** in `entities[].components`, `tables[].rows`, and
   `maps[].legend` looking for objects matching the `Ref` shape
   (single key, `$ref`). For each: parse the `<kind>:<name>` prefix
   (already schema-validated to match the pattern), look up existence
   in the matching symbol-table set.
3. **Report, don't rewrite.** A resolved `$ref` is left as-is in the
   frozen `RuntimePack` — resolution here means *validating the pointer
   is not dangling*, not inlining the pointee. Consumers (C3, `deriveWorld`)
   do their own id → data lookup against `RuntimePack.entities`/`tables`
   at the point they need it. This is deliberate: inlining would
   duplicate shared templates (e.g. every map spawn of a `B` block
   inlining a full copy of that entity's components) and would make "one
   shared entity referenced from many places" impossible to express.
4. **Cycles are not checked.** References here are plain pointers (no
   inheritance/composition semantics — see Open Questions #2), so a
   reference cycle is inert data, not a compile error. If a future task
   adds template inheritance, cycle detection becomes required at that
   point, not before.

Error shape: `{ path: "entities.entity:door_golem.components.Lock.key",
message: "$ref 'entity:credential_stamp_missing' does not resolve. This
pack declares entities: entity:door_golem, entity:credential_stamp." }` —
always includes the full candidate list for that reference kind, since
packs are expected to be small (tens to low hundreds of ids), making an
exhaustive list more useful than a fuzzy-match guess.

## Hashing

`packages/content/src/hash.ts` mirrors `packages/kernel/src/log.ts`'s
`canonicalEvent` discipline exactly, generalized from "an event" to "any
compiled pack value":

```ts
/** Canonical byte form: JSON.stringify with every plain object's keys
 *  recursively sorted (lexicographic); array order preserved. Throws
 *  (does not silently coerce/drop) on undefined, function, symbol —
 *  same as kernel/src/log.ts's canonicalEvent — PLUS NaN/±Infinity,
 *  which kernel's version does not currently guard: bare
 *  JSON.stringify(NaN) silently produces the string "null", which would
 *  make two different packs (one with a NaN field, one with an
 *  explicit null) hash identically. Content packs are frozen build
 *  artifacts; a silent NaN->null coercion at hash time is exactly the
 *  kind of bug this discipline exists to rule out by construction. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}
```

This is a **local, intentional duplication** of kernel's ~15-line
algorithm rather than an import of `@golem-engine/kernel`'s `./log`
export — see Open Questions #1 for the trade-off and why this design
does not resolve it unilaterally.

`hashPack(entities, tables, maps)`: canonicalize `{ entities, tables,
maps }` (the compiled, reference-checked, sorted structures —
**excluding** `name`/`version` metadata, which are authoring convenience
fields, not semantic content) and take the sha256 hex digest, exactly as
`packages/kernel/src/log.ts` takes sha256 hex of `canonicalEvent(...)`
for chain links. The result becomes `RuntimePack.hash`.

"Stable across machines" is proven in CI by three properties (see Test
plan): same-process double-hash equality, hash-survives-a-JSON-
round-trip equality (the practical proxy for "no reliance on object
insertion order or engine-internal state"), and an exact-match golden
hash for the committed sample pack (the same golden-file religion
CLAUDE.md mandates for worldgen).

## Frozen runtime pack shape

```ts
// packages/content/src/types.ts
export type EntityId = `entity:${string}`;
export type TableId  = `table:${string}`;
export type MapId    = `map:${string}`;

export type JsonValue =
  | string | number | boolean | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface EntityDef {
  id: EntityId;
  /** Component name -> component data. C1 does not validate this
   *  against C3's (not-yet-defined) component schemas — only that it
   *  is well-formed JSON with all $refs resolved. See Open Q #4. */
  components: Record<string, JsonValue>;
}

export interface RuntimeTable {
  id: TableId;
  rows: JsonValue[];
}

export type Direction = "N" | "S" | "E" | "W";

export interface MapLegendEntry {
  /** Reference an authored template entity (singletons: Door Golem,
   *  a specific enemy). Mutually exclusive with `components` in
   *  practice (schema allows either, not requiring exactly-one — see
   *  Open Q #2 note on why this is left loose for now). */
  entity?: EntityId;
  /** Inline component bag, instantiated fresh per grid occurrence at
   *  deriveWorld time (owned by C3/games, NOT this package — doctrine
   *  #1: the world, including map-derived entity instances, is a pure
   *  function of (contentHash, seed), computed at runtime, never at
   *  content-compile time). */
  components?: Record<string, JsonValue>;
  facing?: Direction;
}

export interface RuntimeMap {
  id: MapId;
  rows: number;
  cols: number;
  /** Raw legend-token rows, verbatim — same shape as the P0.3
   *  topdown-puzzle parse snapshots (packages/testkit/fixtures/
   *  topdown-puzzle/*.parse.json: `{rows, cols, cells}`), so C2's
   *  snapshot-equivalence DoD ("parses match the P0.3 snapshots
   *  semantically") has a direct structural target to compare against. */
  cells: string[];
  /** The token meaning "no entity here" (default "."). Any cell
   *  character that is neither `floor` nor a key of `legend` is a
   *  malformed-pack error at compile time. */
  floor: string;
  legend: Record<string, MapLegendEntry>;
}

export interface RuntimePack {
  hash: string;
  entities: Record<EntityId, EntityDef>;
  tables: Record<TableId, RuntimeTable>;
  maps: Record<MapId, RuntimeMap>;
}
```

Note the deliberate shape match to
`packages/testkit/fixtures/topdown-puzzle/001.parse.json` (`{file, rows,
cols, cells, entities}`) confirmed by reading that fixture: it already
stores `rows`/`cols`/`cells` plus a token→coordinate-list `entities` map.
`RuntimeMap` keeps `cells` verbatim (provenance + a trivial mechanical
crosswalk to that fixture shape) while moving the "where is each token"
question into `legend` (token → spawn rule) rather than
`entities` (token → coordinate list), because C1 must describe *how to
build* a map generically, while the P0.3 fixture only records *one
already-parsed instance* for regression pinning.

## Compiler pipeline & public API

```ts
// packages/content/src/index.ts
export interface CompileError { path: string; message: string }
export type CompileResult =
  | { ok: true; pack: RuntimePack }
  | { ok: false; errors: CompileError[] };

export function compile(source: unknown): CompileResult;
export { evaluate } from "./conditions.js";
export type { ConditionNode, FactLookup } from "./conditions.js";
export type { RuntimePack, EntityDef, RuntimeTable, RuntimeMap, MapLegendEntry } from "./types.js";
```

`compile()` stages (`packages/content/src/compile.ts`), each
accumulating errors with `allErrors`-style thoroughness rather than
failing on the first problem, later stages skipped once an earlier stage
has already failed (ref-walking a schema-invalid tree is meaningless):

1. **`validateSchema(source)`** — ajv against `schemas/pack.v1.json`.
   Returns immediately with all schema errors if any exist.
2. **`hydrateConditions(source)`** — recursively re-parse every
   schema-validated `ConditionNode` subtree into the typed AST (a
   checked identity mapping, given the schema already closed the shape;
   this stage exists so condition-shape problems have one clearly-owned
   module, and as the seam for a future optimizer).
3. **`resolveReferences(source)`** — build the symbol table, walk for
   `$ref`s, collect dangling-reference errors.
4. **`freeze(source)`** — assemble `{ entities, tables, maps }` keyed by
   id (arrays → `Record<Id, T>`, duplicate-id check lives here too, see
   Reference resolution step 1), producing the shape above minus `hash`.
5. **`hashPack(...)`** — canonicalize + sha256, attach as `hash`.
   Returns `{ ok: true, pack }`.

If any stage 1–3 produced errors, `compile()` returns `{ ok: false,
errors }` with every error collected up to and including the last stage
that ran — never a single error swallowing the rest, matching
`validate-events.mjs`'s "report everything, don't stop at the first
failure" convention.

## File / module layout

```
packages/content/
  package.json            # @golem-engine/content, exports "." -> dist/index.js,
                           #   types -> dist/index.d.ts, scripts: prepare (tsc -p .), test (node --test)
  tsconfig.json            # mirrors packages/random's: strict, ES2022, NodeNext, dist/ from src/
  README.md                # expanded from the current one-liner
  schemas/
    pack.v1.json           # draft 2020-12, version in filename (events.v1.json convention)
  src/
    index.ts                # public API surface (compile, evaluate, types re-export)
    types.ts                 # RuntimePack/EntityDef/RuntimeTable/RuntimeMap/MapLegendEntry — pure types only
    schema.ts                 # ajv setup + validateSchema(source) -> CompileError[]
    conditions.ts               # ConditionNode AST + evaluate() interpreter + hydrateConditions()
    refs.ts                       # symbol table + resolveReferences()
    hash.ts                         # canonicalize() + hashPack()
    compile.ts                        # orchestrates the 5 stages
  tests/
    fixtures/
      sample-pack.yaml            # DoD round-trip fixture (hand-written)
      sample-pack.golden.json     # committed golden RuntimePack (incl. golden hash)
      malformed/
        missing-required-field.json
        unknown-condition-operator.json   # e.g. {"expr": "..."} where a ConditionNode is expected
        dangling-ref.json
        unknown-map-token.json
        duplicate-entity-id.json
    compile.test.js           # round-trip against sample-pack.golden.json
    hash-stability.test.js    # double-hash, JSON-round-trip-then-hash, golden hash exact-match
    schema-errors.test.js     # one test per tests/fixtures/malformed/* — asserts path+message
    refs.test.js               # valid ref resolves; dangling ref -> actionable candidate list
    conditions.test.js          # evaluate() unit tests for all/any/not/fact/cmp incl. short-circuit-free purity
    no-dynamic-code.test.js      # local grep-based redundant-by-design check (see condition-language proof)
```

Matches `packages/random`/`packages/net`/`packages/kernel` conventions:
npm workspace member, `"type": "module"`, `prepare: "tsc -p ."` building
`dist/` (never committed — same as the other three packages' `.gitignore`
posture), `test: "node --test"`. No new root dependency: `ajv` is already
pinned at the root (`8.20.0`) and workspace-hoisted, exactly as
`packages/testkit/tools/validate-events.mjs` already relies on without
its own `package.json` dependency entry.

## Test plan (DoD → concrete `node:test`)

| DoD bullet | Test(s) |
|---|---|
| Compiler round-trips a hand-written sample pack | `tests/compile.test.js`: `compile(loadYaml("sample-pack.yaml"))` deep-equals the committed `sample-pack.golden.json` (entities/tables/maps *and* the golden hash) |
| Hash is stable across machines | `tests/hash-stability.test.js`: (1) `hashPack(x) === hashPack(x)` twice in-process; (2) `hashPack(JSON.parse(JSON.stringify(x))) === hashPack(x)` (serialization-round-trip invariance — proxy for cross-process/cross-machine, since CI runners are homogeneous and literal multi-machine hashing isn't testable in one job); (3) exact-match against a committed golden hex constant for the sample pack (same golden-file religion as worldgen) |
| Malformed packs fail with actionable errors | `tests/schema-errors.test.js` + `tests/refs.test.js`: one fixture-and-test pair per failure mode (missing required field, wrong type / `additionalProperties` violation, unknown condition operator, dangling `$ref` with candidate list, unknown map legend token, duplicate entity id) — each asserts on the actual `path`/`message` text, not just "is an error" |
| Lint rule proves no dynamic code path exists | (a) root `tools/check-bans.mjs` already scans `packages/content/src` — no change needed, called out explicitly in a comment in `compile.ts`; (b) `tests/conditions.test.js` includes the `unknown-condition-operator.json` fixture proving the schema's closed `oneOf` rejects any 6th shape; (c) `tests/no-dynamic-code.test.js` greps this package's own `src/*.ts` for `eval(`/`new Function`/`node:vm` as a local, redundant-by-design assertion |

`evaluate()` itself also gets direct unit coverage (`conditions.test.js`)
independent of the compiler: all/any/not short-circuit correctly, all six
`cmp` operators, `fact` truthiness coercion, and a case proving
`evaluate` never receives or executes anything but the closed AST shape
(TypeScript's exhaustiveness on the discriminated union backs this at
compile time too).

## Open questions / risks (for the orchestrator)

1. **Canonicalization duplication vs. a shared package.**
   `packages/content/src/hash.ts` intentionally reimplements
   `packages/kernel/src/log.ts`'s ~15-line canonicalization algorithm
   locally rather than depending on `@golem-engine/kernel`'s `./log`
   export, because (a) importing an `Event`-named function
   (`canonicalEvent`) to hash a content pack is a semantically odd
   cross-package coupling, and (b) it keeps `packages/content`
   dependency-free of `kernel` (content should be usable — and
   testable — standalone; nothing in VISION's package list makes content
   depend on kernel). This is a real DRY-vs-dependency-direction
   trade-off; a future tiny shared "canon" utility (its own package, or
   hosted in `packages/testkit`) that both `kernel` and `content` import
   is a legitimate alternative. Flagging rather than deciding, since it
   affects a sibling package this task must not touch.
2. **A genuine finding on the sibling package, not acted on here:**
   `kernel/src/log.ts`'s `canonicalEvent` does not guard against
   `NaN`/`Infinity` — bare `JSON.stringify(NaN)` silently produces
   `"null"`, the same class of silent-coercion bug that function already
   throws on for `undefined`/`function`/`symbol`. This design adds that
   guard in content's own `canonicalize()`; worth a follow-up task to
   upstream the same guard into kernel, out of scope for C1 to touch.
3. **No entity template inheritance.** Map legend entries offer a flat
   choice — reference one authored template entity, or one inline
   component bag — with no "extend template X, override field Y."
   Deliberately deferred per the flagship rule ("nothing enters the
   engine that SOME HERO's next milestone does not need"); revisit only
   if C2's topdown-puzzle conversion or S1's content extraction finds
   the flat model too repetitive.
4. **Component-shape validation boundary.** C1 validates
   `components: Record<string, JsonValue>` structurally (well-formed
   JSON, resolved `$ref`s) but not against per-component schemas, because
   C3 (which defines the component vocabulary) doesn't exist yet at C1's
   point in the roadmap. Confirm before C3 starts whether C3 should (a)
   extend `pack.v1.json` with a `$defs` entry per component name and
   re-validate, or (b) run its own separate validation pass over an
   already-compiled `RuntimePack`. This design assumes (b) to avoid C1
   needing a schema migration the moment C3 lands, but it's the
   orchestrator's call.
5. **Table row genericity.** `rows: JsonValue[]` is intentionally
   unconstrained (Ledger copy vs. weighted drop tables vs. corpus
   snippets look nothing alike). Whether specific table *kinds* (e.g. a
   `weighted-table` with `{value, weight}` rows) deserve their own typed
   schema is left open until a real consumer (S1, L3) needs it —
   over-specifying now would be guessing at requirements DELTA hasn't
   stated yet.
6. **No YAML loader / CLI in this package.** DELTA's arrow diagram opens
   with "YAML/JSON... sources"; this design's `compile()` takes an
   already-parsed value, leaving YAML parsing and multi-file pack
   merging to whichever task first authors a real pack (most likely S1).
   Adding a YAML dependency now would be a new dependency DELTA §0.3
   says shouldn't happen "without a task saying so" — flagging this
   explicitly rather than picking `js-yaml` (or any library) unasked.
7. **Map `floor` token.** A single reserved "empty" token per map
   (default `"."`) is the minimum viable design and matches every
   existing topdown-puzzle level (none use `.` as a meaningful token).
   Low-priority open question: does any future map need to distinguish
   "empty floor" from "not yet authored" — no evidence for this yet.

## Orchestrator decisions (locks this design for implementation)

Resolved 2026-07-06 by the orchestrating agent. Implementation follows
the design above with these bindings:

1. **Canonicalization: keep the local implementation.** Accept the ~15-line
   duplication in `content/src/hash.ts`. C1 stays dependency-free of
   `kernel`; a shared "canon" util is a legitimate *future* refactor but is
   not pulled forward (YAGNI + clean dependency direction). No sibling
   package is touched.
2. **kernel `canonicalEvent` NaN/Infinity gap → follow-up task, not C1.**
   C1's own `canonicalize()` guards NaN/±Infinity (throw, don't coerce).
   Do **not** touch `packages/kernel` in the C1 PR. This gap is also fed
   to the Phase-1 review cross-check — if that swarm's K3 reviewer
   surfaces it independently, it becomes its own tracked fix-PR (K3 is a
   Phase-1 deliverable; hardening it is separate from building C1).
3. **No template inheritance.** Deferred — accepted.
4. **Component validation boundary → option (b).** C3 runs its own
   validation pass over an already-compiled `RuntimePack`; C1 does **not**
   pre-carve per-component `$defs`. Keeps C1 stable when C3 lands.
5. **Table rows stay `JsonValue[]`.** No typed table kinds until a real
   consumer (S1/L3) needs them — accepted.
6. **No YAML dependency in C1 — and the round-trip fixture is JSON.**
   `compile()` takes an already-parsed value (parser-agnostic; YAML is a
   *source-authoring* format fed in by a later task's loader). The DoD
   round-trip fixture is therefore **`sample-pack.json`**, not
   `sample-pack.yaml` — so the round-trip test needs zero YAML dependency.
   A YAML rendering of the same pack stays in this doc/README purely as an
   authoring illustration. (This is the one concrete change from the draft:
   `tests/fixtures/sample-pack.yaml` → `tests/fixtures/sample-pack.json`.)
7. **Single `floor` token per map.** Accepted (default `"."`).

Everything else in the design is accepted as written. Implementation may
begin **only after the Phase-1 whole-phase review gate clears** (CLAUDE.md:
"Phase 1 (K1–K6) needs a whole-phase review before Phase 2 (C1) begins").
