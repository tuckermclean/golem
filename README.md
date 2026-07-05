# golem-pipeline

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

`ci.yml` runs on every PR: worldgen golden-seed tests, reducer replay tests,
validator unit tests. No model involved; sub-minute.

## Stages and gates

| Stage   | Trigger            | Gate                                        |
|---------|--------------------|---------------------------------------------|
| ci      | PR                 | determinism tests green                      |
| data    | manual / cron      | validator pass-rate >= 85%; shard schema ok  |
| train   | manual (corpus tag)| grounding < 1%; exits format = 100%; ppl <= last release +2% |
| deploy  | tag `v*`           | wasm smoke test: fixed seed -> golden prose  |

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
make html        # build the single-file dist/golem-grid.html (file:// demo)
make data-batch  # one generation batch against the big-model API
make train-local # tiny smoke-train on CPU (256K params, minutes)
make wasm        # build golem.wasm via emsdk
```

## Rollback

Deploys write `manifest.json` pointing at a pinned weight file. Rollback is
repointing the manifest at the previous artifact and invalidating one path.
The weights themselves are immutable and never overwritten.
