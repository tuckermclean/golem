# L7 — NPC Context Compiler + Memory Schema (design)

Date: 2026-07-07
Roadmap: DELTA.md PHASE 3, step **L7** (the last unblocked Phase-3 item;
L4–L6 twin infra remains blocked — no GPU/emsdk/torch).
Builds on: C3 (`Knowledge` component, done), L1/L2 (`packages/language`).

## Charter (verbatim, DELTA.md L7)

> Deterministic compiler: engine state → truth envelope (KNOWS /
> DOES_NOT_KNOW / RELATIONSHIP / QUEST_STATE / recent witnessed events),
> NPC memory as component data (Knowledge component from C3). No
> transcript accumulation; model stays stateless. DoD: unit tests
> proving an NPC reply prompt never contains facts outside the envelope;
> one demo NPC conversing in golem-grid.

VISION's charter sentence (VISION.md ≈104–112): "NPC memory lives in
engine state; a deterministic context compiler decides what the twin may
know per turn." Law 5: the model "may not assert facts" — it owns no
truth. This step builds the deterministic gate that makes that
enforceable.

## Doctrine constraints this step must honor

- **The golem is a mouth** (CLAUDE.md doctrine #4): the compiler decides
  what may be said; it never mutates state, never sits in `reduce`/
  `validate`, and the only golem-grid integration point is ▶GOLEM-PLUG◀.
- **No logic forked browser↔tooling** (CLAUDE.md working practices): the
  compiler lives in `packages/language` (TS strict ESM, `tsc` prepare,
  `node --test`), importable by the golem-grid browser bundle and Node
  tests alike.
- **No worldgen/golden change**: this step must not alter `serializeState`,
  `reduce`, `validate`, the wire protocol, `events.v1.json`, or any of
  the 25 frozen fixtures / golden replay log / `@ceremony` tests. The
  demo NPC is client-local, exactly like `lookAt`/`/who` already are.
- **Stateless**: no transcript, no per-NPC history, no module-level
  mutable cache. Every call is a fresh pure computation.

## Where the code lives

`packages/language/src/context.ts` (new), exported via
`packages/language/src/index.ts` beside `parse`/`route`. VISION.md's
package-shape doctrine already names "context compiler" as a
`packages/language` responsibility. It stays **dependency-light**: no new
package deps (current deps = `@golem-engine/random` only). It must NOT
live in `packages/kernel` (types + `replay()` only, no game/narration
logic) or `packages/content` (pack/condition compiler, no runtime
component data).

## The truth-envelope type (facts are opaque string tokens)

No concrete `Facts` shape exists in the repo (`kernel/src/index.ts`'s
`Facts` is an open generic). The one real precedent is L3's Task D
(`tools/harvest.js` / `tools/validate.py`), which already uses a flat
slug-token vocabulary (`KNOWS`, `DOESNT_KNOW`). Reuse that atomic unit —
a fact is a lowercase slug token — rather than inventing a rich fact
object the future twin would have to learn twice.

```ts
export interface TruthEnvelope {
  readonly knows: readonly string[];         // fact tokens the NPC MAY assert
  readonly doesNotKnow: readonly string[];   // closed-world complement; for negative
                                             // testing/training only — never rendered positively
  readonly relationship?: Readonly<Record<string, unknown>>; // shape-only stub (no system yet)
  readonly questState?: Readonly<Record<string, unknown>>;    // shape-only stub (no system yet)
  readonly recentEvents: readonly WitnessedEvent[];           // caller-supplied, already bounded
}

export interface WitnessedEvent {
  readonly seq: number;
  readonly t: string;        // event kind, kernel Event.t vocabulary
  readonly summary: string;  // pre-slugged fact token(s), NOT the raw payload
}
```

- `relationship`/`questState` ship **stubbed/omitted** — no relationship
  or quest *system* exists (some-hero S2, not started). Type presence
  satisfies the DoD's category list; live population is out of scope
  (DELTA §0.4 "schema is free, systems are not", applied by analogy).

## The compiler signature

```ts
export function compileEnvelope(
  npcKnowledge: { readonly knows: readonly string[] },  // C3 Knowledge, STRUCTURAL (no kernel dep)
  factUniverse: readonly string[],                       // caller-bounded closed world for doesNotKnow
  recentEvents: readonly WitnessedEvent[] = [],          // caller-sliced/bounded
  relationship?: Readonly<Record<string, unknown>>,
  questState?: Readonly<Record<string, unknown>>,
): TruthEnvelope
```

- **Pure/deterministic/identity-blind**: same inputs → deep-equal,
  referentially-fresh output. No RNG, no clock, no global state.
- **`knows`** = the NPC's own `Knowledge.knows`, normalized (deduped,
  order-stable). The compiler can never invent a fact: `knows ⊆` input.
- **`doesNotKnow`** = `factUniverse` minus `knows` (closed-world
  complement over the *caller-supplied* universe — the package never
  hardcodes any game's fact space, mirroring `ground.ts`'s
  caller-shaped `Affordance`).
- Reads only the one NPC's Knowledge + the caller-bounded inputs. The
  game's own adapter derives `factUniverse`/`recentEvents` from its
  state/world (as `games/golem-grid/src/language-adapter.js` already
  derives L1 affordances) — keeping `packages/language` game-agnostic.
