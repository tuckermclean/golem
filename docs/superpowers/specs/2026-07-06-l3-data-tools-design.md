# `tools/` (L3) — Model Data Tools — Design

**Date:** 2026-07-06
**Status:** Draft — for orchestrator review before implementation begins
**Topic:** DELTA.md Phase 3, task L3 — the model data tools that absorb
old SPEC §8 step 4: harvest control strings from real worldgen, drive a
teacher model to produce target outputs, and gate everything through an
extended grounding validator. This is a design document only; no code
changes are made by it.

## Scope

DELTA §L3, verbatim:

> Model data tools (absorbs old SPEC step 4). `tools/model/harvest.js`
> (walk real worldgen across ≥2000 seeds; emit control strings for ALL
> trained tasks A–F: facts→prose, NL→command, denial→explanation,
> bounded NPC reply, command decomposition, reference resolution),
> `generate.py` (batched teacher-model driver; variant count, register
> rotation, exclusion lists), `stats.py`. Extend `tools/validate.py` to
> all six task types (command outputs must parse and ground; NPC
> replies must not assert facts outside the envelope).
> DoD: one real generated batch ≥85% pass rate; quarantine populated
> and eyeballed (agent: include 20 sampled rejects in the PR
> description).

Two things in that brief do not survive contact with this sandbox
unchanged, and this design is explicit about both up front rather than
discovering them mid-implementation.

**Path discrepancy.** DELTA says `tools/model/harvest.js`. The repo's
actual convention — `Makefile`'s `data-batch` target, `tools/validate.py`
and `tools/test_validate.py` already living there, DELTA §0.3's own
"Python only under `tools/model/` and `train/`" carve-out notwithstanding
— is a flat `tools/` directory with everything L3 needs
(`tools/harvest.js`, `tools/generate.py`, `tools/validate.py`,
`tools/stats.py`), matching the Makefile that already calls them at
those paths. This design follows the repo, not the DELTA path string,
per CLAUDE.md's instruction to treat DELTA as authoritative on
*sequencing* and VISION/CLAUDE.md as authoritative on *principle* — file
layout is neither; it's an existing, working artifact that already
disagrees with DELTA's path text once (`tools/validate.py`, not
`tools/model/validate.py`), and this design keeps that precedent rather
than introducing a `tools/model/` split for only the new files. Flagged
for the orchestrator; trivial to relocate later if that's wrong.

**No teacher-model API.** DELTA assumes an external teacher model
`generate.py` calls over the network. This sandbox has none. The
orchestrator's plan, which this design builds `generate.py` around: a
**teacher-injection seam** — an abstract "given a control string (+
task-specific hints), produce the one surface-form string the task
needs" interface, with two implementations:

(a) `ExternalAPITeacher` — documented, calls a real hosted model. Not
    runnable here; exists so a real production run has a real path.
(b) `AgentAuthoredTeacher` — reads a file of outputs the orchestrator's
    Sonnet subagents already wrote, out of band. **This is the only
    implementation that runs in this sandbox**, and the only one this
    design exercises for the DoD batch.

Every task design below is written so that (b) is sufficient to produce
a real, validatable batch, and so that swapping in (a) later requires no
change to `harvest.js`, `validate.py`, or `stats.py` — only a different
`--teacher` flag to `generate.py`.

## The unifying principle

