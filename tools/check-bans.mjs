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
 *
 * L2 (2026-07-06 design, orchestrator decision #5): tools/lang/
 * (gen_utterances.js/train_classifier.js) carries the exact same "no
 * Math.random/Date.now" obligation — both are randomized processes
 * (template slot selection, gibberish generation, train/calibration/
 * heldout shuffling, minibatch order) that must draw every random value
 * from @golem-engine/random's channel(...). It lives at the repo root,
 * not under packages/, so it needs its own explicit scan root rather
 * than falling out of the packages/*\/{src,tools} sweep above.
 *
 * L3 (2026-07-06 design, orchestrator decision #10): the model-data
 * tools (tools/harvest.js, tools/stub_teacher.js, tools/lang/
 * parse-cli.mjs) carry the same obligation — harvest.js walks worldgen
 * across thousands of seeds and must be reproducible byte-for-byte, so
 * EXTRA_ROOTS is widened from tools/lang/ to the whole tools/ root
 * (tools/lang/ is a subdirectory of it, so this is a superset, not a
 * behavior change for L2's existing files). */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const SCAN_SUBDIRS = ["src", "tools"];
const EXTRA_ROOTS = [join(REPO_ROOT, "tools")];
// This script itself necessarily mentions the ban patterns literally (in
// comments, the BANS table, and this very message) now that EXTRA_ROOTS
// widened to the whole tools/ root (L3 decision #10) — it would
// otherwise flag itself. Not app code; excluded by construction, not by
// a documentation dodge.
const SELF_PATH = fileURLToPath(import.meta.url);
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

function scanDir(root, violations) {
  try {
    statSync(root);
  } catch {
    return; // dir doesn't exist; nothing to scan
  }
  for (const file of walk(root)) {
    if (!isSourceFile(file)) continue;
    if (file === SELF_PATH) continue;
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

function scan() {
  const violations = [];
  for (const pkg of listPackageRoots()) {
    for (const sub of SCAN_SUBDIRS) {
      scanDir(join(PACKAGES_DIR, pkg, sub), violations);
    }
  }
  for (const root of EXTRA_ROOTS) {
    scanDir(root, violations);
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
console.log(
  "check-bans: clean (no Math.random / eval( / new Function under packages/**/src, packages/**/tools, tools/**).",
);
