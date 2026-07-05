#!/usr/bin/env node
/* Ban check (DELTA.md §0.3, pulled forward from O1): scans packages/**\/src
 * and packages/**\/tools for the forbidden patterns Math.random, eval(, and
 * new Function. No dependencies — this must run before `npm ci` has even
 * populated node_modules, and it must never itself execute the code it
 * scans (no eval/exec here either).
 *
 * Future-proofing: as more packages/ subdirectories are added (train/,
 * wasm/, additional package source roots), extend SCAN_ROOTS/SCAN_GLOBS
 * below rather than special-casing new packages — every packages/*\/src
 * and packages/*\/tools tree is in scope by construction.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const SCAN_SUBDIRS = ["src", "tools"];
const SKIP_DIRS = new Set(["node_modules", "dist", "fixtures"]);
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]);

const BANS = [
  { name: "Math.random", pattern: /Math\.random\s*\(/ },
  { name: "eval(", pattern: /\beval\s*\(/ },
  { name: "new Function", pattern: /new\s+Function\s*\(/ },
];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function listPackageRoots() {
  let names;
  try {
    names = readdirSync(PACKAGES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
  return names;
}

function isSourceFile(path) {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return false;
  return SOURCE_EXTENSIONS.has(path.slice(dot));
}

function scan() {
  const violations = [];
  for (const pkg of listPackageRoots()) {
    for (const sub of SCAN_SUBDIRS) {
      const root = join(PACKAGES_DIR, pkg, sub);
      try {
        statSync(root);
      } catch {
        continue; // package has no src/ or tools/ dir; nothing to scan
      }
      for (const file of walk(root)) {
        if (!isSourceFile(file)) continue;
        const text = readFileSync(file, "utf8");
        const lines = text.split("\n");
        for (const ban of BANS) {
          lines.forEach((line, i) => {
            if (ban.pattern.test(line)) {
              violations.push({
                file: relative(REPO_ROOT, file),
                line: i + 1,
                rule: ban.name,
                text: line.trim(),
              });
            }
          });
        }
      }
    }
  }
  return violations;
}

const violations = scan();
if (violations.length > 0) {
  console.error("check-bans: forbidden pattern(s) found:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.text}`);
  }
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}
console.log("check-bans: clean (no Math.random / eval( / new Function under packages/**/src, packages/**/tools).");
