/* ── KERNEL/LOG — append-only event log, hash chain, signed checkpoints.
   DELTA K3. This is the ONLY file in @golem-engine/kernel that imports
   node:crypto; it is reached exclusively via the "./log" subpath export
   so that browser consumers of the platform-neutral core (src/index.ts:
   types + replay()) never pull in a Node built-in. Kernel stays
   synchronous and pure per DELTA §0.3: every function here is a pure
   function of its inputs (no file IO, no clock reads) — persistence is
   the caller's job (see this package's tests for the pattern: write
   bytes to disk, read them back, verify). ─────────────────────────── */

import { createHash, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import type { Event } from "./index.js";

/** The prev hash stored on the very first entry of a chain: 64 hex `0`
 *  characters (the width of a sha256 hex digest), since there is no
 *  predecessor to hash. */
export const GENESIS_PREV = "0".repeat(64);

/**
 * Canonical byte form of an event, PUBLIC API: this is the exact string
 * that gets sha256'd to produce chain links and checkpoint heads.
 * Changing this function's output for any input invalidates every
 * chain/checkpoint ever stored — treat it as a versioned wire format,
 * not an implementation detail.
 *
 * Definition: `JSON.stringify` of the value with every plain object's
 * keys recursively sorted (lexicographic, by `Array.prototype.sort`'s
 * default string comparison); array element order is preserved as-is
 * (arrays are ordered data, not sorted). `undefined`, `function`, and
 * `symbol` values are rejected by throwing a `TypeError` — events are
 * plain JSON data, and silently dropping/coercing those (as bare
 * `JSON.stringify` would) would make the canonical form ambiguous.
 */
export function canonicalEvent(ev: unknown): string {
  return JSON.stringify(sortKeysDeep(ev));
}

function sortKeysDeep(value: unknown): unknown {
  if (value === undefined) {
    throw new TypeError("canonicalEvent: undefined is not a permitted value");
  }
  if (typeof value === "function") {
    throw new TypeError("canonicalEvent: function is not a permitted value");
  }
  if (typeof value === "symbol") {
    throw new TypeError("canonicalEvent: symbol is not a permitted value");
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key]);
  }
  return sorted;
}

function sha256Hex(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

/** An event once it has been appended to a chain: the original event
 *  fields plus `prev`, the sha256 hex digest of the canonical bytes of
 *  the previous stored entry (including THAT entry's own `prev` — the
 *  chaining property). The first entry's `prev` is `GENESIS_PREV`. */
export type ChainedEvent<E extends Event = Event> = E & { prev: string };

/**
 * Append `ev` to `log`, returning a NEW array (append-only, no mutation
 * of the array or any entry in it — same purity discipline as
 * `reduce()`). The returned entry is `{...ev, prev}` where `prev` is
 * sha256(canonicalEvent(lastStoredEntry)), or `GENESIS_PREV` if `log` is
 * empty.
 */
export function appendEvent<E extends Event>(
  log: readonly ChainedEvent<E>[],
  ev: E,
): ChainedEvent<E>[] {
  const prev =
    log.length === 0 ? GENESIS_PREV : sha256Hex(canonicalEvent(log[log.length - 1]));
  return [...log, { ...ev, prev }];
}

export type ChainVerifyResult = { ok: true } | { ok: false; at: number; reason: string };

function seqOrIndex(entry: unknown, index: number): number {
  if (entry !== null && typeof entry === "object" && typeof (entry as { seq?: unknown }).seq === "number") {
    return (entry as { seq: number }).seq;
  }
  return index;
}

/**
 * Recompute every link in `entries` and report the first break.
 * Never throws on tampered/malformed ENTRIES (that's the whole point —
 * a corrupted stored log is expected input); throws only when `entries`
 * itself is not an array. Returns `{ok: true}` if every entry's `prev`
 * matches sha256(canonicalEvent(previous entry)) all the way back to
 * `GENESIS_PREV`, else `{ok: false, at, reason}` where `at` is the
 * offending entry's own `seq` field if it has one, else its array
 * index.
 *
 * Note on WHERE a break is reported: corrupting an entry's OWN `prev`
 * field is caught immediately at that entry (its stored prev no longer
 * matches what the previous entry hashes to). Corrupting an entry's
 * PAYLOAD (anything other than `prev`) does not change that entry's own
 * prev-check — it changes what the NEXT entry's expected prev should
 * have been, so the break surfaces one link forward, at the successor.
 * This is the correct, non-buggy behavior of a hash chain: only the
 * link between a tampered entry and its successor can reveal payload
 * tampering; there is nothing to compare a payload against directly.
 */
export function verifyChain(entries: readonly unknown[]): ChainVerifyResult {
  if (!Array.isArray(entries)) {
    throw new TypeError("verifyChain: entries must be an array");
  }
  let expectedPrev = GENESIS_PREV;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, at: i, reason: "entry is not a plain object" };
    }
    const prev = (entry as { prev?: unknown }).prev;
    if (typeof prev !== "string") {
      return { ok: false, at: seqOrIndex(entry, i), reason: "entry.prev is missing or not a string" };
    }
    if (prev !== expectedPrev) {
      return {
        ok: false,
        at: seqOrIndex(entry, i),
        reason: `prev mismatch: expected ${expectedPrev}, got ${prev}`,
      };
    }
    let canonical: string;
    try {
      canonical = canonicalEvent(entry);
    } catch (err) {
      return {
        ok: false,
        at: seqOrIndex(entry, i),
        reason: `entry failed canonicalization: ${(err as Error).message}`,
      };
    }
    expectedPrev = sha256Hex(canonical);
  }
  return { ok: true };
}

