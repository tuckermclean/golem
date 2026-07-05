/* GOLDEN — games/golem-grid/reference/golem-grid.html is the original
 * hand-written, pre-Vite v0.2 prototype, preserved byte-verbatim as a
 * demo + fixture (K5; see reference/PROVENANCE.md for the extraction
 * command trail: parent of the "golem-grid.html => src/main.js" rename
 * commit 394391a, i.e. commit deb0006).
 *
 * This test pins the file's sha256 as a hardcoded literal. It must
 * never be "fixed" by re-hashing after an edit — the reference file is
 * never edited. A hash mismatch means someone touched the fixture.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const REFERENCE_URL = new URL("../reference/golem-grid.html", import.meta.url);
const EXPECTED_SHA256 =
  "3606eec246165846576d4ca4cae2fe057a3be323cb14714c10bc689a6ad3f16b";

test("reference/golem-grid.html is byte-verbatim (pinned sha256)", () => {
  const bytes = readFileSync(REFERENCE_URL);
  const gotSha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    gotSha256,
    EXPECTED_SHA256,
    "reference/golem-grid.html changed — this fixture must never be edited; " +
      "see reference/PROVENANCE.md",
  );
});
