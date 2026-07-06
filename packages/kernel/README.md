# @golem-engine/kernel

Commands, events, the pure reducer, observation, and affordances — the deterministic core every game runs on.

K2 scope: types (`Event`, `Command`, `Denial`, `ValidateResult`, `isDenial`,
`GameModule`, `KernelCore`) and the pure `replay(core, world, log,
initialState)` fold. No game logic lives here — that's what `KernelCore`
implementations (e.g. `games/golem-grid/shared/module.js`) are for.

`dist/` is built by this package's `prepare` script (`tsc -p .`), which
root `npm ci`/`npm install` runs automatically. If `dist/` is missing
after a manual wipe, re-run `npm ci` (or `npm install`) at the repo
root rather than calling `tsc` by hand.

K3 scope: an append-only event log with a sha256 hash chain and
ed25519-signed checkpoints, reached via the `"./log"` subpath export
(`@golem-engine/kernel/log`, built by the same `prepare` script's
`tsc -p tsconfig.log.json`) — the only entry point in this package that
imports `node:crypto`; `.` (this package's main export) stays
platform-neutral. See `src/log.ts` for `canonicalEvent`,
`appendEvent`/`verifyChain`, and `checkpoint`/`verifyCheckpoint`.
