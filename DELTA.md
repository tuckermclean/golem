# DELTA.md — golem@(SPEC §8 / steps 1–3) → Golem Engine (VISION.md)
*A complete work order. Written for an orchestration agent. Every task has
a definition of done that a machine can check. Read VISION.md and
CLAUDE.md first; they override this file on conflict of principle. This
file overrides them on sequencing.*

---

## 0. Ground truth

### 0.1 Current state (verified assumptions — agent MUST confirm before Phase 0)
- Repo `golem`: `golem-grid.html` playable (v0.2 + light-feel + focus
  fixes); pure sections (h32/channel, THEMES, genDungeon, reducer)
  extracted into shared modules imported by page and node tools;
  `make test` green: golden-seed worldgen tests, replay byte-equality
  tests, validator unit tests; solver in CI (winnability + difficulty
  band across 10K seeds). Pipeline scaffold present (infra/, workflows,
  tools/validate.py, Makefile). NOT present: harvest.js, generate.py,
  stats.py, train/, wasm/runq.c, smoke.mjs, any model.
- Repos `some-hero`, `topdown-puzzle`, `adventure`: exist as described in
  VISION.md §bequests. some-hero: playable, 165+ unit tests + E2E, single
  mutable aggregate. topdown-puzzle: Phaser, ASCII levels, editor.
  adventure: Python/YAML with eval/exec, Flask + CLI.
- If any assumption fails, STOP and report; do not improvise around it.

### 0.2 Target state (summary)
Monorepo `golem-engine` implementing VISION.md: eight packages, three
games, one imported content pack, the language stack through a real
trained twin, and The Ceremony passing its full acceptance list.

### 0.3 Locked decisions (do not re-litigate, do not bikeshed)
- Language: TypeScript strict, ESM, for everything under `packages/`.
  Plain JS permitted in `games/` fixtures. Python only under
  `tools/model/` and `train/`.
- Workspaces: npm workspaces. Test runner: `node:test` (+ existing
  pytest for Python tools). No new frameworks without a task saying so.
- The kernel is synchronous and pure. No async in validate/reduce/
  observe/affordances. IO lives in adapters.
- IDs: string, namespaced (`player:x`, `item:y`, `region:z`). Events:
  `{seq, t, ...fields}` with JSON-schema definitions checked in CI.
- All randomness through `packages/random` named channels. `Math.random`
  is forbidden in packages/ (lint rule, CI-enforced).
- No eval/exec/Function-from-string anywhere, including content
  conditions. (Lint rule, CI-enforced.)
- Every phase ends with: all prior tests green, all fixtures playable.
  A phase that breaks a fixture is not done.

### 0.4 The drawer (DO NOT BUILD — schema only)
d20 resolution; alignment/moral episodes; contribution ledger *systems*;
oath/league/economy *systems*; 3D; physics; editor rebuild; dedicated
server; host migration; blockchain anything. What IS in scope from the
drawer: their event vocabulary and schema fields (task K6), because
schema is free and societies are not.

---

## PHASE 0 — Consolidation and behavior freeze

**P0.1 — Create the monorepo.**
New repo `golem-engine` (or restructure `golem` in place; prefer in
place to preserve history). Layout per VISION.md: `packages/{kernel,
random,content,world,language,net,clients,testkit}`, `games/{some-hero,
golem-grid,topdown-puzzle}`, `imported-content/adventure`, `drawer/`,
`tools/`, `train/`, `infra/`, `.github/`. Move VISION.md, CLAUDE.md,
OATH_AND_LEDGER.md (→ `drawer/`), SPEC.md (→ `docs/SPEC-golem-v0.2.md`,
marked historical). npm workspaces boot; CI runs existing golem tests
unchanged.
DoD: `npm test` green at root; `golem-grid.html` still opens and plays
from `games/golem-grid/`; CI passes.

**P0.2 — Import the three sibling repos.**
Vendored with history if using subtree/submodule is practical, else
snapshot-copied with a `PROVENANCE.md` (source repo, commit SHA, date)
in each. some-hero → `games/some-hero/legacy/`; topdown-puzzle →
`games/topdown-puzzle/legacy/`; adventure → `imported-content/adventure/
legacy/`.
DoD: some-hero's existing unit + E2E suites run green from their new
location via `npm run test:some-hero-legacy`; every topdown-puzzle
ASCII level file inventoried in `games/topdown-puzzle/levels/` with a
manifest; adventure's YAML worlds inventoried with an audit file listing
every `func:`/eval/exec occurrence (these are the compile targets for
C3).

**P0.3 — Behavior freeze (characterization).**
- Export 25 representative golem seeds: full worldgen JSON snapshots +
  one recorded event log each with final-state hash → `packages/testkit/
  fixtures/golem/`.
