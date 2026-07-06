/* The DoD's ≥200-utterance test corpus (design doc §"The ≥200-utterance
 * test corpus"): a committed golden (tests/corpus.json), generated once
 * by a one-off script and frozen — never regenerated at test time. One
 * node:test case per corpus entry, so a failure points at the exact
 * utterance, not "some case in the JSON failed". */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "../dist/index.js";
import { affordances } from "./fixtures/affordances.js";

const corpusPath = fileURLToPath(new URL("./corpus.json", import.meta.url));
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

let totalCases = 0;

for (const { name, cases } of corpus) {
  for (const { utterance, useAffordances, expect } of cases) {
    totalCases++;
    test(`[${name}] ${JSON.stringify(utterance)}`, () => {
      const opts = useAffordances ? { affordances } : undefined;
      const actual = parse(utterance, opts);
      if (expect.ok === false && expect.reason === "ambiguous") {
        assert.equal(actual.ok, false);
        assert.equal(actual.reason, "ambiguous");
        assert.deepEqual([...actual.candidates].sort(), [...expect.candidates].sort());
      } else {
        assert.deepEqual(actual, expect);
      }
    });
  }
}

test("corpus has at least 200 cases across 9 categories (the DoD)", () => {
  assert.ok(totalCases >= 200, `expected >=200 corpus cases, got ${totalCases}`);
  assert.equal(corpus.length, 9, `expected 9 categories, got ${corpus.length}`);
});

// ── Open Question 7 / orchestrator decision #7: perf guard. Table-driven
// matching over a single-digit affordance list should be nowhere near
// the <1ms-per-utterance budget; assert the WHOLE corpus batch parses
// well under a fixed wall-clock budget, using performance.now() (never
// Date.now(), which the doctrine reserves for banned nondeterminism
// elsewhere in this repo — this is just a timing assertion, but the
// same discipline applies) so a future accidental-quadratic or
// regex-heavy regression gets caught here, not discovered in play. ────
test("perf guard: the whole corpus batch parses well under budget", () => {
  const BUDGET_MS = 200;
  const start = performance.now();
  for (const { cases } of corpus) {
    for (const { utterance, useAffordances } of cases) {
      parse(utterance, useAffordances ? { affordances } : undefined);
    }
  }
  const elapsed = performance.now() - start;
  assert.ok(
    elapsed < BUDGET_MS,
    `corpus batch (${totalCases} cases) took ${elapsed.toFixed(2)}ms, budget is ${BUDGET_MS}ms`,
  );
});
