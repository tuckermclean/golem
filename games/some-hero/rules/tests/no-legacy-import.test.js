/* ── DELTA S2a repo-hygiene test: rules/ must never import from
   games/some-hero/legacy/. Mirrors games/some-hero/tests/
   no-legacy-import.test.js's grep-based discipline (same quoted-specifier
   regex, so prose citations like "credentials.js:13-19" don't false-trip).

   Only the SHIPPED rules/*.js sources are covered here (not rules/tests/,
   not rules/index.mjs which only re-exports siblings, not rules/pack.js
   which only imports the some-hero content package — also checked below
   for completeness even though it is a "source", not a test). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RULES_DIR = new URL("../", import.meta.url);

// Same regex as games/some-hero/tests/no-legacy-import.test.js: only a
// real module specifier (a QUOTED path containing "legacy") reached via
// from / import / require trips this — prose citations ("ported from
// legacy/src/systems/credit.js:14-19") do not, since no quote precedes
// the path there.
const LEGACY_REF = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"][^'"\n]*legacy/;

test("rules/ sources import nothing from games/some-hero/legacy/", () => {
  const dir = fileURLToPath(RULES_DIR);
  const files = readdirSync(dir).filter(f => (f.endsWith(".mjs") || f.endsWith(".js")));
  assert.ok(files.length > 0, "expected at least one rules/ source file");

  const violations = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, RULES_DIR), "utf8");
    text.split("\n").forEach((line, i) => {
      if (LEGACY_REF.test(line)) violations.push(`rules/${file}:${i + 1}  ${line.trim()}`);
    });
  }
  assert.deepEqual(
    violations,
    [],
    `rules/ sources must not import from legacy/:\n${violations.join("\n")}`,
  );
});
