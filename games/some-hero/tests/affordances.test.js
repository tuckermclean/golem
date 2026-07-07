/* ── Unit tests for shared/module.js's `affordances()` — DELTA A1 PR1
 * (docs/superpowers/specs/2026-07-07-a1-pr1-affordances-hook-design.md's
 * "some-hero standalone affordances() (the conformance proof)"). Pins:
 * proceed enabled only mid-ceremony, resurrect only when
 * resurrection-pending, one attack per adjacent enemy, the gate enabled/
 * disabled by credentials with the missing-list reason, that every
 * returned Affordance carries the canonical shape (verb/target/name),
 * and purity (no mutation of the observation it's handed).
 *
 * `affordances(observation, actor)` takes `observation = {state, world}`
 * — the SAME ctx shape validate() itself takes (see shared/module.js's
 * own header comment on why this is NOT observe()'s flattened
 * projection, which structurally omits `pending`). */
import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "@golem-engine/content";
import { affordances, deriveWorldFromPack, validate } from "../shared/module.js";
import { createState } from "../shared/reducer.js";
import { makeWorld, floorEnteredState } from "./helpers/build-state.mjs";
import { ENTITY_DEFS } from "../content/entities.mjs";
import { GUILD_HALL_MAP } from "../content/guild-hall-map.mjs";

function withState(world, overrides = {}) {
  const state = floorEnteredState(world);
  return { ...state, ...overrides };
}

// ── shape ────────────────────────────────────────────────────────────

test("affordances: every returned Affordance carries the canonical shape (verb/target/name)", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  const state = withState(world, { pending: { kind: "ceremony" } });
  const out = affordances({ state, world }, "player");
  assert.ok(out.length > 0, "expected at least one affordance (proceed/resurrect are always listed)");
  for (const a of out) {
    assert.equal(typeof a.verb, "string");
    assert.ok(a.verb.length > 0);
    assert.equal(typeof a.target, "string");
    assert.ok(a.target.length > 0);
    assert.equal(typeof a.name, "string");
    assert.ok(a.name.length > 0);
  }
});

test("affordances: is pure — does not mutate state or world", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  const state = withState(world, { pending: { kind: "ceremony" } });
  const stateBefore = JSON.parse(JSON.stringify(state));
  const worldBefore = { ...world, walls: new Set(world.walls) };

  affordances({ state, world }, "player");

  assert.deepEqual(JSON.parse(JSON.stringify(state)), stateBefore);
  assert.deepEqual(world.walls, worldBefore.walls);
});

// ── proceed ──────────────────────────────────────────────────────────

test("affordances: proceed is enabled only mid-ceremony", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });

  const midCeremony = withState(world, { pending: { kind: "ceremony" } });
  const proceedEnabled = affordances({ state: midCeremony, world }, "player").find((a) => a.verb === "proceed");
  assert.ok(proceedEnabled, "expected a proceed affordance");
  assert.equal(proceedEnabled.enabled, true);
  assert.equal(proceedEnabled.reason, undefined);

  const noPending = withState(world, { pending: null });
  const proceedDisabled = affordances({ state: noPending, world }, "player").find((a) => a.verb === "proceed");
  assert.ok(proceedDisabled);
  assert.equal(proceedDisabled.enabled, false);
  assert.equal(typeof proceedDisabled.reason, "string");

  const resurrectionPending = withState(world, { pending: { kind: "resurrection", cause: "skeleton" } });
  const proceedStillDisabled = affordances({ state: resurrectionPending, world }, "player").find((a) => a.verb === "proceed");
  assert.equal(proceedStillDisabled.enabled, false);
});

// ── resurrect ────────────────────────────────────────────────────────

test("affordances: resurrect is enabled only when resurrection-pending", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });

  const resurrectionPending = withState(world, { pending: { kind: "resurrection", cause: "skeleton" } });
  const resurrectEnabled = affordances({ state: resurrectionPending, world }, "player").find((a) => a.verb === "resurrect");
  assert.ok(resurrectEnabled);
  assert.equal(resurrectEnabled.enabled, true);
  assert.equal(resurrectEnabled.reason, undefined);

  const noPending = withState(world, { pending: null });
  const resurrectDisabled = affordances({ state: noPending, world }, "player").find((a) => a.verb === "resurrect");
  assert.ok(resurrectDisabled);
  assert.equal(resurrectDisabled.enabled, false);
  assert.equal(typeof resurrectDisabled.reason, "string");

  const ceremonyPending = withState(world, { pending: { kind: "ceremony" } });
  const resurrectStillDisabled = affordances({ state: ceremonyPending, world }, "player").find((a) => a.verb === "resurrect");
  assert.equal(resurrectStillDisabled.enabled, false);
});

