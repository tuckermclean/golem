#!/usr/bin/env node
/* K6 — validates every committed event against packages/kernel/schemas/
   events.v1.json:
     (a) every packages/testkit/fixtures/golem/*.log.json event
     (b) every games/golem-grid/tests/golden/replay-log.json event
   Exits non-zero with per-file/per-seq errors on any failure. This is the
   runnable check the `event-schema` CI job calls.

   ajv is configured in its default (code-generation) mode — the standard,
   documented mode ajv ships with; it is NOT `$data`-schema mode and does
   not compile user-supplied schemas at runtime. The single schema loaded
   here is repo-controlled (packages/kernel/schemas/events.v1.json), never
   read from network/user input. See DELTA.md §0.3's eval/exec ban and the
   K6 brief's ajv rationale for why this is the accepted shape (dev/CI-time
   validator dependency, never shipped in a package runtime).

   Optional first CLI arg: an alternate fixtures/golem/ directory to
   validate (defaults to the committed packages/testkit/fixtures/golem/),
   mirroring verify-golem-fixtures.mjs's convention. */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
// ajv's default export only ships the draft-07 meta-schema; events.v1.json
// is draft 2020-12 (K6 brief controller decision #2), so the dedicated
// 2020 build is required to recognize its $schema.
import Ajv2020 from "ajv/dist/2020.js";

const SCHEMA_URL = new URL("../../kernel/schemas/events.v1.json", import.meta.url);

const dirArg = process.argv[2];
const FIXTURES_DIR = dirArg
  ? pathToFileURL(path.resolve(dirArg) + path.sep)
  : new URL("../fixtures/golem/", import.meta.url);
const GOLDEN_URL = new URL(
  "../../../games/golem-grid/tests/golden/replay-log.json",
  import.meta.url,
);

function loadSchema() {
  return JSON.parse(readFileSync(SCHEMA_URL, "utf8"));
}

function listLogFiles() {
  const dirPath = new URL(FIXTURES_DIR);
  let names;
  try {
    names = readdirSync(dirPath);
  } catch (err) {
    console.error(`validate-events: could not read fixtures dir (${err.code || err.message})`);
    process.exit(1);
  }
  return names
    .filter((n) => n.endsWith(".log.json"))
    .sort()
    .map((n) => new URL(n, dirPath));
}

function validateFile(validateFn, fileUrl, label) {
  const events = JSON.parse(readFileSync(fileUrl, "utf8"));
  if (!Array.isArray(events)) {
    return { label, count: 0, errors: [{ seq: null, message: "file is not an array of events" }] };
  }
  const errors = [];
  for (const ev of events) {
    if (!validateFn(ev)) {
      errors.push({
        seq: ev && typeof ev === "object" ? ev.seq : null,
        t: ev && typeof ev === "object" ? ev.t : undefined,
        message: (validateFn.errors || [])
          .map((e) => `${e.instancePath || "(root)"} ${e.message}`)
          .join("; "),
      });
    }
  }
  return { label, count: events.length, errors };
}

const schema = loadSchema();
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateEvent = ajv.compile(schema);

const files = [
  ...listLogFiles().map((u) => ({ url: u, label: path.basename(u.pathname) })),
  { url: GOLDEN_URL, label: "games/golem-grid/tests/golden/replay-log.json" },
];

let totalEvents = 0;
let totalErrors = 0;
for (const { url, label } of files) {
  const result = validateFile(validateEvent, url, label);
  totalEvents += result.count;
  if (result.errors.length === 0) {
    console.log(`PASS ${label} (${result.count} events)`);
  } else {
    totalErrors += result.errors.length;
    console.log(`FAIL ${label} (${result.errors.length}/${result.count} events invalid)`);
    for (const e of result.errors) {
      console.log(`  seq=${e.seq} t=${e.t}: ${e.message}`);
    }
  }
}

console.log(`\n${totalEvents} events validated across ${files.length} files, ${totalErrors} errors.`);
process.exit(totalErrors === 0 ? 0 : 1);
