import test from "node:test";
import assert from "node:assert/strict";
import { genDungeon } from "../shared/worldgen.js";
import { START_LIGHT, createState, applyEvent, players, getP, light,
         itemAt, prizeCarrier, radius, serializeState } from "../shared/reducer.js";

const dun = genDungeon("plagueis");
const join = (st, pid, name) => applyEvent(st, dun, { t: "JOIN", pid, name, seq: st.seq + 1 });

test("JOIN places the player at the stairs with empty inventory", () => {
  const st = createState();
  join(st, "p1", "Ash");
  const p = getP(st, "p1");
  assert.deepEqual({ x: p.x, y: p.y, inv: p.inv }, { x: dun.stairs.x, y: dun.stairs.y, inv: [] });
  assert.equal(players(st).length, 1);
});

test("MOVE burns 1; carrier burns 2; light floors at 0", () => {
  const st = createState();
  join(st, "p1", "Ash");
  assert.equal(light(st), START_LIGHT);
  applyEvent(st, dun, { t: "MOVE", pid: "p1", x: 1, y: 1, seq: 2 });
  assert.equal(light(st), START_LIGHT - 1);
  applyEvent(st, dun, { t: "TAKE_PRIZE", pid: "p1", seq: 3 });
  applyEvent(st, dun, { t: "MOVE", pid: "p1", x: 2, y: 1, seq: 4 });
  assert.equal(light(st), START_LIGHT - 3);            // the prize is heavy
  st.D.set("light", 1);
  applyEvent(st, dun, { t: "MOVE", pid: "p1", x: 3, y: 1, seq: 5 });
  assert.equal(light(st), 0);                           // floored, not negative
});

test("TAKE marks the tile and fills the inventory; itemAt hides taken items", () => {
  const st = createState();
  join(st, "p1", "Ash");
  const [k, item] = [...dun.items.entries()][0];
  const [x, y] = k.split(",").map(Number);
  assert.equal(itemAt(st, dun, x, y), item);
  applyEvent(st, dun, { t: "TAKE", pid: "p1", item, x, y, seq: 2 });
  assert.equal(itemAt(st, dun, x, y), null);
  assert.deepEqual(getP(st, "p1").inv, [item]);
});

test("WIN/LOSE set gameover and over", () => {
  const st = createState();
  applyEvent(st, dun, { t: "WIN", pid: "p1", seq: 1 });
  assert.equal(st.D.get("gameover"), "WIN");
  assert.equal(st.over, true);
});

test("radius tiers at exact boundaries", () => {
  const st = createState();
  for (const [L, R] of [[360, 6], [181, 6], [180, 5], [111, 5], [110, 4], [56, 4], [55, 3], [21, 3], [20, 2], [0, 2]]) {
    st.D.set("light", L);
    assert.equal(radius(st), R, `light=${L}`);
  }
});

test("reducer is identity-blind: same events, any observer → same serialized state", () => {
  const a = createState(), b = createState();
  const evs = [
    { t: "JOIN", pid: "p1", name: "Ash", seq: 1 },
    { t: "JOIN", pid: "p2", name: "Brine", seq: 2 },
    { t: "MOVE", pid: "p2", x: 1, y: 1, seq: 3 },
    { t: "SAY", pid: "p1", text: "hello", x: 0, y: 0, scope: "room", seq: 4 },
  ];
  for (const ev of evs) applyEvent(a, dun, ev);
  for (const ev of evs) applyEvent(b, dun, ev);
  assert.equal(serializeState(a), serializeState(b));
  assert.equal(a.seq, 4);
});
