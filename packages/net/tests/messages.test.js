/* Message-guard tests (K4): exactly five kinds, no sixth, no extra
 * fields silently accepted by the type guards' discriminant check. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isMessage,
  isHello,
  isSnapshot,
  isCmd,
  isEvent,
  isDeny,
} from "@golem-engine/net";

const FIVE = [
  { k: "HELLO", pid: "p1", name: "Wanderer" },
  { k: "SNAPSHOT", to: "p1", seed: "plagueis", log: [] },
  { k: "CMD", from: "p1", cmd: "move 0 -1" },
  { k: "EVENT", ev: { t: "MOVE", pid: "p1", x: 1, y: 2 } },
  { k: "DENY", to: "p1", reason: "Stone does not negotiate." },
];

test("isMessage accepts exactly the five kinds", () => {
  for (const m of FIVE) assert.equal(isMessage(m), true, JSON.stringify(m));
});

test("isMessage rejects a sixth kind and non-objects", () => {
  assert.equal(isMessage({ k: "PING" }), false);
  assert.equal(isMessage({ k: "GOODBYE" }), false);
  assert.equal(isMessage(null), false);
  assert.equal(isMessage(undefined), false);
  assert.equal(isMessage("HELLO"), false);
  assert.equal(isMessage(42), false);
  assert.equal(isMessage({}), false);
});

test("per-kind guards discriminate correctly (no cross-matching)", () => {
  const [hello, snapshot, cmd, event, deny] = FIVE;
  assert.equal(isHello(hello), true);
  assert.equal(isSnapshot(hello), false);
  assert.equal(isCmd(hello), false);
  assert.equal(isEvent(hello), false);
  assert.equal(isDeny(hello), false);

  assert.equal(isSnapshot(snapshot), true);
  assert.equal(isHello(snapshot), false);

  assert.equal(isCmd(cmd), true);
  assert.equal(isHello(cmd), false);

  assert.equal(isEvent(event), true);
  assert.equal(isHello(event), false);

  assert.equal(isDeny(deny), true);
  assert.equal(isHello(deny), false);
});
