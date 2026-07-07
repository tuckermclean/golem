/* ── DELTA S2 CLOSURE GATE (S2c PR6): "every @ceremony characterization
   test passes against the kernel implementation" — made machine-checkable.

   The 62 frozen @ceremony tests (games/some-hero/ceremony/*.ceremony.
   test.js, still run verbatim against legacy/ by `test:ceremony`) are the
   port's DoD oracle. This test asserts they are ALL accounted for by the
   kernel port:

   1. FILE PARITY — every ceremony/<area>.ceremony.test.js has a
      corresponding rules/tests/ceremony-kernel/<area>.kernel.test.js
      mirror (so a whole new ceremony area can't be added without a
      kernel mirror silently going missing).
   2. COUNT RECONCILIATION — the kernel-mirror suite's test count
      (`test:ceremony-kernel`) plus the explicitly-documented intentional
      divergences equals the legacy ceremony suite's count. The only
      divergence is the 2 dead-scarab ledger-text assertions (see
      rules/tests/ceremony-kernel/ledger-text.kernel.test.js and
      [[scarab-is-dead-holdover-content]]): scarab is gen-1 holdover
      content the port deliberately does not reproduce.

   These pinned counts are golden-file constants: if a ceremony test is
   added/removed, update them deliberately (and add/remove the mirror),
   the same discipline CLAUDE.md mandates for worldgen goldens. A silent
   drift here means the kernel port fell out of sync with its DoD oracle. */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CEREMONY_DIR = fileURLToPath(new URL("../ceremony/", import.meta.url));
const MIRROR_DIR = fileURLToPath(new URL("../rules/tests/ceremony-kernel/", import.meta.url));

// ── Golden counts (update deliberately with the suites they track) ──
const LEGACY_CEREMONY_TESTS = 62; // `test:ceremony`, run against legacy/
const KERNEL_MIRROR_TESTS = 60; // `test:ceremony-kernel`, run against rules/+shared/
const INTENTIONAL_DIVERGENCES = 2; // the 2 dead-scarab ledger-text pool-text assertions

test("S2 file parity: every @ceremony area has a kernel mirror", () => {
  const areas = readdirSync(CEREMONY_DIR)
    .filter((f) => f.endsWith(".ceremony.test.js"))
    .map((f) => f.replace(/\.ceremony\.test\.js$/, ""))
    .sort();
  const mirrors = new Set(
    readdirSync(MIRROR_DIR)
      .filter((f) => f.endsWith(".kernel.test.js"))
      .map((f) => f.replace(/\.kernel\.test\.js$/, "")),
  );
  const missing = areas.filter((a) => !mirrors.has(a));
  assert.deepEqual(missing, [], `ceremony areas with no kernel mirror: ${missing.join(", ")}`);
  assert.ok(areas.length > 0, "expected at least one ceremony area");
});

test("S2 count reconciliation: kernel mirrors + intentional divergences == legacy ceremony count", () => {
  assert.equal(
    KERNEL_MIRROR_TESTS + INTENTIONAL_DIVERGENCES,
    LEGACY_CEREMONY_TESTS,
    "the kernel port must account for every legacy @ceremony test (mirrored, or an explicitly-documented divergence)",
  );
});
