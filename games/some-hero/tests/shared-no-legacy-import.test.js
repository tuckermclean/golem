/* ── DELTA S2b repo-hygiene test: games/some-hero/shared/ must never
   import from games/some-hero/legacy/. Mirrors games/some-hero/tests/
   no-legacy-import.test.js's and rules/tests/no-legacy-import.test.js's
   grep-based discipline exactly (same quoted-specifier regex, so prose
   citations like "player.js:7-8" don't false-trip). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHARED_DIR = new URL("../shared/", import.meta.url);

const LEGACY_REF = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"][^'"\n]*legacy/;

test("shared/ sources import nothing from games/some-hero/legacy/", () => {
  const dir = fileURLToPath(SHARED_DIR);
  const files = readdirSync(dir).filter((f) => f.endsWith(".mjs") || f.endsWith(".js"));
  assert.ok(files.length > 0, "expected at least one shared/ source file");

  const violations = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, SHARED_DIR), "utf8");
    text.split("\n").forEach((line, i) => {
      if (LEGACY_REF.test(line)) violations.push(`shared/${file}:${i + 1}  ${line.trim()}`);
    });
  }
  assert.deepEqual(
    violations,
    [],
    `shared/ sources must not import from legacy/ (breaks the "legacy code untouched" guarantee):\n${violations.join("\n")}`,
  );
});