- Pin some-hero: record the Ceremony-route behaviors as explicit
  characterization tests if not already covered (Door Golem requirements,
  credential acquisition, credit/APR numbers, seal/stairsOpen logic,
  death/respawn/meta-persistence, Ledger text selection). Tag them
  `@ceremony` — these become the port's spec in Phase 5.
- Snapshot every topdown-puzzle level's initial grid parse.
DoD: `npm run freeze:verify` replays/reruns all of the above and passes;
this command becomes a permanent CI job.

---

## PHASE 1 — Kernel purification (golem-grid re-hosted)

**K1 — `packages/random`.**
Extract h32 + channel + pick/chance/rint from the existing shared
modules into the package, TypeScript, with exhaustive vector tests
(known input → known u32/sequence) so the hash can never silently drift.
DoD: golem golden-seed tests pass importing from the package.

**K2 — `packages/kernel`: types and pure reducer.**
Define `Command`, `Event`, `Denial`, `State` (immutable; structural
sharing fine), and the GameModule interface exactly as VISION.md:
`deriveWorld, validate, reduce, observe, affordances, narrativeFacts`.
Rewrite golem-grid's `applyEvent` as pure `reduce(state, event) → state`
(no global S, no mutation, identity-blind — enforced by a test that
reduces the same log for two different "local" players and asserts
deep-equality). Port `hostCmd` to `validate(ctx, cmd) → Event[]|Denial`.
DoD: replay fixtures from P0.3 produce byte-identical final-state hashes
through the new reducer.

**K3 — `packages/kernel`: event log + hash chain.**
Append-only log; every event carries `prev` (hash of predecessor) and
the log exposes `checkpoint()` → signed digest (signature = simple
ed25519 via node:crypto; key management out of scope — dev key). Replay
verifies the chain.
DoD: tamper test — flipping one byte in a stored log fails verification;
checkpoint verifies across process restart.

**K4 — `packages/net`.**
Extract the 5-message protocol (HELLO/SNAPSHOT/CMD/EVENT/DENY) and the
layered BroadcastChannel + storage-event transport behind a
`Transport {send, onmsg}` interface, with the dedup logic and tests
(double-delivery must not double-apply — fixture exists in freeze).
DoD: two-tab play works exactly as today.

**K5 — Re-host golem-grid on K1–K4.**
`games/golem-grid/` becomes a thin client: rendering + input + perception
over kernel packages. The single-file `golem-grid.html` is preserved
verbatim in `games/golem-grid/reference/` as a golden fixture and demo.
DoD: full VISION acceptance line — "golem-grid's extraction loop runs on
the kernel build, unmodified behavior": all frozen seeds, logs, and the
solver band pass; two-tab multiplayer works; the light-feel rendering is
visually unchanged (manual check + the deterministic parts pinned).

