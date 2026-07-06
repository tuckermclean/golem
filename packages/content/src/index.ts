/* ── @golem-engine/content — public API (DELTA C1).
   unknown (a parsed JS value) in, RuntimePack or actionable errors out.
   Pure, synchronous, dependency-free of @golem-engine/kernel. */

export { compile } from "./compile.js";
export type { CompileError, CompileResult, CompileOk, CompileErr } from "./compile.js";

// canonicalize()/hashPack() are exported alongside compile() (not kept
// as a private implementation detail like kernel's log.ts, which lives
// behind a browser-safety-motivated "./log" subpath) — content has no
// such boundary to protect (see tsconfig.json's header comment), so one
// export surface is simpler. Exposed both for direct unit testing
// (tests/hash-stability.test.js) and because "hash this already-
// compiled value the same way compile() does" is a legitimately
// reusable capability (e.g. a future tool re-hashing a stored
// RuntimePack to verify it hasn't drifted from its manifest).
export { canonicalize, hashPack } from "./hash.js";

export { evaluate } from "./conditions.js";
export type {
  ConditionNode,
  ConditionAll,
  ConditionAny,
  ConditionNot,
  ConditionFact,
  ConditionCmp,
  CmpOp,
  Literal,
  FactLookup,
} from "./conditions.js";

export type {
  RuntimePack,
  EntityDef,
  RuntimeTable,
  RuntimeMap,
  MapLegendEntry,
  EntityId,
  TableId,
  MapId,
  Direction,
  JsonValue,
} from "./types.js";