// ── attack ───────────────────────────────────────────────────────────

test("affordances: one attack affordance per enemy within melee range (adjacent or same tile)", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 2, y: 2 } });
  const state = withState(world, {
    run: {
      ...withState(world).run,
      enemies: [
        { id: "e0", kind: "skeleton", pos: { x: 3, y: 2 }, hp: 4 }, // adjacent (dist 1)
        { id: "e1", kind: "mailbat", pos: { x: 2, y: 2 }, hp: 2 }, // same tile (dist 0)
        { id: "e2", kind: "slime", pos: { x: 4, y: 4 }, hp: 3 }, // far (dist 4)
      ],
    },
  });

  const out = affordances({ state, world }, "player");
  const attacks = out.filter((a) => a.verb === "attack");

  assert.equal(attacks.length, 2, "only the two in-range enemies get an attack affordance");
  const targets = attacks.map((a) => a.target).sort();
  assert.deepEqual(targets, ["e0", "e1"]);
  for (const a of attacks) {
    assert.equal(a.enabled, true);
    const enemy = state.run.enemies.find((e) => e.id === a.target);
    assert.equal(a.name, enemy.kind);
  }
});

// ── warden boss + brazier (seal-affordances, docs/superpowers/specs/
//    2026-07-07-seal-affordances-design.md) ───────────────────────────

/** A minimal live warden in state.run.boss (NOT run.enemies) — affordances()
 *  reads pos/dead/name; validate()'s attack-boss path also reads id/hp. */
function withBoss(world, bossPos, overrides = {}) {
  const base = withState(world);
  return withState(world, {
    run: {
      ...base.run,
      boss: { id: "boss", kind: "warden", name: "the Warden", pos: { ...bossPos }, hp: 40, dead: false, ...overrides },
    },
  });
}

test("affordances: 'attack boss' is listed only when a live warden is within melee range", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 2, y: 2 } });

  // adjacent (dist 1) → listed
  const adjacent = withBoss(world, { x: 3, y: 2 });
  let bossHits = affordances({ state: adjacent, world }, "player").filter((a) => a.target === "boss");
  assert.equal(bossHits.length, 1, "a live adjacent boss gets exactly one attack affordance");
  assert.deepEqual(bossHits[0], { verb: "attack", target: "boss", name: "the Warden", enabled: true });

  // far (dist 4) → absent
  const farBoss = withBoss(world, { x: 0, y: 0 });
  assert.equal(affordances({ state: farBoss, world }, "player").filter((a) => a.target === "boss").length, 0, "an out-of-range boss is not listed");

  // dead boss adjacent → absent
  const dead = withBoss(world, { x: 3, y: 2 }, { dead: true });
  assert.equal(affordances({ state: dead, world }, "player").filter((a) => a.target === "boss").length, 0, "a slain boss is not listed");

  // no boss → absent
  assert.equal(affordances({ state: withState(world), world }, "player").filter((a) => a.target === "boss").length, 0);
});

test("affordances: 'attack brazier' is listed only when an un-lit brazier is adjacent on an unsolved torch floor", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 2, y: 2 } });
  const base = withState(world);
  const torchState = (torches, solved = false) =>
    withState(world, { run: { ...base.run, puzzle: { type: "torch", n: torches.length, time: 13.4, solved, torches } } });

  // un-lit brazier adjacent → listed once
  const adjacent = torchState([{ x: 3, y: 2, lit: false, tm: 0 }, { x: 0, y: 0, lit: false, tm: 0 }]);
  const brazier = affordances({ state: adjacent, world }, "player").filter((a) => a.target === "brazier");
  assert.equal(brazier.length, 1, "one entry even with two adjacent-or-not braziers (a swing lights all in range)");
  assert.deepEqual(brazier[0], { verb: "attack", target: "brazier", name: "light the brazier", enabled: true });

  // adjacent brazier already lit → absent
  const lit = torchState([{ x: 3, y: 2, lit: true, tm: 13.4 }]);
  assert.equal(affordances({ state: lit, world }, "player").filter((a) => a.target === "brazier").length, 0, "an already-lit brazier is not offered");

  // un-lit but not adjacent → absent
  const farBrazier = torchState([{ x: 0, y: 0, lit: false, tm: 0 }]);
  assert.equal(affordances({ state: farBrazier, world }, "player").filter((a) => a.target === "brazier").length, 0);

  // solved torch seal → absent
  const solved = torchState([{ x: 3, y: 2, lit: true, tm: 13.4 }], true);
  assert.equal(affordances({ state: solved, world }, "player").filter((a) => a.target === "brazier").length, 0);
});

