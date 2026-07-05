# PROVENANCE

- **Source repo:** git@github.com:tuckermclean/some-hero.git
- **Commit SHA:** e3d17bb5d45420bad93a510a0d482a2413753ace
- **Snapshot date:** 2026-07-04
- **Method:** `git archive e3d17bb5d45420bad93a510a0d482a2413753ace | tar -x`

## Notes

- `assets/audio/masters/*.wav` (~91MB) are gitignored in the source repo
  and remain there — only the tracked mp3 derivatives under
  `assets/audio/` are vendored here.
- This tree is a read-only legacy snapshot. Do not edit, lint, reformat,
  or otherwise modify anything else under this `legacy/` directory — it
  must remain byte-identical to `git archive` output of the pinned SHA
  above. Later phases port from this tree; they do not modify it in
  place.
