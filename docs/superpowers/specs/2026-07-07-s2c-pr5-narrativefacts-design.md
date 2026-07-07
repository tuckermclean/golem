# S2c PR5 — narrativeFacts + template narration (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 4 S2, **S2c PR5**. Builds on S2a (rules/ledger.js),
S2b (state machine), S2c PR4 (combat/runStats). First real implementation
of the kernel's `narrativeFacts` hook (`packages/kernel/src/index.ts:70`:
`narrativeFacts(state, world, event): Facts`). **Closes 0 ceremony tests**
(ledger-text is already fully mirrored via the pure `rules/ledger.js` in
S2a) — this PR proves the *fact-emission seam* S5's twin-narrated Ledger
(check 4) and the twin-disabled template path (check 3) both need.

## The doctrine resolution (VISION law 5)

Law 5: "the model never owns truth... may not assert facts." But
`deathReport`/`gradeRun` ARE deterministic *authored prose selection* —
the Ledger's own voice, not neutral data. Resolution:

- **`narrativeFacts` returns RAW FACTS ONLY** — never pre-rendered prose.
  A death event → `{kind:"death", cause, deaths, repeatCause}`; an
  `EXITED_TOMB` → `{kind:"grade", grade, depth, kills, killsByKind,
  died}`. Pure, deterministic, neutral data.
- **A separate template-narration renderer** (`renderLedger(facts) →
  string`, a new module — `src/ledger-render.js` or `rules/`) consumes
  those facts and calls the S2a `rules/ledger.js` prose fns
  (`deathReport`/`gradeRun`/`gradeRemark`/…) to produce the actual
  prose. This is the **twin-disabled path** (law 10 / S5 check 3).
- The **same facts** are what a future twin (L4–L6, S5 check 4) renders
  from. Neither path lets the model own truth: the facts are the truth,
  computed by the engine; the renderer (template or twin) only phrases
  them.

So the prose-selection logic stays where S2a already put it
(`rules/ledger.js`), `narrativeFacts` stays neutral, and the renderer is
the thin bridge.

## narrativeFacts(state, world, event) → Facts

Emit per event kind (return `null`/empty for events with no narration):
- **`DIED`** → `{ kind: "death", cause: event.cause, deaths:
  state.knowledge.deaths, repeatCause: state.knowledge.repeatCause }`
  (read post-reduce knowledge, i.e. after `recordDeath` — confirm whether
  the hook sees pre- or post-event state; if pre, derive from event +
  state consistently). Sufficient for `deathReport(meta, cause)`.
- **`EXITED_TOMB`** → `{ kind: "grade", grade: gradeRun(...), depth:
  runStats.depth, kills: runStats.kills, killsByKind, died:
  runStats.died }`. Sufficient for `gradeRun`/`gradeRemark`.
- Other events → no facts (return null).

Wire `narrativeFacts` into `shared/module.js`'s exported `module`
(`KernelCore` → full `GameModule` shape) — it becomes the 4th exported
capability alongside deriveWorld/validate/reduce.

## renderLedger(facts) → string (the template path)

```
renderLedger(facts):
  death → deathReport({deaths, repeatCause}, cause)  (+ any suffix logic already in rules/ledger.js)
  grade → gradeRemark(facts.grade)  / a grade line assembled from gradeRun output
```

Pure, deterministic, reuses `rules/ledger.js` unchanged. This is the
renderer a host calls to show the Ledger with the twin off — and the
exact prose it produces must match what `ledger-text.ceremony.test.js`
pins (since it IS `rules/ledger.js`).

## Tests

- `narrative-facts.test.js`: `narrativeFacts` emits the correct raw facts
  per event (death/grade), returns null for others, is pure (never
  prose).
- `ledger-render.test.js`: `renderLedger(narrativeFacts(...))` reproduces
  the exact `rules/ledger.js` prose for a death and a graded run — the
  round-trip proving facts→template→prose matches the S2a mirror
  (import the same expected strings the ledger-text mirror uses; do NOT
  reintroduce scarab — use a live cause like skeleton/mailbat).
- **Gates unchanged**: legacy ceremony 62, ceremony-kernel 60,
  `freeze:verify` green, `content/pack.json` byte-unchanged. **0 new
  ceremony tests.**

## Scope boundaries

`narrativeFacts` is facts-only (no prose in it, ever). The renderer
reuses `rules/ledger.js` (no new prose logic). No twin (L4–L6, infra-
blocked). No `observe`/`affordances` (separate hooks; not this PR). No
scarab (dead holdover). `shared/` imports nothing from `legacy/`. Reducer/
validate unchanged except adding the `narrativeFacts` export.