**K6 — Event schema v1 (the drawer's free part).**
JSON-schema for all events, including: `audience` field (default
`all`); attribution fields on act events (`actor, beneficiary, attacker,
preventedDamage, proximity`); milestone events with `contributors[]
{player, kind, weight}` stamped at validation; oath vocabulary
(OATH_SWORN, OATHBROTHER_ATTACKED, POSSE_MEMBER_KILLED, OATH_BETRAYED,
SOLE_CLAIM_CREATED); economy vocabulary (GOLD_MINTED/BURNED/TRANSFERRED,
PURSE_DISTRIBUTED) with a conservation-invariant test helper in testkit
(sum(balances) == minted − burned on any replay). Schemas exist and are
CI-validated against every fixture log; NO gameplay systems consume the
drawer vocabulary yet.
DoD: schema CI job green; conservation helper has its own unit tests.

---

## PHASE 2 — Content system + second consumer (topdown-puzzle)

**C1 — `packages/content`: schema + compiler.**
Content pack = YAML/JSON + ASCII sources → validate (JSON-schema) →
compile conditions (restricted expression language: `all/any/not/fact/
cmp` only — a tiny interpreter, NOT eval) → resolve references → hash →
frozen runtime pack `{hash, entities, tables, maps}`.
DoD: compiler round-trips a hand-written sample pack; hash is stable
across machines; malformed packs fail with actionable errors; lint rule
proves no dynamic code path exists.

**C2 — ASCII importer.**
topdown-puzzle's token vocabulary (`# B D @ H V M E/W/N/S`) compiles to
content entities. Every legacy level compiles; parses match the P0.3
snapshots semantically.
DoD: all levels compile; snapshot-equivalence test green.

**C3 — Entities + components in kernel.**
Minimal component set (VISION list): Identity, GridPosition,
RegionMembership, Actor, Health, Inventory, Portable, Portal, Lock,
Credential, Interactable, Perception, Knowledge. Component data only;
systems interpret.
DoD: golem-grid's items/players/prize re-expressed as entities with no
behavior change (frozen fixtures still pass).

**C4 — Port topdown-puzzle onto the kernel.**
Push chains, directional movers, memory holes, diamonds, enemies — as
validate/reduce systems over the grid backend, with a fixed-step tick
(`TICK_ADVANCED` event; autonomous movers act on tick, seeded via named
channels — this task builds the real-time/event bridge in its smallest
form). Thin canvas or DOM client; Phaser is not imported.
DoD: at least 5 legacy levels playable start-to-finish; one recorded
solution log per level replays bit-identically (these become permanent
fixtures); VISION acceptance line "one topdown-puzzle level runs on the
same kernel build" exceeded.

---

## PHASE 3 — Language stack (tiers 0–3; the twin becomes real)

**L1 — `packages/language`: tier-1 deterministic parser.**
Verb/alias/direction grammar + noun grounding against the affordance/
observation set (interim affordance source: golem-grid's context-menu
logic generalized). Structured output `{type, ...slots}` — the same
Command type the kernel validates. "go north"/"n"/"walk north" resolve
in <1ms.
DoD: parser test corpus (≥200 utterances) green; golem-grid chat
accepts natural commands through it with zero decoder involvement.

**L2 — Tier-2 intent classifier.**
Intent set per VISION (move/take/.../unknown), slots, calibrated
confidence; implementation: start with logistic-regression/fasttext-
class model over engine-generated synthetic utterances (tools/lang/
gen_utterances.js harvests real affordances → templated paraphrases via
teacher model). Routing thresholds: ≥0.90 execute; 0.65–0.90 execute iff
exactly one grounded interpretation; <0.65 → tier 3 or choice prompt.
Must be able to output `unknown`.
DoD: held-out accuracy + calibration report in CI; adversarial suite
(classifier must never emit a confident command for gibberish); runs in
<10ms in browser.

**L3 — Model data tools (absorbs old SPEC step 4).**
`tools/model/harvest.js` (walk real worldgen across ≥2000 seeds; emit
control strings for ALL trained tasks A–F: facts→prose, NL→command,
denial→explanation, bounded NPC reply, command decomposition, reference
resolution), `generate.py` (batched teacher-model driver; variant count,
register rotation, exclusion lists), `stats.py`. Extend
`tools/validate.py` to all six task types (command outputs must parse
and ground; NPC replies must not assert facts outside the envelope).
DoD: one real generated batch ≥85% pass rate; quarantine populated and
eyeballed (agent: include 20 sampled rejects in the PR description).

**L4 — Training + smoke model (absorbs step 5).**
`train/train.py` nanoGPT-style, corpus-built BPE tokenizer (2–8K),
`make train-local` 256K-param CPU smoke run proving corpus → checkpoint
→ sample loop end to end.
DoD: smoke model emits schema-valid (if dumb) outputs for all six tasks;
loop documented in train/README.md.

**L5 — WASM runner (absorbs step 6).**
`wasm/runq.c` (llama2.c-derived, int8, external seeded RNG hook,
streaming token callback), emsdk build (flags already in deploy.yml),
worker wrapper, `tests/smoke.mjs` golden prose with the smoke model.
Wire into golem-grid's ▶GOLEM-PLUG◀ behind the tier router; template
stub remains as fallback and as the narration-off path (law 10).
DoD: golden-prose exact-match test green in CI; golem-grid plays with
smoke-twin on and off; identical prose across two tabs (deterministic
sampling test).

**L6 — Real twin v1 (absorbs step 7).**
Full corpus (100–300K validated pairs across tasks), spot-GPU run via
existing train.yml, eval gate extended: grounding violations <1%,
format contracts 100%, command-task outputs must parse AND ground
against the affordance list ≥99%, ppl regression vs none (first
release). Quantize, publish content-addressed immutable artifact, pin
in manifest.
DoD: eval-gate report attached; golem-grid narrated by the real twin;
"take the lantern thing" style long-tail commands resolve via tier 3
and validate correctly in a scripted E2E.

**L7 — NPC context compiler + memory schema.**
Deterministic compiler: engine state → truth envelope (KNOWS /
DOES_NOT_KNOW / RELATIONSHIP / QUEST_STATE / recent witnessed events),
NPC memory as component data (Knowledge component from C3). No
transcript accumulation; model stays stateless.
DoD: unit tests proving an NPC reply prompt never contains facts outside
the envelope; one demo NPC conversing in golem-grid.

---

## PHASE 4 — SOME HERO: The Ceremony (the milestone that matters)

**S1 — Content pack extraction.**
Ceremony-route content (Guild Hall map, Door Golem, credentials, one
seal puzzle family, enemies for one floor, Ledger copy for the route)
extracted from legacy into a `games/some-hero/content/` pack compiled by
C1. Legacy code untouched.
DoD: pack compiles; content review checklist (all strings present,
hashes stable).

**S2 — Rules port.**
Pure helpers first (stairsOpen, sealMsg, credential queries, credit/APR)
moved to `games/some-hero/rules/` with their legacy tests translated.
Then the route's systems as validate/reduce: movement+collision on the
tick bridge from C4, pickups/inventory, combat (one enemy family),
trap/seal puzzle, death → resurrection with Knowledge persistence
(five-tier persistence model: world/run/character/knowledge/profile as
delta namespaces), Ledger fact emission via `narrativeFacts`.
DoD: every `@ceremony` characterization test from P0.3 passes against
the kernel implementation.

**S3 — Worldgen port.**
some-hero's floor generator translated onto named channels (layout/
puzzle/spawns/decor channels per VISION), pinned-room contract as a
`packages/world` feature (authored rooms placed, connected, tagged,
excluded from stair placement).
DoD: golden-seed tests for the new generator; pinned-room invariants
(always connected, never contains stairs) fuzz-tested across 10K seeds;
solver confirms route winnability.

