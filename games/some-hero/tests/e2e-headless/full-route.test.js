/* ── S5 CHECK 1 — the headless full-route bit-identical replay (design
   spec: docs/superpowers/specs/2026-07-07-s5-headless-route-design.md).
   The Ceremony acceptance gate's fully-verifiable core: the ENTIRE some-
   hero engine — Door Golem gate ceremony, ow->tomb zone swap onto a
   SEEDED generated floor, grid movement, tick-driven skeleton contact
   damage, death, resurrection-as-reduce, and the Ledger fact/render seam
   — driven end-to-end through the REAL src/host.js `createHost`
   (validate -> seq-stamp -> commit) discipline, from a fixed
   (contentHash, seed, command log), and proven to replay BIT-IDENTICALLY
   (h32(serializeState(...))) across the live run and two independent
   replays. HEADLESS (node:test) — no browser, no Playwright, no real-time
   clock (every tick is an explicit "tick" command).

   contentHash: games/some-hero/content/pack.json's own "hash" field,
   c85d0a5095884c149fb54c9002a5683bb1383602f314d20f561d47e60ef29766 — the
   REAL committed content this route runs against (rules/pack.js's
   already-compiled `pack`, never recompiled here), fixed for the
   "(contentHash, seed, log)" framing this check proves determinism over.

   ── Bootstrap precedent: tests/derive-world-dispatch.test.js's own
   "production flow" test (the only other `createHost` call site in this
   package) establishes the pattern this file follows exactly: FLOOR_
   ENTERED is committed via a direct `reduce()` call (not through the
   host — the host doesn't exist yet, and validate() has no verb that
   produces FLOOR_ENTERED; this is the doctrinal "how did State come to
   have a valid character position" bootstrap event, same category as
   golem-grid's JOIN / topdown-puzzle's LEVEL_LOADED), THEN credentials/
   swordLv are arranged directly on that state before `S`/the host are
   constructed. No GRANT_* command or event exists anywhere in this
   kernel port yet — see this file's own "arranged start" section below
   for the documented substitute, and the task's final report for this
   as a flagged Ceremony-completeness gap.

   ── The route (achievable with what's built — death on floor 1 ends it,
   so the deferred interactive seal-puzzle resolution is not needed):
     1. Walk onto the Guild Hall's stairs tile with all 3 credentials
        already satisfied -> [MOVED x5, GOLEM_APPROVED] (ceremony played,
        descent gated behind "proceed").
     2. "proceed" -> [ENTERED_TOMB] with mapId "tomb:1:0:1" (the SEEDED
        generated floor — shared/floorgen.js's generateFloor("1", 1) via
        shared/module.js's `deriveWorld` dispatcher).
     3. Navigate the generated floor (36 scripted moves — found by an
        offline BFS search, see "Finding the route" below) to a cell
        Manhattan-distance 2 from an ISOLATED skeleton (id "e6", spawned
        at (24,11), >=5 tiles from every other enemy on this floor — no
        other enemy interferes with the one tick this route drives).
     4. ONE explicit "tick" -> [TICK_ADVANCED, ENEMY_MOVED, HURT, DIED].
        The skeleton steps from (24,11) to (25,11) — newly adjacent to
        the player at (26,11) (shared/tick.js's re-arm-on-separation
        contact rule: distance 2 -> not touching pre-step; distance 1
        post-step -> newly touching -> HURT). hp was arranged to 1 (see
        below), so this single genuine contact HURT (skeleton dmg 1)
        drops hp to 0 -> DIED is derived in the same tick, exactly the
        same sim-and-inspect bridge shared/module.js's own "hurt" verb
        uses.
     5. "resurrect" -> [RESURRECTED]: back to "ow", knowledge.deaths++,
        garnishment, runStats.died.
     6. narrativeFacts(state, world, DIED) -> renderLedger(facts) — the
        twin-disabled Ledger path (src/ledger-render.js) — produces the
        death report prose.

   ── Finding the route: shared/floorgen.js's generateFloor is a pure,
   deterministic function of (seed, floorNum) with no golden fixture
   pinning any particular seed's geometry (S3 PR3's golden fixtures cover
   OTHER seeds, not this one) — so an offline BFS search (not committed,
   see the log fixture's own "//seed" comment) tried seeds "1".."400"
   until one produced a skeleton isolated from every other enemy (>=5
   tiles) with a walkable target cell at Manhattan-distance exactly 2
   from it, reachable from spawn. Seed "1" was the first to satisfy this;
   nothing about seed "1" itself is special beyond that.

   ── Segmented replay: @golem-engine/kernel's `replay()` takes ONE World
   for an entire log (packages/kernel's own contract), but this route
   crosses ow -> tomb -> ow (two world-tier changes), so a plain single-
   World replay() is not enough — same problem src/host.js's own
   `hostCommit` solves for the LIVE run (its header comment: "after every
   commit whose reduce() call actually changed `state.world`... re-derive
   `S.world`... before the next thing gets committed"). NO reusable
   segmented-replay helper exists anywhere in this package today (despite
   this check's design spec describing one as already precedented in
   tests/determinism.test.js — that file's own PR4 test explicitly notes
   "no segmented-replay helper — none exists yet", confirmed by reading
   it) — `replayLog` below is a new, small helper that mirrors src/
   host.js's own world-swap re-derivation exactly (reference-inequality
   check on `state.world`, `deriveWorld(pack, state.world, seed)` on
   change), so its correctness rests on the SAME logic already proven
   live. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { h32 } from "@golem-engine/random";
import { createState, reduce, serializeState } from "../../shared/reducer.js";
import { deriveWorldFromPack, deriveWorld, narrativeFacts } from "../../shared/module.js";
import { createHost } from "../../src/host.js";
import { renderLedger } from "../../src/ledger-render.js";
import { pack } from "../../rules/pack.js";

const FIXTURE = JSON.parse(
  readFileSync(new URL("./full-route.log.json", import.meta.url), "utf8"),
);
const { seed: SEED, arrangedStart, commands } = FIXTURE;

const OW_WORLD_STATE = { zone: "ow", floorNum: 0, mapId: "map:guild_hall" };

/** The one, fixed, deterministic pre-log baseline: FLOOR_ENTERED (a
 *  direct reduce() call — see this file's header) folded through
 *  createState(), then the documented credential/swordLv/hp arrangement
 *  applied. Used identically to seed BOTH the live run and every replay
 *  — the arrangement is not part of "the log" (no event produced it),
 *  but it is exactly as deterministic and reproducible as one. */