- **Kernel-type decision (resolved)**: structurally duplicate the
  `{knows: readonly string[]}` shape; do NOT add a `@golem-engine/kernel`
  dependency. Matches the existing `Affordance` idiom.

## Prompt = control string (reuse Task D's grammar — hard requirement)

The "NPC reply prompt" IS a control string in L3's exact `KEY:VALUE`
space-joined format (`tools/harvest.js` `controlString()` / Task D), so a
future L5/L6 twin never learns two incompatible encodings.

```ts
export function envelopeToControlString(
  envelope: TruthEnvelope, topic: string, question: string,
): string
// e.g. "TASK:D KNOWS:hall+crypt_theme+rat DOESNT_KNOW:cavern TOPIC:room QUESTION:..."
```

Built **only** from `envelope.knows`/`envelope.doesNotKnow`/topic/
question — never from the raw universe or event log. The `KNOWS` field is
*defined as* `envelope.knows.join("+")`, so it is by-construction bounded
to what the compiler decided the NPC knows. This is the structural half
of the "never contains a fact outside the envelope" invariant.

Match L3/harvest slug conventions exactly (lowercasing, separator,
key names) so the two encodings are literally interchangeable — verify
against `tools/harvest.js`'s `controlString()`/Task D emitter before
finalizing the field names/case.

## The stub renderer (twin is infra-blocked; law 10)

`renderStubReply(envelope, topic, question, seed, npcId) → string`:
deterministic template selection seeded via `packages/random`'s
`channel(seed, "npc", npcId, ...)`, matching `main.js`'s `proseFor`/
`roomBeat` idiom — a small authored line-bank keyed **only** by
`envelope.knows` tokens. This is the narration-off / twin-absent path
(law 10), identical in kind to how golem-grid narrates today.

## Demo NPC in golem-grid (fully client-local, zero fixture risk)

Follow the `lookAt` (main.js ≈89–97) and `/who` (input.js ≈59–68)
precedents: client-local, zero host round-trip, zero event, zero
`validate`/`reduce` footprint.

- **New file `games/golem-grid/src/npc.js`** — one stationary NPC with a
  small hardcoded `knows` (e.g. `[dun.theme, someRoomKind]`) and a small
  hand-authored `factUniverse` (e.g. the prize name / a far room kind,
  mirroring harvest's own `distantFact` choice). Isolated exactly like
  `entities.js`.
- **Trigger**: a new `/ask <question>` branch in `input.js`'s existing
  slash-switch (beside `/who`/`/help`), OR a context-menu "ask" action in
  `handleTap` when adjacent to the NPC tile. Dispatches straight to
  `golemLine(renderStubReply(compileEnvelope(...), ...), trace)` — no
  `sendCmd`, no wire message, no event.
- **Render**: reuse the existing `golemLine` teletype UI. No new UI/CSS.
  `make html` single-file build stays reference-free.

## Test plan

`packages/language/tests/context.test.js` (new, `node:test`):
1. **Purity/determinism** — same inputs → deep-equal, non-mutated
   outputs; module has no mutable module-level state.
2. **No-invention** — `compileEnvelope().knows ⊆ npcKnowledge.knows`.
3. **Closed-world** — `doesNotKnow === factUniverse \ knows` (order-stable).
4. **Structural containment (the invariant)** — over many
   `(knows, doesNotKnow, universe)` triples incl. adversarial near-misses
   (a `doesNotKnow` token sharing a word-stem/substring with a `knows`
   token, mirroring harvest.js's own documented worry): tokenized
   `envelopeToControlString` output contains no `doesNotKnow` token that
   isn't independently in `knows`.
5. **Rendered-reply scan** — exhaustively render every `(envelope,
   question)` the demo bank can produce; assert none contains any
   `doesNotKnow` token (runtime analogue of `validate.py`'s `violations_d`,
   as a `node:test`, NOT touching `tools/validate.py`).

Golem-grid: if `src/npc.js` is added, add a parallel **call-graph
exclusion test** (mirroring `entities-not-in-callgraph.test.js`) proving
`npc.js`/`compileEnvelope` never appear in `reduce`/`validate`/`module.js`
source — the same regression-proofing C3 used.

**No fixture/golden/ceremony change expected.** `make test`, `npm test`
(all workspaces), `make html` (reference-free), and `npm run
freeze:verify` must all stay green unchanged.

## Scope boundaries / YAGNI

- **No dependency on L4–L6** (twin/WASM) — none exist; the demo plays via
  the stub renderer (law 10).
- **No transcript accumulation** — no history object, no session state.
- **No some-hero five-tier persistence** (S2, not started);
  `relationship`/`questState` are shape-only stubs.
- **No NPC combat/movement/AI** beyond answering one bounded question
  (C3 design doc: golem-grid "has no NPCs today"; this DoD is the
  sanctioned first exception, kept minimal).
- **Do not touch** `tools/validate.py` / `tools/harvest.js` / the L3
  corpus — L7's guarantee is a new runtime-layer test surface,
  complementary to L3's existing training-corpus guarantee.
