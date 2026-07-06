/* ── HOST integration: drives the REAL createHost -> hostCmd -> hostCommit
   path (not validate() in isolation), the composition that actually runs
   at play time. This is the coverage gap that let the LIGHT_WARN/WIN/LOSE
   double-emit blocker ship: validate() moved the derived-event derivation
   into shared/module.js (K2), but host.js kept its own recursive copy, so
   every derived event was committed twice. The load-bearing invariant
   here — "hostCmd commits EXACTLY the events validate() decides, in order,
   no duplication" — fails on the buggy host and is what pins the fix. ─── */
import test from "node:test";
import assert from "node:assert/strict";
import { createHost } from "../src/host.js";
import { createState, applyEvent } from "../shared/reducer.js";
import { deriveWorld, validate } from "../shared/module.js";

const SEED = "golem";

function setup() {
  const dun = deriveWorld(SEED);
  const S = { seed: SEED, dun, me: "p1", isHost: true, st: createState() };
  applyEvent(S.st, S.dun, { t: "JOIN", pid: "p1", name: "P1", seq: 1 });
  return S;
}

function legalDirFrom(S, x, y) {
  const GH = S.dun.grid.length, GW = S.dun.grid[0].length;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx>=0 && ny>=0 && nx<GW && ny<GH && S.dun.grid[ny][nx] !== "#") return [dx, dy];
  }
  throw new Error("no legal move available from " + x + "," + y);
}

// Drive one command through the real host; return the committed events AND
// the events validate() decided for the same pre-move state.
function drive(S, cmd) {
  const committed = [];
  const NET = { send() {} };
  const Host = createHost(S, NET, { onCommit: (ev) => committed.push(ev), onDenyLocal() {} });
  const decided = validate({ st: S.st, dun: S.dun, from: "p1" }, cmd); // pure, pre-move
  Host.hostCmd("p1", cmd);
  return { committed, decided };
}

// The core invariant, asserted in every scenario below.
function assertHostMatchesValidate(committed, decided) {
  assert.ok(Array.isArray(decided), "validate should return an event array for a legal command");
  assert.deepEqual(committed.map((e) => e.t), decided.map((e) => e.t),
    "host must commit exactly the events validate() decided — same types, same order, no duplication");
}

test("plain move commits exactly [MOVE] (no derived events)", () => {
  const S = setup();
  const p = S.st.D.get("player:p1");
  const [dx, dy] = legalDirFrom(S, p.x, p.y);
  const { committed, decided } = drive(S, `move ${dx} ${dy}`);
  assertHostMatchesValidate(committed, decided);
  assert.deepEqual(committed.map((e) => e.t), ["MOVE"]);
});

test("a light-tier crossing commits exactly ONE LIGHT_WARN (not two)", () => {
  const S = setup();
  const p = S.st.D.get("player:p1");
  const [dx, dy] = legalDirFrom(S, p.x, p.y);
  S.st.D.set("light", 181); // one non-prize move -> 180, crosses the 180 tier exactly once
  const { committed, decided } = drive(S, `move ${dx} ${dy}`);
  assertHostMatchesValidate(committed, decided);
  assert.deepEqual(committed.map((e) => e.t), ["MOVE", "LIGHT_WARN"]);
  assert.equal(committed.filter((e) => e.t === "LIGHT_WARN").length, 1);
});

test("running out of light commits exactly ONE LOSE", () => {
  const S = setup();
  const p = S.st.D.get("player:p1");
  const [dx, dy] = legalDirFrom(S, p.x, p.y);
  S.st.D.set("light", 1); // one non-prize move burns 1 -> 0
  const { committed, decided } = drive(S, `move ${dx} ${dy}`);
  assertHostMatchesValidate(committed, decided);
  assert.deepEqual(committed.map((e) => e.t), ["MOVE", "LOSE"]);
  assert.equal(committed.filter((e) => e.t === "LOSE").length, 1);
});

test("carrying the prize onto the stairs commits exactly ONE WIN", () => {
  const S = setup();
  const { x: sx, y: sy } = S.dun.stairs;
  // place p1 on a non-wall neighbour of the stairs, then step onto the stairs
  const [dx, dy] = legalDirFrom(S, sx, sy); // dir stairs -> neighbour
  const ax = sx + dx, ay = sy + dy;
  const p = S.st.D.get("player:p1");
  S.st.D.set("player:p1", { ...p, x: ax, y: ay });
  S.st.D.set("prize_by", "p1");
  S.st.D.set("light", 360);
  const { committed, decided } = drive(S, `move ${-dx} ${-dy}`); // neighbour -> stairs
  assertHostMatchesValidate(committed, decided);
  assert.deepEqual(committed.map((e) => e.t), ["MOVE", "WIN"]);
  assert.equal(committed.filter((e) => e.t === "WIN").length, 1);
});

test("committed events carry strictly increasing seq stamps", () => {
  const S = setup();
  const p = S.st.D.get("player:p1");
  const [dx, dy] = legalDirFrom(S, p.x, p.y);
  S.st.D.set("light", 181);
  const { committed } = drive(S, `move ${dx} ${dy}`);
  for (let i = 1; i < committed.length; i++) {
    assert.equal(committed[i].seq, committed[i - 1].seq + 1,
      "each committed event's seq must be exactly one past its predecessor");
  }
});
