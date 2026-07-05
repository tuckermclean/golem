/* Transport contract tests (K4) — fakes, not Node's real ambient
 * BroadcastChannel/localStorage globals, are the contract here (per the
 * K4 brief): each fake models "N tabs sharing one channel/one origin's
 * storage", the same shape a real browser gives two file:// tabs. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createBroadcastTransport,
  createStorageTransport,
  createAutoTransport,
} from "@golem-engine/net";

/* ── Fake BroadcastChannel: mirrors the real spec's "delivered to every
 * OTHER same-name instance, never back to the sender" semantics. */
function makeFakeBroadcastChannel() {
  const channels = new Map(); // name -> Set<instance>
  class FakeBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      if (!channels.has(name)) channels.set(name, new Set());
      channels.get(name).add(this);
    }
    postMessage(data) {
      for (const inst of channels.get(this.name)) {
        if (inst !== this && inst.onmessage) inst.onmessage({ data });
      }
    }
    close() {
      channels.get(this.name)?.delete(this);
    }
  }
  return FakeBroadcastChannel;
}

/* ── Fake storage world: N "tabs" sharing one key/value store; setItem/
 * removeItem in one tab notifies every OTHER tab's "storage" listeners
 * (never the writer's own) — exactly how the real storage event fires
 * cross-tab, same origin. */
function makeFakeStorageWorld() {
  const store = new Map();
  const tabs = [];
  function makeTabEnv() {
    const listeners = [];
    const tab = {
      storage: {
        setItem(k, v) {
          store.set(k, String(v));
          notifyOthers(tab, k, String(v));
        },
        removeItem(k) {
          store.delete(k);
          notifyOthers(tab, k, null);
        },
        getItem(k) {
          return store.has(k) ? store.get(k) : null;
        },
      },
      addEventListener(type, cb) {
        if (type === "storage") listeners.push(cb);
      },
      listeners,
    };
    tabs.push(tab);
    return tab;
  }
  function notifyOthers(sender, key, newValue) {
    for (const tab of tabs) {
      if (tab === sender) continue;
      for (const cb of tab.listeners) cb({ key, newValue });
    }
  }
  return { makeTabEnv };
}

test("createBroadcastTransport: fake BC pair delivers across two instances", () => {
  const FakeBC = makeFakeBroadcastChannel();
  const a = createBroadcastTransport("ch1", { BroadcastChannel: FakeBC });
  const b = createBroadcastTransport("ch1", { BroadcastChannel: FakeBC });
  assert.equal(a.ok, true);
  assert.equal(a.label, "BroadcastChannel");
  let got;
  b.onmsg((m) => {
    got = m;
  });
  a.send({ k: "HELLO", pid: "p1", name: "Wanderer" });
  assert.deepEqual(got, { k: "HELLO", pid: "p1", name: "Wanderer" });
});

test("createBroadcastTransport: ok:false when no BroadcastChannel ctor is available", () => {
  const t = createBroadcastTransport("ch1", { BroadcastChannel: undefined });
  assert.equal(t.ok, false);
  assert.equal(t.label, "none");
  assert.doesNotThrow(() => t.send({ k: "HELLO", pid: "p1", name: "x" }));
});

test("createStorageTransport: fake storage firing storage events across tabs", () => {
  const world = makeFakeStorageWorld();
  const tabA = world.makeTabEnv();
  const tabB = world.makeTabEnv();
  const a = createStorageTransport("golem-grid-net", {
    storage: tabA.storage,
    addEventListener: tabA.addEventListener,
  });
  const b = createStorageTransport("golem-grid-net", {
    storage: tabB.storage,
    addEventListener: tabB.addEventListener,
  });
  assert.equal(a.ok, true);
  assert.equal(a.label, "storage bridge");
  let got;
  b.onmsg((m) => {
    got = m;
  });
  a.send({ k: "CMD", from: "p1", cmd: "move 0 -1" });
  assert.deepEqual(got, { k: "CMD", from: "p1", cmd: "move 0 -1" });
});

