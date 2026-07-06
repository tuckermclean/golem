/* L1+L2 chat-wiring proof: drives the REAL @golem-engine/language
 * `route` (L1's parse() composed with L2's classifier, per the L2
 * design doc), the REAL games/golem-grid/src/language-adapter.js
 * (`computeAffordances`/`dispatchIntent`), and the REAL host
 * (src/host.js -> shared/module.js's `validate` -> shared/reducer.js's
 * `reduce`) against a real dungeon (genDungeon("plagueis"), the same
 * fixed seed reducer.test.js already uses) — no reimplementation of any
 * of those.
 *
 * `routeChatLine` below is a deliberately tiny mirror of src/input.js's
 * plain-text chat branch (`cmdEl`'s keydown handler) — the same shape as
 * games/topdown-puzzle/tests/e2e/touch.wiring.fallback.mjs reproduces
 * its one-line onDir wrapper verbatim rather than importing DOM-bound
 * code. Updated from `parse` to `route` alongside input.js's own L2
 * wiring (design doc: "the route() swap is transparent") — every case
 * below is an L1 hit or an L1 "ambiguous", so route()'s answer is
 * byte-identical to parse()'s; only a genuine L1 "unknown" would ever
 * reach L2 here, and none of these fixtures produce one. This is a real
 * `node --test` file (not an e2e/*.mjs script): it needs no DOM/canvas/
 * browser, so unlike the two-tab/visual Playwright smokes it runs in
 * this sandbox and is wired into golem-grid's own `npm test` (and
 * therefore root `npm test`) like any other unit test. */
import test from "node:test";
import assert from "node:assert/strict";
import { genDungeon } from "../shared/worldgen.js";
import { createState, getP as rGetP, applyEvent } from "../shared/reducer.js";
import { createHost } from "../src/host.js";
import { route } from "@golem-engine/language";
import { computeAffordances, dispatchIntent } from "../src/language-adapter.js";

const dun = genDungeon("plagueis");

function makeS() {
  const S = { seed: "plagueis", dun, me: "p1", st: createState() };
  applyEvent(S.st, S.dun, { t: "JOIN", pid: "p1", name: "Ash", seq: 1 });
  return S;
}

function moveTo(S, x, y) {
  applyEvent(S.st, S.dun, { t: "MOVE", pid: "p1", x, y, seq: S.st.seq + 1 });
}

/* Mirrors src/input.js's plain-text chat branch verbatim. */
function routeChatLine(raw, S, deps) {
  const { sendCmd, feedLine, lookAt } = deps;
  const me = rGetP(S.st, S.me);
  const result = route(raw, { affordances: me ? computeAffordances(S, me.x, me.y) : [] });
  if (result.ok) return dispatchIntent(result.intent, { sendCmd, lookAt, me });
  if (result.reason === "ambiguous")
    return feedLine("Did you mean: " + result.candidates.join(", ") + "?", "sys");
  return sendCmd("say " + raw);
}

function makeHarness(S) {
  const sent = [];
  const looked = [];
  const fed = [];
  const Host = createHost(S, { send: () => {} }, { onCommit: () => {}, onDenyLocal: () => {} });
  const sendCmd = (cmd) => {
    sent.push(cmd);
    Host.hostCmd(S.me, cmd);
  };
  const lookAt = (x, y) => looked.push([x, y]);
  const feedLine = (text, kind) => fed.push([text, kind]);
  return { sent, looked, fed, sendCmd, lookAt, feedLine };
}

test("'go north' -> sendCmd('move 0 -1'), landing on the real host", () => {
  const S = makeS();
  const h = makeHarness(S);
  routeChatLine("go north", S, h);
  assert.deepEqual(h.sent, ["move 0 -1"]);
  assert.deepEqual(h.looked, []);
});

test("'grab the brass stylus' -> sendCmd('take brass stylus'), and the real reducer actually takes it", () => {
  const S = makeS();
  const [x, y] = [12, 6]; // dun.items.get("12,6") === "brass stylus"
  assert.equal(dun.items.get(`${x},${y}`), "brass stylus");
  moveTo(S, x, y);
  const h = makeHarness(S);
  routeChatLine("grab the brass stylus", S, h);
  assert.deepEqual(h.sent, ["take brass stylus"]);
  assert.deepEqual(rGetP(S.st, "p1").inv, ["brass stylus"]);
});

test("'look at the sign' -> lookAt(...) at the inscription's own tile (client-local, no sendCmd)", () => {
  const S = makeS();
  const [lx, ly] = [11, 12]; // dun.lore has an entry here
  assert.ok(dun.lore.has(`${lx},${ly}`));
  moveTo(S, lx, ly);
  const h = makeHarness(S);
  routeChatLine("look at the sign", S, h);
  assert.deepEqual(h.sent, []);
  assert.deepEqual(h.looked, [[lx, ly]]);
});

test("a plain sentence -> sendCmd('say ...') unchanged fallback", () => {
  const S = makeS();
  const h = makeHarness(S);
  routeChatLine("hello down here, anyone around", S, h);
  assert.deepEqual(h.sent, ["say hello down here, anyone around"]);
  assert.deepEqual(h.looked, []);
});

test("bare 'take' with no grounded item still resolves ('take' auto-detects, matching module.js)", () => {
  const S = makeS();
  const h = makeHarness(S);
  routeChatLine("take", S, h);
  assert.deepEqual(h.sent, ["take"]);
});

test("an ambiguous grounded noun surfaces a 'Did you mean' hint and is NOT sent as chat", () => {
  const S = makeS();
  const [x, y] = [32, 25]; // "cracked seal" also sits at 21,4 — same name, different tile,
  // so this alone isn't ambiguous; instead prove the ambiguous PATH generically via
  // computeAffordances + a synthetic duplicate, since golem-grid's real per-tile
  // affordance list only ever has at most one take-candidate per tile (module.js's
  // own take grammar has no notion of "two items on one tile").
  moveTo(S, x, y);
  const affordances = [...computeAffordances(S, x, y), { verb: "take", target: "seal-b", name: "cracked seal" }];
  const result = route("take the cracked seal", { affordances });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ambiguous");
  const h = makeHarness(S);
  if (result.ok) dispatchIntent(result.intent, h);
  else if (result.reason === "ambiguous") h.feedLine("Did you mean: " + result.candidates.join(", ") + "?", "sys");
  assert.deepEqual(h.sent, []);
  assert.equal(h.fed.length, 1);
  assert.match(h.fed[0][0], /^Did you mean: /);
});
