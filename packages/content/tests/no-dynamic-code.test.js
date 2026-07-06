import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// Local, redundant-by-design proof (belt-and-suspenders on top of the
// repo-wide tools/check-bans.mjs, which already scans every package's
// src tree for Math.random/eval(/new Function): reads this package's
// OWN src/*.ts source text and asserts none of eval(, new Function,
// require("vm")/node:vm, or Function.prototype.constructor appear. This
// never executes the code it scans (plain readFileSync + regex, same
// posture as check-bans.mjs's own header comment).

const SRC_DIR = new URL("../src/", import.meta.url);

// Patterns match actual USAGE (an import/require/call), not prose —
// several of this package's own header comments mention "eval" / "new
// Function" / "node:vm" BY NAME to explain the ban, which must not
// itself trip the ban.
const BANS = [
  { name: "eval(", pattern: /\beval\s*\(/ },
  { name: "new Function", pattern: /new\s+Function\s*\(/ },
  { name: 'import/require of "node:vm"', pattern: /(?:from\s+|require\(\s*)["']node:vm["']/ },
  { name: 'require("vm")', pattern: /require\(\s*["']vm["']\s*\)/ },
  { name: "Function.prototype.constructor", pattern: /Function\.prototype\.constructor/ },
];

function listSourceFiles() {
  return readdirSync(SRC_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => new URL(name, SRC_DIR));
}

test("no-dynamic-code: packages/content/src/*.ts contains no eval/new Function/node:vm", () => {
  const files = listSourceFiles();
  assert.ok(files.length > 0, "expected at least one src/*.ts file to scan");

  const violations = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (const ban of BANS) {
      lines.forEach((line, i) => {
        if (ban.pattern.test(line)) {
          violations.push(`${file.pathname}:${i + 1} [${ban.name}] ${line.trim()}`);
        }
      });
    }
  }

  assert.deepEqual(violations, [], `forbidden pattern(s) found:\n${violations.join("\n")}`);
});
