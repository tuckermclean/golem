/* nextPortalState: the full pure FSM transition table (A2 — see
 * docs/superpowers/specs/2026-07-07-a2-regions-design.md). Every
 * current x action pair is exercised explicitly (no loop-generated
 * table-vs-itself tautology). */
import test from "node:test";
import assert from "node:assert/strict";
import { nextPortalState } from "../dist/index.js";

test("nextPortalState: closed -> open via open", () => {
  assert.equal(nextPortalState("closed", "open"), "open");
});
test("nextPortalState: closed -> closed via close (no-op)", () => {
  assert.equal(nextPortalState("closed", "close"), "closed");
});
test("nextPortalState: closed -> locked via lock", () => {
  assert.equal(nextPortalState("closed", "lock"), "locked");
});
test("nextPortalState: closed -> closed via unlock (no-op)", () => {
  assert.equal(nextPortalState("closed", "unlock"), "closed");
});

test("nextPortalState: open -> open via open (no-op)", () => {
  assert.equal(nextPortalState("open", "open"), "open");
});
test("nextPortalState: open -> closed via close", () => {
  assert.equal(nextPortalState("open", "close"), "closed");
});
test("nextPortalState: open -> open via lock — ILLEGAL in one step, stays open", () => {
  assert.equal(nextPortalState("open", "lock"), "open");
});
test("nextPortalState: open -> open via unlock (no-op)", () => {
  assert.equal(nextPortalState("open", "unlock"), "open");
});

test("nextPortalState: locked -> locked via open — illegal, stays locked", () => {
  assert.equal(nextPortalState("locked", "open"), "locked");
});
test("nextPortalState: locked -> locked via close (no-op)", () => {
  assert.equal(nextPortalState("locked", "close"), "locked");
});
test("nextPortalState: locked -> locked via lock (no-op)", () => {
  assert.equal(nextPortalState("locked", "lock"), "locked");
});
test("nextPortalState: locked -> closed via unlock — the only way out of locked", () => {
  assert.equal(nextPortalState("locked", "unlock"), "closed");
});

test("nextPortalState: deterministic — same input always yields same output", () => {
  const states = ["open", "closed", "locked"];
  const actions = ["open", "close", "lock", "unlock"];
  for (const s of states) {
    for (const a of actions) {
      const first = nextPortalState(s, a);
      const second = nextPortalState(s, a);
      assert.equal(first, second, `nextPortalState(${s}, ${a}) not deterministic`);
    }
  }
});

test("nextPortalState: locked can only ever reach closed, never open, in one step", () => {
  for (const action of ["open", "close", "lock", "unlock"]) {
    const next = nextPortalState("locked", action);
    assert.notEqual(next, "open", `locked + ${action} must not jump straight to open`);
  }
});

test("nextPortalState: a full locked->closed->open sequence via unlock then open", () => {
  let state = "locked";
  state = nextPortalState(state, "unlock");
  assert.equal(state, "closed");
  state = nextPortalState(state, "open");
  assert.equal(state, "open");
});
