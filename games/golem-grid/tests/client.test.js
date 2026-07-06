import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { genDungeon } from "../shared/worldgen.js";
import { createState, applyEvent, serializeState } from "../shared/reducer.js";
import { createClient } from "../src/client.js";

const dun = genDungeon("plagueis");
// This is the same frozen 75-event log used by replay.test.js (P0.3 fixture /
// packages/testkit/fixtures/golem/plagueis.log.json, byte-identical) — JOIN,
// SAY, and a full winning run of MOVE/TAKE/TAKE_PRIZE/WIN.
const log = JSON.parse(
  readFileSync(new URL("./golden/replay-log.json", import.meta.url), "utf8"),
);

test("K5 no-fork invariant: applySnapshot (kernel replay) and applyEvent (host/EVENT path) agree byte-for-byte", () => {
  const S = { seed: "plagueis", dun, me: "p1", isHost: false, st: createState() };
  const client = createClient(S);
  client.applySnapshot(dun, log);

  const direct = createState();
  for (const ev of log) applyEvent(direct, dun, ev);

  assert.equal(serializeState(S.st), serializeState(direct));
  assert.equal(S.st.seq, 75);
  assert.equal(S.st.over, true);
});

test("applyRemoteEvent mutates S.st in place to exactly the state a host commit of the same event would produce", () => {
  const S = { seed: "plagueis", dun, me: "p1", isHost: false, st: createState() };
  const client = createClient(S);
  const direct = createState();
  const stRef = S.st; // captured before any applyRemoteEvent call

  for (const ev of log) {
    client.applyRemoteEvent(ev);
    applyEvent(direct, dun, ev);
    assert.equal(serializeState(S.st), serializeState(direct), `diverged at seq ${ev.seq}`);
  }
  // in-place: the object identity of S.st never changed across the whole log
  assert.equal(S.st, stRef);
});

test("applySnapshot on an empty log yields the initial createState() shape", () => {
  const S = { seed: "plagueis", dun, me: null, isHost: false, st: createState() };
  const client = createClient(S);
  client.applySnapshot(dun, []);
  assert.equal(serializeState(S.st), serializeState(createState()));
});
