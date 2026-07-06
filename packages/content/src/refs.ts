/* ── CONTENT/REFS — symbol table + reference resolution (DELTA C1,
   compiler pipeline stage 3). A reference is exactly `{ "$ref":
   "<kind>:<name>" }` — a single-key object, never a bare string (bare
   strings stay bare strings: table rows are free-form strings that must
   never be misread as refs). Resolution here means VALIDATING the
   pointer is not dangling, not inlining the pointee — see the C1 design
   doc's Reference resolution section, point 3, for why (shared
   templates must stay shared, not be duplicated per reference site). */

import type { CompileError } from "./schema.js";
import type { EntityId, MapId, TableId } from "./types.js";

export interface SymbolTable {
  entityIds: Set<string>;
  tableIds: Set<string>;
  mapIds: Set<string>;
}

interface IdSource {
  id?: unknown;
}

/**
 * Stage 3a: one pass over entities/tables/maps collecting every
 * declared id into its kind's Set, and reporting duplicate ids (two
 * array elements sharing an id — uniqueness across array elements isn't
 * expressible in JSON-Schema without a much messier `contains` trick,
 * so it is checked here in code, per the design doc's Reference
 * resolution step 1).
 */
export function buildSymbolTable(source: unknown): { table: SymbolTable; errors: CompileError[] } {
  const table: SymbolTable = { entityIds: new Set(), tableIds: new Set(), mapIds: new Set() };
  const errors: CompileError[] = [];
  if (source === null || typeof source !== "object") return { table, errors };
  const pack = source as { entities?: unknown; tables?: unknown; maps?: unknown };

  collectIds(pack.entities, "entities", table.entityIds, errors);
  collectIds(pack.tables, "tables", table.tableIds, errors);
  collectIds(pack.maps, "maps", table.mapIds, errors);

  return { table, errors };
}

function collectIds(list: unknown, label: string, into: Set<string>, errors: CompileError[]): void {
  if (!Array.isArray(list)) return;
  list.forEach((entry, i) => {
    if (entry === null || typeof entry !== "object") return;
    const id = (entry as IdSource).id;
    if (typeof id !== "string") return;
    if (into.has(id)) {
      errors.push({
        path: `${label}[${i}].id`,
        message: `duplicate id '${id}': another entry in '${label}' already declares this id.`,
      });
      return;
    }
    into.add(id);
  });
}

function kindOf(id: string): "entity" | "table" | "map" | undefined {
  const colon = id.indexOf(":");
  if (colon <= 0) return undefined;
  const prefix = id.slice(0, colon);
  if (prefix === "entity" || prefix === "table" || prefix === "map") return prefix;
  return undefined;
}

const PLURAL: Record<"entity" | "table" | "map", string> = {
  entity: "entities",
  table: "tables",
  map: "maps",
};

function candidateList(table: SymbolTable, kind: "entity" | "table" | "map"): string {
  const set = kind === "entity" ? table.entityIds : kind === "table" ? table.tableIds : table.mapIds;
  const list = Array.from(set).sort();
  return list.length > 0 ? list.join(", ") : "(none declared)";
}

function isRefShape(value: unknown): value is { $ref: unknown } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length === 1 && keys[0] === "$ref";
}

function checkRefString(
  ref: unknown,
  path: string,
  table: SymbolTable,
  errors: CompileError[],
  label = "$ref",
): void {
  if (typeof ref !== "string") {
    errors.push({ path, message: `${label} must be a string, got ${typeof ref}.` });
    return;
  }
  const kind = kindOf(ref);
  if (!kind) {
    errors.push({
      path,
      message: `${label} '${ref}' is not a valid reference: expected the form '<entity|table|map>:<name>'.`,
    });
    return;
  }
  const set = kind === "entity" ? table.entityIds : kind === "table" ? table.tableIds : table.mapIds;
  if (!set.has(ref)) {
    errors.push({
      path,
      message: `${label} '${ref}' does not resolve. This pack declares ${PLURAL[kind]}: ${candidateList(table, kind)}.`,
    });
  }
}

/** Recursively walk `value`, checking every `{ $ref }` object found. */
function walkForRefs(value: unknown, path: string, table: SymbolTable, errors: CompileError[]): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkForRefs(item, `${path}[${i}]`, table, errors));
    return;
  }
  if (isRefShape(value)) {
    checkRefString((value as { $ref: unknown }).$ref, `${path}.$ref`, table, errors);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    walkForRefs(child, `${path}.${key}`, table, errors);
  }
}

/**
 * Stage 3b: walk entities[].components, tables[].rows, and
 * maps[].legend[*].components for `{ $ref }` objects, PLUS
 * maps[].legend[*].entity (a direct EntityId field, not a `$ref`
 * wrapper), reporting every dangling reference with the full candidate
 * list of that reference kind (design doc: packs are expected to be
 * small, so an exhaustive list beats a fuzzy-match guess).
 */
export function resolveReferences(source: unknown, table: SymbolTable): CompileError[] {
  const errors: CompileError[] = [];
  if (source === null || typeof source !== "object") return errors;
  const pack = source as { entities?: unknown; tables?: unknown; maps?: unknown };

  if (Array.isArray(pack.entities)) {
    pack.entities.forEach((entity, i) => {
      if (entity === null || typeof entity !== "object") return;
      const e = entity as { id?: unknown; components?: unknown };
      const label = typeof e.id === "string" ? e.id : `entities[${i}]`;
      walkForRefs(e.components, `entities.${label}.components`, table, errors);
    });
  }

  if (Array.isArray(pack.tables)) {
    pack.tables.forEach((tbl, i) => {
      if (tbl === null || typeof tbl !== "object") return;
      const t = tbl as { id?: unknown; rows?: unknown };
      const label = typeof t.id === "string" ? t.id : `tables[${i}]`;
      walkForRefs(t.rows, `tables.${label}.rows`, table, errors);
    });
  }

  if (Array.isArray(pack.maps)) {
    pack.maps.forEach((map, i) => {
      if (map === null || typeof map !== "object") return;
      const m = map as { id?: unknown; legend?: unknown };
      const mapLabel = typeof m.id === "string" ? m.id : `maps[${i}]`;
      if (m.legend !== null && typeof m.legend === "object" && !Array.isArray(m.legend)) {
        for (const [token, entry] of Object.entries(m.legend as Record<string, unknown>)) {
          if (entry === null || typeof entry !== "object") continue;
          const legendEntry = entry as { entity?: unknown; components?: unknown };
          const legendPath = `maps.${mapLabel}.legend.${token}`;
          if (legendEntry.entity !== undefined) {
            checkRefString(legendEntry.entity, `${legendPath}.entity`, table, errors, "entity");
          }
          walkForRefs(legendEntry.components, `${legendPath}.components`, table, errors);
        }
      }
    });
  }

  return errors;
}

export type { EntityId, TableId, MapId };
