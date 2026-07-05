# PROVENANCE

- **Source repo:** git@github.com:tuckermclean/topdown-puzzle.git
- **Commit SHA:** a2c2e8338885ca16ae05c8c5001bd21a5d6f04ed
- **Snapshot date:** 2026-07-04
- **Method:** `git archive a2c2e8338885ca16ae05c8c5001bd21a5d6f04ed | tar -x`

## Notes

- A locally-modified `package-lock.json` existed in the source working
  tree at snapshot time (uncommitted changes to the working copy). It
  was deliberately excluded — this snapshot vendors the last **committed**
  `package-lock.json` at the pinned SHA, via `git archive`, not the dirty
  working-tree file.
- This tree is a read-only legacy snapshot. Do not edit, lint, reformat,
  or otherwise modify anything else under this `legacy/` directory — it
  must remain byte-identical to `git archive` output of the pinned SHA
  above. Later phases port from this tree; they do not modify it in
  place.
- The `levels/*.txt` ASCII level files are also copied out flat into
  `games/topdown-puzzle/levels/` (sibling to this `legacy/` dir) with a
  generated manifest — see `games/topdown-puzzle/tools/gen-level-manifest.mjs`.
