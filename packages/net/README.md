# @golem-engine/net

The five-message protocol (HELLO/SNAPSHOT/CMD/EVENT/DENY) and its transports.

K4 scope: the `Message` discriminated union + per-kind type guards, the
`Transport {ok,label,send,onmsg}` interface, `createBroadcastTransport`/
`createStorageTransport`/`createAutoTransport` (BroadcastChannel, the
storage-event bridge, and the layering between them — auto picks
BroadcastChannel, then storage, then `ok:false`), and `makeDeduper`
(double-delivery across both wires must not double-apply). Browser-safe:
no `node:` imports anywhere in `src/`. Environment (BroadcastChannel
ctor, storage object, `addEventListener`) is injectable for tests only —
see `NetEnv`.

`dist/` is built by this package's `prepare` script (`tsc -p .`), which
root `npm ci`/`npm install` runs automatically. If `dist/` is missing
after a manual wipe, re-run `npm ci` (or `npm install`) at the repo
root rather than calling `tsc` by hand.
