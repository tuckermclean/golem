# `packages/language` (L2) — Tier-2 Intent Classifier — Design

**Date:** 2026-07-06
**Status:** Draft — for orchestrator review before implementation begins
**Topic:** DELTA.md Phase 3, task L2 — the tier-2 intent classifier that
picks up where L1's deterministic parser gives up. This is a design
document only; no code changes are made by it.

## Scope

DELTA §L2, verbatim:

> Tier-2 intent classifier. Intent set per VISION (move/take/.../unknown),
> slots, calibrated confidence; implementation: start with logistic-
> regression/fasttext-class model over engine-generated synthetic
> utterances (`tools/lang/gen_utterances.js` harvests real affordances →
> templated paraphrases via teacher model). Routing thresholds: ≥0.90
> execute; 0.65–0.90 execute iff exactly one grounded interpretation;
> <0.65 → tier 3 or choice prompt. Must be able to output `unknown`.
> DoD: held-out accuracy + calibration report in CI; adversarial suite
> (classifier must never emit a confident command for gibberish); runs
> in <10ms in browser.

L2 does **not** replace L1. VISION's four-stage pipeline (`VISION.md`
lines 33–36: "direct controls → deterministic parser → tiny intent
classifier (intent + slots + confidence) → twin → and ALWAYS terminating
in the authoritative validator. 'Go north' never touches the decoder.")
places the classifier strictly *after* the table-driven parser tier L1
already built (`packages/language/src/parse.ts`, merged to `main` —
`ff47f23`). Concretely:

- L1 stays the fast path for anything table-matchable: `<1ms`, zero
  scoring, zero model weights loaded. Every utterance L1 resolves
  `{ok:true, ...}` on is **never seen by L2** — the classifier does not
  get a vote on things the deterministic grammar already understood.
- L2 exists only for the utterances L1 returns `{ok:false,
  reason:"unknown"}` on — free-form phrasing outside L1's verb/alias
  tables ("could you head over to the lantern and grab it" → no, "can
  I get the lamp" → yes-ish, "hey wanna trade" → no/unknown, etc.). This
  is "the long tail" the task brief names.
- L2 reuses L1's noun-grounding (`packages/language/src/ground.ts`'s
  `groundNoun`) for slot fill — it does not reinvent grounding, and it
  does not reinvent the `Intent`/`ParseResult` types. It predicts an
  **intent label** (one of L1's eight `CanonicalVerb`s, or a ninth
  `"unknown"` label) plus a calibrated confidence; slot-filling and the
  routing policy around that confidence are what turn a label into the
  same `ParseResult` shape L1 already returns.