Every one of the six tasks splits cleanly into **facts** (deterministic,
harvested straight from real worldgen/module state, never invented) and
**one surface-form string** the teacher is asked to write. `harvest.js`
computes every fact — including, where relevant, the *ground-truth
answer* — before any teacher is involved. The teacher never gets to
originate a fact; it only gets to phrase, elaborate, or paraphrase facts
it's handed. `validate.py`'s job, for all six tasks, is exactly what it
already is for task A: mechanically check that the teacher's one string
didn't smuggle in a fact it wasn't given. This is VISION law 5 ("no
model — twin, teacher, or remote — may... assert facts") applied one
level up the pipeline, to the teacher that trains the twin, not just the
twin itself. It is also what makes six new validators tractable to
design in one document: each is "the task-A grounding check, generalized
to a different fact-set and a different surface form," not six
unrelated problems.

Concretely, per task, `harvest.js` emits a JSONL row shaped:

```json
{"task": "A", "seed": "1042", "id": "1042-room3-move",
 "control": "EVENT:move THEME:deep_mine ROOM:hall EXITS:n,e ITEMS:none MOB:none",
 "teacherSlot": "prose",
 "groundTruth": {}}
```

`groundTruth` is empty for task A (the prose *is* the answer — there is
nothing to check equality against, only grounding). For B/C/E/F it holds
the already-known answer (a canonical command, a denial reason code, an
ordered command list, a resolved referent) that the teacher never sees
as something to invent — it's carried through to the final pair
unchanged, and `validate.py` re-derives it independently (via
`packages/language`'s `route()`/`groundNoun`, or a small keyword table)
to confirm the teacher's string is consistent with it.

## Task A — facts → prose (existing; documented as the template)

This is `tools/validate.py` today, unchanged. Control-string format
(read off `parse_control`/`violations` and `test_validate.py`'s fixtures,
which is the actual accepted schema — richer than the live
`ROOM:/TONE:/THEME:/DEPTH:` trace `games/golem-grid/src/main.js`'s
`roomBeat`/`proseFor` emit today, since those traces were never meant to
be a training corpus, just an on-screen debug annotation):

```
EVENT:<move|look|join|take|take_prize|read|light_warn|win|lose>
THEME:<theme> [ROOM:<kind> TONE:<tone> DEPTH:<n>]
EXITS:<n,s,e,w subset>   -- required only when EVENT ∈ {move,look,join}
ITEMS:<name(+name)*|none>
MOB:<name|none>
```

- `EXITS` drives the "Ways out: n, e." final-line contract and the
  phantom-direction body-text check — both existing, both untouched.
- `ITEMS`/`MOB` are "names the prose is required to mention" (room decor
  for move/look/join; the taken/read/prized thing itself for
  take/take_prize/read) and "must not invent a mob when absent."
- Target output: the prose string. Validator: `violations()`, unchanged.

**One real gap, worth fixing here rather than carrying forward.**
`test_validate.py` already flags it: `parse_control` splits the whole
control string on spaces, so a multi-word name (`"green coin"`) can't be
expressed — `ITEMS:green coin` would break the `KEY:VALUE` tokenization
of everything after it. `harvest.js` needs multi-word item/mob names
(most of `THEMES[...].loot` in `games/golem-grid/shared/themes.js` are
two words: "wax stub", "cracked seal", "cold lantern"...). Proposed fix,
backward compatible with every existing single-word test: encode
multi-word names with underscores in the control string
(`ITEMS:green_coin+brass_stylus`), and have `parse_control` replace `_`
→ ` ` when it extracts item/mob names for the prose-matching regex
(`it.split()[-1]` becomes, effectively, matching on the last real word
of the underscore-joined name — no change needed to the *matching* logic
at all, since it already only checks the last word). Single-word names
are untouched by this (no underscore, no-op). This is a deliberate,
named change to a function `test_validate.py` pins today — call it out
explicitly in the PR, don't bundle it silently.

## Task B — NL → command

**Control:**
```
TASK:B THEME:<theme> ROOM:<kind>
AFFORD:<verb:target:name(+alias)*;verb:target:name...>
CMD:<ground-truth canonical command, e.g. "move 0 -1" | "take green_coin"
     | "read" | "whisper Bram hello">
```
`AFFORD` is a harvested, serialized `Affordance[]` (packages/language's
own type) built straight from the harvested tile's real state: an item
on the tile → a `take` affordance; a player present → a `whisper`
target; adjacent lore → nothing extra (read takes no argument, per
`parse.ts`). `CMD` is the *actual* legal command at that state — computed
by literally importing `games/golem-grid/shared/module.js`'s `validate()`
and picking one of the commands it accepts (never denies) from that
tile, so the ground truth can never drift from the real game rules.

**teacherSlot:** `"utterance"` — a natural phrasing a player might type
to invoke `CMD` in this context. This mirrors `tools/lang/
gen_utterances.js`'s L2 corpus in spirit (naturalistic paraphrase
generation seeded by real affordances) but serves a different purpose:
L2's synthetic corpus trains a *classifier label*; this trains the twin
on cases language alone, plus context, must resolve — deliberately
biased toward the long tail L1's table-match and L2's classifier
*don't* confidently resolve (see Open Questions — this is a soft
priority, not a hard gate here).

