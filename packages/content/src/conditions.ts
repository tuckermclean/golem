/* ── CONTENT/CONDITIONS — the safe condition language (DELTA C1): AST,
   pure tree-walking interpreter, and the compiler's "hydrate conditions"
   pipeline stage. NO eval, NO exec, NO new Function, NO node:vm — see
   tests/no-dynamic-code.test.js for the local, redundant-by-design proof
   on top of the repo-wide tools/check-bans.mjs scan. */

import type { CompileError } from "./schema.js";
import { conditionNodeValidator } from "./schema.js";
import type { JsonValue } from "./types.js";

export type CmpOp = "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
export type Literal = string | number | boolean;

export interface ConditionAll {
  all: ConditionNode[];
}
export interface ConditionAny {
  any: ConditionNode[];
}
export interface ConditionNot {
  not: ConditionNode;
}
export interface ConditionFact {
  fact: string;
}
export interface ConditionCmp {
  cmp: { op: CmpOp; fact: string; value: Literal };
}

export type ConditionNode = ConditionAll | ConditionAny | ConditionNot | ConditionFact | ConditionCmp;

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
    case "eq":
      return actual === value;
    case "neq":
      return actual !== value;
    // Ordering ops require BOTH sides to be numbers — deliberately not
    // falling back to JS's implicit string/number coercion for `<` etc.
    // (e.g. "10" < "9" is true under lexicographic string comparison,
    // which would be a silent footgun in a language whose whole point is
    // to be safe/predictable for non-programmer pack authors). A
    // mismatched-type comparison is simply false, not an error: the
    // fact may legitimately not exist yet, or evaluate to a different
    // type than the authored `value`, and that must not throw.
    case "lt":
      return typeof actual === "number" && typeof value === "number" && actual < value;
    case "lte":
      return typeof actual === "number" && typeof value === "number" && actual <= value;
    case "gt":
      return typeof actual === "number" && typeof value === "number" && actual > value;
    case "gte":
      return typeof actual === "number" && typeof value === "number" && actual >= value;
  }
}

/** The five (and only five) shape-defining keys of a ConditionNode. */
const CONDITION_MARKER_KEYS = new Set(["all", "any", "not", "fact", "cmp"]);

/**
 * hydrateConditions() — compiler pipeline stage 2.
 *
 * WHY THIS STAGE EXISTS, AND WHY IT WALKS RATHER THAN SCHEMA-$REFS:
 * schemas/pack.v1.json's own `$ref` graph never reaches ConditionNode,
 * because `EntitySource.components` / `MapLegendEntrySource.components`
 * are deliberately generic `JsonValue` (orchestrator decision #4 on the
 * C1 design doc: C1 does not pre-carve per-component schemas — that is
 * C3's job, once the component vocabulary exists). Conditions such as
 * `Lock.unlockCondition` / `Interactable.enabledWhen` (the design doc's
 * own sample-pack.json locations) live INSIDE that opaque component
 * data, so nothing in stage 1 (validateSchema) ever looks at their
 * shape.
 *
 * To still make the DoD's "malformed pack: unknown condition operator"
 * case a real compile()-time error (not just a fact never checked),
 * this stage walks every entity's `components` bag and every map
 * legend entry's inline `components` bag (table `rows` are excluded —
 * design doc's "Table row genericity" note: rows are free-form
 * heterogeneous data, e.g. Ledger copy, and must NOT be misread as
 * conditions just because a row object happens to use a common English
 * word like "fact" as a key for unrelated reasons). Recognition is
 * purely STRUCTURAL and closed: a plain object counts as an "attempted
 * condition" iff it has EXACTLY ONE own-enumerable key and that key is
 * one of {all, any, not, fact, cmp} (CONDITION_MARKER_KEYS). Anything
 * else (including objects using an unrelated single key, or the $ref
 * shape, or a multi-key object) is left as ordinary opaque data — this
 * is deliberately conservative to avoid false positives on legitimate
 * non-condition data that happens to use one of these words.
 *
 * Every recognized attempted condition is re-validated, recursively,
 * against schemas/pack.v1.json's own `#/$defs/ConditionNode` fragment
 * (via schema.ts's conditionNodeValidator()) — the SAME closed oneOf
 * that proves "no dynamic code path" structurally. A value like
 * `{"cmp": {"op": "matches", "fact": "x", "value": 1}}` (an operator
 * outside the closed enum) fails this check with an actionable
 * path+message; a value with a wholly unrelated single key (e.g.
 * `{"expr": "1+1"}`) is not recognized as an attempted condition at all
 * and passes through untouched (schema-opaque data, per decision #4).
 *
 * This stage produces ONLY CompileErrors; it does not rewrite or return
 * a hydrated AST into the frozen pack (RuntimePack.entities[].components
 * stays JsonValue, per types.ts) — "hydration" here means "prove every
 * condition-shaped value in scope is a well-formed ConditionNode",
 * which is exactly what the schema-level half of the no-dynamic-code
 * proof requires actually running against pack data to mean anything.
 */
export function hydrateConditions(source: unknown): CompileError[] {
  const errors: CompileError[] = [];
  if (source === null || typeof source !== "object") return errors;
  const pack = source as { entities?: unknown; maps?: unknown };

  if (Array.isArray(pack.entities)) {
    pack.entities.forEach((entity, i) => {
      if (entity === null || typeof entity !== "object") return;
      const e = entity as { id?: unknown; components?: unknown };
      const label = typeof e.id === "string" ? e.id : `[${i}]`;
      walkForConditions(e.components, `entities.${label}.components`, errors);
    });
  }

  if (Array.isArray(pack.maps)) {
    pack.maps.forEach((map, i) => {
      if (map === null || typeof map !== "object") return;
      const m = map as { id?: unknown; legend?: unknown };
      const mapLabel = typeof m.id === "string" ? m.id : `[${i}]`;
      if (m.legend !== null && typeof m.legend === "object" && !Array.isArray(m.legend)) {
        for (const [token, entry] of Object.entries(m.legend as Record<string, unknown>)) {
          if (entry === null || typeof entry !== "object") continue;
          const legendEntry = entry as { components?: unknown };
          walkForConditions(
            legendEntry.components,
            `maps.${mapLabel}.legend.${token}.components`,
            errors,
          );
        }
      }
    });
  }

  return errors;
}

function isAttemptedCondition(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length === 1 && CONDITION_MARKER_KEYS.has(keys[0]!);
}

/** Recursively walk `value` (an already schema-validated JsonValue
 *  subtree), validating every recognized attempted condition against
 *  ConditionNode and recursing into ordinary objects/arrays otherwise. */
function walkForConditions(value: unknown, path: string, errors: CompileError[]): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkForConditions(item, `${path}[${i}]`, errors));
    return;
  }
  if (isAttemptedCondition(value)) {
    const validate = conditionNodeValidator();
    const ok = validate(value);
    if (!ok) {
      for (const err of validate.errors ?? []) {
        const suffix = err.instancePath && err.instancePath.length > 0 ? err.instancePath : "";
        errors.push({
          path: `${path}${suffix}`,
          message: `not a valid condition: ${err.message ?? "schema validation failed"}`,
        });
      }
    }
    // A recognized-but-valid condition's children were already fully
    // checked by the recursive ConditionNode schema (all/any/not nest
    // ConditionNode itself) — no need to walk further inside it.
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, JsonValue>)) {
    walkForConditions(child, `${path}.${key}`, errors);
  }
}
