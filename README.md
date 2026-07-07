# golem-pipeline

This repo is now the `golem-engine` monorepo (see VISION.md) and is under
restructure per DELTA.md; golem-grid lives at `games/golem-grid/`.

CI/CD for a 15M-parameter dungeon golem: synthetic data generation, GPU
training on ephemeral spot instances, eval-gated model promotion, WASM
packaging, and CDN deployment. All cloud resources are Terraform-defined.

## Why this project is a CI dream

Everything downstream of the seed is deterministic:

- worldgen is a pure function        -> golden-seed tests (exact match)
- the reducer is a pure function     -> event-log replay tests (bit-identical)
- prose sampling is seeded           -> model regression tests are string equality
- weights are content-addressed      -> a game build pins its exact brain

Hallucination is a failing test, not a vibe.

## Pipeline

```
 [data.yml]                [train.yml]                  [deploy.yml]
 harvest control strings   terraform apply (spot GPU)   emsdk: runq.c -> wasm
 -> big-model API batches  -> train -> checkpoint to S3 -> bundle site + manifest
 -> grounding validator    -> EVAL GATE:                -> S3 + CloudFront
 -> corpus shard to S3        - grounding violations       (immutable weights,
      |                       - exits-line format 100%      invalidate manifest
      |                       - perplexity vs released      only)
      v                    -> quantize int8
 quarantine bucket for     -> publish golem-vX.Y.Z-sha.bin
 rejected pairs            -> terraform destroy (always)
```

`ci.yml` runs on every PR and every push to `main`: nine jobs, no model
involved (the model pipeline is the separate `data.yml`/`train.yml`/
`deploy.yml` workflows below, all manual/tag-triggered).

## CI (`.github/workflows/ci.yml`) — one workflow graph

This is the real job graph as it exists today (DELTA Phase 6 O1), not an
aspirational pipeline. Every job runs on every `pull_request`, every push
to `main`, and manual `workflow_dispatch`:

| Job | Gates | Notes |
|---|---|---|
| `determinism` | root `npm test` (`npm run test --workspaces --if-present`) — every workspace's own test script in one pass: golem-grid's worldgen goldens/reducer replay, every `packages/*` package's own DoD suite, some-hero's full test suite (unit + e2e-headless + rules + ceremony-kernel), and adventure's test suite | The architecture's superpower: nearly everything here is a golden-file test — a diff means the world function or reducer changed, a MAJOR version bump under CLAUDE.md's doctrine, not a routine bugfix |
| `solver` | `node games/golem-grid/tools/solve.js --seeds 10000` — 10K-seed winnability + difficulty band | golem-grid only; some-hero's own 10K-seed floor solver (`make solve-some-hero`) is not wired into this CI job today, run locally |
| `validator` | `python -m pytest tools/test_validate.py tools/test_l3.py -q` — grounding validator unit tests, including L3's task A–F validators driven through the real L1 parser | Needs both Node (`@golem-engine/language`'s built `dist/`) and Python |
| `build` | `node tools/check-bans.mjs` (DELTA §0.3: no `Math.random`/`eval`/`new Function` under `packages/`) then the single-file golem-grid Vite build | Uploads `golem-grid.html` as an artifact `deploy-pages` reuses |
| `some-hero-legacy` | the flagship's own vendored unit + Playwright E2E suite, run read-only from `games/some-hero/legacy/` | Installs Playwright Chromium cold every run; uploads E2E screenshots on failure |
| `level-manifest` | regenerates `games/topdown-puzzle/levels/manifest.json` and fails on any git diff | Catches level-file drift without a committed regen |
| `event-schema` | `packages/testkit/tools/validate-events.mjs` (K6 schema vs. every golem-grid fixture/golden) + `event-schema.test.js`/`conservation.test.js` (the gold-conservation invariant helper) | Golem-grid only today — not yet extended to validate some-hero's or adventure's own event kinds |
| `freeze-verify` | `npm run freeze:verify` — golem fixture replay, the legacy `@ceremony` suite, topdown-puzzle parse-snapshot + solution-log replay, some-hero content-pack verification, and the some-hero `ceremony-kernel` mirror suite, in that order, failing fast | The permanent behavior-freeze gate from DELTA P0.3, extended by every later phase that added a fixture matrix entry (3 games: golem-grid, topdown-puzzle, some-hero) |
| `deploy-pages` | gated via `needs:` on all eight jobs above | Publishes the single-file golem-grid build to GitHub Pages on a green push to `main` or manual dispatch; PRs build the artifact but never publish (a red branch is never published on either trigger) |

There is **no separate CI job named "ceremony"** and **no model-eval gate
job in `ci.yml`**: the ceremony acceptance checks DELTA calls for are
folded into `freeze-verify` (which runs `test:ceremony` and
`test:ceremony-kernel` among its steps), and the model eval gate lives in
`train.yml` (below) but is honestly **not exercised for real** — no
corpus batch, no trained checkpoint, and no deployed weights exist yet
(L4–L6 are infra-blocked: they need a GPU account and `train.yml`'s AWS
variables, none of which are set up in this environment). Lint bans
(`tools/check-bans.mjs`) run as a `build`-job step, not a standalone job.

## Stages and gates

| Stage   | Trigger            | Gate                                        |
|---------|--------------------|---------------------------------------------|
| ci      | every PR + push to `main` | the eight gating jobs green (determinism/solver/validator/build/some-hero-legacy/level-manifest/event-schema/freeze-verify); `deploy-pages` additionally runs (gated on all eight) only on a green push to `main` or manual dispatch, never on a PR |
| data    | manual / cron      | validator pass-rate >= 85%; shard schema ok  |
| train   | manual (corpus tag)| grounding < 1%; exits format = 100%; ppl <= last release +2% |
| deploy  | tag `v*`           | wasm smoke test: fixed seed -> golden prose  |

`data`/`train`/`deploy` remain infra-blocked as described in "Pipeline"
above — no corpus, no trained model, no deployed weights exist (L4–L6 in
ARCHITECTURE.md's language-tiers table). Only `ci` runs for real today.

## Cloud resources (infra/)

- 3× S3: `corpus` (shards + quarantine), `models` (checkpoints + released
  weights), `site` (static game bundle)
- CloudFront distribution over `site` + `models/released/` (weights are
  content-addressed: cache-control immutable, forever)
- IAM OIDC role assumed by GitHub Actions — no long-lived keys
- Launch template for ephemeral spot GPU training (g5.xlarge default);
  instance self-terminates after uploading its checkpoint

## Cost profile (order of magnitude)

- data generation: $50–150 in big-model API tokens for 100–300K pairs
- training: g5.xlarge spot ≈ $0.35–0.55/hr × 4–12 hr per run
- serving: ~pennies. Static site + a 5–15 MB weight file on a CDN.
- idle: ~$0. Nothing runs between pipelines.

## Local entry points

```
make test        # determinism + validator tests
make solve       # 10K-seed winnability + difficulty band
make html        # build games/golem-grid/dist/golem-grid.html (file:// demo)
make data-batch  # one generation batch against the big-model API
make train-local # tiny smoke-train on CPU (256K params, minutes)
make wasm        # build golem.wasm via emsdk
```

## Rollback

Deploys write `manifest.json` pointing at a pinned weight file. Rollback is
repointing the manifest at the previous artifact and invalidating one path.
The weights themselves are immutable and never overwritten.