**Final pair:** `in = "THEME:... ROOM:... AFFORD:... UTTERANCE:<teacher
text>"`, `out = CMD` (carried through unchanged — the teacher never
writes the answer, only the question-shaped side of it).

**Validator:** parse `AFFORD` back into an `Affordance[]`; call
`packages/language`'s `route(utterance, {affordances})` (built `dist/`,
reused verbatim — the whole point of L1/L2 existing is that grounding
logic is not reinvented per consumer); require `ok:true`; serialize the
resulting `Intent` back to the same wire-command grammar
`module.js`'s `validate()` parses (`move dx dy` / `take item` / `read` /
`say text` / `party text` / `whisper to text` / `emote text`) and assert
string equality with `out`. Mismatch or `ok:false` → quarantine
(`ungrounded-command` / `command-mismatch`). As a **soft**, non-quarantine
quality signal (reported by `stats.py`, not rejected by `validate.py`):
flag pairs where L1's *bare* `parse()` (tier 1 alone, without L2) already
resolves the utterance — those are real, but low-value twin training
data, since L1 already has them for free.

## Task C — denial → explanation

**Control:**
```
TASK:C THEME:<theme> EVENT:<attempted verb>
REASON:<WALL|NOTHING_HERE|WRONG_ITEM|NO_LORE|NO_SUCH_PLAYER|UNKNOWN_VERB|GAME_OVER>
[relevant context fields, e.g. DIR:<attempted direction>]
```
`REASON` is not re-invented prose describing when each denial fires —
it's read directly off `module.js`'s `validate()` return value.
`harvest.js` deliberately issues an illegal command at a harvested tile
(walk into a wall, `take` on an empty tile, `read` with no lore
adjacent, etc.) through the *real* `validate()`, and tags the row with
whichever of the seven literal `deny:` strings actually came back. This
means the REASON taxonomy can never drift out of sync with the code —
if `module.js`'s denial strings change, harvesting against the live
import surfaces the new string immediately rather than silently
training against a stale enum.

**teacherSlot:** `"explanation"` — an in-theme sentence elaborating the
denial ("Stone does not negotiate" → something more atmospheric) without
inventing a *different* reason or asserting facts not in `control`.

**Validator:** reuse task A's phantom-exit / missing-item / phantom-mob
machinery against whatever room-context fields `harvest.js` attaches
(e.g., a `WALL` denial's explanation must not claim a *different*
direction was blocked, must not name an item/mob that isn't there); add
a small `REASON → {must-not-mention keyword set}` table so a `WALL`
explanation can't accidentally read like a `NOTHING_HERE` explanation
(cross-reason leakage is its own grounding failure, specific to this
task); reuse banned-register and sentence-budget checks unchanged.

## Task D — bounded NPC reply

**Control:**
```
TASK:D THEME:<theme> TOPIC:<room|theme_lore|item|mob|distant>
KNOWS:<fact(+fact)*>  DOESNT_KNOW:<fact(+fact)*>
QUESTION:<a canned player question, from a small fixed authored bank —
          NOT teacher-generated; this is scene-setting, not creative
          writing>
```
`KNOWS` is drawn from the harvested tile/room's real facts (room kind,
theme lore fragment if present nearby, item/mob names if present).
`DOESNT_KNOW` is a real fact from a *different, distant* room in the
*same* dungeon — genuinely true of the world, genuinely outside this
envelope — used to build negative/refusal training rows where the
correct reply is a graceful non-answer, never a fabrication.

**teacherSlot:** `"reply"` — the NPC's in-character response.

