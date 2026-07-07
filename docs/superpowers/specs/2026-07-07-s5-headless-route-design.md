# S5 check 1 — Headless full-route bit-identical replay (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 4 **S5** (THE CEREMONY — acceptance gate). This is
**check 1 of 5**: "Headless run of the full route from (contentHash,
seed, scripted command log) twice → bit-identical final-state hashes."
The other checks: 2 (@ceremony tests — DONE, 62 green), 5 (golem-grid +
topdown-puzzle on the same kernel — DONE), 3–4 (fully playable / twin-
narrated interactive) — **browser-blocked, deferred** (no browser here or
in CI). This PR delivers the headless, fully-verifiable heart of the
acceptance gate.

## What it proves

The entire some-hero engine — Door Golem gate ceremony, ow→tomb zone swap
with a SEEDED generated floor, grid movement, tick-driven skeleton
combat, contact-damage death, resurrection-as-reduce, and the Ledger
fact/render seam — runs end-to-end and **replays bit-identically** from a
committed (seed, command log). This is the determinism doctrine (#1–3)
proven across the whole Ceremony route, not just per-system.

## The route (achievable with what's built — no interactive seal needed)

Death on floor 1 ends the route, so the deferred interactive seal-puzzle
resolution (riddle-answer / plates) is NOT required:

1. **Setup**: `createHost` (src/host.js) with a fixed `seed`; grant the
   three credentials the Door Golem requires — `character.swordLv >= 1`,
   `knowledge.credentials.backstory = true`, `...debt = true` (via the
   real grant events/commands, or a documented arranged start state).
2. **Gate ceremony**: move onto the guild-hall stairs tile → `[MOVED,
   GOLEM_APPROVED]` (credentials complete) → `"proceed"` → `[ENTERED_TOMB]`
   with `mapId = "tomb:<seed>:<runs>:1"` (the generated floor).
3. **Tomb**: navigate the generated floor; drive **explicit `"tick"`
   commands** (NOT the real-time clock — determinism) so a skeleton
   closes to contact and lands `HURT`s until `character.hp <= 0` → `DIED`.
4. **Resurrection**: `"resurrect"` → `[RESURRECTED]` (back to ow, deaths++,
   garnishment, runStats.died).
5. **Ledger**: `narrativeFacts(state, world, DIED)` → `renderLedger(facts)`
   produces the death report prose (the twin-disabled path).

Record the **full committed event log** across the whole route (the host
already seq-stamps + commits; capture each committed event).

## The replay assertion (check 1's core)

- Replay the committed log **twice** from a fresh `createState()` through
  a **segmented-replay** helper (the route crosses ow→tomb→ow, so re-
  derive the World on each world-changing event — the same helper the S2b
  PR3 determinism test introduced; reuse it) — asserting
  `h32(serializeState(final))` is **byte-identical** across: the live run,
  replay #1, and replay #2. (contentHash is fixed — the committed
  `content/pack.json` hash; note it in the test for the "(contentHash,
  seed, log)" framing.)
- Assert the route actually hit the beats (so it's not a vacuous replay
  of a no-op): `ENTERED_TOMB` happened (zone reached "tomb", mapId
  `tomb:`-prefixed), `DIED` happened, `RESURRECTED` happened (zone back to
  "ow", `knowledge.deaths` incremented), and `renderLedger` produced a
  non-empty death report.

## Where it lives

`games/some-hero/tests/e2e-headless/full-route.test.js` (node:test,
headless — NOT Playwright, NOT browser). Optionally a committed
`full-route.log.json` fixture (the scripted command list) so the route is
a permanent, inspectable artifact. May reuse the ceremony-kernel helpers
(`kernel-helpers.mjs`'s `guildHallWorld()` etc.) and src/host.js.

## Gates

`npm test --workspace @golem-engine/some-hero` green (+ the new full-route
test); `test:ceremony` 62 / `test:ceremony-kernel` 60 unchanged; `npm
test` all workspaces fail 0; `freeze:verify` green; `content/pack.json` +
floor goldens byte-unchanged; `check-bans` clean; shipped code imports
nothing from `legacy/`. Consider wiring the full-route test into
`freeze:verify` as the permanent Ceremony-acceptance gate (check 1).

## Scope boundaries

Headless check 1 ONLY. NO browser visual smoke (S4 PR2, deferred). NO
interactive twin-narration Playwright (S5 check 4, browser). NO
interactive seal-puzzle resolution (deferred; the route ends in death, so
it isn't needed). No `content/pack.json`/golden change. If the route
can't be scripted to a clean death with current systems, report exactly
what's missing rather than faking it — that's a real finding about
Ceremony completeness.
