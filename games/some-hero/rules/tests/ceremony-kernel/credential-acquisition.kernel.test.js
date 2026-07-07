// Mirror of games/some-hero/ceremony/credential-acquisition.ceremony.test.js
// against rules/ instead of legacy/src. S2a design spec DoD:
// "credential-acquisition — fully (7/7 pure)." All 7 ceremony tests
// covered, 0 deferred.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMeta } from "../../meta.js";
import { missingCredentials, grantBackstory, grantDebt } from "../../credentials.js";
import { borrow, payDown } from "../../credit.js";
import { blankGame } from "./fixtures.js";

// ceremony/credential-acquisition.ceremony.test.js:16-19
test("@ceremony-kernel fresh meta.credentials starts as { backstory: false, debt: false } — no sword slot (the sword is not knowledge)", () => {
  const meta = createMeta();
  assert.deepEqual(meta.credentials, { backstory: false, debt: false });
});

// ceremony/credential-acquisition.ceremony.test.js:21-26
test("@ceremony-kernel backstory credential: grantBackstory sets meta.credentials.backstory permanently true, no other field touched", () => {
  const meta = createMeta();
  grantBackstory(meta);
  assert.equal(meta.credentials.backstory, true);
  assert.equal(meta.credentials.debt, false, "unrelated");
});

// ceremony/credential-acquisition.ceremony.test.js:28-35
test("@ceremony-kernel debt credential: acquired indirectly, as a side effect of systems/credit.js borrow(), not a direct grant call", () => {
  const game = blankGame();
  game.meta.income = 15;
  assert.equal(game.meta.credentials.debt, false);
  borrow(game.meta, 60);
  assert.equal(game.meta.credentials.debt, true, "one purchase on credit suffices");
  assert.equal(game.meta.credit.balance, 60);
});

// ceremony/credential-acquisition.ceremony.test.js:37-44
test("@ceremony-kernel debt credential is knowledge: it survives paying the balance to zero", () => {
  const game = blankGame();
  game.meta.income = 15;
  borrow(game.meta, 60);
  payDown(game.meta, 60);
  assert.equal(game.meta.credit.balance, 0);
  assert.equal(game.meta.credentials.debt, true, "crippling debt is knowledge; knowledge is permanent");
});

// ceremony/credential-acquisition.ceremony.test.js:46-51
test("@ceremony-kernel grantDebt is also a direct setter used independently of the credit account (e.g. debug/cheat paths)", () => {
  const meta = createMeta();
  grantDebt(meta);
  assert.equal(meta.credentials.debt, true);
  assert.equal(meta.credit.balance, 0, "granting the credential directly does not fabricate a balance");
});

// ceremony/credential-acquisition.ceremony.test.js:53-62
test("@ceremony-kernel the sword credential is NOT meta-state: it is read live off game.player.swordLv on every gate check", () => {
  const game = blankGame();
  game.player.swordLv = 0;
  assert.deepEqual(missingCredentials(game.meta, game.player.swordLv), ["sword", "backstory", "debt"]);
  game.player.swordLv = 1; // equip a sword-shaped object
  assert.deepEqual(missingCredentials(game.meta, game.player.swordLv), ["backstory", "debt"]);
  game.player.swordLv = 0; // un-equip: the golem checks the hand every time
  assert.deepEqual(missingCredentials(game.meta, game.player.swordLv), ["sword", "backstory", "debt"],
    "unlike backstory/debt, the sword credential is not persisted anywhere in meta");
});

// ceremony/credential-acquisition.ceremony.test.js:64-73
test("@ceremony-kernel BITE: backstory/debt are meta-scoped booleans, not booleans on the transient game object", () => {
  const meta = createMeta();
  grantBackstory(meta);
  const meta2 = grantBackstory(createMeta());
  assert.equal(meta2.credentials.backstory, true);
  assert.notEqual(meta.credentials, meta2.credentials, "distinct meta instances have distinct credential state");
});
