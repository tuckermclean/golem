/* ── DELTA S4 PR1 repo-hygiene test: games/some-hero/src/ must never
   import from games/some-hero/legacy/. Mirrors tests/
   shared-no-legacy-import.test.js's and rules/tests/no-legacy-import.
   test.js's grep-based discipline exactly (same quoted-specifier regex,
   so prose citations like "player.js:7-8" don't false-trip). The S4 PR1
   brief's hard constraint: the shipped adapter (src/render-adapter.js)
   and shared/module.js must import NOTHING from legacy/ — TL/T/enemy-
   visual constants are defined inline instead (cited to their legacy
   source lines in comments, which this regex deliberately does not
   flag). Only TEST files (tests/render-adapter-drawable.test.js) are
   allowed to import legacy/, for the headless renderer-compat proof. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC_DIR = new URL("../src/", import.meta.url);

const LEGACY_REF = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"][^'"\n]*legacy/;

test("src/ sources import nothing from games/some-hero/legacy/", () => {
  const dir = fileURLToPath(SRC_DIR);
  const files = readdirSync(dir).filter((f) => f.endsWith(".mjs") || f.endsWith(".js"));
  assert.ok(files.length > 0, "expected at least one src/ source file");

  const violations = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, SRC_DIR), "utf8");
    text.split("\n").forEach((line, i) => {
      if (LEGACY_REF.test(line)) violations.push(`src/${file}:${i + 1}  ${line.trim()}`);
    });
  }
  assert.deepEqual(
    violations,
    [],
    `src/ sources must not import from legacy/ (breaks the "shipped adapter is legacy-free" guarantee):\n${violations.join("\n")}`,
  );
});
