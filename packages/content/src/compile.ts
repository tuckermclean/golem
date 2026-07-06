/* ── CONTENT/COMPILE — orchestrates the compiler pipeline (DELTA C1):
   1. validateSchema   — ajv against schemas/pack.v1.json
   2. hydrateConditions — re-validate every recognized in-component
      condition against #/$defs/ConditionNode (see conditions.ts)
   3. buildSymbolTable / resolveReferences — duplicate-id + dangling-$ref
      checks
   4. freeze — assemble {entities, tables, maps} keyed by id, checking
      map cell/legend consistency along the way
   5. hashPack — canonicalize + sha256, attach as `hash`

   Each stage accumulates errors (allErrors-style thoroughness); later
   stages are skipped once an earlier stage has already failed
   (ref-walking / condition-walking a schema-invalid tree is meaningless
   — the shapes the walkers assume are only guaranteed once stage 1
   passes). Stages 2 and 3 are independent of each other (conditions
   live in component/legend data, refs are a structural scan over the
   same data) so both run and their errors are merged before deciding
   whether to proceed to freeze.

   NO eval / exec / new Function / node:vm anywhere in this file or this
   package — tools/check-bans.mjs (repo-wide, CI-enforced) scans every
   package's src tree automatically; tests/no-dynamic-code.test.js adds
   a local, redundant-by-design grep as belt-and-suspenders. */

import { validateSchema } from "./schema.js";
import type { CompileError } from "./schema.js";
import { hydrateConditions } from "./conditions.js";
import { buildSymbolTable, resolveReferences } from "./refs.js";
import { hashPack } from "./hash.js";
import type {
  Direction,
  EntityDef,
  EntityId,
  JsonValue,
  MapId,
  MapLegendEntry,
  RuntimeMap,
  RuntimePack,
  RuntimeTable,
  TableId,
} from "./types.js";

export type { CompileError };

export interface CompileOk {
  ok: true;
  pack: RuntimePack;
}
export interface CompileErr {
  ok: false;
  errors: CompileError[];
}
export type CompileResult = CompileOk | CompileErr;

interface EntitySource {
  id: EntityId;
  components: Record<string, JsonValue>;
}
interface TableSource {
  id: TableId;
  rows: JsonValue[];
}
interface MapLegendEntrySource {
  entity?: EntityId;
  components?: Record<string, JsonValue>;
  facing?: Direction;
}
interface MapSource {
  id: MapId;
  floor: string;
  legend: Record<string, MapLegendEntrySource>;
  cells: string[];
}
interface SourcePack {
  name: string;
  version: number;
  entities: EntitySource[];
  tables: TableSource[];
  maps: MapSource[];
}

export function compile(source: unknown): CompileResult {
  const schemaErrors = validateSchema(source);
  if (schemaErrors.length > 0) return { ok: false, errors: schemaErrors };

  // Past this point `source` is schema-valid: the SourcePack shape
  // (including every nested EntitySource/TableSource/MapSource) is
  // guaranteed by schemas/pack.v1.json, so the cast below is a checked
  // identity, not an unchecked assumption.
  const pack = source as SourcePack;

  const { table, errors: duplicateIdErrors } = buildSymbolTable(source);
  const conditionErrors = hydrateConditions(source);
  const refErrors = resolveReferences(source, table);

  const preFreezeErrors = [...duplicateIdErrors, ...conditionErrors, ...refErrors];
  if (preFreezeErrors.length > 0) return { ok: false, errors: preFreezeErrors };

  const frozen = freeze(pack);
  if (!frozen.ok) return frozen;

  const hash = hashPack(frozen.entities, frozen.tables, frozen.maps);
  return {
    ok: true,
    pack: { hash, entities: frozen.entities, tables: frozen.tables, maps: frozen.maps },
  };
}

type FreezeResult =
  | {
      ok: true;
      entities: Record<EntityId, EntityDef>;
      tables: Record<TableId, RuntimeTable>;
      maps: Record<MapId, RuntimeMap>;
    }
  | CompileErr;

function freeze(pack: SourcePack): FreezeResult {
  const errors: CompileError[] = [];

  const entities: Record<EntityId, EntityDef> = {};
  for (const e of pack.entities) {
    entities[e.id] = { id: e.id, components: e.components };
  }

  const tables: Record<TableId, RuntimeTable> = {};
  for (const t of pack.tables) {
    tables[t.id] = { id: t.id, rows: t.rows };
  }

  const maps: Record<MapId, RuntimeMap> = {};
  for (const m of pack.maps) {
    freezeMap(m, errors, maps);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, entities, tables, maps };
}

function freezeMap(m: MapSource, errors: CompileError[], into: Record<MapId, RuntimeMap>): void {
  const cols = m.cells.length > 0 ? m.cells[0]!.length : 0;
  const legendTokens = Object.keys(m.legend).sort();

  m.cells.forEach((row, rowIndex) => {
    if (row.length !== cols) {
      errors.push({
        path: `maps.${m.id}.cells[${rowIndex}]`,
        message: `row length ${row.length} does not match the map's column count ${cols} (established by row 0).`,
      });
      return;
    }
    for (let col = 0; col < row.length; col++) {
      const token = row[col]!;
      if (token !== m.floor && !(token in m.legend)) {
        errors.push({
          path: `maps.${m.id}.cells[${rowIndex}][${col}]`,
          message:
            `unknown map legend token '${token}': not the floor token ('${m.floor}') and not a ` +
            `key of legend. Declared legend tokens: ${legendTokens.length > 0 ? legendTokens.join(", ") : "(none)"}.`,
        });
      }
    }
  });

  const legend: Record<string, MapLegendEntry> = {};
  for (const [token, entry] of Object.entries(m.legend)) {
    const frozenEntry: MapLegendEntry = {};
    if (entry.entity !== undefined) frozenEntry.entity = entry.entity;
    if (entry.components !== undefined) frozenEntry.components = entry.components;
    if (entry.facing !== undefined) frozenEntry.facing = entry.facing;
    legend[token] = frozenEntry;
  }

  into[m.id] = {
    id: m.id,
    rows: m.cells.length,
    cols,
    cells: m.cells,
    floor: m.floor,
    legend,
  };
}
