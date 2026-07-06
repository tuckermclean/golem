# `packages/language` (L1) — Tier-1 Deterministic Parser — Design

**Date:** 2026-07-06
**Status:** Draft — for orchestrator review before implementation begins
**Topic:** DELTA.md Phase 3, task L1 — the tier-1 deterministic parser
(verb/alias/direction grammar + noun grounding against an affordance set).
This is a design document only; no code changes are made by it.

## Scope

DELTA §L1, verbatim:

> `packages/language`: tier-1 deterministic parser. Verb/alias/direction
> grammar + noun grounding against the affordance/observation set (interim
> affordance source: golem-grid's context-menu logic generalized).
> Structured output `{type, ...slots}` — the same Command type the kernel
> validates. "go north"/"n"/"walk north" resolve in <1ms.
> DoD: parser test corpus (≥200 utterances) green; golem-grid chat accepts
> natural commands through it with zero decoder involvement.

L1 is a pure, synchronous, table-driven text→intent mapper. It does **not**:

- run any ML model, classifier, or scoring function (VISION doctrine: "Go
  north never touches the decoder" — L1 *is* that non-decoder path; L2's
  classifier is a separate, later package);
- decide what golem-grid's wire command strings look like (that stays
  `games/golem-grid/shared/module.js`'s business — L1 emits a game-agnostic
  structured `Intent`, not a command string);
- own multi-step planning (e.g. "walk to the lantern and take it" as one
  utterance) — tier-1 grounds nouns against what is *immediately*
  actionable from the player's current tile, matching what golem-grid's
  wire grammar (`move`/`take`/`read`/...) can execute in one command (see
  Open Question 5);
- replace `packages/kernel`'s `validate()` as the source of legality — a
  parsed, grounded intent is still just a proposal; the kernel denies it
  exactly as it would a hand-typed `"take lantern"` string today.

What exists today: `packages/language/package.json` (bare
`@golem-engine/language` stub — no `exports`/`scripts`/`src`/`tests`, same
starting point C1 had) and a one-line `README.md`. This design proposes
filling the package in, matching the conventions already established by
`packages/random`, `packages/net`, and `packages/kernel` (npm-workspace
member, TS strict, ESM, `tsc -p .` via `prepare`, `node --test` via
`test`, `dist/` built and never committed).

## Why this shape (grounding in VISION + DELTA)

- VISION's latency-tiering law (doctrine #6, and the four-stage pipeline
  in "The sentence": *direct controls → deterministic parser → tiny
  intent classifier → twin*) makes L1 the second-cheapest tier, ahead of
  any model. "Go north" must resolve at table-lookup speed — no scoring,
  no confidence math, no fallback-through-a-model. That is the whole
  reason `<1ms` and "zero decoder involvement" are both named explicitly
  in the DoD.
- VISION doctrine #6 also says "the classifier must be able to say
  'unknown'" — the same discipline applies one tier down: L1 must be able
  to say "I don't know" (`{ok:false, reason:"unknown"}`) rather than
  guess, so tiers 2/3 have a well-defined handoff point once they exist.
  Guessing wrong here would be worse than not trying, because a wrong
  *silent* guess (as opposed to a denial) never shows the player anything
  is off.
