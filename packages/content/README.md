# @golem-engine/content

Content-pack schema, safe conditions, compiler, and hashing — YAML/JSON in, an immutable runtime pack out.

C1 scope: `compile(source)` takes an already-parsed JS value (no file/
YAML IO in this package) and returns `{ ok: true, pack }` or `{ ok:
false, errors }`. The pipeline is schema validation (`schemas/
pack.v1.json`, ajv, draft 2020-12) → condition hydration → reference
resolution → freeze → sha256 hash. `evaluate(node, factLookup)` is the
safe condition-language interpreter (`all`/`any`/`not`/`fact`/`cmp`
only — no eval, no `new Function`, no `node:vm`; see `tests/
no-dynamic-code.test.js` and the repo-wide `tools/check-bans.mjs`).
Standalone: no dependency on `@golem-engine/kernel` or any game code.

`dist/` is built by this package's `prepare` script (`tsc -p .`), which
root `npm ci`/`npm install` runs automatically. If `dist/` is missing
after a manual wipe, re-run `npm ci` (or `npm install`) at the repo
root rather than calling `tsc` by hand.
