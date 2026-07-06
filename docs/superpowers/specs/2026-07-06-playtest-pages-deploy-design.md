# Playtest Pages Deploy — Design

**Date:** 2026-07-06
**Status:** Approved for planning
**Topic:** Fast playtest path — publish the golem-grid single-file build to GitHub Pages on green CI.

## Problem

There is no low-friction way to play the current build right after CI passes.
The `build` job in `.github/workflows/ci.yml` already produces a playable,
fully self-contained `golem-grid.html` and uploads it as the
`golem-grid-html` artifact — but reaching it means digging into an Actions
run, downloading a zip, unzipping, and opening a local file. The user wants
a shareable hosted URL that refreshes when a build goes green.

## Non-goals / what this is NOT

- **Not Docker, not a server.** The deliverable is a single static HTML file
  with zero external references (doctrine: runs from `file://`, two tabs).
  There is no runtime to containerize; a container would wrap one static file.
- **Not a replacement for `deploy.yml`.** `deploy.yml` is the separate,
  later "prod" path for the *narrated* build (S3 + CloudFront, pinned WASM
  weights, golden-prose smoke). It depends on `wasm/runq.c` (Phase 3, not yet
  built) and deploys an old prototype. This design does not touch it.
- **Not per-PR preview URLs.** One stable URL, not a throwaway URL per PR.
- **Not narrated gameplay.** The golem is still the stub at ▶GOLEM-PLUG◀, so
  what gets published is the real game loop (worldgen, movement, light pool,
  extraction, two-tab multiplayer) with *template* narration. This is expected
  and called out so the published build is not mistaken for the twin build.

## Success criteria

1. A green `main` build is automatically published to
   `https://tuckermclean.github.io/golem/` and serves the current
   `golem-grid.html` as the site root.
2. A build is published **only after every CI job passes** — on both the
   automatic (main) and manual triggers. A red branch can never be published.
3. A manual "deploy this branch" action publishes a chosen branch's build to
   the same URL, for playtesting before merge.
4. Pull requests still build the artifact (unchanged) but do **not** publish.
5. Two-tab multiplayer works over `https://` exactly as it does from
   `file://` (BroadcastChannel + storage-event bridge are same-origin).

## Approach (chosen: A — deploy job inside `ci.yml`)

Rejected alternative (B): a separate `pages.yml` on `workflow_run` +
`workflow_dispatch`. Cleaner separation, but `workflow_run` requires manually
checking `conclusion == 'success'`, fetching the artifact across workflows,
and a build/re-trigger step on the dispatch path — and the manual path does
**not** inherit the green-gate for free. Approach A is less machinery and
gives the "only ever publish green" guarantee on both triggers, because the
same `needs:` gate applies to the manual path.

## Design — changes to `.github/workflows/ci.yml`

### Triggers
Add `workflow_dispatch` alongside the existing `pull_request` and
`push: { branches: [main] }`. GitHub's "Run workflow" dropdown selects the
branch to deploy; CI runs fully on that ref first.

### Workflow-level additions
```yaml
permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false
```
Workflow-level permissions are harmless for the existing jobs (they only read
`contents`). The concurrency group prevents two Pages deploys from racing.

### New job: `deploy-pages`
```yaml
deploy-pages:
  needs: [determinism, solver, validator, build, some-hero-legacy,
          level-manifest, event-schema, freeze-verify]
  if: >-
    (github.event_name == 'push' && github.ref == 'refs/heads/main') ||
    github.event_name == 'workflow_dispatch'
  runs-on: ubuntu-latest
  environment:
    name: github-pages
    url: ${{ steps.deploy.outputs.page_url }}
  steps:
    - uses: actions/download-artifact@v4
      with:
        name: golem-grid-html
        path: site
    - name: land single file as index.html
      run: mv site/golem-grid.html site/index.html
    - uses: actions/upload-pages-artifact@v3
      with:
        path: site
    - id: deploy
      uses: actions/deploy-pages@v4
```

Notes:
- `needs:` lists **every** existing CI job, so the deploy only runs once the
  whole suite is green — this is the green-gate, and it applies identically to
  the automatic and manual triggers.
- The artifact is the one the `build` job produced **in the same run** — no
  cross-workflow fetch.
- The `build` job uploads the file as `golem-grid.html`; Pages needs
  `index.html` at the site root, hence the rename.
- On `pull_request`, neither `if:` branch is true, so `deploy-pages` is
  skipped — PRs build but never publish.

## One-time prerequisite (manual, done once)

Enable GitHub Pages with source = "GitHub Actions":
```
gh api -X POST repos/tuckermclean/golem/pages -f build_type=workflow
```
(or Settings → Pages → Build and deployment → Source: GitHub Actions). This
is repo configuration, not code, and is a precondition for `deploy-pages` to
succeed. It is called out in the plan as a checklist item, not a code change.

## Verification

1. On the feature branch, run the manual deploy (`workflow_dispatch` on this
   branch). Confirm CI runs, goes green, and `deploy-pages` publishes.
2. Open `https://tuckermclean.github.io/golem/`, confirm it serves the current
   build and is playable.
3. Open a second tab on the same URL; confirm a move in one tab renders in the
   other (two-tab multiplayer over https).
4. Merge to main; confirm the automatic trigger refreshes the same URL.
5. Confirm an open PR builds the artifact but does not publish (no
   `deploy-pages` run).

## Risks / edge cases

- **Pages not yet enabled** → `deploy-pages` fails until the one-time
  prerequisite is done. Mitigated by making it the first plan checklist item.
- **Public URL:** repo is already public, so a public Pages URL exposes
  nothing new. Acceptable.
- **Browser caching of `index.html`:** Pages sets a short cache TTL by
  default; a hard refresh always gets the latest. Not worth extra config.
- **Manual dispatch cost:** a manual deploy re-runs the full CI suite on the
  chosen branch. This is intentional (it is what guarantees green), and is the
  same cost as a normal push.
