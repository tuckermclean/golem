/* Runtime unit tests for @golem-engine/kernel's "./log" subpath (DELTA
 * K3): canonicalEvent, appendEvent/verifyChain, and checkpoint/
 * verifyCheckpoint. Deliberately generic (a toy 3-event sequence), NOT
 * golem-grid — the fixture pass-through conformance test lives in
 * packages/testkit/tests/log-chain.test.js. Cross-process checkpoint
 * verification (fresh load, tampered-store non-zero exit) lives in
 * ./log-restart.test.js + the committed child script
 * ./log-restart-child.mjs. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  GENESIS_PREV,
  appendEvent,
  canonicalEvent,
  checkpoint,
  makeDevKeypair,
  verifyChain,
  verifyCheckpoint,
} from "@golem-engine/kernel/log";

function buildLog() {
  const events = [
    { seq: 1, t: "JOIN", pid: "p1" },
    { seq: 2, t: "MOVE", pid: "p1", x: 3, y: 4 },
    { seq: 3, t: "MOVE", pid: "p1", x: 4, y: 4 },
  ];
  let log = [];
  for (const ev of events) log = appendEvent(log, ev);
  return log;
}

/** True byte-level flip (not a JSON object mutation) — proves the
 * tamper test operates on stored/serialized bytes, per the brief. XOR
 * with 1 on an ASCII digit/hex-letter/quote-adjacent byte always yields
 * a different-but-still-valid single JSON character in this codebase's
 * usage (never turns into `"` 0x22 or `\` 0x5C for the byte classes we
 * flip in these tests), so `JSON.parse` still succeeds. */
function flipByteAt(str, index) {
  const buf = Buffer.from(str, "utf8");
  buf[index] = buf[index] ^ 1;
  return buf.toString("utf8");
}

// ── canonicalEvent ─────────────────────────────────────────────────