test("createStorageTransport: a tab never delivers its own write to itself", () => {
  const world = makeFakeStorageWorld();
  const tabA = world.makeTabEnv();
  const a = createStorageTransport("golem-grid-net", {
    storage: tabA.storage,
    addEventListener: tabA.addEventListener,
  });
  let calls = 0;
  a.onmsg(() => {
    calls++;
  });
  a.send({ k: "DENY", to: "p1", reason: "no" });
  assert.equal(calls, 0);
});

test("createStorageTransport: ok:false when storage/addEventListener are unavailable", () => {
  const t = createStorageTransport("golem-grid-net", {
    storage: undefined,
    addEventListener: undefined,
  });
  assert.equal(t.ok, false);
  assert.equal(t.label, "none");
  assert.doesNotThrow(() => t.send({ k: "DENY", to: "p1", reason: "no" }));
});

test("createAutoTransport: labels/ok mirror main.js's old layering exactly", () => {
  const FakeBC = makeFakeBroadcastChannel();
  const world = makeFakeStorageWorld();

  // both available
  {
    const tab = world.makeTabEnv();
    const t = createAutoTransport("ch", "key", {
      BroadcastChannel: FakeBC,
      storage: tab.storage,
      addEventListener: tab.addEventListener,
    });
    assert.equal(t.ok, true);
    assert.equal(t.label, "BroadcastChannel + storage bridge");
  }
  // BC only
  {
    const t = createAutoTransport("ch", "key", {
      BroadcastChannel: FakeBC,
      storage: undefined,
      addEventListener: undefined,
    });
    assert.equal(t.ok, true);
    assert.equal(t.label, "BroadcastChannel");
  }
  // storage only
  {
    const tab = world.makeTabEnv();
    const t = createAutoTransport("ch", "key", {
      BroadcastChannel: undefined,
      storage: tab.storage,
      addEventListener: tab.addEventListener,
    });
    assert.equal(t.ok, true);
    assert.equal(t.label, "storage bridge");
  }
  // neither -> ok:false path
  {
    const t = createAutoTransport("ch", "key", {
      BroadcastChannel: undefined,
      storage: undefined,
      addEventListener: undefined,
    });
    assert.equal(t.ok, false);
    assert.equal(t.label, "none (solo)");
    assert.doesNotThrow(() => t.send({ k: "HELLO", pid: "p1", name: "x" }));
  }
});

test("createAutoTransport: double delivery (BC + storage both fire) must not double-apply", () => {
  const FakeBC = makeFakeBroadcastChannel();
  const world = makeFakeStorageWorld();
  const tabA = world.makeTabEnv();
  const tabB = world.makeTabEnv();
  const a = createAutoTransport("ch1", "golem-grid-net", {
    BroadcastChannel: FakeBC,
    storage: tabA.storage,
    addEventListener: tabA.addEventListener,
  });
  const b = createAutoTransport("ch1", "golem-grid-net", {
    BroadcastChannel: FakeBC,
    storage: tabB.storage,
    addEventListener: tabB.addEventListener,
  });
  assert.equal(a.label, "BroadcastChannel + storage bridge");

  let received = 0;
  let lastEv;
  b.onmsg((m) => {
    received++;
    lastEv = m;
  });
  a.send({ k: "EVENT", ev: { t: "MOVE", pid: "p1", x: 1, y: 2 } });

  // Both the fake BC and the fake storage bridge fired synchronously —
  // dedup must have dropped the second delivery.
  assert.equal(received, 1);
  assert.equal(lastEv.k, "EVENT");
  assert.deepEqual(lastEv.ev, { t: "MOVE", pid: "p1", x: 1, y: 2 });
});

test("createAutoTransport: stamps a shared _id across both wires (send mutates the msg)", () => {
  const FakeBC = makeFakeBroadcastChannel();
  const a = createAutoTransport("ch2", "key2", {
    BroadcastChannel: FakeBC,
    storage: undefined,
    addEventListener: undefined,
  });
  const msg = { k: "HELLO", pid: "p1", name: "Wanderer" };
  a.send(msg);
  assert.equal(typeof msg._id, "string");
  assert.ok(msg._id.length > 0);
});
