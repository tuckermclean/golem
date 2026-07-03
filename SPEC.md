# GOLEM/GRID — Project Specification
*v0.2 handoff — from design conversation to working repository*

## 1. What this is

A multiplayer extraction dungeon crawl played in a chat-first, grid-rendered
terminal aesthetic, in which all prose is spoken by a tiny (~15M parameter)
neural network — "the golem" — that runs client-side in WASM. The world is
derived, not stored; multiplayer is an ordered event log; the golem is a
mouth that renders engine facts and can never lie about the world.

Mission sentence (invariant across all seeds and themes):

> Bring the [prize] up from the bottom of [the founder's ruin] before the
> light runs out — knowing one of you answers to whatever is still down there.

The traitor clause is a future layer (see §6); v0 is the pure co-op crawl.

## 2. Doctrine (the constitution — everything else is derivable)

1. **The world is a pure function.** `world(seed, place) → facts`. Never
   stored, never transmitted, identical on every machine. Changing this
   function invalidates every seed in the wild: worldgen changes are
   MAJOR version bumps. The hash is a public API.
2. **The delta map is the only truth.** All mutable state is a keyed map of
   overrides. Save file = seed + event log. Queries check deltas first,
   fall through to the world function.
3. **The host sequences; the reducer is sacred.** One client stamps event
   order. `applyEvent()` is deterministic and identity-blind. Clients that
   apply the same events in the same order are bit-identical, provably.
4. **The golem is a mouth.** It receives a control string, returns prose.
   It never decides, never remembers, never touches state. New content
   flows through it (copying); new *voice* requires fine-tuning.
5. **Prose sampling is seeded** by `(seed, eventSeq)` — every client
   hallucinates identical words locally; text never crosses the wire.
6. **Determinism for everything the world knows; entropy for everything
   the world hides.** (Traitor identity etc. come from a host-private
   salt, deliberately outside the derivable universe.)
7. **All meaning is authored upstream.** The generator is a librarian, not
   a writer: tables, grammars, corpus, weights are frozen authorship.
   Spend effort on tables and curation, not generator cleverness.
8. **Hallucination is a failing test.** The model is a build artifact:
   versioned, immutable, eval-gated, rejected by CI if it invents doors.

Design tests, applied to every proposed feature:
- **Oatmeal test:** does it create a decision, a consequence, or a story
  someone would retell? More world alone is oatmeal.
- **Teachability test:** if a rule can't be taught by one line of spooky
  prose, it's too complicated for this game.
- **Gauge redundancy test:** every resource must be *felt* in the world
  (rendering/prose), not only read from a meter.
- **One key, one meaning:** no context-sensitive controls. Arrows are feet.

## 3. Current artifacts (state of the world at handoff)

- **`golem-grid.html`** — v0.2 prototype, WORKING. Single file, no deps.
  Contains: seeded finite dungeon (rooms+corridors, BFS depth, prize in
  deepest room, 3 lore tiles at shallow/mid/deep), theme layer (3 founders:
  drowned_monastery / salt_counting_house / deep_mine — each reskins loot,
  mob, adjectives, prize name, lore fragments), delta-map state, host-
  authoritative multiplayer over BroadcastChannel + localStorage-event
  bridge (works across two tabs incl. Chrome file://), fog of war from
  per-client perception, light-as-clock (radius = f(pool), carrier burns
  2x), radial light falloff + low-light flicker + ember tint (lit tiles
  never darker than memory baseline; reduced-motion honored), chat feed
  with the golem as a styled participant + dim control-string traces,
  IRC grammar (bare=room-local say, /party /w /me /take /read /who /help),
  document-level arrow movement (capture phase, unconditional), click
  context menus resolving to the same command grammar, BFS click-to-walk
  over *seen* tiles only, WIN/LOSE predicates + generated epilogue.
  The golem is a STUB: seeded grammar templates at the `▶GOLEM-PLUG◀` seam.
- **`golem-world.html`** — v0.1 room-graph prototype. Superseded; keep as
  reference for the original room/exit control-string style.
- **`golem-pipeline.tar.gz`** — CI/CD + IaC scaffold: Terraform (3 S3
  buckets, CloudFront w/ immutable /weights/*, GitHub OIDC role, ephemeral
  spot-GPU launch template w/ self-termination + hard shutdown guard),
  workflows (ci / data / train / deploy), `tools/validate.py` (grounding
  validator, real), Makefile. Everything the Makefile calls that isn't
  listed here does NOT exist yet (see §8 roadmap).

## 4. Architecture reference

Wire protocol (entire): `HELLO {pid,name}` → host; `SNAPSHOT {to,seed,log}`
→ joiner; `CMD {from,cmd}` → host; `EVENT {ev}` → all; `DENY {to,reason}`
→ one. Transport is an interface; BroadcastChannel/storage now, WebRTC
DataChannel later, protocol unchanged.

Event types (v0.2): JOIN, MOVE, TAKE, TAKE_PRIZE, READ, SAY (scope:
room|party), WHISPER, EMOTE, LIGHT_WARN, WIN, LOSE.

Delta keys: `player:<id>` {id,name,x,y,inv}, `light` (number),
`taken:<x,y>` (bool), `prize_by` (pid), `gameover`.

Host validation lives in `hostCmd()`; win/lose predicates run after each
committed MOVE in `hostCommit()`. Reducer must never consult local
identity. Perception (seen/lit sets, LOS raycast) is client-local and is
deliberately each player's *partial* knowledge — click-to-walk pathfinds
over seen tiles only. This partial-knowledge property is load-bearing for
the future traitor layer (partial logs = testimonies).

Light economy: START_LIGHT=240, burn 1/move (2 while carrying prize),
radius tiers 180/110/55/20 → 6/5/4/3/2. Host emits LIGHT_WARN at tier
crossings. These constants are the difficulty dial; see §9 solver.

## 5. The golem (mouth) — contract and build plan

Contract at the `▶GOLEM-PLUG◀` seam: `prose = golem(controlString, rng)`
where `rng = channel(seed,"prose",eventSeq)` (or room index for first-entry
beats, tile coords for /look). Streaming tokens out is desirable (teletype
already queues). Nothing else about the app may change when the stub is
replaced.

Control-token vocabulary (current): `ROOM:<kind> TONE:<tone>
THEME:<founder> DEPTH:<n> EVENT:<type> ITEM:<name> LIGHT:<tier>
TILE:<x,y> EVENTS:<n>`. Room kinds: hall gallery vault stairwell chapel
store. Tones: ominous still cold watchful. This schema is the training
corpus's input format — keep it boring, rigid, and versioned.

Model plan: llama2.c-style decoder, ~6–8 layers, dim 288–512, ctx 256–512,
vocab 2–8K BPE built FROM the corpus; int8 quantized (~5–15 MB);
inference in C compiled to WASM with SIMD128 (emsdk flags already in the
deploy workflow); sampling MUST accept an external seeded RNG so
deterministic-per-event holds. Grounding requirements the model must meet
(mirrors validator): mention only facts in the control string; sensory
texture allowed; every listed item/mob mentioned; exits/format contracts
where applicable; 2–4 sentences; per-THEME register.

Corpus: harvest control strings from REAL worldgen across ~2000 seeds
(never let the big model invent inputs); big-model generates 4–8 variants
each under the system prompt recorded in this conversation (grounding iron
rule, style rules, JSON out); validator rejects to quarantine;
100–300K clean pairs is the target. Rule of thumb: **new content = table
edit; new voice = fine-tune** (one shared model for all themes forever —
themes are control tokens, not checkpoints).

## 6. Game design — the onion

- **v0 (SHIPPED in prototype):** co-op extraction. Finite dungeon, shared
  light pool, prize at max depth, heavy carry, lore by depth, epilogue.
- **v1 (next gameplay layer):** the doppelganger. One hidden traitor dealt
  from host-private salt; sabotage verbs that are corruptions of normal
  play; audience-scoped event delivery (host relays only what each client
  may witness — the ONE real engineering lift); body/bell meetings, votes,
  banishment, ghost channel. Win predicates extend: traitor wins on wipe
  or lights-out.
- **Expansions drawer (pull ONLY when playtests show a specific boredom):**
  tick-beat simultaneity; roles (Lantern/Chronicler/Porter/Warden — note
  players self-organize roles socially first; assigned roles may never be
  needed); two-body obstacles; AWAKENED phase flip on prize pickup;
  death-drops with last words (persistent across sessions of a seed);
  daily seed + epilogue sharing; rumor system (true prophecy from derived
  facts about unvisited rooms); lock-and-key derivation.

## 7. Data pipeline & CI/CD (scaffolded)

Stages & gates: ci (PR: determinism tests) → data (manual/cron: harvest →
generate → validate, min pass-rate 85% else the PROMPT is broken) →
train (ephemeral spot GPU → eval gate: grounding violations <1%, format
contracts 100%, ppl regression ≤ last release +2% → int8 → publish
content-addressed immutable artifact) → deploy (emsdk build → golden-prose
smoke test → S3/CloudFront, invalidate manifest only; rollback = repoint
manifest). GitHub OIDC, no stored keys. AWS is scaffolded; a
RunPod/Lambda trainer is acceptable — the pipeline only cares that a
checkpoint lands in S3 and survives the gate.

## 8. Roadmap (ordered by feedback-loop cheapness)

1. **Repo-ify.** Untar pipeline scaffold; add `golem-grid.html` at root;
   extract pure sections (h32/channel/THEMES/genDungeon, reducer) into
   shared modules imported by both the page and node tools. Add this
   SPEC.md and CLAUDE.md.
2. **Tests green.** `tests/worldgen.test.js` (golden seeds — the 500-seed
   determinism/winnability harness from the conversation is the starting
   point), `tests/replay.test.js` (recorded log → byte-identical deltas),
   `tools/test_validate.py`. `make test` passes; ci.yml passes.
3. **Solver in CI.** Path+light-budget solve of entrance→prize→entrance
   across 10K seeds; fail on unwinnable or difficulty-band drift. Wire the
   worst-case budget to START_LIGHT as the difficulty dial.
4. **Data tools.** `tools/harvest.js` (walk real worldgen), `generate.py`
   (batched API driver w/ variant + exclusion-list rotation), `stats.py`.
   Run one real batch; eyeball quarantine; iterate prompt.
5. **Smoke model.** `train/train.py` (nanoGPT-style) + `train-local`
   (256K params, CPU, minutes) proving corpus→checkpoint→sample loop.
6. **WASM runner.** `wasm/runq.c` (llama2.c-derived, int8, seeded
   sampler, streaming callback) + `tests/smoke.mjs` golden prose. Wire
   into ▶GOLEM-PLUG◀ behind a worker; stub remains as fallback.
7. **Real model.** Full corpus, spot-GPU run, eval gate, quantize, pin in
   manifest. The sock puppet graduates.
8. **v1 traitor layer.** Audience-scoped delivery first (protocol change:
   host filters EVENT fan-out per recipient), then the deal, sabotage
   verbs, meetings/votes, ghost channel. New corpus batches for suspicion/
   verdict registers.

## 9. Testing requirements (non-negotiable)

Golden seeds (worldgen exact-match; includes `plagueis` =
salt_counting_house, 12 rooms, prize depth 34 — already verified);
reducer replay byte-equality; solver winnability + difficulty band;
validator unit tests incl. adversarial phrasings; prose determinism
(same seed+seq → identical string, stub AND model); transport dedup
(double-delivery via BC+storage must not double-apply);
reduced-motion path renders (no flicker, no teletype).

## 10. Non-goals / guardrails

No servers at runtime (CDN + P2P only). No game logic in the model, ever.
No graphics beyond the character grid (render only what prose is bad at:
space and quantities). No procedural objectives — the mission sentence is
invariant; themes reskin nouns, never the verb. No new player-facing rule
without passing the teachability test. No localStorage for game state
(transport shim only). Weights immutable once published.

## 11. Open questions (decide in the Code session, low stakes now)

WebRTC signaling story for real-network play (copy-paste blob vs tiny
relay); host migration (v0: world sleeps when host closes); snapshot
compaction threshold; tokenizer size after corpus exists; whether /look
beats should be host events (shared) or stay client-local (current);
mobile touch layout for the grid.
