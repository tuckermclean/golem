# reference/golem-grid.html — provenance

This file is the ORIGINAL hand-written, pre-Vite v0.2 prototype of
golem-grid: a single committed HTML file with inline `<style>`/`<script>`,
runnable directly from `file://`. It predates the shared-module
extraction and the Vite build; the `main.js`/`src/` split that followed
(K5) never touches it.

It is preserved here **byte-verbatim** as a golden fixture and demo —
never edited. `games/golem-grid/tests/reference.test.js` pins its
sha256; a hash mismatch means someone edited the fixture and the test
must fail, not be "fixed" by re-hashing.

## History

- `45bb7ba` "Repo-ify: import v0.2 prototype + pipeline scaffold as-is"
  (2026-07-03) — `golem-grid.html` first committed at the repo root.
- `deb0006` "feat: 10K-seed winnability + difficulty-band gate (make
  solve)" (2026-07-04 18:57:45 -0700) — last commit before the rename;
  this is the SHA the file was extracted from.
- `394391a` "feat: port page to Vite app over shared modules; single-file
  build replaces committed prototype" (2026-07-04 19:08:09 -0700) —
  `git show --stat` reports `golem-grid.html => src/main.js`: the
  rename/rewrite commit. Its PARENT (`deb0006`) is the last commit
  holding the original file untouched by the Vite port.

## Extraction command trail

```
git log --follow --oneline -- games/golem-grid/src/main.js
# ... 394391a feat: port page to Vite app over shared modules; ...
git show --stat 394391a | head
#  golem-grid.html => src/main.js | 307 +++++------------------------------------
git rev-parse 394391a^
# deb00060167a069a8c426b7940d860aedf680cb2
git show 394391a^:golem-grid.html > games/golem-grid/reference/golem-grid.html
sha256sum games/golem-grid/reference/golem-grid.html
# 3606eec246165846576d4ca4cae2fe057a3be323cb14714c10bc689a6ad3f16b  games/golem-grid/reference/golem-grid.html
git cat-file -p 394391a^:golem-grid.html | sha256sum
# 3606eec246165846576d4ca4cae2fe057a3be323cb14714c10bc689a6ad3f16b  -   (matches)
```

## Verification

- `git show 394391a^:golem-grid.html | wc -c` → 34748 bytes, matches
  `wc -c games/golem-grid/reference/golem-grid.html` exactly (34748).
- sha256: `3606eec246165846576d4ca4cae2fe057a3be323cb14714c10bc689a6ad3f16b`
  (pinned literal in `tests/reference.test.js`).

## Usage

Open `games/golem-grid/reference/golem-grid.html` directly in a browser
(`file://`) — no build step, no dev server. It is a demo of the original
prototype and a fixture the golden test protects; it is not part of the
Vite `src/` build and is never imported by it.
