/* ── CONTENT/TYPES — the frozen runtime pack shape (DELTA C1). Pure types
   only, no runtime code, no imports. ─────────────────────────────────── */

export type EntityId = `entity:${string}`;
export type TableId = `table:${string}`;
export type MapId = `map:${string}`;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface EntityDef {
  id: EntityId;
  /** Component name -> component data. C1 does not validate this
   *  against C3's (not-yet-defined) component schemas — only that it
   *  is well-formed JSON with all $refs resolved (orchestrator decision
   *  #4 on the C1 design doc). */
  components: Record<string, JsonValue>;
}

export interface RuntimeTable {
  id: TableId;
  rows: JsonValue[];
}

export type Direction = "N" | "S" | "E" | "W";

export interface MapLegendEntry {
  /** Reference an authored template entity (singletons: Door Golem, a
   *  specific enemy). Mutually exclusive with `components` in practice
   *  (schema allows either, not requiring exactly-one — design Open Q
   *  #2). */
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
   *  topdown-puzzle/*.parse.json: `{rows, cols, cells}`). */
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
