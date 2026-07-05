#!/usr/bin/env node
/* Committed helper for packages/kernel/tests/log-restart.test.js
 * (DELTA K3 cross-process restart DoD). Run as a FRESH node process
 * (never imported by the parent test) so there is no shared module
 * state between "write" and "verify" — this is the only way to prove
 * checkpoint verification actually survives a process restart rather
 * than merely surviving within one node process's module cache.
 *
 * Usage: node log-restart-child.mjs <path-to-store.json>
 * The store file is {entries, checkpoint, publicKeyPem} (see the
 * parent test for how it's written). Exits 0 iff BOTH verifyChain(entries)
 * and verifyCheckpoint(checkpoint, entries, publicKey) succeed; exits 1
 * otherwise (malformed JSON, chain break, or signature/digest mismatch).
 */
import { readFileSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { verifyChain, verifyCheckpoint } from "@golem-engine/kernel/log";

const storePath = process.argv[2];
if (!storePath) {
  console.error("usage: log-restart-child.mjs <path-to-store.json>");
  process.exit(1);
}

let store;
try {
  const bytes = readFileSync(storePath, "utf8");
  store = JSON.parse(bytes);
} catch (err) {
  console.error(`log-restart-child: failed to read/parse store: ${err.message}`);
  process.exit(1);
}

try {
  const publicKey = createPublicKey(store.publicKeyPem);

  const chainResult = verifyChain(store.entries);
  if (!chainResult.ok) {
    console.error(`log-restart-child: chain verification failed at ${chainResult.at}: ${chainResult.reason}`);
    process.exit(1);
  }

  const cpOk = verifyCheckpoint(store.checkpoint, store.entries, publicKey);
  if (!cpOk) {
    console.error("log-restart-child: checkpoint verification failed");
    process.exit(1);
  }
} catch (err) {
  console.error(`log-restart-child: verification threw: ${err.message}`);
  process.exit(1);
}

console.log("log-restart-child: chain + checkpoint verify ok");
process.exit(0);