- VISION's affordance vocabulary (`affordances(observation, actor) →
  [{verb, target, requirements, enabled, reason}]`, promised for A1 in
  Phase 5) is the eventual grounding source for L1 and for golem-grid's
  context menu alike. DELTA explicitly calls out golem-grid's *existing*
  context-menu logic (`games/golem-grid/src/input.js`'s `handleTap`) as
  the **interim** affordance source, to be replaced once A1 lands. This
  design's `Affordance` type is deliberately shaped to need only a
  rename/no-op adapter when that swap happens (see "Noun grounding" and
  Open Question 2).
- DELTA §0.3 (language: TS strict, ESM, for everything under `packages/`)
  and the K1/K4/C1 precedent (dependency-light, `dist/` built via
  `prepare`, `node --test`) set the package skeleton; nothing about L1
  needs Node-only APIs (no crypto, no fs), so — unlike `packages/kernel`,
  which splits `index.ts` from `log.ts` to keep `node:crypto` walled off —
  L1 needs only a single `tsconfig.json` covering all of `src/`.

## What the parser must produce (studied from the target)

`games/golem-grid/shared/module.js`'s `validate(ctx, cmd)` is the ground
truth for what a legal command string looks like. Reading it line by
line, the full grammar it accepts is:

| verb string | args | example |
|---|---|---|
| `move` | `<dx> <dy>`, one of dx/dy is ±1 and the other 0 | `move 0 -1` |
| `take` | optional `[item]` (substring-checked against what's at the player's own tile; no item ⇒ auto-detect prize or the one item there) | `take`, `take lantern` |
| `read` | none (auto-detects lore adjacent to the player, 3×3 neighborhood) | `read` |
| `say` | `<text>` (room-scoped) | `say hello` |
| `party` | `<text>` (party-scoped) | `party regroup` |
| `whisper` | `<name> <text>` | `whisper Bram over here` |
| `emote` | `<text>` | `emote waves` |

Two things worth flagging up front because they shape the design below:

1. **`take` has no coordinates.** It only ever acts on the player's *own*
   tile. There is no wire command for "take the sword three tiles away."
   `games/golem-grid/src/input.js`'s context menu papers over this with
   `walkTo(x,y)` + a deferred `sendCmd("take")` — i.e. the *menu* can
   reach distant items by walking first, but a single typed command
   cannot. Tier-1 grounding must not oversell what a bare `take <noun>`
   utterance can actually do (Open Question 5).
2. **`look` has no wire command at all.** `input.js`'s context menu offers
   `look` as an action, but it calls `lookAt(x,y)` directly — client-local
   golem prose (the `▶GOLEM-PLUG◀` narration path), never `sendCmd`. This
   is consistent with doctrine #4 (perception is client-local) and #10
   (the golem never touches state). So the parser's output type set is
   *not* a strict subset of "things `validate()` accepts" — `look`/
   `examine` intents exist and are grounded exactly like `take`, but the
   golem-grid adapter routes them to a local function instead of
   `sendCmd`. This is why the design keeps `Intent` **game-agnostic** and
   pushes the type→dispatch decision into a small adapter, rather than
   folding `toCommand()` into `packages/language` itself.

`packages/kernel/src/index.ts`'s `Command = unknown` — "the kernel does
not constrain it beyond 'some value'; each game module defines its own
command vocabulary." That is exactly the seam DELTA's phrase "the same
Command type the kernel validates" is pointing at: L1's `Intent` union is
the generic, game-agnostic structured shape; a **golem-grid adapter**
(small, lives under `games/golem-grid/src/`, not in `packages/language`)
turns an `Intent` into golem-grid's specific `Command` (a string) or a
local no-wire action (`look`). A future game built on the kernel with a
richer `Command` type (e.g. an object, once C3 entities exist) would write
its own adapter over the same `Intent` union — `packages/language` never
needs to know golem-grid's string grammar exists.

## Grammar tables

### Verb table

Keys may be **one or two tokens** (to cover "pick up", "look at") — the
tokenizer does a greedy longest-prefix match (try 2 tokens, fall back to
1) against this table before anything else runs. Values are the
canonical verb tier-1 knows about.

```ts
// tables.ts
export const VERB_ALIASES: ReadonlyMap<string, CanonicalVerb> = new Map([
  // move
  ["go", "move"], ["walk", "move"], ["move", "move"], ["head", "move"],
  ["run", "move"], ["travel", "move"],
  // take
  ["take", "take"], ["get", "take"], ["grab", "take"],
  ["pick up", "take"], ["pick-up", "take"], ["pickup", "take"],
  ["snag", "take"],
  // look / examine (client-local; see "look has no wire command" above)
  ["look", "look"], ["look at", "look"], ["examine", "look"],
  ["inspect", "look"], ["l", "look"], ["x", "look"],
  // read
  ["read", "read"],
  // say / chat
  ["say", "say"], ["chat", "say"], ["shout", "say"],
  // party
  ["party", "party"],
  // whisper
  ["whisper", "whisper"], ["tell", "whisper"], ["w", "whisper"],
  // emote
  ["emote", "emote"], ["me", "emote"],
]);
```

`CanonicalVerb = "move" | "take" | "look" | "read" | "say" | "party" |
"whisper" | "emote"`. This table is intentionally **conservative** and
mirrors the existing `/`-slash command set 1:1 (`/take`, `/read`,
`/party`, `/w`, `/me`, plain-text = say) plus the obvious English verbs
DELTA names for movement/take/look. Expanding aliases later (e.g. "shout"
→ `party` instead of `say`) is cheap table-editing, not a design change —
flagged as Open Question 8 rather than guessed at now.

### Direction table

Only the four cardinals — "one key, one meaning" (CLAUDE.md's design
test) rules out anything richer (no "northeast", no relative "left"/
"right" from facing, since golem-grid characters have no facing).

```ts
export const DIRECTION_ALIASES: ReadonlyMap<string, {dx:-1|0|1; dy:-1|0|1}> = new Map([
  ["north", {dx:0,dy:-1}], ["n", {dx:0,dy:-1}], ["up", {dx:0,dy:-1}], ["↑", {dx:0,dy:-1}],
  ["south", {dx:0,dy:1}],  ["s", {dx:0,dy:1}],  ["down", {dx:0,dy:1}], ["↓", {dx:0,dy:1}],
  ["east", {dx:1,dy:0}],   ["e", {dx:1,dy:0}],  ["right", {dx:1,dy:0}], ["→", {dx:1,dy:0}],
  ["west", {dx:-1,dy:0}],  ["w", {dx:-1,dy:0}], ["left", {dx:-1,dy:0}], ["←", {dx:-1,dy:0}],
]);
```

Note `"w"` is overloaded (west direction *and* the whisper verb alias
above). This is resolved by pipeline ordering, not by removing the
overlap — see "Parse pipeline" below and Open Question 4 for the residual
risk.

### Filler / article table

Stripped from noun phrases (never from verb phrases, and never from
`say`/`party`/`emote`/`whisper` message bodies, which must preserve the
player's actual words):

```ts
export const FILLER_WORDS: ReadonlySet<string> = new Set([
  "the", "a", "an", "to", "at", "up", "over", "there", "here", "thing", "item",
]);
```

`"up"` is deliberately in both the direction table (bare "up" ⇒ move
north) and the filler table (as in "pick up the X" — but there, "pick up"
is consumed whole as a *two-token verb phrase* before filler-stripping
ever runs, so it never reaches the direction table). This ordering
dependency is exactly why the verb-phrase match must run before any
direction/filler handling — documented inline in `tokenize.ts`, not left
implicit.

## Parse pipeline

1. **Normalize.** Lowercase, trim, strip one trailing `!`/`?`/`.`, collapse
   internal whitespace.
2. **Tokenize** on whitespace.
3. **Empty check.** Zero tokens ⇒ `{ok:false, reason:"empty"}`.
4. **Verb-phrase match.** Try the first 2 tokens joined, then the first 1
   token, against `VERB_ALIASES` (longest match wins). If found: canonical
   verb + the remaining tokens ("rest").
5. **Bare-direction fallback.** If no verb matched *and* the entire
   utterance is a single token found in `DIRECTION_ALIASES`, treat it as
   an implicit `move` with that direction (covers "n", "w", "north" typed
   alone — the DoD's literal "n" example). This is the **only** place a
   bare single-letter/word utterance can turn into a command; anything
   else that fails to match a verb phrase falls through to `unknown`.
6. **No match at all** ⇒ `{ok:false, reason:"unknown"}`.
7. **Per-verb slot filling**, given canonical verb + rest tokens:
   - **move:** strip filler from `rest`; find the first token present in
     `DIRECTION_ALIASES`. Found ⇒ `{type:"move", dx, dy}`. Not found ⇒
     `unknown` (a bare "go" with no direction is not a legal move).
   - **take:** strip filler from `rest`, join what remains as a noun
     phrase. Empty ⇒ `{type:"take"}` (matches `module.js`'s own
     auto-detect — no grounding needed, see "Noun grounding" below).
     Non-empty ⇒ ground the phrase against affordances with
     `verb:"take"`; success ⇒ `{type:"take", item:<name>}`; no-match/
     ambiguous ⇒ propagate that `ParseFail`.
   - **look:** same grounding path as take, but `verb:"look"`; empty noun
     phrase after filler-stripping ⇒ `{type:"look"}` (look at the room —
     matches "look" with no target, an existing golem-grid affordance).
   - **read:** no args ever consulted ⇒ `{type:"read"}` unconditionally
     (module.js's own `read` ignores args and auto-detects nearby lore;
     tier-1 mirrors that — no grounding needed).
   - **say:** `rest` re-joined *without* filler-stripping (preserve the
     player's exact words) ⇒ `{type:"say", text}`. Empty text is legal
     (module.js allows it; harmless).
   - **party:** same as say ⇒ `{type:"party", text}`.
   - **whisper:** first `rest` token = target name (**not** groundable
     against the affordance set — see below), remainder re-joined = text
     ⇒ `{type:"whisper", to:<name>, text}`. No target token at all ⇒
     `unknown` (nothing to send).
   - **emote:** `rest` re-joined, no filler-stripping ⇒ `{type:"emote",
     text}`.

Whisper's target name is deliberately **not** groundable through the
`Affordance` interface: `module.js`'s own `whisper` validate already does
a case-insensitive exact match against connected players and denies with
`No one called ${to} is down here` if it fails. Re-implementing that
lookup in the parser would duplicate a check the kernel already owns for
free, and — unlike `take`/`look` targets, which the parser must narrow
because the wire grammar takes only a bare item substring — a whisper
target genuinely is just "the next word", no grounding ambiguity to
resolve. Scope stays smaller this way.

## Noun grounding

### The interface (a dependency the caller provides)

`packages/language` is generic; it never hardcodes golem-grid's items,
lore, or players. The caller injects a flat list of what's currently
actionable:

```ts
export interface Affordance {
  /** Canonical verb this affordance responds to ("take" | "look" | ...).
   *  Open vocabulary — the parser only ever filters by exact string
   *  equality against the canonical verb it already resolved. */
  verb: string;
  /** Opaque identifier the caller hands back to itself once grounded —
   *  golem-grid's interim source uses the item/lore name itself (its
   *  wire grammar only needs a name, not a stable id); a post-A1 source
   *  may use a real entity id instead. The parser never inspects this. */
  target: string;
  /** Primary grounding name, e.g. "lantern", "Bram", "the stone sign". */
  name: string;
  /** Extra synonyms grounding may also match, e.g. ["lantern thing"]. */
  aliases?: readonly string[];
  /** Default true. Present for forward-compatibility with A1's shape
   *  (`{verb, target, requirements, enabled, reason}`); tier-1 filters
   *  out `enabled:false` affordances before matching. */
  enabled?: boolean;
}

