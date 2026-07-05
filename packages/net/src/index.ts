/* ── @golem-engine/net — the five-message wire protocol (HELLO/SNAPSHOT/
 * CMD/EVENT/DENY) and its layered BroadcastChannel + storage-event
 * transports (K4). Extracted from games/golem-grid/src/main.js's inline
 * NET section; see that file's git history pre-K4 for the byte-behavior
 * this package now owns. Browser-safe: no node: imports anywhere here. */
export type {
  Hello,
  Snapshot,
  Cmd,
  EventMsg,
  Deny,
  Message,
  MessageKind,
} from "./messages.js";
export { isMessage, isHello, isSnapshot, isCmd, isEvent, isDeny } from "./messages.js";

export { makeDeduper } from "./dedup.js";

export type { Transport, NetEnv } from "./transports.js";
export {
  createBroadcastTransport,
  createStorageTransport,
  createAutoTransport,
} from "./transports.js";
