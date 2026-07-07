/* ── DELTA A3 PR1 DoD test: "decision log required" is machine-checkable,
   not just prose (design spec, "A completeness test"). Parses AUDIT.md
   for every backtick-quoted `path:line` (or `path:line-line` range)
   locator it cites — the func:/condition:/hazard-supporting-site
   citations that anchor every row of AUDIT.md's own tables — and asserts
   each one is referenced (as a literal substring) somewhere in
   DECISION-LOG.md. A locator dropped from AUDIT.md without ever landing
   in the decision log fails this test immediately. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const AUDIT_PATH = new URL("../AUDIT.md", import.meta.url);
const DECISION_LOG_PATH = new URL("../DECISION-LOG.md", import.meta.url);

// Matches backtick-quoted `world.yaml:103`, `adventure.py:57`,
// `items.py:152-153`, etc. — a bare filename (world.yaml/adventure.py/
// items.py — the three legacy files AUDIT.md cites), a colon, and a line
// number or line-range.
const LOCATOR = /`((?:world\.yaml|adventure\.py|items\.py):\d+(?:-\d+)?)`/g;

function extractLocators(text) {
  const found = new Set();
  for (const match of text.matchAll(LOCATOR)) {
    found.add(match[1]);
  }
  return found;
}

test("AUDIT.md has at least one citable func:/condition:/hazard locator", () => {
  const audit = readFileSync(AUDIT_PATH, "utf8");
  const locators = extractLocators(audit);
  assert.ok(locators.size > 20, `expected >20 distinct locators in AUDIT.md, found ${locators.size}`);
});

test("every AUDIT.md func:/condition:/hazard locator is cited in DECISION-LOG.md", () => {
  const audit = readFileSync(AUDIT_PATH, "utf8");
  const decisionLog = readFileSync(DECISION_LOG_PATH, "utf8");

  const required = extractLocators(audit);
  const missing = [...required].filter((locator) => !decisionLog.includes(locator));

  assert.deepEqual(
    missing,
    [],
    `DECISION-LOG.md is missing a disposition row for: ${missing.join(", ")}`,
  );
});

test("DECISION-LOG.md cites the exact 16 world.yaml func: line numbers from AUDIT.md's own table", () => {
  const auditLines = [
    103, 137, 197, 237, 259, 296, 304, 326, 409, 453, 516, 543, 590, 687, 779, 790,
  ];
  const decisionLog = readFileSync(DECISION_LOG_PATH, "utf8");
  assert.equal(auditLines.length, 16);
  for (const line of auditLines) {
    assert.ok(decisionLog.includes(`world.yaml:${line}`), `missing world.yaml:${line}`);
  }
});

test("DECISION-LOG.md cites the condition: line and the 3 eval/exec loader lines", () => {
  const decisionLog = readFileSync(DECISION_LOG_PATH, "utf8");
  assert.ok(decisionLog.includes("world.yaml:578"), "missing the secret portal's condition: line");
  for (const line of [57, 77, 93]) {
    assert.ok(decisionLog.includes(`adventure.py:${line}`), `missing adventure.py:${line}`);
  }
});
