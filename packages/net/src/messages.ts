/* ── Wire protocol: exactly five message kinds (CLAUDE.md doctrine —
 * "Keep the wire protocol at five message kinds"). Field shapes are
 * copied verbatim from the live usage in games/golem-grid/src/main.js
 * (pre-K4): no fields added, none dropped.
 *
 *   HELLO    {k,pid,name}          joiner -> host, "I exist, who's home?"
 *   SNAPSHOT {k,to,seed,log}       host -> one joiner, full replay state
 *   CMD      {k,from,cmd}          peer -> host, "please validate this"
 *   EVENT    {k,ev}                host -> all, "this happened, for real"
 *   DENY     {k,to,reason}         host -> one, "that didn't happen"
 *
 * `ev`, `cmd`, and `log` are intentionally typed as unknown/string here:
 * this package is the wire, not the game. It never inspects payload
 * shape — that's @golem-engine/kernel's + each game's module's job. */

export interface Hello {
  k: "HELLO";
  pid: string;
  name: string;
}

export interface Snapshot {
  k: "SNAPSHOT";
  to: string;
  seed: string;
  log: readonly unknown[];
}

export interface Cmd {
  k: "CMD";
  from: string;
  cmd: string;
}

export interface EventMsg {
  k: "EVENT";
  ev: unknown;
}

export interface Deny {
  k: "DENY";
  to: string;
  reason: string;
}

export type Message = Hello | Snapshot | Cmd | EventMsg | Deny;
export type MessageKind = Message["k"];

const KINDS: ReadonlySet<string> = new Set<MessageKind>([
  "HELLO",
  "SNAPSHOT",
  "CMD",
  "EVENT",
  "DENY",
]);

export function isMessage(x: unknown): x is Message {
  if (!x || typeof x !== "object") return false;
  const k = (x as { k?: unknown }).k;
  return typeof k === "string" && KINDS.has(k);
}

export function isHello(m: Message): m is Hello {
  return m.k === "HELLO";
}
export function isSnapshot(m: Message): m is Snapshot {
  return m.k === "SNAPSHOT";
}
export function isCmd(m: Message): m is Cmd {
  return m.k === "CMD";
}
export function isEvent(m: Message): m is EventMsg {
  return m.k === "EVENT";
}
export function isDeny(m: Message): m is Deny {
  return m.k === "DENY";
}