export interface ParseOptions {
  /** Everything the actor could plausibly name right now. Default []. */
  affordances?: readonly Affordance[];
}
```

This shape is chosen to need only a rename/no-op adapter when A1 lands
(`affordances(observation, actor) → [{verb, target, requirements, enabled,
reason}]`) — see Open Question 2 on the one field (`name`/`aliases`) A1's
current sketch doesn't carry, which grounding cannot work without.

### Matching algorithm

Deterministic, no scoring model — a small ranked set of exact/rules:

1. Filter `affordances` to `enabled !== false && verb === <canonical
   verb>`.
2. Normalize the noun phrase the same way as the utterance (lowercase,
   filler-stripped already by step 7 above).
3. For each candidate, compute the best of:
   - **3** — phrase equals `name` or any `alias`, exactly.
   - **2** — phrase is a substring of `name`/an alias, or vice versa
     (covers "sign" grounding "the stone sign", and "lantern thing"
     grounding "lantern" if authored as an alias).
   - **1** — phrase and `name` share at least one non-filler token.
   - **0** — no relation.
4. Take the candidates at the max score achieved by anyone:
   - max score is **0** (nobody matched) ⇒ `{ok:false, reason:"unknown"}`.
   - exactly **one** candidate at the max ⇒ ground to it.
   - **more than one** tied at the max ⇒ `{ok:false, reason:"ambiguous",
     candidates:[...targets]}` — tier-1 refuses to guess between two
     lanterns; this is the exact "must be able to say 'I don't know'"
     hook tiers 2/3 (or a simple disambiguation reply) can build on
     later.

This whole pass is a handful of string comparisons over a list that in
practice never exceeds single digits (whatever's on/adjacent to one
tile) — nowhere near the <1ms budget.

### Reach: which affordances the caller should pass in

Per "What the parser must produce" above, `take`/`read`/`look` wire
commands only ever act on the player's own tile (`take`/`read`) or are
resolved client-locally (`look`). The **caller** (golem-grid's adapter,
not `packages/language`) is responsible for only including affordances
that a *single* legal command can actually satisfy right now — i.e. the
same reach `handleTap` already computes when the tapped tile equals the
player's own tile (`adj` true, no `walkTo` needed). Passing in
"everything visible on the map, including far-away items reachable only
by walking first" would let the parser ground a noun the kernel will
then flatly deny — technically correct per the ground truth, but a
worse player experience than saying `unknown` up front. This filtering
policy is documented as part of the adapter, not the parser (which just
matches whatever list it's handed) — see Open Question 5.

## Output shape

```ts
export type Intent =
  | { type: "move"; dx: -1|0|1; dy: -1|0|1 }
  | { type: "take"; item?: string }
  | { type: "look"; target?: string }   // client-local; see below
  | { type: "read" }
  | { type: "say"; text: string }
  | { type: "party"; text: string }
  | { type: "whisper"; to: string; text: string }
  | { type: "emote"; text: string };