**Validator:** any noun drawn from `DOESNT_KNOW` appearing in `reply` →
`envelope-violation` (this is the generalized "iron rule": task A checks
"don't mention absent items/mobs," task D checks "don't mention facts
outside this envelope" — same shape, wider fact universe). For
`TOPIC:distant` rows, passing means the reply contains none of the
`DOESNT_KNOW` nouns — deliberately *not* requiring one specific refusal
phrasing (authoring a canned deflection line is a table/register
decision, out of this task's mechanical scope). Reuse banned-register
and sentence-budget checks.

**Honest caveat, stated once here rather than buried:** golem-grid has
no live, interactive NPCs today — its "mobs" are decorative flavor, not
dialogue partners (see `games/golem-grid/shared/module.js`; there is no
`ask`/`talk` verb). This task is designed against a *stand-in* envelope
built entirely from world facts, anticipating L7's real context
compiler (Phase 3, later) and some-hero's actual NPCs (Phase 4). The
grounding mechanics designed here should transfer directly once a real
NPC target exists, but the training data this produces *before* that
exists is synthetic against a synthetic target — see Open Questions.

## Task E — command decomposition

**Control:**
```
TASK:E THEME:<theme> AFFORD:<...>
CMDS:<cmd1|cmd2|cmd3>   -- an ORDERED ground-truth sequence, 2-3 primitives
```
`harvest.js` builds `CMDS` by literally simulating the sequence through
`module.js`'s real `validate()`/`reduce()` (take real dungeons, so
`take`-then-`move` is only ever offered as a pair if the second command
is *still* legal in the state the first command produces — e.g. never
"walk into a wall, then take", since that first command wasn't legal to
begin with). This is the same "run the real code, don't reimplement its
rules" discipline as task C's `REASON` sourcing.

**teacherSlot:** `"utterance"` — one natural compound sentence expressing
the sequence ("grab the coin, then head north").

**Final pair:** `in = context + compound utterance`, `out = CMDS`
unchanged.

**Validator — the most mechanically involved of the six.** Split the
utterance on connectives (`then`/`and`/`,`/`;` — a small deterministic
heuristic, new code, no existing precedent: L1/L2 are explicitly
single-intent parsers by design, "one key, one meaning," and neither
splits compound utterances today). Route each segment independently via
`route()`, **threading a simulated affordance list forward between
segments** (e.g., after a `take` segment resolves, drop that item's
affordance before routing the next segment — mirroring what a real
player experiences turn to turn). Require the resulting ordered command
list to exactly equal `CMDS`. Any segment that fails to parse/ground, or
a length/order mismatch → quarantine (`segment-ungrounded` /
`decomposition-mismatch`). Flagged in Open Questions as the highest
implementation-risk validator: the splitting heuristic has real failure
modes (three-way splits, ambiguous connectives) that don't have an
existing library function to fall back on.

## Task F — reference resolution

**Control:**
```
TASK:F THEME:<theme>
ANTECEDENT_TEXT:<a canned, deterministic sentence establishing an entity
                  — templated, NOT teacher-authored>
REFERENT:<ground-truth target id, e.g. item:green_coin@12,7>
AFFORD:<...current-room affordances, PLUS one entry for REFERENT carrying
        pronoun aliases: aliases:["it","that","the thing"]>
```
**teacherSlot:** `"utterance"` — a natural pronoun-bearing follow-up
("take it", "grab that", "look at the thing").

**Final pair:** `in = antecedent + context + follow-up utterance`,
`out = REFERENT` unchanged.

**Validator — the cleanest of the six, a pure reuse.** `ground.ts`'s
`Affordance.aliases` already exists precisely to let a caller register
extra names for a target; registering `"it"/"that"/"the thing"` as
aliases for the antecedent entity is a legitimate, already-supported use
of that field, not new grounding logic. Run `route(utterance,
affordances)`; require `ok:true` and `intent.item`/`intent.target ===
REFERENT`. No new parsing machinery needed — this task is "task B, with
one extra affordance row."

## `harvest.js`

Walks a deterministic ≥2000-seed range (e.g. numeric string seeds
`"0"`..`"1999"` — `genDungeon(seed)` takes any string). For each seed,
calls `genDungeon` once and derives, per room/tile, the facts each task
needs; every internal choice of *which* room/tile/topic to sample per
seed goes through `@golem-engine/random`'s `channel(seed, "harvest",
task, ...)` (never `Math.random` — `tools/check-bans.mjs`'s `EXTRA_ROOTS`
needs `tools/` added alongside the existing `tools/lang/` entry, the
same obligation L2 already carries). Per seed, emits a bounded, not
combinatorial, sample (roughly: 1 control per room for task A,
a handful of take/read/denial rows for B/C, one or two D/E/F rows) —
full ≥2000-seed coverage at that density is tens of thousands of lines,
not millions.

**Output:** JSONL, one control row per line, shape as in "The unifying
principle" above (`task`, `seed`, `id`, `control`, `teacherSlot`,
`groundTruth`), sorted deterministically by `(seed, task, id)` so
re-running `harvest.js` on an unchanged repo reproduces the file
byte-for-byte — the same "regen is a no-op" property `tools/lang/
gen_utterances.js` already documents and is tested for.

## `generate.py`

```
class Teacher(ABC):
    def generate(self, task, control, teacher_slot, ground_truth,
                 register) -> str: ...

