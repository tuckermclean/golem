/* ── CONTENT/HASH — canonical byte form + sha256 digest for a compiled
   pack (DELTA C1). Mirrors packages/kernel/src/log.ts's canonicalEvent
   discipline exactly, generalized from "an event" to "any compiled pack
   value" — this is an intentional, LOCAL duplication of that ~15-line
   algorithm, not an import of @golem-engine/kernel (orchestrator
   decision #1 on the C1 design doc: content stays dependency-free of
   kernel; a shared "canon" util is a legitimate future refactor, not
   pulled forward here).

   TWO guarantees this file adds beyond a bare `JSON.stringify`, both
   load-bearing for "the hash is stable across machines" (content packs
   are frozen build artifacts — a silent coercion at hash time would
   make two semantically different packs hash identically, which is
   exactly the class of bug this discipline exists to rule out):

   1. Throws (does not silently drop/coerce) on `undefined`, `function`,
      `symbol` — same as kernel's canonicalEvent.
   2. Throws on NaN/+Infinity/-Infinity — a guard kernel's canonicalEvent
      does NOT currently have (bare `JSON.stringify(NaN)` silently
      produces the string "null", which would make a pack with an
      explicit `null` field indistinguishable, at hash time, from one
      with a NaN field). Flagged in the C1 design doc's Open Q #2 as a
      genuine finding on the sibling package; orchestrator decision #2:
      fixed HERE, not upstreamed into kernel by this task.

   PLUS: correct handling of an own-enumerable property literally named
   `__proto__`. A naive port of kernel's algorithm builds the sorted
   object via an object literal (`const sorted: Record<string, unknown>
   = {}`) and assigns `sorted[key] = ...` in a loop. For a source object
   with an own key "__proto__" (which JSON.parse produces correctly, as
   a genuine own data property — JSON.parse's spec algorithm uses
   CreateDataProperty, not [[Set]], so reading is never the problem),
   that assignment pattern is the bug: `{}["__proto__"] = x` on a
   NORMAL object literal invokes Object.prototype's `__proto__`
   ACCESSOR (inherited from the object's own prototype chain), which
   either silently changes the new object's prototype (if x is an
   object or null) or silently no-ops (if x is a primitive) — either
   way the key is dropped from the object's own enumerable properties,
   and JSON.stringify never sees it. Two packs differing only in a
   `__proto__` field would then hash identically: an injectivity break
   just as real as the NaN one above.

   Fix chosen (see canonicalize()'s sortKeysDeep): build the sorted
   object as a NULL-PROTOTYPE object (`Object.create(null)`) rather than
   `{}`. A null-prototype object has no inherited `__proto__` accessor
   to intercept the assignment, so `sorted["__proto__"] = x` becomes an
   ordinary own data-property assignment, and JSON.stringify serializes
   it like any other key. This is preferred over rejecting `__proto__`
   outright (content-pack authors have no obvious reason to use that key,
   but rejecting a structurally valid JSON key the pack's own JSON-Schema
   already permits — recall components/rows are generic JsonValue, which
   allows any string key — would be a needless extra restriction; making
   the hash correct for the input it already accepts is simpler and more
   general than special-casing a reject). Proven directly by
   tests/hash-stability.test.js. */

import { createHash } from "node:crypto";
import type { EntityId, EntityDef, TableId, RuntimeTable, MapId, RuntimeMap } from "./types.js";

/** Canonical byte form: `JSON.stringify` with every plain object's keys
 *  recursively sorted (lexicographic, `Array.prototype.sort`'s default
 *  string comparison); array element order is preserved (arrays are
 *  ordered data, not sorted). Throws a `TypeError` on `undefined`,
 *  `function`, `symbol`, `NaN`, `Infinity`, `-Infinity` rather than
 *  silently coercing/dropping them — see the file header for why. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function assertCanonicalizable(value: unknown): void {
  if (value === undefined) {
    throw new TypeError("canonicalize: undefined is not a permitted value");
  }
  if (typeof value === "function") {
    throw new TypeError("canonicalize: function is not a permitted value");
  }
  if (typeof value === "symbol") {
    throw new TypeError("canonicalize: symbol is not a permitted value");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(
      `canonicalize: ${String(value)} is not a permitted value (NaN/Infinity are not valid JSON numbers)`,
    );
  }
}

function sortKeysDeep(value: unknown): unknown {
  assertCanonicalizable(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const obj = value as Record<string, unknown>;
  // Object.create(null): a plain `{}` literal inherits Object.prototype's
  // `__proto__` accessor, which would silently swallow an own key
  // literally named "__proto__" on assignment below (see file header).
  // A null-prototype object has no such accessor to intercept it.
  const sorted: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key]);
  }
  return sorted;
}

function sha256Hex(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

/** Hash a compiled, reference-checked pack's semantic content —
 *  EXCLUDING `name`/`version` metadata, which are authoring convenience
 *  fields, not semantic content (design doc, Hashing section). This
 *  becomes `RuntimePack.hash`. */
export function hashPack(
  entities: Record<EntityId, EntityDef>,
  tables: Record<TableId, RuntimeTable>,
  maps: Record<MapId, RuntimeMap>,
): string {
  return sha256Hex(canonicalize({ entities, tables, maps }));
}
