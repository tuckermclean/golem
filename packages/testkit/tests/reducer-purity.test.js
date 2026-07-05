/* Purity + identity-blindness pinning for games/golem-grid/shared/
 * reducer.js's pure `reduce` export (DELTA K2). These characterize the
 * two properties the K2 brief calls out explicitly:
 *
 *   1. `reduce(state, world, event)` must not mutate the `state` it is
 *      handed, and must return a different object reference.
 *   2. `reduce`/`validate` are identity-blind: they take no "who is
 *      asking" argument at all, so replaying the same log from two
 *      independent initial states (standing in for "two different
 *      local players") must always converge on byte-identical
 *      serialized state — plus a source-level grep proving neither
 *      module references a local-identity variable (S.me / a local
 *      player binding), so a future edit that quietly threads one in
 *      fails this test even in cases the behavioral check wouldn't
 *      catch (e.g. an identity read that happens not to change output
 *      for this particular log).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { genDungeon } from "../../../games/golem-grid/shared/worldgen.js";
import { createState, applyEvent, reduce, serializeState } from "../../../games/golem-grid/shared/reducer.js";

const dun = genDungeon("plagueis");

test("purity: reduce does not mutate its input state and returns a new reference", () => {
  const st = createState();
  applyEvent(st, dun, { t: "JOIN", pid: "p1", name: "Ash", seq: 1 });
  const beforeBytes = serializeState(st);
  const preLogLength = st.log.length;
  const preLogRef = st.log;

  // reduce() doesn't validate legality (that's `validate`'s job) so any
  // coordinates exercise the MOVE case; light/x/y all get touched.
  const ev = { t: "MOVE", pid: "p1", x: dun.stairs.x + 1, y: dun.stairs.y, seq: 2 };
  const next = reduce(st, dun, ev);

  assert.equal(serializeState(st), beforeBytes, "reduce must not mutate the state handed to it");
  assert.notEqual(next, st, "reduce must return a new state object, not the same reference");
  assert.notEqual(next.D, st.D, "reduce must return a fresh Map for D, not the original reference");
  assert.equal(next.D.get("player:p1").x, dun.stairs.x + 1, "the returned state reflects the event");
  assert.equal(st.D.get("player:p1").x, dun.stairs.x, "the original state's player is untouched");

  // `serializeState` does not include `log` at all (see reducer.js), so
  // the assertions above are blind to a `reduce` that does
  // `st.log.push(ev); return {..., log: st.log, ...}` — in-place growth
  // of the original array PLUS aliasing the same reference out as the
  // "new" state's log. That variant would pass every assertion above
  // (byte-identical serialization, `next !== st`, `next.D !== st.D`)
  // while still mutating `st` and violating "reduce returns a NEW
  // state" for its `log` field specifically. Close that gap directly:
  assert.notEqual(next.log, st.log, "reduce must return a new log array, not the same reference (no aliasing)");
  assert.equal(st.log.length, preLogLength, "reduce must not grow the original state's log array in place");
  assert.equal(st.log, preLogRef, "the original state's log array reference must be completely untouched");
  assert.equal(next.log.length, preLogLength + 1, "the returned state's log must have exactly one more entry");
  assert.equal(next.log[next.log.length - 1], ev, "the returned state's log must end with the new event");
});

test("identity-blind: two independent replays of the same log (standing in for two different local players) converge byte-identically", () => {
  // reduce/validate take no local-identity argument at all — there is
  // no "as p1" vs "as p2" to pass. DELTA's wording asks for replaying
  // the same log "as" two different local players; since the functions
  // structurally cannot take one, the equivalent, honest test is: two
  // completely independent replays (fresh initial states, fresh calls)
  // of the same committed log must produce byte-identical serialized
  // state, because nothing about "who's asking" can leak in.
  const log = [
    { t: "JOIN", pid: "p1", name: "Ash", seq: 1 },
    { t: "JOIN", pid: "p2", name: "Brine", seq: 2 },
    { t: "MOVE", pid: "p1", x: dun.stairs.x + 1, y: dun.stairs.y, seq: 3 },
    { t: "SAY", pid: "p2", text: "hi", x: 0, y: 0, scope: "room", seq: 4 },
  ];

  const replayIndependently = () => {
    let st = createState();
    for (const ev of log) st = reduce(st, dun, ev);
    return st;
  };

  const asIfP1Local = replayIndependently();
  const asIfP2Local = replayIndependently();
  assert.equal(serializeState(asIfP1Local), serializeState(asIfP2Local));
});

test("source-level: reducer.js and module.js never reference a local-identity variable", () => {
  const files = {
    "reducer.js": new URL("../../../games/golem-grid/shared/reducer.js", import.meta.url),
    "module.js": new URL("../../../games/golem-grid/shared/module.js", import.meta.url),
  };
  for (const [name, url] of Object.entries(files)) {
    const src = readFileSync(url, "utf8");
    assert.doesNotMatch(src, /\bS\.me\b/, `${name} must not reference S.me (page-local identity)`);
    assert.doesNotMatch(src, /\blocalPlayer\b/i, `${name} must not reference a local-player identity binding`);
    assert.doesNotMatch(src, /\bisLocal\b/i, `${name} must not branch on "is this the local player"`);
  }
});