class ExternalAPITeacher(Teacher):
    # Documented, NOT runnable here: a real hosted-model call (model id,
    # batching, retry/backoff). The DELTA-assumed production path.

class AgentAuthoredTeacher(Teacher):
    # The ONLY implementation exercised in this sandbox. Does not spawn
    # agents itself — the orchestrator fans out Agent/Task calls out of
    # band, collects each agent's returned text, and writes
    # {"id": ..., "output": "..."} lines to a file BEFORE generate.py
    # runs. This class's job is purely to join harvest rows against
    # that file by "id", assemble the final (in, out) pair per the
    # per-task substitution rule above, and error loudly (not skip
    # silently) on any harvested id with no matching output.
```

CLI: `--controls work/controls.jsonl --teacher {external|file}
--teacher-outputs work/agent-outputs.jsonl --variants k
--register-rotation plain,terse,lush --exclude work/seen-hashes.txt
--out work/raw.jsonl`.

- **Variant count / register rotation:** `k` variants per control line,
  each tagged with a register rotated deterministically (round-robin via
  a `channel`-seeded pick over a small authored register vocabulary —
  DELTA's own "register rotation" phrase, applied literally; the actual
  register *taxonomy* is not specified anywhere upstream today and needs
  a real authored decision before this is more than a placeholder — see
  Open Questions).
- **Exclusion lists:** a running set of normalized-output hashes
  (lowercased, whitespace-collapsed, punctuation-stripped); a variant
  whose hash already exists is logged as a near-duplicate and excluded
  from `raw.jsonl` (reported by `stats.py`, not silently dropped). For
  `AgentAuthoredTeacher`, the orchestrator's per-agent prompt should
  itself ask for `k` *distinct* variants — `generate.py`'s dedup is a
  mechanical safety net on top of that, not a substitute for it.

## `validate.py`, extended to all six tasks

Add a `task` field to every row (default `"A"` for full backward
compatibility with existing `raw.jsonl` files and with
`test_validate.py`'s direct calls to `violations(control, prose)`, which
remain valid, unchanged, as the task-A path). Factor the existing
function into `violations_a(control, prose)` and add `violations_b`
through `violations_f`, dispatched by a small table:

```python
def violations(control, prose, task="A", **kw):
    return DISPATCH[task](control, prose, **kw)