/** A signed checkpoint over a chain's current tip. `head` is the hash
 *  the NEXT appended entry would use as its `prev` (i.e. sha256 of the
 *  last stored entry's canonical bytes), or `GENESIS_PREV` for an empty
 *  chain. `seq` is the last entry's `seq` field (or its array index if
 *  it has none), or 0 for an empty chain — a convenience for callers,
 *  not itself checked against the chain by `verifyCheckpoint` beyond
 *  being recomputed the same way on both ends. `digest` is
 *  sha256(head + String(count)); `signature` is an ed25519 signature
 *  (hex) over `digest`'s utf8 bytes.
 *
 *  IMPORTANT — a checkpoint protects only the chain's TIP (its last
 *  entry's hash and the total count), not the interior: two entries in
 *  the middle of the chain can be tampered with, or swapped, without
 *  changing `head` or `count` at all, so a checkpoint alone cannot
 *  reveal that. Pair every checkpoint check with `verifyChain(entries)`
 *  over the same entries to get interior integrity as well — checkpoint
 *  answers "has the tip been rolled back or forged since I signed it,"
 *  `verifyChain` answers "is every link intact." Neither alone is a
 *  complete integrity proof. */
export interface Checkpoint {
  seq: number;
  head: string;
  count: number;
  digest: string;
  signature: string;
}

function checkpointFields(entries: readonly unknown[]): Omit<Checkpoint, "signature"> {
  const count = entries.length;
  const head = count === 0 ? GENESIS_PREV : sha256Hex(canonicalEvent(entries[count - 1]));
  const seq = count === 0 ? 0 : seqOrIndex(entries[count - 1], count - 1);
  const digest = sha256Hex(head + String(count));
  return { seq, head, count, digest };
}

/**
 * Produce a signed checkpoint over `entries`' current tip. `privateKey`
 * must be an ed25519 `KeyObject` (see `makeDevKeypair`). Signing uses
 * `node:crypto`'s `sign(null, ...)` form (algorithm is implied by an
 * ed25519 key — Node requires `null` here, not `"sha256"` or similar).
 */
export function checkpoint(entries: readonly unknown[], privateKey: KeyObject): Checkpoint {
  if (!Array.isArray(entries)) {
    throw new TypeError("checkpoint: entries must be an array");
  }
  const fields = checkpointFields(entries);
  const signature = sign(null, Buffer.from(fields.digest, "utf8"), privateKey).toString("hex");
  return { ...fields, signature };
}

/**
 * Recompute `entries`' checkpoint fields and verify both that they
 * match `cp` and that `cp.signature` is a valid ed25519 signature over
 * `cp.digest` under `publicKey`. Returns a plain boolean — never throws
 * on tampered/mismatched input, only on malformed `entries`/`cp` shape.
 *
 * SCOPE: `head`/`count` are derived ONLY from the last entry and the
 * array length, so this only catches tampering that changes the
 * chain's TIP or its length — truncation, appending a rogue entry, or
 * editing/swapping the last entry — plus any direct edit of `cp` itself
 * or a wrong `publicKey`. It does NOT, by itself, detect tampering
 * confined to the chain's interior: editing a non-last entry leaves
 * `head` and `count` completely unchanged, so this function has
 * nothing to disagree with. Call `verifyChain(entries)` on the same
 * entries for interior integrity; use both together for a complete
 * check, as this package's cross-process restart test does.
 */
export function verifyCheckpoint(
  cp: Checkpoint,
  entries: readonly unknown[],
  publicKey: KeyObject,
): boolean {
  if (!Array.isArray(entries)) {
    throw new TypeError("verifyCheckpoint: entries must be an array");
  }
  if (cp === null || typeof cp !== "object") {
    throw new TypeError("verifyCheckpoint: checkpoint must be an object");
  }
  const recomputed = checkpointFields(entries);
  if (
    recomputed.seq !== cp.seq ||
    recomputed.head !== cp.head ||
    recomputed.count !== cp.count ||
    recomputed.digest !== cp.digest
  ) {
    return false;
  }
  if (typeof cp.signature !== "string" || !/^[0-9a-f]+$/i.test(cp.signature) || cp.signature.length % 2 !== 0) {
    return false;
  }
  return verify(null, Buffer.from(cp.digest, "utf8"), publicKey, Buffer.from(cp.signature, "hex"));
}

/**
 * dev key — key management out of scope (DELTA K3). Generates a fresh
 * ed25519 keypair (`KeyObject`s) for tests/dev use. No production key
 * management (rotation, storage, distribution, revocation) is provided
 * or implied; no key material is ever committed to this repo.
 */
export function makeDevKeypair(): { publicKey: KeyObject; privateKey: KeyObject } {
  return generateKeyPairSync("ed25519");
}