test("affordances: the target each new action advertises round-trips through validate() (attack boss strikes; attack brazier lights)", () => {
  const world = makeWorld({ rows: 5, cols: 5, spawn: { x: 2, y: 2 } });

  const bossState = withBoss(world, { x: 3, y: 2 });
  const bossResult = validate({ state: bossState, world }, "attack boss");
  assert.ok(Array.isArray(bossResult), "attack boss must be a legal command, not a Denial");
  assert.equal(bossResult[0].t, "WARDEN_HURT", "attack boss resolves to a warden strike");

  const base = withState(world);
  const torchState = withState(world, {
    run: { ...base.run, puzzle: { type: "torch", n: 1, time: 13.4, solved: false, torches: [{ x: 3, y: 2, lit: false, tm: 0 }] } },
  });
  const brazierResult = validate({ state: torchState, world }, "attack brazier");
  assert.ok(Array.isArray(brazierResult), "attack brazier must be a legal command, not a Denial");
  assert.equal(brazierResult[0].t, "TORCH_LIT", "attack brazier resolves to lighting");
});

test("affordances: no attack affordances when run.enemies is empty", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  const state = withState(world);
  const out = affordances({ state, world }, "player");
  assert.equal(out.filter((a) => a.verb === "attack").length, 0);
});

// ── gate/descend ─────────────────────────────────────────────────────

function compiledGuildHall() {
  const compiled = compile({
    name: "affordances-gate-test",
    version: 1,
    entities: ENTITY_DEFS,
    tables: [],
    maps: [GUILD_HALL_MAP],
  });
  assert.ok(compiled.ok, `expected map:guild_hall to compile: ${JSON.stringify(compiled.ok ? null : compiled.errors)}`);
  return deriveWorldFromPack(compiled.pack, { zone: "ow", floorNum: 0, mapId: "map:guild_hall" });
}

test("affordances: gate/descend is enabled when all three credentials are satisfied", () => {
  const world = compiledGuildHall();
  assert.ok(world.gate, "expected map:guild_hall to derive a Door Golem gate");
  const state = withState(world, {
    character: { ...withState(world).character, swordLv: 1 },
    knowledge: { ...withState(world).knowledge, credentials: { backstory: true, debt: true } },
  });

  const gate = affordances({ state, world }, "player").find((a) => a.verb === "descend");
  assert.ok(gate, "expected a descend affordance at the guild-hall gate");
  assert.equal(gate.enabled, true);
  assert.equal(gate.reason, undefined);
  assert.equal(gate.requirements, world.gate.unlockCondition);
});

test("affordances: gate/descend is disabled with the missing-credentials list as reason", () => {
  const world = compiledGuildHall();
  const state = withState(world, {
    character: { ...withState(world).character, swordLv: 0 },
    knowledge: { ...withState(world).knowledge, credentials: { backstory: false, debt: true } },
  });

  const gate = affordances({ state, world }, "player").find((a) => a.verb === "descend");
  assert.ok(gate);
  assert.equal(gate.enabled, false);
  assert.equal(typeof gate.reason, "string");
  assert.match(gate.reason, /sword/);
  assert.match(gate.reason, /backstory/);
  assert.doesNotMatch(gate.reason, /debt/);
  assert.deepEqual(gate.requirements, world.gate.unlockCondition);
});

test("affordances: no gate/descend affordance when the world has no gate", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  const state = withState(world);
  const out = affordances({ state, world }, "player");
  assert.equal(out.filter((a) => a.verb === "descend").length, 0);
});

test("affordances: actor is unused — identical result regardless of actor value", () => {
  const world = makeWorld({ rows: 3, cols: 3, spawn: { x: 1, y: 1 } });
  const state = withState(world, { pending: { kind: "ceremony" } });
  const a = affordances({ state, world }, "player-a");
  const b = affordances({ state, world }, "player-b");
  const c = affordances({ state, world }, undefined);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
});