export type ParseOk   = { ok: true; intent: Intent };
export type ParseFail = { ok: false; reason: "unknown" | "ambiguous" | "empty";
                           candidates?: readonly string[] };
export type ParseResult = ParseOk | ParseFail;
```

`Intent` is the "structured output `{type, ...slots}`" DELTA names, and it
is intentionally the same *shape family* as `packages/kernel`'s `Command`
(a discriminated union any game module could validate) without being
golem-grid's actual `Command` (`Command = unknown`, and for golem-grid
specifically, a raw string). Serialization is a **separate, tiny,
golem-grid-specific step** — not part of `packages/language`'s public
surface, because baking golem-grid's string grammar into the generic
package would violate DELTA's own framing ("the *same* Command type the
kernel validates" describes a structural kinship, not code reuse across
games — compare how `packages/kernel`'s `Command` is explicitly "whatever
shape a game module's validate accepts", never one shape).

```js
// games/golem-grid/src/language-adapter.js (illustrative, not implemented
// by this design)
export function toCommand(intent) {
  switch (intent.type) {
    case "move":    return `move ${intent.dx} ${intent.dy}`;
    case "take":    return intent.item ? `take ${intent.item}` : "take";
    case "read":    return "read";
    case "say":     return `say ${intent.text}`;
    case "party":   return `party ${intent.text}`;
    case "whisper": return `whisper ${intent.to} ${intent.text}`;
    case "emote":   return `emote ${intent.text}`;
    case "look":    return null;   // no wire command — caller handles locally
  }
}
```

## Public API

```ts
// packages/language/src/index.ts
export function parse(utterance: string, opts?: ParseOptions): ParseResult;

