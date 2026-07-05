/* ── Transport: layered BroadcastChannel + storage-event bridge, behind
 * a `{ok,label,send,onmsg}` interface (CLAUDE.md — "transports are
 * swappable behind send/onmsg"). Ported from games/golem-grid/src/
 * main.js's inline NET IIFE during K4; see that file's git history for
 * the pre-extraction version this is byte-behavior-compatible with.
 *
 * Layering, exactly as main.js had it:
 *   - createBroadcastTransport: a single BroadcastChannel. ok when the
 *     constructor + onmessage wiring succeed.
 *   - createStorageTransport: the storage-event bridge (CLAUDE.md's
 *     sanctioned net shim — NOT game-state storage). ok when a
 *     set/remove probe succeeds and the "storage" listener attaches.
 *   - createAutoTransport: composes both. `ok` and `label` mirror
 *     main.js's NET exactly:
 *       both      -> "BroadcastChannel + storage bridge"
 *       bc only   -> "BroadcastChannel"
 *       ls only   -> "storage bridge"
 *       neither   -> "none (solo)"
 *     Every outgoing message is stamped with one `_id` shared across
 *     both wires (the SAME message, sent twice) — dedup on receipt
 *     (see ./dedup.ts) drops the duplicate delivery. This is the only
 *     place double-delivery can happen: a lone broadcast or storage
 *     transport never delivers a message to itself twice. */
import { makeDeduper } from "./dedup.js";
import type { Message } from "./messages.js";

export interface Transport {
  readonly ok: boolean;
  readonly label: string;
  send(msg: Message): void;
  onmsg(handler: (msg: Message) => void): void;
}

/* Injectable environment, for testability ONLY (fakes in unit tests) —
 * every field defaults to the matching globalThis piece. No other
 * configurability (YAGNI): channel name / storage key are the only
 * other parameters, and those are protocol topic identity, not test
 * seams. (main.js never unsubscribes its storage listener, so there's
 * no removeEventListener to inject a fake for — only add.) */
export interface NetEnv {
  BroadcastChannel?: typeof BroadcastChannel;
  storage?: Storage;
  addEventListener?: typeof globalThis.addEventListener;
}

function ambientBroadcastChannel(): typeof BroadcastChannel | undefined {
  return typeof globalThis !== "undefined"
    ? (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel
    : undefined;
}
function ambientStorage(): Storage | undefined {
  return typeof globalThis !== "undefined"
    ? (globalThis as { localStorage?: Storage }).localStorage
    : undefined;
}
function ambientAddEventListener(): typeof globalThis.addEventListener | undefined {
  return typeof globalThis !== "undefined" ? globalThis.addEventListener : undefined;
}

/* Resolution uses `key in env`, not `env[key] ?? ambient()`: both real
 * browsers and modern Node ship ambient BroadcastChannel/localStorage
 * globals, so a test that wants to force "unavailable" needs to be able
 * to say so explicitly (env.BroadcastChannel = undefined) without that
 * looking identical to "field omitted, use the ambient default". Own-
 * property presence is the only way to tell those two apart. */
function resolveEnvField<K extends keyof NetEnv>(
  env: NetEnv,
  key: K,
  ambient: () => NetEnv[K],
): NetEnv[K] {
  return key in env ? env[key] : ambient();
}

/* main.js's message-id nonce previously drew on a banned pseudo-random
 * call (tools/check-bans.mjs forbids it under packages/**\/src — DELTA.md
 * §0.3). It doesn't need to be seeded or reproducible (it's a dedup
 * nonce, not world state), so Web Crypto's getRandomValues — standard
 * in both browsers and modern Node, no node: import required — replaces
 * it; the wire format is unaffected (still an opaque string on `_id`). */
function randomSuffix(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return (buf[0] as number).toString(36);
  }
  return "0"; // last-resort fallback; Date.now() + counter still keep ids unique
}
let idCounter = 0;
function nextId(): string {
  return `${Date.now()}-${idCounter++}-${randomSuffix()}`;
}

export function createBroadcastTransport(name: string, env: NetEnv = {}): Transport {
  const BC = resolveEnvField(env, "BroadcastChannel", ambientBroadcastChannel);
  let handler: (msg: Message) => void = () => {};
  let bc: BroadcastChannel | null = null;
  try {
    if (BC) {
      bc = new BC(name);
      bc.onmessage = (e: MessageEvent) => handler(e.data as Message);
    }
  } catch {
    bc = null;
  }
  return {
    ok: !!bc,
    label: bc ? "BroadcastChannel" : "none",
    send(msg) {
      if (bc) bc.postMessage(msg);
    },
    onmsg(fn) {
      handler = fn;
    },
  };
}

const STORAGE_PROBE_KEY = "gg-probe";

export function createStorageTransport(key: string, env: NetEnv = {}): Transport {
  const storage = resolveEnvField(env, "storage", ambientStorage);
  const addEventListener = resolveEnvField(env, "addEventListener", ambientAddEventListener);
  let handler: (msg: Message) => void = () => {};
  let ok = false;
  try {
    if (storage && addEventListener) {
      storage.setItem(STORAGE_PROBE_KEY, "1");
      storage.removeItem(STORAGE_PROBE_KEY);
      ok = true;
      addEventListener("storage", ((e: StorageEvent) => {
        if (e.key === key && e.newValue) {
          try {
            handler(JSON.parse(e.newValue) as Message);
          } catch {
            /* malformed payload — ignore, matches main.js's old swallow */
          }
        }
      }) as EventListener);
    }
  } catch {
    ok = false;
  }
  return {
    ok,
    label: ok ? "storage bridge" : "none",
    send(msg) {
      if (!ok || !storage) return;
      try {
        storage.setItem(key, JSON.stringify(msg));
      } catch {
        /* quota / disabled storage — ignore, matches main.js's old swallow */
      }
    },
    onmsg(fn) {
      handler = fn;
    },
  };
}

export function createAutoTransport(
  channelName: string,
  storageKey: string,
  env: NetEnv = {},
): Transport {
  const bcT = createBroadcastTransport(channelName, env);
  const stT = createStorageTransport(storageKey, env);
  const fresh = makeDeduper();
  let handler: (msg: Message) => void = () => {};
  function deliver(m: unknown) {
    const wire = m as (Message & { _id?: string }) | null | undefined;
    if (!wire || !fresh(wire._id)) return;
    handler(wire);
  }
  bcT.onmsg(deliver);
  stT.onmsg(deliver);

  const label = bcT.ok && stT.ok
    ? "BroadcastChannel + storage bridge"
    : bcT.ok
      ? "BroadcastChannel"
      : stT.ok
        ? "storage bridge"
        : "none (solo)";

  return {
    ok: bcT.ok || stT.ok,
    label,
    send(msg) {
      const wire = msg as Message & { _id?: string };
      wire._id = nextId();
      if (bcT.ok) bcT.send(wire);
      if (stT.ok) stT.send(wire);
    },
    onmsg(fn) {
      handler = fn;
    },
  };
}