test("canonicalEvent: key order does not affect output (recursively sorted)", () => {
  const a = canonicalEvent({ seq: 1, t: "MOVE", x: 3, y: 4 });
  const b = canonicalEvent({ y: 4, x: 3, t: "MOVE", seq: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"seq":1,"t":"MOVE","x":3,"y":4}');
});

test("canonicalEvent: nested objects are sorted at every level", () => {
  const a = canonicalEvent({ b: 1, a: { d: 2, c: 1 } });
  const b = canonicalEvent({ a: { c: 1, d: 2 }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"c":1,"d":2},"b":1}');
});

test("canonicalEvent: array element order is preserved, not sorted", () => {
  assert.equal(canonicalEvent({ list: [3, 1, 2] }), '{"list":[3,1,2]}');
});

test("canonicalEvent: throws on undefined (top-level and nested)", () => {
  assert.throws(() => canonicalEvent(undefined), TypeError);
  assert.throws(() => canonicalEvent({ a: undefined }), TypeError);
  assert.throws(() => canonicalEvent({ a: [1, undefined] }), TypeError);
});

test("canonicalEvent: throws on function and symbol values", () => {
  assert.throws(() => canonicalEvent({ a: () => {} }), TypeError);
  assert.throws(() => canonicalEvent({ a: Symbol("x") }), TypeError);
});

test("canonicalEvent: throws on NaN, +Infinity, -Infinity (top-level and nested)", () => {
  assert.throws(() => canonicalEvent(NaN), TypeError);
  assert.throws(() => canonicalEvent(Infinity), TypeError);
  assert.throws(() => canonicalEvent(-Infinity), TypeError);
  assert.throws(() => canonicalEvent({ a: NaN }), TypeError);
  assert.throws(() => canonicalEvent({ a: Infinity }), TypeError);
  assert.throws(() => canonicalEvent({ a: -Infinity }), TypeError);
  assert.throws(() => canonicalEvent({ a: [1, NaN] }), TypeError);
});

test("canonicalEvent: an own __proto__ field is preserved and changes the hash (injectivity)", () => {
  // A `{__proto__: x}` OBJECT LITERAL is spec-special-cased (it sets the
  // prototype, producing no own "__proto__" property) and would NOT
  // reproduce the bug this guards against. JSON.parse, by contrast, uses
  // CreateDataProperty and genuinely creates an own enumerable
  // "__proto__" data property — that's the shape that broke the naive
  // {}-literal + assignment implementation.
  const withProto = JSON.parse('{"seq":1,"t":"MOVE","__proto__":"evil"}');
  const withoutProto = JSON.parse('{"seq":1,"t":"MOVE"}');

  assert.deepEqual(Object.keys(withProto).sort(), ["__proto__", "seq", "t"]);

  const a = canonicalEvent(withProto);
  const b = canonicalEvent(withoutProto);
  assert.notEqual(a, b, "an event with an own __proto__ field must hash differently from one without it");
  assert.equal(a, '{"__proto__":"evil","seq":1,"t":"MOVE"}');
});

// ── chain: append / verify / determinism ──────────────────────────

test("appendEvent: genesis entry's prev is 64 zero characters", () => {
  const log = buildLog();
  assert.equal(log[0].prev, GENESIS_PREV);
  assert.equal(GENESIS_PREV, "0".repeat(64));
});

test("appendEvent: does not mutate its input array", () => {
  const log = [];
  const next = appendEvent(log, { seq: 1, t: "JOIN", pid: "p1" });
  assert.equal(log.length, 0, "appendEvent must not mutate the array it was handed");
  assert.equal(next.length, 1);
});

test("appendEvent -> verifyChain: a freshly built chain verifies ok", () => {
  assert.deepEqual(verifyChain(buildLog()), { ok: true });
});

test("appendEvent: prev hashes are deterministic exact hex literals for a fixed sequence (pinned)", () => {
  // Pinned against this package's canonical-bytes definition. A change
  // to these literals means canonicalEvent's output changed — which
  // DELTA K3 says invalidates every stored chain; that's a breaking
  // change to call out explicitly, not silently update.
  const log = buildLog();
  assert.equal(log[0].prev, "0".repeat(64));
  assert.equal(log[1].prev, "651ebde1acda8843a6ad33f5678a62e1a3a6e9938a189aae0a556fc9e4c79a0d");
  assert.equal(log[2].prev, "d90c9167ae8a1a15eeb301c763e72a442823901e9d871cb49df5a5f689323bcd");
});

test("appendEvent: building the same log twice yields byte-identical prev hashes", () => {
  assert.deepEqual(buildLog(), buildLog());
});

// ── chain: tamper detection ────────────────────────────────────────

test("TAMPER (end): flipping a byte inside the LAST entry's own prev is caught at that entry", () => {
  const log = buildLog();
  const bytes = JSON.stringify(log);
  const lastPrev = log[log.length - 1].prev;
  const at = bytes.indexOf(lastPrev);
  assert.ok(at >= 0, "test setup: last entry's prev hex must appear verbatim in the serialized bytes");

  const tamperedBytes = flipByteAt(bytes, at + 10);
  const tampered = JSON.parse(tamperedBytes); // must still be valid JSON (see flipByteAt's doc comment)

  const result = verifyChain(tampered);
  assert.equal(result.ok, false);
  assert.equal(result.at, log[log.length - 1].seq);
});

test("TAMPER (middle): flipping a byte in a middle event's payload is caught at the NEXT link, not the tampered entry itself", () => {
  // This is the correct (non-buggy) hash-chain behavior, documented on
  // verifyChain: an entry's own prev-check only validates against its
  // PREDECESSOR, so corrupting entry i's payload (not its prev field)
  // is invisible until entry i+1's prev-check runs against the
  // (now-different) recomputed hash of entry i.
  const log = buildLog();
  const bytes = JSON.stringify(log);
  const marker = `"x":${log[1].x},"y":${log[1].y}`; // unique to entry index 1 (seq 2)
  const at = bytes.indexOf(marker);
  assert.ok(at >= 0, "test setup: middle entry's x/y payload must appear verbatim in the serialized bytes");

  const tamperedBytes = flipByteAt(bytes, at + 4); // the digit of "x":3
  const tampered = JSON.parse(tamperedBytes);
  assert.notEqual(tampered[1].x, log[1].x, "test setup: the byte flip must actually change entry[1]'s payload");

  const result = verifyChain(tampered);
  assert.equal(result.ok, false);
  assert.equal(result.at, log[2].seq, "detection surfaces at the successor entry (seq 3), not the tampered entry (seq 2)");
});

test("verifyChain: throws on non-array input, never on tampered array content", () => {
  assert.throws(() => verifyChain("not an array"), TypeError);
  assert.throws(() => verifyChain(null), TypeError);
  assert.doesNotThrow(() => verifyChain([{ prev: "nonsense" }]));
});

// ── checkpoint ─────────────────────────────────────────────────────

test("checkpoint/verifyCheckpoint: sign then verify round-trips true", () => {
  const log = buildLog();
  const { publicKey, privateKey } = makeDevKeypair();
  const cp = checkpoint(log, privateKey);
  assert.equal(cp.count, 3);
  assert.equal(cp.seq, 3);
  assert.equal(verifyCheckpoint(cp, log, publicKey), true);
});

test("checkpoint: empty log checkpoints against GENESIS_PREV", () => {
  const { publicKey, privateKey } = makeDevKeypair();
  const cp = checkpoint([], privateKey);
  assert.equal(cp.head, GENESIS_PREV);
  assert.equal(cp.count, 0);
  assert.equal(cp.seq, 0);
  assert.equal(verifyCheckpoint(cp, [], publicKey), true);
});

test("verifyCheckpoint: rejects a checkpoint verified against the WRONG public key", () => {
  const log = buildLog();
  const signer = makeDevKeypair();
  const impostor = makeDevKeypair();
  const cp = checkpoint(log, signer.privateKey);
  assert.equal(verifyCheckpoint(cp, log, impostor.publicKey), false);
});

test("verifyCheckpoint: rejects a checkpoint whose digest was tampered", () => {
  const log = buildLog();
  const { publicKey, privateKey } = makeDevKeypair();
  const cp = checkpoint(log, privateKey);
  const tampered = { ...cp, digest: cp.digest.slice(0, -1) + (cp.digest.at(-1) === "0" ? "1" : "0") };
  assert.equal(verifyCheckpoint(tampered, log, publicKey), false);
});

test("verifyCheckpoint: rejects when the TIP entry no longer matches the checkpoint (log tampered after signing)", () => {
  // `head` is the hash of the LAST entry only, so this is checkpoint's
  // actual protection boundary: it guards the tip, not the interior.
  // Interior tampering (see the chain TAMPER tests above) is
  // verifyChain's job, not checkpoint's — a real caller checks both.
  const log = buildLog();
  const { publicKey, privateKey } = makeDevKeypair();
  const cp = checkpoint(log, privateKey);
  const tamperedLog = log.map((e, i) => (i === log.length - 1 ? { ...e, x: e.x + 1 } : e));
  assert.equal(verifyCheckpoint(cp, tamperedLog, publicKey), false);
});

test("verifyCheckpoint: does NOT by itself detect interior tampering that leaves the tip entry unchanged — that is verifyChain's job", () => {
  // Documents the boundary above from the other side: interior-only
  // tampering changes neither the last entry's bytes nor the count, so
  // head/digest/signature all still check out under verifyCheckpoint
  // alone. A caller that wants full protection must run verifyChain
  // over the same entries too (see this package's TAMPER tests, and
  // the cross-process restart test which checks both).
  const log = buildLog();
  const { publicKey, privateKey } = makeDevKeypair();
  const cp = checkpoint(log, privateKey);
  const interiorTamperedLog = log.map((e, i) => (i === 1 ? { ...e, x: e.x + 1 } : e));
  assert.equal(verifyCheckpoint(cp, interiorTamperedLog, publicKey), true);
  assert.equal(verifyChain(interiorTamperedLog).ok, false, "verifyChain must still catch what verifyCheckpoint alone cannot");
});