export type { Affordance, ParseOptions, Intent, CanonicalVerb,
               ParseOk, ParseFail, ParseResult };
```

That is the entire public surface. `parse` is pure and synchronous:
tokenize (allocation-free beyond `split(/\s+/)`), a handful of `Map`
lookups, and an O(tokens × affordances) grounding pass over a list that's
realistically ≤10 elements — no regex beyond the initial whitespace
split/punctuation trim (no catastrophic-backtracking surface), matching
the `<1ms` budget with room to spare. `tables.ts`, `tokenize.ts`, and
`ground.ts` are internal modules exercised directly by their own unit
tests but not re-exported, so the package can refactor its internals
without a breaking change (same posture as `packages/net`'s
`transports.ts`/`messages.ts` staying internal to `index.ts`'s curated
export list).

## The ≥200-utterance test corpus

Lives at `packages/language/tests/corpus.json`: an array of category
blocks, each with a name and a list of `{utterance, expect}` cases, run by
`packages/language/tests/corpus.test.js` via `node:test` (`for (const
{name, cases} of corpus) for (const {utterance, expect} of cases) test(...)`
— one `node:test` case per corpus entry so failures point at the exact
utterance, not "some case in the JSON failed"). A single small, shared
`Affordance[]` fixture (`packages/language/tests/fixtures/affordances.js`
— a lantern, a stone sign/lore, a door, two other players "Aria"/"Bram",
and — deliberately — **two** same-verb items to exercise the ambiguous
path) is reused by every case that needs grounding.

Target category breakdown (sums to ≥200; exact counts are illustrative,
not contractual):

| category | ~count | covers |
|---|---|---|
| direction × aliases | 40 | all 4 cardinals × (word/letter/arrow/`go `/`walk `/`head `/`move ` prefixes) |
| take × phrasings × grounding | 45 | bare take, `take <item>`, get/grab/pick up/snag variants, no-match ⇒ unknown, two-candidate ⇒ ambiguous |
| look/examine (client-local) | 20 | bare look, look at `<target>`, examine/inspect aliases, grounding + ambiguous |
| read | 10 | bare read and read-with-ignored-args, still resolves to `{type:"read"}` |
| say/chat (plain sentences) | 25 | ordinary chat that must **not** match any verb table entry, including sentences that happen to contain a direction/verb word mid-sentence (must not false-positive) |
| party/whisper/emote × aliases | 30 | `/`-equivalent natural phrasings, whisper with/without a target token |
| negatives / gibberish → unknown | 20 | empty string, whitespace-only, nonsense tokens, an unmatched noun for take/look |
| punctuation/case/whitespace robustness | 15 | `"Go   NORTH!"`, trailing `?`, mixed case, doubled spaces |
| multi-word verb aliases | 15 | "pick up", "pick-up", "look at" |

Corpus authoring note: roughly 60% systematic coverage (every alias ×
every direction/verb, generated by a small script *once*, then frozen
into the committed JSON — not regenerated at test time, so the corpus is
an authored fixture like every other golden file in this repo) plus ~40%
hand-written natural phrasing/negative/edge cases, so the count isn't
padding from mechanical permutation (Open Question 3).

## Wiring into golem-grid chat (the DoD's second half)

Today, `games/golem-grid/src/input.js`'s `cmdEl` keydown handler:

```js
if(!raw.startsWith("/"))return sendCmd("say "+raw);
```

treats *all* non-slash text as chat. This design changes only that one
branch:

```js
if (!raw.startsWith("/")) {
  const result = parse(raw, { affordances: computeAffordances(S, me.x, me.y) });
  if (result.ok) return dispatchIntent(result.intent);   // sendCmd(toCommand(...)) or lookAt(...) for "look"
  return sendCmd("say " + raw);   // unknown/ambiguous ⇒ still ordinary chat, unchanged behavior
}
```

The `/`-prefixed slash grammar (`/take`, `/read`, `/party`, `/w`, `/me`,
`/who`, `/help`) is **left untouched** — it was already a deterministic,
tested 1:1 string mapping; routing it through `parse()` too would add
risk (a second code path exercising the same table) for no DoD benefit,
and CLAUDE.md's working practices favor the smaller diff. The DoD's
"golem-grid chat accepts natural commands through it" is satisfied by the
plain-text branch alone.

`computeAffordances(S, x, y)` is a **generalization of** (not a rewrite
of) the pure tile-inspection logic already inside `handleTap` in
`input.js` — the same computation that currently only runs for a *clicked*
tile (`itemAt(x,y)`, `S.dun.lore.has(k)`, `prizeCarrier()`, `players()...
occupants`) factored out so it can also be called with the player's own
`(me.x, me.y)` for the chat path. This factoring is explicitly named by
DELTA ("interim affordance source: golem-grid's context-menu logic
generalized") and is scoped as part of L1's implementation — small, pure,
no behavior change to the existing click menu (see Open Question 6).
`dispatchIntent` is the few-line switch shown under "Output shape" above,
living alongside `computeAffordances` (e.g. a new
`games/golem-grid/src/language-adapter.js`, imported by `input.js`, kept
out of `main.js`'s composition root the same way `perceive.js`/`render.js`
are already separated concerns).

Keyboard arrows are **not touched at all** — `moveStep`/the capture-phase
`keydown` handler call `sendCmd` directly today and continue to do so;
CLAUDE.md's "one key, one meaning: arrows are feet, always, capture-phase"
is a controls law, not a chat-parsing concern, and the parser only ever
sees text a player typed into `cmdEl`. Mobile PR1 made `cmdEl` opt-in
behind a chat toggle (`chat:{onOpen:()=>cmdEl.focus()}` in `main.js`) —
this design makes that field meaningfully more useful on a phone (typing
"grab the sword" now works without hunting for the right tap), which is
worth noting as motivation but requires no mobile-specific code changes.

## File/module layout

```
packages/language/
  package.json     # fill in: exports "." -> ./dist/index.js, types,
                   #   scripts.prepare = "tsc -p .", scripts.test = "node --test"
  tsconfig.json    # TS strict, ES2022, NodeNext, no node: APIs needed
  README.md
  src/
    index.ts       # public exports only: parse, Affordance, Intent, ParseResult...
    tables.ts       # VERB_ALIASES, DIRECTION_ALIASES, FILLER_WORDS
    tokenize.ts     # normalize + tokenize + longest-prefix verb-phrase match
    ground.ts       # groundNoun(phrase, verb, affordances) -> match/unknown/ambiguous
    parse.ts        # orchestrator: wires tokenize + tables + ground per verb
  tests/
    tables.test.js
    tokenize.test.js
    ground.test.js
    parse.test.js       # hand-picked unit cases, fast feedback during dev
    corpus.test.js      # loads corpus.json, drives all ≥200 cases (the DoD)
    corpus.json          # the authored ≥200-utterance corpus, by category
    fixtures/
      affordances.js     # shared small Affordance[] fixture for grounding cases

