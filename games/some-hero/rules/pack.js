// The table-consumption seam (DELTA S2a design spec, "The table-consumption
// seam"): rules/ is the first repo consumer of pack.tables. The content
// pack is compiled once, at module load, via the some-hero content
// package's own compileContentPack() (games/some-hero/content/index.mjs)
// — no per-call recompile, and no re-reading of the raw pack.json here
// (that stays content/'s concern).

import { compileContentPack } from "../content/index.mjs";

const result = compileContentPack();
if (!result.ok) {
  throw new Error(
    "games/some-hero/rules: content pack failed to compile: " + JSON.stringify(result.errors, null, 2),
  );
}

/** The compiled RuntimePack (packages/content's CompileResult.pack). */
export const pack = result.pack;

/** Raw table map: TableId -> RuntimeTable ({ id, rows }). */
export const tables = result.pack.tables;

/** A required table's rows. Throws if the table id is absent — every
 *  caller here names a table S1 actually committed (content/pack.json),
 *  so a miss is a real wiring bug, not a soft-fail case. */
export function tableRows(id) {
  const t = tables[id];
  if (!t) throw new Error(`games/some-hero/rules: missing table ${id}`);
  return t.rows;
}