```

B/E/F need `packages/language`'s compiled `route()`/`groundNoun` for
grounding, which is TypeScript compiled to `dist/` — Python calling it
means a **new cross-language integration point** that has no precedent
in this repo today (`tools/lang/gen_utterances.js` calls `parse()`
directly because it's already JS; `validate.py` has zero JS dependency
today). Proposed shape: a small batching bridge script (e.g. `tools/
lang_bridge.mjs`) that reads many `{utterance, affordances}` requests
from stdin and writes many `{ok, intent}` results to stdout in one
process — `validate.py` shells out to it once per validation run, not
once per pair, for throughput. Flagged as a real implementation risk in
Open Questions, not hand-waved.

Rejects still go to quarantine (never discarded), each tagged with a
`violations` list identical in spirit to today's (`missing-item:...`,
`phantom-exit:...`, plus the new task-specific reasons named above:
`ungrounded-command`, `command-mismatch`, `envelope-violation`,
`segment-ungrounded`, `decomposition-mismatch`, `unresolved-referent`).

## `stats.py`

Reads `clean.jsonl`/`quarantine.jsonl` (and optionally `raw.jsonl` for
pre-validation counts). Reports, per task: pass/quarantine rate;
quarantine-reason histogram (top violation reasons); register
distribution; output-length distribution (mean/percentiles, feeding the
sentence-budget conversation); near-duplicate rate (from `generate.py`'s
exclusion log). Emits both a human-readable summary and a small JSON
blob so CI (or the DoD report) can gate on `--min-pass-rate`-style
thresholds per task, matching `validate.py`'s existing convention rather
than inventing a new one.

## The DoD batch — agents-as-teacher, concretely

The full ≥2000-seed corpus is not what runs through agents for this
DoD — that's L4's training-corpus scale problem, not L3's. A tractable
real batch for *this* DoD: harvest from roughly 20–30 seeds (not 2000),
at harvest.js's normal per-seed sampling density, yielding on the order
of 400–600 control rows spread across all six tasks. Group those into
batches of ~20–25 controls of the same task per agent call (so the
agent's prompt carries one clear task brief, the control-string schema,
the exact grounding rule it must satisfy, and 2–3 worked examples,
rather than one round-trip per single control string) — roughly 20
parallel/background Agent calls total. Each agent returns a JSONL blob
of `{id, output}` rows; the orchestrator concatenates all of them into
`work/agent-outputs.jsonl`; `generate.py --teacher file` assembles pairs;
`validate.py --min-pass-rate 0.85` gates; `stats.py` reports; the
orchestrator hand-samples 20 quarantined rows (spread across tasks and
violation reasons, not all from one task) to paste into the PR
description, per DoD.

## Decomposition — proposed 2 sub-PRs (with a documented fallback to 3)

**PR1 — the deterministic, self-verifying pipeline.** `harvest.js` (all
six tasks) + `validate.py` extended to all six + `stats.py` + unit tests
+ the underscore-encoding fix to task A's `parse_control` + `tools/`
added to `check-bans.mjs`'s `EXTRA_ROOTS`. No real teacher involved:
exercise the full pipeline against a trivial deterministic **stub**
teacher (reusing golem-grid's own existing template-stub prose function
at ▶GOLEM-PLUG◀ for task A, since it's already pure and channel-seeded;
simple deterministic template fillers for B–F, clearly labeled as smoke
data, not training data). This PR is fully machine-checkable in CI on
every push, with zero dependency on agents or an external API — it
proves the plumbing, not the corpus.

**PR2 — the teacher seam + the real DoD batch.** `generate.py`'s
`Teacher` abstraction (both implementations), the real agents-as-teacher
batch described above, the ≥85% pass-rate report, and the 20 sampled
rejects in the PR description. This is where real (agent-authored)
teacher quality enters the corpus for the first time.

**Optional PR3** (fallback, not the default plan): split task C/D's
envelope logic out of PR1 into its own follow-up once real playtesting
of the DoD batch's C/D outputs shows the envelope rules need iteration —
these two are the least-precedented of the six (no fixed `REASON`
prose exists yet to imitate; no live NPC exists at all) and may not
survive first contact with real generated data unchanged.

## Open questions / risks (honestly)

1. **Teacher-quality variance, agents-as-teacher vs. a real external
   teacher.** Sonnet subagents given an explicit "don't invent facts
   outside this control string" instruction are likely to comply *more*
   reliably than a typical high-throughput external-API teacher run
   would by default — so clearing ≥85% here plausibly validates the
   *validator and pipeline*, not that a real production teacher (L4's
   actual concern) will also clear it. Don't over-read this DoD's pass
   rate as a proof about the eventual real-teacher pipeline.
2. **Python/pytest availability.** Confirmed in this sandbox right now:
   `import pytest` fails (not installed). CI's `validator` job does
   `pip install pytest` before running, so the *extended* `test_validate.py`
   will work in CI exactly as today's does. Locally, new tests should be
   written in the same plain `def test_...(): assert ...` style
   `test_validate.py` already uses (no fixtures, no `@pytest.mark.
   parametrize`) so they remain runnable via a trivial fallback script
   (introspect and call every module-level `test_*` function) if a
   contributor's sandbox also lacks pytest — don't lean on pytest-only
   features.
3. **New Python↔Node bridge for B/E/F grounding.** No precedent exists
   today (`validate.py` has zero JS dependency; `gen_utterances.js`
   calls `parse()` because it's already JS). The batching subprocess
   bridge sketched above is new integration surface with its own
   performance and error-handling design that this document only
   sketches — worth a short spike before committing to PR1's scope.
4. **Task E's compound-utterance splitter has no existing library to
   reuse.** L1/L2 are deliberately single-intent ("one key, one
   meaning"). The connective-splitting heuristic is new code with real
   ambiguity (three-way splits, "and" used inside a noun phrase vs. as a
   connective) — the highest-effort, highest-uncertainty validator of
   the six.
5. **Task D's envelope is a stand-in, not a real feature.** golem-grid
   has no interactive NPCs; the KNOWS/DOESNT_KNOW mechanics designed
   here are built from world facts anticipating L7's context compiler
   and some-hero's actual NPCs. The mechanics should transfer, but the
   training value of data produced against this stand-in, before a real
   NPC target exists, is genuinely speculative.
6. **Register-rotation taxonomy is invented, not authored.** DELTA names
   "register rotation" as a knob but nowhere upstream defines what the
   registers actually are. Per doctrine #7 ("improve tables before
   improving the generator"), this needs a real authored decision (even
   a short one) before `generate.py`'s rotation is more than a
   placeholder enum.
7. **Corpus scale.** This DoD's real batch (hundreds of rows) is two to
   three orders of magnitude smaller than the eventual ≥2000-seed / 100–
   300K-pair corpus L4 needs. Agents-as-teacher does not obviously scale
   to that size (cost, wall-clock, per-agent supervision) — L3 makes the
   seam clean for a future external teacher to take over at that scale,
   but does not itself solve the scale problem.
8. **The underscore-encoding fix touches a pinned contract.** It's
   backward compatible (single-word names unaffected) but changes a
   function `test_validate.py` explicitly documents as having a known
   gap — call it out as a deliberate, reviewed change in the PR, not a
   silent side effect of "extending the validator."

## Orchestrator decisions (locks this design for implementation)

Resolved 2026-07-06 by the orchestrating agent.

1. **Facts + single surface-form split: accepted** (the design's core — the teacher only phrases facts it's handed; all 6 validators are grounding checks). Flat `tools/` paths accepted.
2. **Decomposition:** **PR1** = `harvest.js` + all-6 `validate.py` + `stats.py` + tests, driven by a **deterministic stub teacher** (fully CI-checkable, no agents). **PR2** = `generate.py`'s teacher seam + the real **agents-as-teacher** batch (≥85% + quarantine + 20 sampled rejects). PR3 (optional) = C/D envelope iteration. Implement PR1 now.
3. **pytest is NOT installed locally** (only CI installs it). New L3 Python tests use **stdlib `unittest`** (runnable via `python3 -m unittest` locally AND in CI); keep the existing pytest `test_validate.py` (task A) passing, and wire the CI `validator` job to also run the unittest tests.
4. **Python↔Node grounding bridge (B/E/F):** `validate.py` shells out to a small **node parse-CLI** (`tools/lang/parse-cli.mjs`) that runs L1's real `route()`/`parse()` and returns JSON — grounding is validated by the REAL parser, never reimplemented in Python. Batch the calls (one node process per validation run) for speed.
5. **Task A multi-word-item fix:** apply the underscore-encoding fix, but keep it **backward-compatible** and update `test_validate.py` minimally if needed — task A's CI test MUST stay green.
6. **Task E splitter:** conservative — split only on a small authored connective set ("and then"/"then"/"and"/","); every resulting primitive must independently validate, else the whole decomposition is quarantined. Accept it's new logic; keep it minimal.
7. **Task D envelope** is a documented **stand-in** (near/distant-room facts) until real NPCs (L7) — it exercises the envelope-check machinery honestly labeled as placeholder.
8. **Register rotation:** minimal, documented set; flag that a proper register taxonomy is **authored content** (doctrine #7) for a follow-up, not invented wholesale now.
9. **The DoD batch is a SMOKE batch** (one real batch, hundreds of controls), 2–3 orders smaller than L4's eventual corpus — documented as such; **≥85% is against agent-teacher output** (optimistic vs. a real external teacher), stated honestly.
10. **No `Math.random`/`Date.now`** — harvest.js seeded via `@golem-engine/random`; extend `check-bans` to cover `tools/*.js` (harvest.js) if not already.