games/golem-grid/src/
  language-adapter.js   # new, small: computeAffordances(S,x,y), toCommand(intent),
                        #   dispatchIntent(intent) — golem-grid-specific glue only
  input.js              # modified: plain-text chat branch calls parse() + dispatchIntent
```

## Open questions / risks

1. **How much disambiguation UX belongs to L1.** Today, `ambiguous`/
   `unknown` both fall back to sending the raw text as chat (`say`) — so
   a genuinely ambiguous "take the sword" (two swords in reach) silently
   becomes a chat message with no feedback. A one-line templated
   `feedLine("Did you mean: sword-a, sword-b?", "sys")` hint (not a
   model, just formatting `ParseFail.candidates`) seems clearly in scope
   and low-risk, but the DoD only names the parser's *return value* and
   the chat *acceptance* path — whether the corpus/DoD needs to assert
   this UX too, or whether it's left to taste during implementation, is
   the orchestrator's call.
2. **Pre-aligning `Affordance` with A1's future shape.** A1 (Phase 5)
   will define `affordances(observation, actor) → [{verb, target,
   requirements, enabled, reason}]` and is explicitly documented to
   *replace* L1's interim source. This design's `Affordance` adds `name`/
   `aliases` (required for grounding-by-text) that A1's current one-line
   sketch doesn't carry. Worth flagging now so A1's design either adopts
   `name`/`aliases` directly (zero-churn swap) or documents where
   grounding vocabulary lives if `target` becomes a full entity id
   instead of a raw string post-C3.
3. **Corpus authoring effort/quality.** 200+ hand-authored utterances
   across 9 categories is achievable as pure data, but a corpus that's
   60% mechanical alias×direction permutation and 40% real phrasing is a
   judgment call on the ratio, not a hard requirement — if the
   orchestrator wants more (or less) systematic coverage vs. natural-
   language variety, that's cheap to adjust before writing 200 lines of
   JSON.
4. **Single-letter direction risk (`n`/`s`/`e`/`w`).** A player typing the
   literal chat message "w" (for whatever reason) will move west instead
   of sending "w" as a chat line, because bare single-token utterances
   check the direction table before falling through to `say`. This
   mirrors real MUD/IF convention and is almost certainly the right
   product call for this genre, but it is a real, visible behavior change
   from today (where *everything* non-slash is chat) — worth an explicit
   sign-off rather than assuming it's obviously fine.
5. **Take/read reach vs. the context menu's `walkTo`-then-act.** The
   context menu can reach a *distant* item (walk there, then auto-fire
   `take`), but a single typed "take the lantern" cannot, because
   `module.js`'s `take` command carries no coordinates. This design
   restricts the affordances passed to the parser to same-tile/adjacent
   reach so grounding never promises what the wire grammar can't deliver
   — but that means typed commands are strictly less capable than the
   tap menu for off-tile items. Whether a future tier (L2, or a "goto-
   then-act" compound command) should close this gap is left open; L1
   should not invent auto-walk-then-execute to paper over it now.
6. **`computeAffordances` extraction scope.** This design treats
   generalizing `handleTap`'s inline affordance-building logic in
   `input.js` into a reusable, DOM-free function as part of L1's
   implementation (DELTA names it as L1's own "interim affordance
   source"), not a separate prerequisite task. Confirming that scoping
   avoids a surprise mid-implementation.
7. **`<1ms` is not really at risk** given table-driven matching over a
   single-digit affordance list, but the corpus test suite should still
   assert wall-clock time on a batch run (e.g. all 200+ cases complete in
   well under 200ms total) so a future refactor that accidentally
   introduces something quadratic or regex-heavy gets caught by CI, not
   discovered in play.
8. **How far to expand social-verb aliases** (should "shout" alias to
   `party` instead of `say`? should "announce"/"holler" exist at all?).
   This design keeps the initial alias table conservative and 1:1 with
   the existing `/`-slash vocabulary, deferring expansion to actual
   playtesting feedback rather than guessing coverage the corpus DoD
   doesn't require.

## Orchestrator decisions (locks this design for implementation)

Resolved 2026-07-06 by the orchestrating agent.

**Two table corrections (caught in review — they are bugs, not preferences):**

- **A. Drop `"w"` from `VERB_ALIASES` (whisper).** As written, verb-match
  runs before the bare-direction fallback, so `"w"` → whisper → (no
  target) → unknown, which contradicts OQ4's own claim that `"w"` moves
  west. Bare `"w"` must resolve to **west** for a movement-first game.
  Whisper stays reachable via `"whisper"`/`"tell"` and the untouched `/w`
  slash command. (`"l"`/`"x"`/`"me"` have no direction overlap, so they
  stay.)
- **B. Remove `"up"` from `FILLER_WORDS`.** `"up"` is a direction; leaving
  it as filler makes `"go up"` strip to no-direction → unknown. The only
  reason it was there ("pick up X") is already handled by the 2-token
  verb-phrase match consuming `"pick up"` whole, so `"up"` never needs to
  be filler. After this, `"go up"` → move north and `"pick up the X"` →
  take X both work. (Add a corpus case for each.)

**Open-question resolutions:**

1. **Disambiguation UX:** `parse()` returns `{ok:false, reason:"ambiguous",
   candidates}`; the **golem-grid adapter** surfaces a one-line
   `feedLine("Did you mean: a, b?", "sys")` hint for `ambiguous` (pure
   formatting of `candidates`, no model) and does NOT send it as chat.
   `unknown` still falls back to `say` (it's probably chat). The corpus
   tests the parser's return values; the ambiguous-hint UX gets its own
   small adapter test.
2. **Affordance shape:** accepted as designed (`{verb,target,name,aliases,
   enabled}`). A1 alignment is noted for A1's future design, not forced
   now (YAGNI).
3. **Corpus:** 60% systematic / 40% hand-authored accepted; it is a
   **committed golden JSON** (generated once, frozen — never regenerated
   at test time), one `node:test` per case.
4. **Bare single-direction tokens → move: ACCEPTED**, documented behavior
   change (chat is opt-in behind the mobile chat toggle; the command field
   is for commands; multi-word non-command text still falls through to
   `say`).
5. **Take/read reach:** the adapter passes only **same-tile/adjacent**
   affordances (what one wire command can satisfy). Typed `take <noun>`
   cannot auto-walk to distant items — accepted tier-1 limitation; no
   "goto-then-act" invented here.
6. **`computeAffordances` extraction:** in scope for L1 (DELTA names it as
   the interim source) — a DOM-free generalization of `handleTap`'s inline
   logic, no behavior change to the click menu.
7. **Perf guard:** add a corpus-batch timing assertion (all cases well
   under a fixed budget) so a future quadratic/regex regression is caught
   by CI.
8. **Social aliases:** conservative set accepted.

Everything else in the design is accepted as written. Implementation:
fill `packages/language` (parse + tables + tokenize + ground + the ≥200
corpus) and add the golem-grid `language-adapter.js` (`computeAffordances`
+ `toCommand` + `dispatchIntent`) wiring only the plain-text chat branch —
`/`-slash grammar and arrow keys untouched; all frozen fixtures/golden/
freeze-verify stay byte-identical.
