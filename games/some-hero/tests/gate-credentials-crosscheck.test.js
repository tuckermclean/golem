/* ── S2b PR3's locked cross-check test (docs/superpowers/specs/
   2026-07-07-s2b-pr3-ceremony-machine-design.md's "Cross-check test
   (locked in scope)"): a property test asserting
   `evaluate(gate.unlockCondition, factLookup) === (missingCredentials(
   knowledge, swordLv).length === 0)` across the full 2^3 credential-
   boolean matrix (sword/backstory/debt). This guards drift between the
   content-authored `Lock.unlockCondition` (content/entities.mjs's
   `entity:door_golem`) and the hand-written `missingCredentials()`
   (rules/credentials.js) — the two independent sources shared/module.js's
   "move" gate check reconciles (one decides pass/fail via evaluate(),
   the other builds the GOLEM_DENIED missing list). If a future edit
   changes one without the other, this is the test that catches it. */
import test from "node:test";
import assert from "node:assert/strict";
import { compile, evaluate } from "@golem-engine/content";
import { ENTITY_DEFS } from "../content/entities.mjs";
import { GUILD_HALL_MAP } from "../content/guild-hall-map.mjs";
import { deriveWorldFromPack } from "../shared/module.js";
import { missingCredentials } from "../rules/credentials.js";

test("evaluate(world.gate.unlockCondition) agrees with missingCredentials() across the full 2^3 credential matrix", () => {
  const compiled = compile({
    name: "gate-credentials-crosscheck",
    version: 1,
    entities: ENTITY_DEFS,
    tables: [],
    maps: [GUILD_HALL_MAP],
  });
  assert.ok(compiled.ok, `expected map:guild_hall to compile: ${JSON.stringify(compiled.ok ? null : compiled.errors)}`);

  const world = deriveWorldFromPack(compiled.pack, { zone: "ow", floorNum: 0, mapId: "map:guild_hall" });
  assert.ok(world.gate, "expected map:guild_hall to derive a Door Golem gate");

  let checked = 0;
  for (const sword of [false, true]) {
    for (const backstory of [false, true]) {
      for (const debt of [false, true]) {
        const factLookup = (fact) => {
          if (fact === "credential_sword") return sword;
          if (fact === "credential_backstory") return backstory;
          if (fact === "credential_debt") return debt;
          return undefined;
        };
        const passed = evaluate(world.gate.unlockCondition, factLookup);

        const meta = { credentials: { backstory, debt } };
        const swordLv = sword ? 1 : 0;
        const noneMissing = missingCredentials(meta, swordLv).length === 0;

        assert.equal(passed, noneMissing, `sword=${sword} backstory=${backstory} debt=${debt}`);
        checked++;
      }
    }
  }
  assert.equal(checked, 8, "the full 2^3 credential-boolean matrix");
});
