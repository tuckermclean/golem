# A1 PR1 — Affordances kernel API: the hook + shape (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 5 **A1** (Affordances as kernel API), **PR1 of 3**.
100% headless-verifiable (no browser). PR2 = golem-grid adoption
(context menu + parser); PR3 = tutorial-hint + twin-grounding consumer
tests. Builds on the `observe()` hook (S4 PR1).

## The canonical `Affordance` shape (locked)

DELTA quotes `{verb, target, requirements, enabled, reason}`; L1's
existing interim `Affordance` (`packages/language/src/ground.ts:11-23`)
adds `name` (required, for grounding) + `aliases?`. The canonical shape
is the **superset**:

```ts
export interface Affordance {
  verb: string;               // "take" | "look" | "attack" | ...
  target: string;             // opaque id the game hands back to itself
  name: string;               // grounding name ("lantern", "the keeper")
  aliases?: readonly string[];// grounding synonyms
  enabled?: boolean;          // default true
  requirements?: unknown;     // opaque condition tree (DELTA field; games
                              // may put a content ConditionNode here)
  reason?: string;            // why offered/disabled (tutorial/twin/UI)
}
```

`requirements` is `unknown` — the same opaque-condition idiom as
`components.ts`'s `Lock.unlockCondition`/`Interactable.enabledWhen`.
Non-grounding consumers ignore `name`/`aliases`; grounding ignores
`requirements`.

## Ownership + dependency direction (locked)

- Define the canonical `Affordance` interface **once in
  `packages/kernel`** (co-located with the hook it types) and tighten
  the `GameModule.affordances` return from `unknown` → `readonly
  Affordance[]` (`packages/kernel/src/index.ts:66`).
- `packages/language/src/ground.ts` keeps its **locally-declared,
  field-compatible** `Affordance` — do NOT add a `@golem-engine/kernel`
  dependency (the dependency-light idiom `context.ts:14-18` already uses
  for `Knowledge`). Add optional `requirements?`/`reason?` to L1's copy
  for exact parity, and update the doc comment: "interim source" →
  "matches `@golem-engine/kernel`'s `Affordance`; A1 has landed". No
  grounding logic changes (canonical is a superset of what `groundNoun`
  needs; existing `route`/`parse` tests stay green).
- Update `packages/kernel/tests/*` (the toy/type-check module) to
  exercise the tightened `affordances` signature so TS strict stays
  green.

## some-hero standalone `affordances()` (the conformance proof)

A kernel hook only one game implements isn't proven as an API. some-hero
gets a standalone `affordances(observation, actor) → Affordance[]` in
`shared/module.js` (like `observe`/`narrativeFacts` were added there),
proving the hook generalizes across two very different `Obs` shapes.
Derive from the observation's state:
- **`proceed`** — enabled iff `state.pending?.kind === "ceremony"`
  (verb `"proceed"`, target `"tomb"`, `reason` when disabled).
- **`resurrect`** — enabled iff `state.pending?.kind === "resurrection"`.
- **`attack <enemyId>`** — one per adjacent enemy in `run.enemies`
  (enabled iff within melee range of `character.pos`), `name`=kind,
  target=enemy id.
- **`descend`/gate** — at the guild-hall stairs: enabled iff credentials
  satisfy the Door Golem `Lock` (use `@golem-engine/content`'s
  `evaluate()` on `world.gate.unlockCondition` with a credential
  `factLookup` — some-hero already depends on content); `requirements` =
  the `unlockCondition`; `reason` = the missing-credentials list when
  disabled.

Pure, deterministic; add `affordances` to the exported `module` object.
Optionally add a some-hero `observe()`-fed path, but affordances can read
the observation directly.

## Tests (headless)

- `packages/kernel` type-check test compiles with the tightened
  signature (TS strict, zero errors).
- `packages/language` `ground`/`parse`/`route` tests still green (no
  behavior change; the doc-only + optional-field edit to `ground.ts`
  must not break them).
- `games/some-hero/tests/affordances.test.js` (new) — `affordances`
  returns the right verbs per state: proceed enabled only mid-ceremony,
  resurrect only when dead-pending, attack per adjacent enemy, gate
  enabled/disabled by credentials with the missing-list `reason`; each
  Affordance has the canonical shape; pure (no mutation).

## Gates

`npm test` all workspaces fail 0 (kernel type-check, language, some-hero
+ new affordances test); `test:ceremony` 62 / `test:ceremony-kernel` 60
unchanged; `freeze:verify` green; `content/pack.json` + goldens
byte-unchanged; `check-bans` clean; some-hero `affordances` imports
nothing from `legacy/`. `packages/language` gains NO new dependency.

## Scope boundaries (PR1)

The hook + canonical shape + L1 doc reconciliation + some-hero
conformance `affordances()` only. **NO golem-grid adoption** (PR2 — that's
where `entitiesOf()` + context-menu + parser swap + the
`entities-not-in-callgraph` banned-list update live). **NO** tutorial-
hint/twin-grounding helpers (PR3). No `observe()` redesign. No
`content/pack.json` change.