function arrangedInitialState(owWorld) {
  let st = reduce(createState(), owWorld, {
    t: "FLOOR_ENTERED",
    zone: OW_WORLD_STATE.zone,
    floorNum: OW_WORLD_STATE.floorNum,
    mapId: OW_WORLD_STATE.mapId,
    seq: 1,
  });
  return {
    ...st,
    knowledge: { ...st.knowledge, credentials: { ...arrangedStart.credentials } },
    character: { ...st.character, swordLv: arrangedStart.swordLv, hp: arrangedStart.hp },
  };
}

/** Fold a committed event log through reduce(), re-deriving `world`
 *  (via the SAME `deriveWorld` dispatcher src/host.js's hostCommit uses)
 *  every time an event's own reduce() call actually changes
 *  `state.world` (reference inequality — see this file's header). */
function replayLog(initialState, initialWorld, log) {
  let state = initialState;
  let world = initialWorld;
  for (const ev of log) {
    const prevWorldTier = state.world;
    state = reduce(state, world, ev);
    if (state.world !== prevWorldTier) {
      world = deriveWorld(pack, state.world, SEED);
    }
  }
  return state;
}

test("S5 check 1: the full Ceremony route replays bit-identically (live + 2 replays)", () => {
  const owWorld = deriveWorldFromPack(pack, OW_WORLD_STATE);
  const initialState = arrangedInitialState(owWorld);

  // ── Live run: a real seeded host, driven by the committed command
  // script (tests/e2e-headless/full-route.log.json), capturing every
  // committed event (the log we will replay) plus the state snapshot
  // immediately BEFORE the DIED event's own reduce() (narrativeFacts'
  // documented contract: "state here is the PRE-event state" — shared/
  // module.js's own header). onCommit fires AFTER S.st is updated for
  // the event just committed, so `prevState` (captured at the END of the
  // previous onCommit call) is exactly that pre-event snapshot for
  // whatever commits next.
  const S = { st: initialState, world: owWorld, pack, seed: SEED };
  const log = [];
  const denials = [];
  let prevState = S.st;
  let diedContext = null;
  const host = createHost(S, {
    onCommit: (ev) => {
      log.push(ev);
      if (ev.t === "DIED") {
        diedContext = { stateBeforeDied: prevState, worldAtDied: S.world, diedEvent: ev };
      }
      prevState = S.st;
    },
    onDenyLocal: (reason) => denials.push(reason),
    onCmd: () => {},
  });

  for (const cmd of commands) host.hostCmd("hero", cmd);
  assert.deepEqual(denials, [], "no command in the scripted route should be denied");

  // ── Beat assertions (not a vacuous replay of a no-op) ──────────────
  const enteredTomb = log.find((ev) => ev.t === "ENTERED_TOMB");
  assert.ok(enteredTomb, "ENTERED_TOMB must have happened");
  assert.equal(enteredTomb.zone, "tomb");
  assert.match(enteredTomb.mapId, /^tomb:/, 'ENTERED_TOMB\'s mapId must be "tomb:"-prefixed (the seeded generated floor)');
  assert.equal(enteredTomb.mapId, `tomb:${SEED}:0:1`);

  const died = log.find((ev) => ev.t === "DIED");
  assert.ok(died, "DIED must have happened");
  assert.ok(diedContext, "the DIED event's pre-event state/world must have been captured");

  const resurrected = log.find((ev) => ev.t === "RESURRECTED");
  assert.ok(resurrected, "RESURRECTED must have happened");
  assert.equal(S.st.world.zone, "ow", "the route must climb back out to the overworld");
  assert.equal(S.st.knowledge.deaths, 1, "knowledge.deaths must have incremented");

  // ── The Ledger seam: narrativeFacts(state, world, DIED) -> renderLedger ──
  const facts = narrativeFacts(diedContext.stateBeforeDied, diedContext.worldAtDied, diedContext.diedEvent);
  assert.ok(facts, "narrativeFacts must produce something for a DIED event");
  assert.equal(facts.kind, "death");
  const report = renderLedger(facts);
  assert.ok(typeof report === "string" && report.length > 0, "renderLedger must produce a non-empty death report");

  // ── The replay assertion (check 1's core): replay the SAME committed
  // log twice, from the SAME deterministic baseline, through the
  // segmented-replay helper above (crossing ow -> tomb -> ow) —
  // byte-identical h32(serializeState(...)) across live + replay #1 +
  // replay #2.
  const liveHash = h32(serializeState(S.st));

  const replay1 = replayLog(arrangedInitialState(owWorld), owWorld, log);
  const replay1Hash = h32(serializeState(replay1));
  assert.deepEqual(replay1, S.st, "replay #1 must reproduce a structurally-identical state");
  assert.equal(replay1Hash, liveHash, "replay #1's hash must be byte-identical to the live run's hash");

  const replay2 = replayLog(arrangedInitialState(owWorld), owWorld, log);
  const replay2Hash = h32(serializeState(replay2));
  assert.deepEqual(replay2, S.st, "replay #2 must reproduce a structurally-identical state");
  assert.equal(replay2Hash, liveHash, "replay #2's hash must be byte-identical to the live run's hash");

  // A record of the exact bit-identical hash + beats, for the task
  // report (no assertion below this line — pure documentation-by-log).
  assert.equal(pack.hash, "c85d0a5095884c149fb54c9002a5683bb1383602f314d20f561d47e60ef29766", "the contentHash this route ran against, for the (contentHash, seed, log) framing");
});
