/* ── DELTA A3 PR1 repo-hygiene test: the A3 belt-and-suspenders (design
   spec, "no-dynamic-code hygiene"). tools/check-bans.mjs scans
   packages/**\/src, packages/**\/tools, and tools/** — it does NOT scan
   imported-content/** (confirmed by reading tools/check-bans.mjs's own
   SCAN_SUBDIRS/EXTRA_ROOTS), so this local, redundant-by-design grep is
   the only thing proving `imported-content/adventure/{content,tests,
   module,bin}` carry no eval(/exec(/new Function/Function(/node:vm.

   DELTA A3 PR2 extends SCAN_DIRS with `module/` (the GameModule itself
   — reducer.js/module.js) and `bin/` (the one TTY wrapper, play.mjs):
   "generic declarative mechanics ONLY... Zero dynamic code" is exactly
   as load-bearing for the verb/lock/spawn interpreter as it was for the
   content pack's own compiler.

   Scoped to content/, tests/, module/, and bin/ only — NOT legacy/,
   which is frozen historical evidence (world.yaml's `func:`/
   `condition:` bodies and adventure.py's/items.py's real exec(/eval(/
   InteractiveConsole hazard ARE there by design; that is the entire
   point of AUDIT.md and DECISION-LOG.md). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ADVENTURE_DIR = fileURLToPath(new URL("..", import.meta.url));
// This file necessarily mentions the ban patterns literally (as BANS
// labels/regex source) — excluded by construction, not a documentation
// dodge, same as tools/check-bans.mjs's own SELF_PATH exclusion.
const SELF_PATH = fileURLToPath(import.meta.url);
const SCAN_DIRS = ["content", "tests", "module", "bin"];
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);

const BANS = [
  { name: "eval(", pattern: /\beval\s*\(/ },
  { name: "exec(", pattern: /\bexec\s*\(/ },
  { name: "new Function", pattern: /new\s+Function\s*\(/ },
  { name: "Function(", pattern: /(?<!new\s)\bFunction\s*\(/ },
  { name: "node:vm", pattern: /\bnode:vm\b/ },
];

function isSourceFile(name) {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return SOURCE_EXTENSIONS.has(name.slice(dot));
}

// Recursive — so nested dirs (e.g. tests/e2e/) are covered too; the zero-
// dynamic-code guarantee must hold for every source file under a scanned
// root, not just its top level.
function listFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(path));
    else if (e.isFile() && isSourceFile(e.name)) out.push(path);
  }
  return out;
}

test("imported-content/adventure/{content,tests,module,bin} carry no eval(/exec(/new Function/Function(/node:vm", () => {
  const violations = [];
  let scannedFiles = 0;

  for (const sub of SCAN_DIRS) {
    const dir = join(ADVENTURE_DIR, sub);
    for (const file of listFiles(dir)) {
      if (file === SELF_PATH) continue;
      scannedFiles += 1;
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n");
      for (const ban of BANS) {
        lines.forEach((line, i) => {
          if (ban.pattern.test(line)) {
            violations.push(`${file}:${i + 1}  [${ban.name}]  ${line.trim()}`);
          }
        });
      }
    }
  }

  assert.ok(scannedFiles > 0, "expected to scan at least one file under content/, tests/, module/, and bin/");
  assert.deepEqual(violations, [], `forbidden pattern(s) found:\n${violations.join("\n")}`);
});
