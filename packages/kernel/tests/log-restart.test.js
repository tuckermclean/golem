/* Cross-process restart test (DELTA K3 DoD): checkpoint verification
 * must survive a fresh process, not just survive within the process
 * that produced it. Writes {entries, checkpoint, publicKeyPem} to a
 * scratch file under os.tmpdir(), then runs the committed
 * ./log-restart-child.mjs in a brand-new `node` process
 * (child_process.spawnSync — never imported directly) that loads the
 * file fresh and exits 0 iff chain + checkpoint verify, else non-zero.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { appendEvent, checkpoint, makeDevKeypair } from "@golem-engine/kernel/log";

const CHILD_SCRIPT = new URL("./log-restart-child.mjs", import.meta.url);

function buildStore() {
  const events = [
    { seq: 1, t: "JOIN", pid: "p1" },
    { seq: 2, t: "MOVE", pid: "p1", x: 5, y: 6 },
    { seq: 3, t: "MOVE", pid: "p1", x: 6, y: 6 },
  ];
  let entries = [];
  for (const ev of events) entries = appendEvent(entries, ev);

  const { publicKey, privateKey } = makeDevKeypair();
  const cp = checkpoint(entries, privateKey);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });

  return { entries, checkpoint: cp, publicKeyPem };
}

function runChild(storePath) {
  return spawnSync(process.execPath, [CHILD_SCRIPT.pathname, storePath], { encoding: "utf8" });
}

test("cross-process restart: fresh child process verifies a freshly-written store (exit 0)", () => {
  const dir = mkdtempSync(join(tmpdir(), "golem-kernel-log-"));
  try {
    const storePath = join(dir, "store.json");
    writeFileSync(storePath, JSON.stringify(buildStore()), "utf8");

    const result = runChild(storePath);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cross-process restart: flipping a byte in the stored file makes the fresh child exit non-zero", () => {
  const dir = mkdtempSync(join(tmpdir(), "golem-kernel-log-"));
  try {
    const storePath = join(dir, "store.json");
    const bytes = JSON.stringify(buildStore());

    // Flip one byte inside the middle event's payload — a stand-in for
    // "the stored log got corrupted on disk" (bit rot, a bad edit, a
    // deliberate attack). XOR-1 on a digit stays valid JSON (see
    // log.test.js's flipByteAt doc comment for why this is safe here).
    const marker = '"x":5,"y":6';
    const at = bytes.indexOf(marker);
    assert.ok(at >= 0, "test setup: expected marker not found in serialized store");
    const buf = Buffer.from(bytes, "utf8");
    buf[at + 4] = buf[at + 4] ^ 1; // the digit of "x":5
    writeFileSync(storePath, buf.toString("utf8"), "utf8");

    // Confirm the tamper actually changed the payload (test-setup sanity).
    const tampered = JSON.parse(readFileSync(storePath, "utf8"));
    assert.notEqual(tampered.entries[1].x, 5, "test setup: byte flip must actually change the stored payload");

    const result = runChild(storePath);
    assert.notEqual(result.status, 0, `expected non-zero exit for a tampered store, got ${result.status}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
