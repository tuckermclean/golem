# VISION.md — Golem Engine
*The single vision for the rewrite that unifies adventure, topdown-puzzle,
some-hero, and golem.*

## The sentence

A deterministic, replayable semantic world machine whose only voice is a
tiny local language model — a linguistic twin of the machine itself,
trained on it, incapable by construction of lying about it — proven by
shipping SOME HERO on it.

Motto: **The engine knows. The golem speaks.**

## What this is (and is not)

This is a product effort with an engine as a byproduct, not an engine
effort with games as a demo. The four repositories were four approaches
to one thing: an authored simulation with a generative surface. The
rewrite ships that thing once, as SOME HERO, on a kernel clean enough
that golem-grid and topdown-puzzle run on it as conformance fixtures and
adventure's world imports as a content pack.

The distinctive artifact — the reason this is not just another roguelike
engine — is the **twin**: a ~15M-parameter, 5–15 MB, int8, WASM-compiled
local model trained on the game's own semantic universe, doing four jobs
through one set of weights:

1. facts → prose            (narration, the Ledger's voice)
2. language → command       (the long tail the classifier can't parse)
3. denial → explanation     ("why can't I open this?")
4. NPC dialogue             (bounded by engine-supplied truth envelopes)

Fronted by latency tiers so it is never on the critical path:
direct controls → deterministic parser → tiny intent classifier
(intent + slots + confidence) → twin → and ALWAYS terminating in the
authoritative validator. "Go north" never touches the decoder. Every
model output is either a proposal (commands, validated like any other)
or presentation (prose, affecting nothing).

## The constitution

1. **The world is a pure function.** `world(contentHash, seed) → facts`.
   Never stored, never sent. Changing its output is a MAJOR version.
2. **State is deltas; the save is `contentHash + seed + event log`**
   (plus optional checkpoints). Replay is bit-identical, always.
3. **One authority sequences; the reducer is pure and identity-blind.**
   Commands are validated at the authority boundary; clients that apply
   the same events in the same order are provably identical.
4. **Perception is per-viewer and knowledge is first-class state.**
   What exists, what changed, what this viewer observed, what the
   character knows, and what survives death are five different things.
5. **The model never owns truth.** No model — twin, teacher, or remote —
   may mutate state, mint entity IDs, or assert facts. It proposes
   commands and renders prose. This is the one law with no exceptions.
6. **Latency is tiered.** Common commands resolve in the parser or
   classifier in milliseconds; the twin earns its seconds only on
   ambiguity, conversation, and narration. Confidence is load-bearing:
   the classifier must be able to say "unknown."
7. **Content is data, compiled.** YAML/ASCII sources → schema validation
   → safe condition language → reference resolution → content hash →
   immutable pack. No eval, no exec, no code in content, ever again.
8. **Meaning is authored upstream.** Tables, grammars, corpus, weights
   are frozen authorship; the generator is a librarian. Improve tables
   before improving generators.
9. **Hallucination is a failing test.** Models are eval-gated, immutable,
   content-addressed build artifacts, pinned by manifest. New content is
   a table/corpus change; new voice is a fine-tune; one model serves all
   themes and all games on the engine.
10. **Presentation-independent events.** The game must be fully playable
    with narration off and renderable by any client (canvas, terminal,
    headless test). Systems emit events; renderers, audio, and the
    Ledger react independently.
11. **Determinism for what the world knows; private authority entropy
    for what it hides** (hidden roles, secret deals).
12. **The flagship rule.** Nothing enters the engine that SOME HERO's
    next milestone does not need. Generality is proven by the fixtures
    (golem-grid, topdown-puzzle), never pursued for its own sake.

## The four bequests — and the four deaths

**golem** bequeaths the constitution, the kernel behaviors (hash/channels,
derived world, deltas, validation, sequencing, replay, perception, the
narrator seam), the model pipeline (harvest → teacher → validator →
train → eval gate → immutable weights), and the test religion.
*Dies:* the single-file layout (becomes a reference fixture and golden
test); its game mechanics (light pool, extraction, traitor) demote from
law to content.

**some-hero** bequeaths the game: all writing, content, art, audio,
quests, puzzles, bosses, credentials, the credit satire, the Ledger's
personality, the pinned-room worldgen contract, the meta-progression
distinction, the pure rule helpers, and — above all — 165+ tests that
become the behavioral specification the port must satisfy.
*Dies:* the mutable game-state aggregate, fx-coupled systems, ambient
Math.random, localStorage saves.

**topdown-puzzle** bequeaths the ASCII level notation (kept as a
supported importer), every authored level as a regression/replay/solver
fixture, the push-chain mechanics as the kernel's second consumer, and
the edit→serialize→playtest-immediately workflow.
*Dies:* Phaser as engine, sprites as authoritative entities, timers and
tweens as simulation clocks.

**adventure** bequeaths vocabulary, not code: the semantic world model
(regions, portals, containers, characters, conditions), the affordance
query as a core kernel API (`affordances(observation, actor) →
[{verb, target, enabled, reason}]` — powering text commands, context
menus, NPC planning, tutorials, and twin grounding), and its authored
world as an imported sample content pack.
*Dies:* the entire Python runtime; eval/exec in content; AI characters
with authority or canonical memory. NPC memory lives in engine state; a
deterministic context compiler decides what the twin may know per turn.

## The shape (start here, grow only on demand)

    packages/
      kernel/      commands, events, reducer, observe, affordances
      random/      hash, named channels
      content/     schema, safe conditions, compiler, hashing
      world/       generation, pinned rooms, regions, grid backend
      language/    parser, classifier, twin runtime (WASM), context
                   compiler, model pipeline tooling
      net/         protocol (HELLO/SNAPSHOT/CMD/EVENT/DENY), transports
      clients/     canvas (some-hero's renderer behind an adapter),
                   terminal/chat
      testkit/     golden seeds, replay equality, solver, prose golden,
                   characterization harnesses
    games/
      some-hero/   the flagship (content pack + game module)
      golem-grid/  kernel fixture
      topdown-puzzle/  kernel fixture
    imported-content/
      adventure/

Eight packages, not twenty-five. `resolution-d20/`, `alignment/`,
`spatial-3d/`, `physics/`, `editor/` do not exist yet — see the drawer.

## The drawer (recorded, shaped for, not built)

Each item has a pull-condition; until it fires, the item only influences
event-vocabulary design (which costs nothing):

- **d20 resolution** — pull when SOME HERO authors its first genuinely
  uncertain check. Lands kernel-adjacent, on a named channel, with the
  roll recorded in the event.
- **Alignment / moral episodes** — pull when the knowledge model and
  event vocabulary are stable AND a playtest wants NPCs reacting to
  reputation. Evidence-based (traits, not scores), knowledge-at-
  decision-time, authored adjudication. The Ledger's comic run grade
  ships long before this does.
- **3D client, then physics** — pull only after a second 2D client
  proves the observation seam. Render the authoritative grid first;
  physics enters the kernel boundary last, if ever.
- **Editor rebuild** — pull when content authoring throughput, not
  architecture, is the bottleneck. Until then, ASCII + YAML + hot reload.
- **Dedicated server / host migration** — pull when real-network play
  matters. The protocol already permits it.

## The first proof (the only milestone that matters now)

**The Ceremony.** One vertical slice of SOME HERO on the new kernel:

Guild Hall → approach the Door Golem → denied for missing credential →
obtain the credential → the ceremony → descend → one generated floor
(pinned room included) → one seal puzzle → combat → death →
resurrection with knowledge retained → the Ledger's report.

Acceptance, all simultaneously:
- Runs headless, bit-identical from (contentHash, seed, log), twice.
- Old some-hero characterization tests for this route pass against it.
- Fully playable with the twin disabled (template narration).
- Twin enabled: the Ledger's report is model-rendered from facts, and
  "show the golem my stamp" — typed, not clicked — compiles through
  classifier or twin into validated commands.
- golem-grid's extraction loop and one topdown-puzzle level run on the
  same kernel build, unmodified.

Ship that, and the convergence is real. Everything after it is roadmap,
not vision.