- **Output shape is unchanged.** `route()` (L2's new composed entry
  point, see "Routing" below) returns the exact same `ParseOk | ParseFail`
  union L1's `parse()` returns, carrying the exact same `Intent` union.
  This is a hard design constraint (task brief: "so the golem-grid
  adapter is unchanged") — `games/golem-grid/src/language-adapter.js`'s
  `toCommand`/`dispatchIntent` do not need a single line changed; only
  `games/golem-grid/src/input.js`'s one `import { parse }` becomes
  `import { route }` (see "Wiring" below).

What L2 is explicitly **not**: it is not the twin (L3–L6, a real
~15M-parameter WASM language model — a completely different scale and a
completely different DELTA phase), it does not touch the kernel's
`validate()` (a grounded, high-confidence intent is still just a
proposal — the kernel denies it exactly as it would today), and it does
not attempt multi-step planning or conversation. It is a small, linear,
in-browser router that decides "is this actually one of our eight verbs,
phrased unusually — or is it genuinely something else."

## Why this shape (grounding in VISION + DELTA)

- VISION doctrine #6: "Latency is tiered... Confidence is load-bearing:
  the classifier must be able to say 'unknown.'" This is the single
  sentence that makes calibration non-optional: a classifier that always
  picks *some* label with high confidence is a worse product than L1's
  own honest `unknown` — it would silently misfire commands instead of
  falling through to chat/tier-3. Everything about the model choice below
  (linear, hashed features, temperature scaling, a trained `unknown`
  class, and a hard confidence floor) is in service of that one line.
- DELTA §0.3: "Python only under `tools/model/` and `train/`." `tools/lang/`
  is explicitly **not** one of those two directories — the task brief's
  own naming (`tools/lang/gen_utterances.js`, a `.js` file) confirms L2's
  tooling stays JavaScript, matching L1's TS-strict-under-`packages/`
  convention and keeping inference and training in the same language
  (no serialization boundary between a Python-trained model and a JS
  inference engine, no ONNX/TF.js runtime dependency to satisfy the
  `<10ms in browser` DoD).
- DELTA §0.3 also: "All randomness through `packages/random` named
  channels. `Math.random` is forbidden in packages/ (lint rule,
  CI-enforced)." Both the synthetic-data generator and the trainer are
  randomized processes (template slot selection, gibberish generation,
  train/calibration/held-out shuffling, minibatch order) — every one of
  those draws must come from a `packages/random` `channel(...)`, seeded
  by a fixed string, never `Math.random`/`Date.now`. See "Reproducibility"
  below for why this is load-bearing, not just a lint rule to satisfy.
- CLAUDE.md doctrine #8: "Hallucination is a failing test. Models are
  eval-gated build artifacts: immutable, content-addressed, pinned by
  manifest." L2's weights are a *tiny* model artifact by the twin's
  standards (kilobytes, not megabytes) but they are still a trained
  artifact, not source code — the same discipline applies at this scale:
  content-addressed filename, a manifest pointer, and CLAUDE.md's own
  working-practices line "Never overwrite a published weight artifact.
  Rollback = repoint manifest" governs it exactly as it would the twin's
  `golem-v*.bin`.
- The four-stage pipeline's ordering is also why L2 lives in the *same*
  `packages/language` package as L1 rather than a new package: VISION's
  monorepo layout sketch (`VISION.md`: "language/ parser, classifier,
  twin runtime (WASM), context...") names all three tiers as one
  package's job. They share tokenization/normalization concerns
  (`tokenize.ts`), the affordance/grounding contract (`ground.ts`), and
  the `Intent`/`ParseResult` output vocabulary — splitting L2 into its
  own package would just re-import all of that with an extra
  `package.json` for no isolation benefit (L2 has no different runtime
  constraints than L1 — both must be dependency-light, synchronous,
  browser-safe TS).

## Model choice & feature representation

**Model: a single linear layer (multinomial logistic regression) over
hashed n-gram features, trained via mini-batch gradient descent, with a
post-hoc temperature-scaled softmax.** This is deliberately the simplest
model that can satisfy every DoD line at once:

| DoD requirement | why this model satisfies it |
|---|---|
| trains in-repo, no GPU | a `D × C` matrix (D = hash buckets, C = 9 labels) trained by dense mini-batch SGD over a few thousand synthetic examples is milliseconds-to-seconds of single-threaded JS work — no BLAS, no autodiff framework, no accelerator |
| infers in <10ms in browser | one hashing pass over the utterance's tokens (a handful of string ops) + one `D`-length dot product per class (`C` of them) — a few thousand multiply-adds total, not a neural forward pass |
| "genuinely tiny" | see sizing below: the whole trained artifact is tens of KB, not MB |
| calibrated confidence | softmax over `C` logits is already a probability simplex; the only extra step is temperature scaling (one scalar) to correct known overconfidence, which is trivial to add to a linear model and does not require an ensemble or Bayesian machinery |
| must output `unknown` | `unknown` is trained as a real **10th... 9th class** (see below) fed by generated gibberish, backstopped by a hard confidence floor independent of training data quality |

This is "fasttext-class" in the sense DELTA names it (fasttext's own
classifier is exactly averaged/hashed n-gram features → one linear layer
→ softmax, no hierarchical softmax needed here since `C = 9` is tiny) —
not an embedding-averaging reimplementation, a hashed bag-of-features
linear classifier, which is the cheaper and equally-adequate end of that
spectrum for a genuinely tiny label set.

### Feature representation

Given a normalized utterance (reuse `tokenize.ts`'s `normalize()` — same
lowercase/trim/punctuation-strip L1 already does, so L1 and L2 agree on
what "the same input" means):

1. **Character n-grams, n ∈ {3, 4, 5}**, generated over the *whole*
   normalized string with word boundaries marked (`" go north "` →
   `"_go"`, `"go "`, `"o n"`, ... — the boundary markers are what let
   3-grams distinguish "the sword" from "swordfish"-as-one-token
   nonsense, and give partial credit on typos: "noth" vs "north" share
   most of their 4-grams).
2. **Word unigrams and bigrams** over the whitespace-tokenized utterance
   (`tokenize.ts`'s existing `tokenize()`), giving the model a cheap
   signal for exact known vocabulary ("lantern", "whisper") on top of the
   sub-word signal.
3. Every feature (a string) is hashed into a fixed **`D = 4096`** bucket
   space via `@golem-engine/random`'s existing `h32(str) % D` — reusing
   the repo's one canonical string hash (`packages/random/src/index.ts`)
   rather than introducing a second hash function. (`h32` is used here as
   a hash primitive, not as a PRNG seed — a distinct, well-established
   reuse of the same function, the same way a single SHA-256
   implementation serves both content-addressing and signing elsewhere
   in this repo.) Collisions are accepted (this is the "feature hashing"
   / "hashing trick" every fasttext-class system uses); at `D = 4096`
   against a vocabulary of at most a few hundred distinct
   n-grams/words in this game's entire lexicon, collision rate is low
   and, per the hashing-trick literature, does not meaningfully hurt a
   linear model's accuracy.
4. The feature vector is a **sparse count vector** (bucket → count of
   n-grams/words hashing there), L2-normalized before the dot product so
   utterance length doesn't dominate the logit scale.

### Weights artifact & size budget

The trained artifact is a `D × C` weight matrix + a `C`-length bias
vector + one scalar temperature + the ordered label list + the exact
hashing config (n-gram sizes, `D`) needed to reproduce feature extraction
byte-for-byte:

- `D = 4096`, `C = 9` (`move, take, look, read, say, party, whisper,
  emote, unknown`) → `4096 × 9 = 36,864` floats.
- As plain JSON/JS `number[]` (float64 in JS, but stored/printed at
  float32 precision — no need for float64's extra digits in a linear
  classifier): **~150 KB** as readable JSON, or **~40 KB** gzipped
  (typical for repetitive small-magnitude floats) — small enough to
  check into git directly, no S3/content-addressed-bucket infra needed
  (unlike the twin's multi-MB weights in `train.yml`, which need
  ephemeral-GPU + S3 because of both training cost and artifact size;
  neither applies here).
- Int8 quantization of the weight matrix (à la the twin's own
  `train/quantize.py`) would shrink this further (~10 KB), but is **not
  required** to hit the `<10ms` inference budget — that number is
  dominated by feature hashing + a `4096×9` dot product, not by artifact
  fetch size — so quantization is scoped as a deferred optimization (see
  Open Questions), not part of this DoD.

## Synthetic data pipeline — `tools/lang/gen_utterances.js`

DELTA's own phrase is "harvests real affordances → templated paraphrases
via teacher model." Read literally and honestly for this sandbox (no
teacher-model API is reachable from here — every other DELTA task that
needs one, e.g. L3's `generate.py`, treats it as an external, credentialed
service):

**First cut: deterministic, seeded templates — no teacher model.**

1. **Harvest.** Pull the *real* grammar tier-1 already ships:
   `packages/language/src/tables.ts`'s `VERB_ALIASES` (the canonical
   verb set + every existing alias), `DIRECTION_ALIASES` (the four
   cardinals + all their spellings), and a small authored noun/name
   vocabulary standing in for "real affordances" — reusing
   `packages/language/tests/fixtures/affordances.js`'s existing lantern/
   sign/door/Aria/Bram fixture (already the harvested-affordance stand-in
   L1's own corpus uses) plus `games/golem-grid/src/language-adapter.js`'s
   `computeAffordances` shape as the schema contract, so a generated
   utterance's grounded slot always corresponds to something a real
   `Affordance` could name. This is "harvest real affordances", scoped to
   what already exists rather than inventing a second harvesting path.
2. **Template.** For each of the 9 labels, author a bank of **phrasing
   templates** with `{slot}` placeholders — the part of "teacher model
   paraphrase" this sandbox *can* do honestly by hand: not one template
   per verb (which would just re-derive L1's own alias table and teach
   the classifier nothing new), but 15–30 *naturalistic* phrasings per
   label that don't table-match L1 on purpose — questions ("could you
   grab {noun}?"), politeness wrapping ("would you mind heading {dir}"),
   indirect requests ("I need {noun}"), typos/contractions ("cn u tak
   {noun}"), and multi-clause chat that should resolve to `say`/`emote`/
   `party` rather than a command. Slots are filled by drawing from the
   harvested vocabulary using `@golem-engine/random`'s `pick`/`rint`,
   seeded via `channel("l2-gen", templateId, slotIndex)` — **never**
   `Math.random`.
3. **Negatives / gibberish.** A parallel generator produces the `unknown`
   class's training examples: seeded random-character strings, keyboard-
   mash-shaped strings (bigram frequency drawn from a small "adjacent
   keys" table, still seeded), pure numeric/punctuation noise, and
   repeated-character spam — enough variety that the `unknown` class
   isn't just "empty string" (which L1 already handles as `reason:
   "empty"` before L2 ever runs). Labeled `unknown`, same seeded pipeline.
4. **Output**: a single committed JSON file, structurally a sibling of
   L1's `corpus.json` — `packages/language/tests/fixtures/
   classifier-corpus.json`, an array of `{utterance, label, split}` rows
   where `split ∈ {"train", "calibration", "heldout"}` is assigned by a
   seeded shuffle (`channel("l2-split")`), not interleaved by generation
   order (so held-out isn't accidentally correlated with template
   authorship order).

**Deferred, honestly named as such:** once a teacher-model API is
actually reachable (the same one `tools/model/generate.py` will use for
L3), `gen_utterances.js` gains a second mode that sends each hand-written
template through the teacher for paraphrase expansion (5–10 rewordings
per template) and folds the results back in as a versioned corpus bump
(`classifier-corpus.v2.json`). This is explicitly **not** built now — it
is named here so the eventual swap is a data refresh, not an
architecture change (the trainer/feature/model code do not care whether
a training row came from a template or a teacher paraphrase).

## Training — `tools/lang/train_classifier.js`

A plain Node script (JS, per DELTA §0.3's carve-out — no Python anywhere
in this path):

1. Load `classifier-corpus.json`, split by its precomputed `split` field.
2. Extract hashed features (via a shared `packages/language/src/
   features.ts` module the *trainer* and the *runtime classifier* both
   import — no feature-extraction logic duplicated between train-time
   and inference-time, the single most common source of train/serve
   skew in small ML systems).
3. Train the `D×C` weight matrix + bias by mini-batch gradient descent
   on multinomial cross-entropy, fixed epoch count, fixed learning-rate
   schedule, batches shuffled each epoch via `channel("l2-train-shuffle",
   epoch)`. No dropout/regularization scheme needs its own randomness
   beyond L2 weight decay (a fixed hyperparameter, not sampled).
4. **Fit calibration** (temperature `T`) on the `calibration` split only
   — never on `train` or `heldout` — by a 1-D search minimizing negative
   log-likelihood of `softmax(logits / T)` against true labels (standard
   post-hoc temperature scaling; trivial in a linear model since there's
   only one scalar to fit).
5. **Evaluate** on `heldout` (never touched by steps 3–4): top-1 accuracy,
   a confusion matrix, and calibration metrics (see next section).
6. **Emit**:
   - `packages/language/weights/classifier.v1.<sha8>.ts` — a plain
     exported object literal (`export const WEIGHTS = {D, labels, W, b,
     temperature, ngramSizes}`), **not raw JSON**, to stay inside the
     "TS strict for everything under `packages/`" convention and avoid
     JSON-import-attribute friction across Node/bundler versions
     (`.ts` files are already how every other package ships its
     internals). `<sha8>` is `sha256(serialized weights)`'s first 8 hex
     chars — content-addressed, matching CLAUDE.md's twin-artifact
     discipline at a much smaller scale.
   - `packages/language/weights/manifest.ts` — `export const CURRENT =
     "classifier.v1.<sha8>"`, the single file `classify.ts` imports by
     name. Rollback is repointing this one export, per CLAUDE.md's "Never
     overwrite a published weight artifact. Rollback = repoint manifest"
     — applied literally, just via a committed TS re-export instead of
     an S3 key, since there's no remote store at this size.
   - `packages/language/reports/calibration-report.json` — the CI
     artifact (see "DoD as CI").

### Reproducibility ("regen is a no-op")

Every random draw in both scripts goes through `@golem-engine/random`'s
`channel(...)`, seeded by fixed strings — the same discipline
`games/golem-grid/shared/worldgen.js` already lives by for the world
itself. Given the same corpus JSON and the same seed strings, the
training loop is a fixed sequence of deterministic float64 arithmetic
operations (JS `+`/`*`/`/` are IEEE-754-exact and V8 does not
reassociate them) in a single thread with no external nondeterminism
(no wall-clock, no `Date.now`, no multi-threaded reduction order) — so
**re-running `train_classifier.js` on an unchanged corpus is expected to
reproduce the committed weights file byte-for-byte**, the same "golden
regen is a no-op" discipline the repo already holds `level-manifest`'s
CI job to (`node .../gen-level-manifest.mjs && git diff --exit-code`).
This gives CI a cheap, honest drift check: regenerate the corpus, regen
the weights, diff both against what's committed, fail if either moved.
The one residual risk this doesn't fully close — cross-Node-major-version
float behavior — is called out explicitly in Open Questions rather than
asserted away.

## Calibrated confidence

Three layers, deliberately redundant (VISION doctrine #6 makes `unknown`
a correctness requirement, not a nice-to-have, so it gets more than one
line of defense):

1. **Softmax + temperature.** Raw logits `z = Wx + b` → `p =
   softmax(z / T)`, `T` fit post-hoc on the calibration split (Guo et al.
   2017's standard technique — a single scalar keeps a linear model's
   otherwise well-known overconfidence in check without touching
   accuracy, since temperature scaling is monotonic and doesn't change
   the argmax).
2. **A trained `unknown` class.** Rather than only inferring "not
   confident enough" from a low max-probability over the 8 real verbs,
   `unknown` is a 9th class with its own training signal (the generated
   gibberish set) — so the model can learn actual *shape* differences
   between real commands and noise (e.g. character-n-gram statistics of
   gibberish look different from English words), not just "I've never
   seen anything like this get a high score."
3. **A hard confidence floor**, independent of both of the above:
   regardless of argmax label, if `max(p) < 0.50`, the router treats the
   result as `unknown`. This is the backstop for inputs that are
   *outside the training distribution in a way the trained `unknown`
   class didn't anticipate* — the floor doesn't need the gibberish
   generator to have been exhaustive, only for genuinely novel garbage to
   fail to concentrate probability mass anywhere, which an
   undertrained/unfamiliar input naturally does under a well-calibrated
   softmax.

`max(p)` (after temperature scaling, after the floor check) is exactly
the "calibrated confidence" the routing thresholds below consume.

## Routing — `packages/language/src/router.ts`

```ts
export function route(utterance: string, opts: ParseOptions = {}): ParseResult {
  const l1 = parse(utterance, opts);               // L1 always tries first
  if (l1.ok) return l1;                             // tier-1 wins outright
  if (l1.reason !== "unknown") return l1;           // "empty"/"ambiguous" pass through unchanged — see below
  return classifyAndGround(utterance, opts);        // L2 only runs on L1's "unknown"
}
```

**Handoff rule: L2 runs if and only if L1 returns `reason:"unknown"`.**
This is a deliberate, narrow answer to the brief's own open question
("does L2 only run when L1 says unknown, or always"):

- `l1.ok === true` → tier-1 already has a *structural* match (a known
  verb phrase, possibly a bare direction) — L2 never gets a vote here.
  Running a probabilistic model over something the deterministic grammar
  already resolved would only add a chance of silently overriding a
  correct, cheap answer with a probabilistic one; VISION's "go north
  never touches the decoder" is a hard latency/certainty law, not a
  soft preference, and extending "the decoder" to include L2 for
  already-resolved utterances would violate it.
- `l1.reason === "empty"` → nothing to classify; passing an empty string
  to a bag-of-features classifier is undefined-ish behavior for no
  product benefit (there is no command hiding inside `""`).
- `l1.reason === "ambiguous"` → L1 already found a *known verb* and a
  *grounded slot space*, just with more than one tied candidate (e.g.
  two lanterns in reach). This is not the long tail L2 is for — it's a
  disambiguation problem the existing adapter already has a answer for
  (`docs/.../l1-language-parser-design.md`'s Orchestrator Decision #1: a
  one-line `feedLine("Did you mean: a, b?")` hint). Re-running a
  9-class intent classifier over an utterance whose *intent* L1 already
  nailed would not help resolve *which* lantern.

`classifyAndGround` then applies the DELTA thresholds:

```ts
function classifyAndGround(utterance: string, opts: ParseOptions): ParseResult {
  const { label, confidence } = classifyIntent(utterance);   // classify.ts
  if (label === "unknown" || confidence < 0.65) {
    return { ok: false, reason: "unknown" };                 // <0.65 -> tier 3 / choice prompt (tier 3 doesn't exist yet: same fallback L1's own "unknown" already gets — chat)
  }
  const filled = fillSlot(label, utterance, opts.affordances ?? []);  // reuses ground.ts + DIRECTION_ALIASES
  if (confidence >= 0.90) {
    if (filled.ok) return { ok: true, intent: filled.intent };
    // High label-confidence but slot-fill failed/ambiguous: still can't
    // execute an ungrounded target. Downgrade honestly rather than guess.
    return filled;   // filled is itself a well-formed ParseFail (unknown/ambiguous)
  }
  // 0.65 <= confidence < 0.90: execute ONLY if there is exactly one
  // grounded interpretation (DELTA's own phrase, applied literally).
  if (filled.ok) return { ok: true, intent: filled.intent };
  return { ok: false, reason: "unknown" };   // no single grounded reading in the medium band -> don't guess
}
```

`fillSlot(label, utterance, affordances)` is the one piece of new glue,
and it is **not** a model — it is the same deterministic machinery L1
already has, applied more permissively (scanning the *whole* utterance,
not just "the tokens after a matched verb prefix", since the classifier
already told us the verb):

- `move`: scan all tokens for one present in `DIRECTION_ALIASES`
  (`tables.ts`) — first hit wins; none found → `unknown`.
- `take`/`look`: strip `FILLER_WORDS` from the whole utterance, hand the
  remainder to `ground.ts`'s `groundNoun(phrase, verb, affordances)` —
  the *exact* function L1 uses, unmodified. Zero remainder after
  stripping → the bare-verb intent (`{type:"take"}` / `{type:"look"}`),
  matching L1's own empty-noun-phrase behavior.
- `read`: no slot to fill — always `{type:"read"}`.
- `say`/`party`/`emote`: the classifier already told us the shape; the
  entire (un-stripped) utterance becomes `text` — these can't fail to
  "ground" since there's no affordance lookup involved, so they always
  return `ok:true` once picked as the label (never enter the "single
  grounded interpretation" gate — see Open Question 3).
- `whisper`: the first token that is *not* a filler word and is not
  itself a recognized verb-phrase token is treated as the target name
  (mirroring L1's "next word after the verb" rule, since there's no
  affordance-based grounding for player names either here or in L1); no
  such token → `unknown`.

This keeps grounding as one single, un-duplicated implementation
(`ground.ts`) shared by both tiers — L2 changes *when* grounding runs and
*over what span of the utterance*, never *how* grounding scores
candidates.

### Output shape — unchanged

`route()`'s return type is exactly `ParseResult` (`ParseOk | ParseFail`)
and `Intent` is exactly L1's existing union — **no new fields, no new
`reason` values, no new `Intent` variant.** The medium-confidence
"exactly one grounded interpretation" gate is expressed entirely through
existing `ParseFail` reasons (`"unknown"` when nothing/multiple ground,
implicit success when exactly one does) rather than inventing a new
"choice prompt" shape — DELTA's own phrase "tier 3 or choice prompt" is
satisfied by the *existing* `reason:"ambiguous"` + `candidates` path
already wired to a UI hint (see `fillSlot`'s reuse of `groundNoun`, which
already returns `{ok:false, reason:"ambiguous", candidates}` when more
than one target ties) — L2 doesn't need a distinct prompt mechanism, it
just needs to be able to *reach* that existing path, which reusing
`ground.ts` gives it for free.

## DoD as machine-checkable CI

Four independent gates, each a concrete `node:test` file or tool, mirroring the shape of the K6/event-schema and P0.3/freeze-verify jobs already in `.github/workflows/ci.yml`:

1. **Held-out accuracy + calibration report** —
   `tools/lang/train_classifier.js --eval-only` (loads the *committed*
   weights, scores the `heldout` split, does **not** retrain) emits
   `packages/language/reports/calibration-report.json`: top-1 accuracy,
   a 9×9 confusion matrix, and an **Expected Calibration Error (ECE)** —
   bucket held-out predictions into 10 confidence bins, compare each
   bin's mean predicted confidence against its actual accuracy, weight
   by bin size. `packages/language/tests/calibration.test.js` loads this
   report and asserts two placeholder bars (see Open Questions for why
   these are placeholders, not settled numbers): held-out accuracy ≥ 0.90,
   ECE ≤ 0.05.
2. **Adversarial suite** — `packages/language/tests/fixtures/
   adversarial-suite.json` (committed, generated by `gen_utterances.js`'s
   negative-example path, a superset of what feeds the `unknown` training
   class plus hand-added edge cases: emoji-only strings, single very
   long repeated character, mixed-script nonsense).
   `packages/language/tests/adversarial.test.js` asserts, for **every**
   entry, `route(entry).ok === false` — a hard 100% bar with no
   tolerance, matching the brief's "must never emit a confident command
   for gibberish" literally (not a statistical threshold — a single
   failing row is a real bug, same posture as a golden-file exact match
   elsewhere in this repo).
3. **`<10ms` in-browser inference** — `packages/language/tests/
   classify-perf.test.js`, structurally identical to L1's own corpus-batch
   timing assertion (its Open Question 7): run `route()` over a batch of
   ~500 mixed utterances (a mix of L1-hits and L1-misses, since L1-hits
   never reach the classifier and must not be allowed to hide a slow
   classifier path), measure with `performance.now()`, assert total time
   / count `< 10ms`. Run under plain `node --test` (V8, the same engine
   browsers ship) — good enough evidence for the DoD without a real
   browser harness, the same posture L1 took for its own `<1ms` claim.
4. **Corpus/weights drift check** — a CI step (not a `node:test`, a
   shell step, matching `level-manifest`'s job shape):
   ```
   node tools/lang/gen_utterances.js
   git diff --exit-code -- packages/language/tests/fixtures/classifier-corpus.json packages/language/tests/fixtures/adversarial-suite.json
   node tools/lang/train_classifier.js
   git diff --exit-code -- packages/language/weights/
   ```
   A red diff here means either the generator or the trainer drifted
   from what's committed — exactly the "regen is a no-op" discipline the
   brief asks for, enforced the same way `level-manifest`'s job already
   enforces it for `topdown-puzzle`'s manifest.

Illustrative CI job (not applied by this design — a future PR wires it
into `.github/workflows/ci.yml` alongside `event-schema`/`freeze-verify`):

```yaml
  classifier-eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: regenerate corpus + weights; fail on drift
        run: |
          node tools/lang/gen_utterances.js
          git diff --exit-code -- packages/language/tests/fixtures/classifier-corpus.json packages/language/tests/fixtures/adversarial-suite.json
          node tools/lang/train_classifier.js
          git diff --exit-code -- packages/language/weights/
      - name: classifier + router + adversarial + calibration + perf tests
        run: node --test packages/language/tests/classify.test.js packages/language/tests/router.test.js packages/language/tests/adversarial.test.js packages/language/tests/calibration.test.js packages/language/tests/classify-perf.test.js
      - name: publish calibration report
        run: cat packages/language/reports/calibration-report.json >> "$GITHUB_STEP_SUMMARY"
```

Note also: `tools/check-bans.mjs` (the CI-enforced `Math.random`/`eval`/
`new Function` scanner) today only walks `packages/*/src` and
`packages/*/tools` (`tools/check-bans.mjs` lines 17–18) — it does
**not** cover repo-root `tools/lang/`. Since both `gen_utterances.js` and
`train_classifier.js` carry the same "no `Math.random`" obligation by
this design's own rule (not by an existing lint gate), extending
`SCAN_SUBDIRS`-equivalent coverage to `tools/lang/` is proposed as part
of L2's implementation (a small, additive change to a shared root
script, flagged explicitly in Open Questions rather than assumed
in-scope).

## File/module layout

```
packages/language/
  package.json        # add "dependencies": { "@golem-engine/random": "*" }
                       #   (new — L1 had zero deps; L2's feature hashing
                       #   reuses h32 rather than a second hash impl)
  src/
    index.ts           # existing L1 exports UNCHANGED, plus: export { route } from "./router.js";
                        #   export type { ClassifyResult } from "./classify.js" (if useful to callers/tests)
    tables.ts           # existing, untouched
    tokenize.ts         # existing, untouched
    ground.ts           # existing, untouched — reused by fillSlot
    parse.ts            # existing, untouched — L1 stays exactly as designed/shipped
    features.ts         # NEW: char-n-gram + word hashing, shared by train + infer
    classify.ts         # NEW: classifyIntent(utterance) -> {label, confidence, probs}
                        #   loads weights via weights/manifest.ts
    router.ts           # NEW: route(utterance, opts) -> ParseResult (the L1+L2 composition above)
  weights/
    classifier.v1.<sha8>.ts   # NEW, generated — committed, never hand-edited
    manifest.ts                # NEW, generated — { CURRENT: "classifier.v1.<sha8>" }
  reports/
    calibration-report.json    # NEW, generated by --eval-only — a CI artifact, not consumed by any code
  tests/
    classify.test.js            # NEW: hand-picked utterance -> expected label/confidence-bucket cases
    router.test.js              # NEW: L1-hit passthrough, L1-unknown -> L2, threshold-boundary cases,
                                 #   ambiguous/empty passthrough unchanged
    calibration.test.js         # NEW: loads calibration-report.json, asserts accuracy/ECE bars
    adversarial.test.js         # NEW: loads adversarial-suite.json, asserts 100% reject rate
    classify-perf.test.js       # NEW: batch timing, <10ms/utterance
    fixtures/
      classifier-corpus.json    # NEW, generated — train/calibration/heldout rows
      adversarial-suite.json    # NEW, generated — gibberish/OOD set

tools/lang/
  gen_utterances.js     # NEW: harvest tables.ts + affordances fixture -> templated
                         #   paraphrases + gibberish -> classifier-corpus.json + adversarial-suite.json
                         #   (seeded via @golem-engine/random, no Math.random)
  train_classifier.js   # NEW: corpus -> features.ts -> mini-batch SGD -> temperature fit ->
                         #   weights/*.ts + reports/calibration-report.json
                         #   supports --eval-only (score committed weights, no retrain — CI's path)

games/golem-grid/src/
  input.js               # ONE-LINE change (not part of this design's scope, named for completeness):
                          #   import { parse } from "@golem-engine/language";
                          #   -> import { route } from "@golem-engine/language";
                          #   and the one call site `parse(raw, {...})` -> `route(raw, {...})`.
                          #   language-adapter.js's computeAffordances/toCommand/dispatchIntent:
                          #   UNCHANGED — they consume ParseResult/Intent, which didn't change shape.

.github/workflows/ci.yml # illustrative "classifier-eval" job sketched above — not applied by this design
tools/check-bans.mjs      # proposed scope extension to also scan tools/lang/** — not applied by this design
```

## Open questions / risks

1. **Quality is bounded by templated (non-teacher) data, honestly.** The
   first-cut corpus is authored templates + seeded slot-filling, not real
   user utterances and not teacher-model paraphrases (no such API is
   reachable in this sandbox). Held-out accuracy measured against a
   held-out split of the *same generative process* will likely look
   good (≥0.90 is a plausible bar) largely because train/heldout share a
   template family — that number is evidence the model learned the
   templates, not proof it generalizes to what players actually type.
   The adversarial suite and the confidence floor are the real
   safety net for real-world weirdness; the accuracy number is a
   regression guard, not a quality guarantee. This should be stated to
   players/stakeholders the same way, not oversold.
2. **The accuracy (≥0.90) and ECE (≤0.05) bars in `calibration.test.js`
   are placeholders**, chosen as reasonable-sounding round numbers, not
   derived from any real data. The orchestrator should treat them as a
   starting negotiating position to tune once the first trained model's
   actual numbers are in hand, not a committed contract.
3. **`say`/`party`/`emote` never enter the "exactly one grounded
   interpretation" gate** (they have no affordance-based slot to ground
   — see `fillSlot`). This means the 0.65–0.90 confidence band, for these
   three labels specifically, degrades to "confidence ≥ 0.65 executes" —
   arguably looser than DELTA's stated policy, which reads as though it
   assumes every intent has a groundable slot to gate on. Whether that's
   the right call (chat-shaped intents are low-stakes, so a lower medium-
   band bar is fine) or whether these three labels should instead be
   *held to the ≥0.90 bar only* (no medium-band execution at all, since
   there's nothing to disambiguate against) is a real policy choice this
   design flags rather than resolves.
4. **Weights artifact: committed vs. rebuilt in CI.** This design commits
   `weights/classifier.v1.<sha8>.ts` to git (small enough, and matching
   "regen is a no-op") and has CI *regenerate-and-diff* rather than
   *regenerate-and-use*. The alternative — CI trains fresh every run and
   never checks in weights at all — was rejected because (a) it makes a
   red CI run on an unrelated PR possible if training has any hidden
   nondeterminism, and (b) it breaks the "immutable, content-addressed,
   pinned by manifest" discipline CLAUDE.md asks of every weight
   artifact, twin-sized or not. Floating-point determinism *within* a
   fixed Node major version, single-threaded, is expected to hold (see
   "Reproducibility" above) — but this has not been empirically proven
   the way `h32`'s integer arithmetic has been proven bit-exact across
   engines; a Node-version bump someday causing a diff here is a real,
   if small, residual risk worth the orchestrator's awareness.
5. **Exact L1/L2 handoff rule (resolved in this draft, flagged for
   sign-off):** L2 runs only on `l1.reason === "unknown"`, never on
   `l1.ok === true` (tier-1 always wins) or `l1.reason ∈ {"empty",
   "ambiguous"}` (both already have a defined, cheaper answer). This is
   the design's recommendation, not something DELTA states explicitly —
   worth an explicit sign-off given how much of the routing logic hinges
   on it.
6. **`fillSlot`'s "scan the whole utterance" grounding is more permissive
   than L1's own "grounding only ever sees tokens after the matched verb
   phrase."** This is intentional (the classifier, not a position in the
   token stream, is what identified the verb) but means a pathological
   utterance containing two direction words, or a noun phrase that also
   contains an unrelated affordance name, could ground differently than
   a human would expect. Not covered by the corpus/adversarial suites in
   this draft — worth a small dedicated test category if the orchestrator
   wants it locked down before implementation rather than discovered
   during playtesting.
7. **`tools/check-bans.mjs` scope extension to `tools/lang/`** is
   proposed but not yet real — until it's added, the "no `Math.random`"
   rule for the generator/trainer is enforced only by design intent and
   code review, not CI, for the one PR cycle where L2 lands. Whether to
   land the ban-check extension in the same PR as L2 (this design's
   recommendation) or as a tiny separate housekeeping PR is the
   orchestrator's call.
8. **Int8 quantization of the weight matrix** is scoped out (not needed
   for the `<10ms` DoD, artifact is already small enough to commit as
   float32 JSON-ish TS). Worth revisiting only if a future task wants a
   *smaller bundle*, not a faster classifier — flagged so it isn't
   silently assumed done.

## Orchestrator decisions (locks this design for implementation)

Resolved 2026-07-06 by the orchestrating agent.

1. **Weights are a committed, pinned artifact; CI validates BEHAVIOR, not
   bit-identical retraining (correction to §"DoD"/OQ4).** Drop the
   `train_classifier.js` + `git diff weights/` step from CI. Float SGD is
   NOT portably bit-reproducible — `Math.exp`/`Math.log` (softmax/
   cross-entropy) vary across platform libm/V8 builds, so a dev-trained
   vs. CI-retrained diff would flake. Instead:
   - **Keep** the CORPUS drift check (`gen_utterances.js` + `git diff`
     the corpus/adversarial JSON) — that generator is deterministic
     (seeded `pick`/`rint` over integer `h32`, string templates; no
     `Math.exp`), so it IS a legitimate no-op gate.
   - CI loads the **committed** weights (`--eval-only`, never retrains)
     and asserts held-out accuracy / ECE / adversarial-reject / perf.
   This is doctrine #8 applied correctly ("models are **eval-gated** build
   artifacts") — you eval the artifact, you don't re-derive it in CI.
   `train_classifier.js` produces/updates the weights locally; they're
   committed once, content-addressed + manifest-pinned.
2. **DoD bars (starting values, tune once real numbers are in):** held-out
   accuracy ≥ 0.90, ECE ≤ 0.08, adversarial reject = **100%** (hard bar,
   no tolerance), perf < 10ms/utterance batch. Documented as a
   templated-corpus regression guard, NOT a real-world quality claim
   (OQ1) — say so in the report and PR.
3. **L2 runs iff `l1.reason === "unknown"` (accept OQ5).** Tier-1 always
   wins; `empty`/`ambiguous` pass through unchanged.
4. **`say`/`party`/`emote` medium band: execute at ≥0.65 (accept OQ3).**
   Low-stakes — misclassifying chat-shaped text just sends it as text,
   the same outcome as the `unknown`→`say` fallback. No harm; keep simple.
5. **Extend `tools/check-bans.mjs` to scan `tools/lang/` IN THIS PR
   (OQ7).** The generator/trainer's "no `Math.random`/`Date.now`" rule
   must be CI-enforced, not just design intent.
6. **Add a small `fillSlot` edge-case test category (OQ6):** whole-
   utterance grounding with two direction words / a noun phrase that also
   contains an unrelated affordance name — lock the permissive-scan
   behavior with tests rather than discover it in play.
7. Quantization (OQ8) and teacher-model paraphrase augmentation (§synthetic
   data "Deferred") stay deferred — L3 brings the real data pipeline.

Everything else in the design is accepted as written (the L1+L2
composition, the hashed-ngram logistic model reusing `h32`, the
softmax+temperature+trained-unknown+0.50-floor confidence stack, the
`route()` output-shape-preserving contract, and the file layout).
