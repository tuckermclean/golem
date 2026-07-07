/* ── DELTA S1 PR3 repo-hygiene test: the content pack's sources must
   never import from games/some-hero/legacy/. This is what makes "Legacy
   code untouched" (DELTA S1 DoD; design spec "Legacy code untouched" —
   mechanism) regression-proof rather than merely true-at-merge — the
   same grep-based discipline games/golem-grid/tests/
   entities-not-in-callgraph.test.js uses for its own client-local
   guarantee.

   TESTS are deliberately exempt (content-review.test.js / hash-stability
   .test.js DO import legacy exports — that is how characterization
   proves byte-identity); only the SHIPPED content sources under
   content/ are covered here. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CONTENT_DIR = new URL("../content/", import.meta.url);

// Every .mjs/.js under content/ (the shipped sources — NOT tests, NOT
// the compiled pack.json). Matches only a real module specifier (a
// QUOTED path containing "legacy") reached via from / import / require —
// static, side-effect, or dynamic. The quote requirement is deliberate:
// the content sources legitimately cite "transcribed from .../legacy/..."
// in prose comments, which must NOT trip this (no quote precedes the
// path there), while an actual `from "../legacy/..."` import MUST.
const LEGACY_REF = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"][^'"\n]*legacy/;

test("content/ sources import nothing from games/some-hero/legacy/", () => {
  const dir = fileURLToPath(CONTENT_DIR);
  const files = readdirSync(dir).filter((f) => f.endsWith(".mjs") || f.endsWith(".js"));
  assert.ok(files.length > 0, "expected at least one content source file");

  const violations = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, CONTENT_DIR), "utf8");
    text.split("\n").forEach((line, i) => {
      if (LEGACY_REF.test(line)) violations.push(`content/${file}:${i + 1}  ${line.trim()}`);
    });
  }
  assert.deepEqual(
    violations,
    [],
    `content sources must not import from legacy/ (breaks the "legacy code untouched" guarantee):\n${violations.join("\n")}`,
  );
});
