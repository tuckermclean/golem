import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { genDungeon } from "../shared/worldgen.js";
import { createState, applyEvent, serializeState, light } from "../shared/reducer.js";
import { makeDeduper } from "../shared/dedup.js";

const log = JSON.parse(readFileSync(new URL("./golden/replay-log.json", import.meta.url), "utf8"));
const want = readFileSync(new URL("./golden/replay-final.json", import.meta.url), "utf8");
const dun = genDungeon("plagueis");

test("replay: recorded log → byte-identical delta map", () => {
  const st = createState();
  for (const ev of log) applyEvent(st, dun, ev);
  assert.equal(serializeState(st) + "\n", want);
  assert.equal(st.D.get("gameover"), "WIN");
  assert.ok(light(st) > 0);
});

test("transport dedup: double delivery must not double-apply", () => {
  const st = createState();
  const fresh = makeDeduper();
  let applied = 0;
  for (const ev of log) {
    const m = { k: "EVENT", _id: "m" + ev.seq, ev };
    for (const copy of [m, m])          // BC + storage bridge both fire
      if (copy && fresh(copy._id)) { applyEvent(st, dun, copy.ev); applied++; }
  }
  assert.equal(applied, log.length);
  assert.equal(serializeState(st) + "\n", want);
});

test("dedup drops messages with no id", () => {
  const fresh = makeDeduper();
  assert.equal(fresh(undefined), false);
  assert.equal(fresh("a"), true);
  assert.equal(fresh("a"), false);
});
