/* A1 PR2's guardrail (docs/superpowers/specs/
 * 2026-07-07-a1-pr2-golem-grid-adopt-design.md, "Tests"): golem-grid had
 * NO existing test of menu contents before this PR, so this locks the
 * swap from the interim `computeAffordances(S, x, y)` (src/
 * language-adapter.js) to the real `GameModule.affordances()` kernel hook
 * (shared/module.js's `module.affordances`, implemented in shared/
 * affordances.js) BEFORE the swap happens.
 *
 * The expected take/look arrays below were captured by running the
 * PRE-SWAP `computeAffordances(S, x, y)` against a fixed seed
 * ("plagueis" — the same fixed seed reducer.test.js/
 * language-adapter.test.js already use) at four fixture tiles: an item
 * tile, the prize tile, a lore tile (exact match), and a lore-adjacent
 * tile (within the 3x3 neighborhood but not the lore's own tile), plus
 * one empty tile with nothing nearby. `module.affordances()` must
 * reproduce EXACTLY these take/look entries — verb + target + name +
 * aliases + order — for every one of those tiles. `read` is NEW (A1
 * PR2 promotes handleTap's hand-rolled "read the inscription" trigger
 * into the shared affordances function too — computeAffordances never
 * had a `read` verb), so it is asserted separately, not diffed against
 * the interim function. */
import test from "node:test";
import assert from "node:assert/strict";
import { genDungeon } from "../shared/worldgen.js";
import { createState } from "../shared/reducer.js";
import { module } from "../shared/module.js";
import { observationAt } from "../shared/affordances.js";

const dun = genDungeon("plagueis");
const st = createState();

function takeLook(x, y) {
  const obs = observationAt(st, dun, { x, y });
  return module.affordances(obs, "p1").filter((a) => a.verb === "take" || a.verb === "look");
}

function readsAt(x, y) {
  const obs = observationAt(st, dun, { x, y });
  return module.affordances(obs, "p1").filter((a) => a.verb === "read");
}

test("item tile: take/look byte-identical to the pre-swap computeAffordances capture", () => {
  const [x, y] = [12, 6]; // dun.items.get("12,6") === "brass stylus"
  assert.equal(dun.items.get(`${x},${y}`), "brass stylus");
  assert.deepEqual(takeLook(x, y), [
    { verb: "take", target: "brass stylus", name: "brass stylus" },
    { verb: "look", target: "12,6", name: "brass stylus" },
  ]);
  assert.deepEqual(readsAt(x, y), []);
});

test("prize tile: take/look byte-identical to the pre-swap computeAffordances capture", () => {
  const { x, y } = dun.prize;
  assert.deepEqual(takeLook(x, y), [
    { verb: "take", target: dun.T.prize, name: dun.T.prize, aliases: ["Final Ledger"] },
    { verb: "look", target: `${x},${y}`, name: dun.T.prize, aliases: ["Final Ledger"] },
  ]);
  assert.deepEqual(readsAt(x, y), []);
});

test("lore tile (exact): look byte-identical to the pre-swap computeAffordances capture; read is new", () => {
  const [lx, ly] = [11, 12]; // dun.lore has an entry here
  assert.ok(dun.lore.has(`${lx},${ly}`));
  assert.deepEqual(takeLook(lx, ly), [
    { verb: "look", target: "11,12", name: "inscription", aliases: ["sign", "writing", "stone"] },
  ]);
  assert.deepEqual(readsAt(lx, ly), [
    { verb: "read", target: "11,12", name: "inscription", aliases: ["sign", "writing", "stone"] },
  ]);
});

test("lore-adjacent tile (within the 3x3 neighborhood, not the lore's own tile): same parity", () => {
  const [x, y] = [12, 12]; // adjacent to the lore at 11,12; itself has no item/prize/lore
  assert.ok(!dun.items.has(`${x},${y}`));
  assert.ok(!dun.lore.has(`${x},${y}`));
  assert.deepEqual(takeLook(x, y), [
    { verb: "look", target: "11,12", name: "inscription", aliases: ["sign", "writing", "stone"] },
  ]);
  assert.deepEqual(readsAt(x, y), [
    { verb: "read", target: "11,12", name: "inscription", aliases: ["sign", "writing", "stone"] },
  ]);
});

test("empty tile (no item/prize/lore in reach): empty, matching the pre-swap computeAffordances capture", () => {
  assert.deepEqual(takeLook(2, 2), []);
  assert.deepEqual(readsAt(2, 2), []);
});

test("prize already carried: no take/look affordance is offered even standing on the carrier's own tile", () => {
  const carryState = createState();
  carryState.D.set("prize_by", "p1");
  const { x, y } = dun.prize; // carrier hasn't moved off the prize tile in this synthetic state
  const obs = observationAt(carryState, dun, { x, y });
  const affs = module.affordances(obs, "p1");
  assert.deepEqual(
    affs.filter((a) => a.verb === "take" || a.verb === "look").filter((a) => a.name === dun.T.prize),
    [],
  );
});