**S4 — Legacy renderer adapter.**
Observation → legacy view-model adapter so the existing Canvas skins
draw the kernel game. No art rewrite.
DoD: visual smoke E2E of the route on both skins; skin snapshot hash
test still passes for the pinned desert renderer.

**S5 — THE CEREMONY (acceptance gate for the entire delta).**
All simultaneously, in CI where automatable:
1. Headless run of the full route from (contentHash, seed, scripted
   command log) twice → bit-identical final-state hashes.
2. All `@ceremony` legacy characterization tests pass.
3. Fully playable with the twin disabled (template narration).
4. Twin enabled: Ledger report is model-rendered from facts; typed
   "show the golem my stamp" compiles through classifier or twin into
   validated commands (scripted E2E).
5. golem-grid extraction loop AND ≥1 topdown-puzzle level run on the
   same kernel build, unmodified (their fixture suites green against
   the exact commit).
DoD: a single `npm run ceremony` executes checks 1–5 (4's interactive
part as a playwright script) and exits 0. Tag the commit `engine-v1.0`.

---

## PHASE 5 — Semantic layer (post-Ceremony, still in scope)

**A1 — Affordances as kernel API.** `affordances(observation, actor) →
[{verb, target, requirements, enabled, reason}]`; golem-grid context
menus and the tier-1 parser both consume it (replacing the interim
source from L1); tutorial-hint and twin-grounding consumers get tests.
**A2 — Regions overlay.** tile→region membership, portals with state,
as `packages/world` semantic layer over the grid.
**A3 — Adventure import.** adventure's YAML worlds compiled to a content
pack (C1) with every `func:` occurrence from the P0.2 audit re-expressed
as components/conditions or explicitly dropped (decision log required);
playable through a terminal/text client in `packages/clients`.
DoD: adventure sample world walkable, affordance-listed, twin-narrated;
zero dynamic code.

---

## PHASE 6 — Pipeline & ops closure

**O1 — Extend CI:** schema validation, lint bans (Math.random, eval),
conservation helper, ceremony job, fixture matrix (3 games), model eval
gate — one workflow graph, documented in README.
**O2 — Terraform apply** against real account (vars: github_repo,
repo_url); one full data→train→deploy pass producing a pinned manifest;
rollback drill (repoint manifest, verify).
**O3 — Docs:** VISION.md unchanged; new ARCHITECTURE.md (package map,
kernel contract, language tiers); MIGRATION.md (where every legacy
system went); drawer/ index with pull-conditions.

---

## Explicit deletions / demotions (agent: do these, don't skip)
- golem's single-file layout → reference fixture only (K5).
- golem-grid mechanics (light pool, extraction, traitor plans) → content
  of games/golem-grid, stripped from any engine package.
- some-hero mutable aggregate, fx-coupled systems, localStorage saves,
  ambient Math.random → replaced by Phases 1/4 equivalents; legacy tree
  kept read-only until S5, then archived to `games/some-hero/legacy/`
  (already there) with a tombstone README.
- topdown-puzzle Phaser runtime → not imported; levels + rules survive.
- adventure Python runtime, eval/exec YAML, AI-with-authority → never
  ported; content only (A3).

## Reporting contract for the orchestration agent
Per task: PR titled `[<ID>] <name>`, description containing (a) DoD
checklist with evidence links, (b) fixture-suite status for all three
games, (c) any deviation from this file with rationale — deviations that
touch the constitution (VISION.md laws) require human sign-off, halt and
ask. Never mark a phase complete with a red fixture. When blocked >2
attempts on the same failure, stop and surface the failing artifact
rather than weakening the test.
