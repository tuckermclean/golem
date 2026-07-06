/* ── CONTENT/SCHEMA — ajv setup + JSON-Schema validation stage (DELTA
   C1, compiler pipeline stage 1). Reuses ajv exactly as
   packages/testkit/tools/validate-events.mjs already does: the root
   devDependency's draft-2020 build (`ajv/dist/2020.js`), `allErrors:
   true, strict: true`, one repo-controlled schema file, never a
   user-supplied one — same rationale as that script's own header
   comment (dev/CI-time validator dependency, never a runtime code path
   that compiles arbitrary schemas). No new package-level dependency:
   ajv is not listed in this package's own package.json, exactly
   mirroring validate-events.mjs's posture (root-hoisted devDependency,
   resolved via normal node_modules lookup). */

import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";

export interface CompileError {
  path: string;
  message: string;
}

const SCHEMA_URL = new URL("../schemas/pack.v1.json", import.meta.url);
const CONDITION_NODE_REF = "https://golem-engine/packages/content/schemas/pack.v1.json#/$defs/ConditionNode";

let cachedAjv: InstanceType<typeof Ajv2020> | undefined;
let cachedPackValidator: ValidateFunction | undefined;
let cachedConditionValidator: ValidateFunction | undefined;

function loadPackSchema(): Record<string, unknown> {
  return JSON.parse(readFileSync(SCHEMA_URL, "utf8")) as Record<string, unknown>;
}

function ajv(): InstanceType<typeof Ajv2020> {
  if (cachedAjv) return cachedAjv;
  // allowUnionTypes: pack.v1.json's ConditionNode.cmp.value is
  // legitimately `{"type": ["string","number","boolean"]}` (the
  // Literal type from the design doc) — standard, unremarkable
  // JSON-Schema; ajv's strict mode just requires opting in to
  // multi-type arrays explicitly. Unrelated to the eval/exec/dynamic-
  // code bans (DELTA §0.3): this only affects which JSON-Schema
  // keyword shapes ajv accepts, not what JS it can execute.
  const instance = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  instance.addSchema(loadPackSchema());
  cachedAjv = instance;
  return instance;
}

function packValidator(): ValidateFunction {
  if (cachedPackValidator) return cachedPackValidator;
  const instance = ajv();
  const fn = instance.getSchema("https://golem-engine/packages/content/schemas/pack.v1.json");
  if (!fn) throw new Error("schema.ts: pack.v1.json failed to register with ajv");
  cachedPackValidator = fn;
  return fn;
}

/**
 * Compiled validator for the standalone `#/$defs/ConditionNode` fragment
 * (draft 2020-12's `$defs` addressing: a schema registered under an
 * `$id` makes every internal `$defs` entry separately retrievable via
 * `<$id>#/$defs/<name>`). Used by src/conditions.ts's hydrateConditions()
 * to re-validate any object-shaped value it recognizes as an attempted
 * condition (see that file for why recognition, not schema $ref, is how
 * in-component conditions are reached at all).
 */
export function conditionNodeValidator(): ValidateFunction {
  if (cachedConditionValidator) return cachedConditionValidator;
  const instance = ajv();
  const fn = instance.getSchema(CONDITION_NODE_REF);
  if (!fn) throw new Error("schema.ts: #/$defs/ConditionNode failed to register with ajv");
  cachedConditionValidator = fn;
  return fn;
}

function formatAjvErrors(errors: ValidateFunction["errors"]): CompileError[] {
  if (!errors) return [];
  return errors.map((err) => ({
    path: err.instancePath && err.instancePath.length > 0 ? err.instancePath : "(root)",
    message: err.message ? `${err.message}${formatParams(err.params)}` : "schema validation failed",
  }));
}

function formatParams(params: unknown): string {
  if (params === null || typeof params !== "object") return "";
  const entries = Object.entries(params as Record<string, unknown>);
  if (entries.length === 0) return "";
  const rendered = entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
  return ` (${rendered})`;
}

/** Stage 1 of compile(): validate `source` against schemas/pack.v1.json.
 *  Returns every schema violation (allErrors), not just the first. */
export function validateSchema(source: unknown): CompileError[] {
  const validate = packValidator();
  const ok = validate(source);
  if (ok) return [];
  return formatAjvErrors(validate.errors);
}
