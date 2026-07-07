/* ── A3 PR3 — the sample-world E2E walkthrough (closes DELTA Phase 5 A3).
   PR1 (imported-content/adventure/content — the content pack) and PR2
   (module/{module,reducer}.js — the GameModule; packages/clients/src/
   terminal.js — the terminal client) are merged and tested. This is the
   single, committed, comprehensive end-to-end walkthrough proving the
   whole sample world plays as a cohesive journey: "adventure sample
   world walkable, affordance-listed, twin-narrated; zero dynamic code"
   (the literal DoD sentence) — mirroring games/some-hero/tests/
   e2e-headless/full-route.test.js's own "fixed (contentHash, seed),
   scripted command log, replay twice, assert bit-identical hash + beat
   assertions" pattern.

   contentHash: imported-content/adventure/content/pack.json's own
   "hash" field, f9bdc69b6089807c85f7d6520bcf3c2c617c9b83dcde0fd78abfebe8c5cd044d
   — the REAL committed content this route runs against (compileContentPack()
   re-derives it fresh here, exactly as every other adventure test does;
   asserted equal to the fixed string below for the "(contentHash, seed,
   log)" framing).

   ── Driving the REAL engine, not a hand-built state ──────────────────
   Every command below goes through the genuine createTerminalSession()
   submit() -> module.validate() -> module.reduce() path (packages/
   clients/src/terminal.js), over the real compiled content pack. The
   only instrumentation this file adds is a thin recording wrapper
   around module.reduce/validate (recordingModule below) that observes
   the SAME calls the session already makes internally — it never
   substitutes a different implementation, only tees committed events
   (for the replay-determinism check) and denials (for the "no
   unexpected denial" assertion) into local arrays, mirroring src/host.js's
   own onCommit/onDenyLocal callback idiom elsewhere in this monorepo.
   Because createTerminalSession keeps its `current` state in a private
   closure (by design — see terminal.js's own header), the recording
   wrapper's tracked `liveState` (the return value of every reduce()
   call) is the only way to observe the session's true state between
   commands for the affordance checkpoints and the final hash — and it
   is, by construction, identical to the session's own private `current`
   (both are threaded through the exact same reduce() calls).

   ── The route (imported-content/adventure/tests/e2e/
   sample-world.walkthrough.log.json's own "//route" comment has the
   full narrative) ──
     1. Walk from the entry room (village square) toward the secret
        portal (haunted_grove <-> ancient_ruin): DENIED before insight
        (index 10) -- the affordance menu already shows it enabled:false
        with the door's own reason.
     2. Backtrack, take + eat the rare mushroom (deep forest path) --
        setting mushroom_insight -- then walk the SAME path back to
        haunted grove: the secret portal is now ALLOWED (index 19) --
        the walkability climax, proven by a real "go" command.
     3. Through the portal to hidden waterfall; take the sparkling fish
        (Portable+Interactable.enabledWhen gated on the same insight
        fact, already satisfied).
     4. To the wizard's tower: talk to the wizard while still holding
        the rare mushroom (eating it never removes it from inventory) --
        his Spawns.when (has_rare_mushroom + not wizard_gave_key) fires,
        handing over the odd key. The talk response is asserted against
        an INDEPENDENTLY reconstructed twin line (compileEnvelope +
        renderStubReply, called here with the exact same inputs
        narrateTalk uses) -- not a hand-typed string.
     5. Take the odd key; walk back to the village square -> back alley
        -> secret hideout: the back door (keyed on has_odd_key) was
        DENIED early (index 1, before the key existed) and is now
        ALLOWED (index 36) -- the second locked-door proof, opened with
        the wizard's own reward. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { compileContentPack } from "../../content/build-pack.mjs";
import { deriveWorld, createState, module, serializeState } from "../../module/module.js";
import { createTerminalSession } from "@golem-engine/clients";
import { compileEnvelope, renderStubReply } from "@golem-engine/language";
import { replay } from "@golem-engine/kernel";
import { h32 } from "@golem-engine/random";

const FIXTURE = JSON.parse(
  readFileSync(new URL("./sample-world.walkthrough.log.json", import.meta.url), "utf8"),
);
const { seed: SEED, contentHash: CONTENT_HASH, commands } = FIXTURE;

const CONTENT_HASH_EXPECTED = "f9bdc69b6089807c85f7d6520bcf3c2c617c9b83dcde0fd78abfebe8c5cd044d";

function compilePack() {
  const result = compileContentPack();
  assert.equal(result.ok, true, "adventure content pack must compile (PR1 gate)");
  return result.pack;
}

/** Drive the full scripted command log through a REAL terminal session,
 *  recording every committed event (for the replay/hash proof) and
 *  every denial (verb+noun+reason, for the "no unexpected denial"
 *  proof) via a thin tee around the real module's reduce()/validate() --
 *  see this file's header. Returns everything the assertions below need:
 *  the per-command render() output (for affordance checkpoints), the
 *  event log, the final live state, and the denial list. */
function runWalkthrough(world, seed) {
  const events = [];
  const denials = [];
  let liveState = createState(world);

  const recordingModule = {
    ...module,
    validate(ctx, cmd) {
      const r = module.validate(ctx, cmd);
      if (!Array.isArray(r)) denials.push({ verb: cmd.verb, noun: cmd.noun, reason: r.deny });
      return r;
    },
    reduce(state, w, ev) {
      const next = module.reduce(state, w, ev);
      events.push(ev);
      liveState = next;
      return next;
    },
  };

  const session = createTerminalSession({
    module: recordingModule,
    world,
    state: createState(world),
    seed,
  });

  const outputs = [];
  const affordanceSnapshots = [];
  commands.forEach((cmd, index) => {
    const out = session.submit(cmd);
    outputs.push(out);
    // A structural snapshot at every step (cheap; only inspected at the
    // checkpoints below) -- the actual State this command left behind,
    // and the affordance menu module.affordances() derives from it.
    affordanceSnapshots.push({
      index,
      cmd,
      state: liveState,
      affordances: module.affordances({ state: liveState, world }, "player"),
    });
  });

  return { session, outputs, affordanceSnapshots, events, denials, finalState: liveState };
}

function findAffordance(affordances, verb, target) {
  return affordances.find((a) => a.verb === verb && a.target === target);
}

test("A3 PR3: sample-world walkthrough is walkable, affordance-listed, and twin-narrated (contentHash, seed, scripted log)", () => {
  const pack = compilePack();
  assert.equal(pack.hash, CONTENT_HASH_EXPECTED, "pack.hash must match the fixed contentHash this route was authored against");
  assert.equal(CONTENT_HASH, CONTENT_HASH_EXPECTED, "the committed fixture's own contentHash field must match too");

  const world = deriveWorld({}, pack);
  const { outputs, affordanceSnapshots, events, denials, finalState } = runWalkthrough(world, SEED);

  // ── Walkable: the region sequence actually visited a meaningful
  // journey, including the post-insight secret portal and the
  // post-quest locked door. ────────────────────────────────────────────
  const regionsVisited = affordanceSnapshots.map((s) => s.state.region);
  for (const expectedRegion of [
    "back_alley",
    "forest_road",
    "forest_clearing",
    "enchanted_pond",
    "deep_forest_path",
    "misty_glen",
    "fae_circle",
    "haunted_grove",
    "ancient_ruin",
    "hidden_waterfall",
    "wizards_tower",
    "secret_hideout",
  ]) {
    assert.ok(regionsVisited.includes(expectedRegion), `expected the walkthrough to visit "${expectedRegion}"`);
  }
  assert.equal(finalState.region, "secret_hideout", "the walkthrough must end inside the back door's own destination room");
  assert.deepEqual(
    [...finalState.inventory].sort(),
    ["entity:item_odd_key", "entity:item_rare_mushroom", "entity:item_sparkling_fish"],
    "the final inventory must carry every item picked up along the route",
  );

  // ── Denials: EXACTLY the two expected ones, nothing else. ───────────
  assert.equal(denials.length, 2, `expected exactly 2 denials, got ${denials.length}: ${JSON.stringify(denials)}`);
  assert.equal(denials[0].verb, "go");
  assert.equal(denials[0].noun, "secret_hideout");
  assert.match(denials[0].reason, /back door.*locked/i, "the back door must be denied by name before the odd key");
  assert.equal(denials[1].verb, "go");
  assert.equal(denials[1].noun, "ancient_ruin");
  assert.match(denials[1].reason, /secret portal.*locked/i, "the secret portal must be denied by name before insight");

  // ── Affordance-listed: at 4 checkpoints (both locked doors, before
  // and after their gate), module.affordances() lists the exit with the
  // correct enabled/reason -- not just "the command failed", the actual
  // A1 canonical Affordance shape a client would render a menu from. ──

  // Checkpoint 1 (index 0, "go back_alley"): the back door is disabled,
  // reason names it, BEFORE the odd key exists anywhere in the run.
  const backDoorBefore = findAffordance(affordanceSnapshots[0].affordances, "go", "secret_hideout");
  assert.ok(backDoorBefore, "expected a 'go secret_hideout' affordance from back_alley");
  assert.equal(backDoorBefore.enabled, false);
  assert.match(backDoorBefore.reason, /back door.*locked/i);

  // Checkpoint 2 (index 9, "go haunted_grove", first visit): the secret
  // portal is disabled, reason names it, BEFORE mushroom_insight.
  const portalBefore = findAffordance(affordanceSnapshots[9].affordances, "go", "ancient_ruin");
  assert.ok(portalBefore, "expected a 'go ancient_ruin' affordance from haunted_grove");
  assert.equal(portalBefore.enabled, false);
  assert.match(portalBefore.reason, /secret portal.*locked/i);

  // Checkpoint 3 (index 18, "go haunted_grove", second visit, AFTER
  // eating the rare mushroom at index 15): the secret portal is now
  // enabled, no reason -- the walkability climax, affordance-menu proof.
  const portalAfter = findAffordance(affordanceSnapshots[18].affordances, "go", "ancient_ruin");
  assert.ok(portalAfter, "expected a 'go ancient_ruin' affordance from haunted_grove");
  assert.equal(portalAfter.enabled, true);
  assert.equal(portalAfter.reason, undefined);
  assert.ok(affordanceSnapshots[18].state.facts.includes("mushroom_insight"), "mushroom_insight must be set by checkpoint 3");

  // Checkpoint 4 (index 35, "go back_alley", second visit, AFTER the
  // wizard handed over the odd key at index 30 and it was taken at
  // index 31): the back door is now enabled, no reason.
  const backDoorAfter = findAffordance(affordanceSnapshots[35].affordances, "go", "secret_hideout");
  assert.ok(backDoorAfter, "expected a 'go secret_hideout' affordance from back_alley");
  assert.equal(backDoorAfter.enabled, true);
  assert.equal(backDoorAfter.reason, undefined);
  assert.ok(affordanceSnapshots[35].state.inventory.includes("entity:item_odd_key"), "the odd key must be in inventory by checkpoint 4");

  // ── Twin-narrated: "talk wizard" (index 30) returns the EXACT
  // deterministic twin line -- reconstructed independently here via the
  // same compileEnvelope()+renderStubReply() call terminal.js's own
  // narrateTalk() makes, not a hand-typed string fixture. ─────────────
  const wizard = world.npcs["entity:char_wizard"];
  assert.ok(wizard, "expected the wizard npc in the derived world");
  const expectedEnvelope = compileEnvelope(wizard.knowledge, world.factUniverse);
  const expectedLine = renderStubReply(expectedEnvelope, wizard.name, "wizard", SEED, "entity:char_wizard");

  const talkOutput = outputs[30];
  assert.deepEqual(commands[30], "talk wizard", "index 30 in the committed log must be the wizard talk");
  assert.ok(talkOutput.includes(expectedLine), `expected the twin's exact line among the talk output, got: ${JSON.stringify(talkOutput)}`);
  assert.equal(expectedLine, "What I know of wizard: mutant, potion_insight, mushroom_insight. That's the whole of it.");

  // Also assert the odd key was actually SPAWNED into the room by this
  // same talk (the mechanically meaningful half of the quest, not just
  // narration) -- and was reachable for "take odd key" at index 31.
  assert.ok(
    affordanceSnapshots[30].state.roomItems.wizards_tower.includes("entity:item_odd_key"),
    "the wizard's talk must have spawned the odd key into wizards_tower",
  );

  // ── Determinism (the S5 pattern): replay the SAME committed event
  // log through @golem-engine/kernel's replay(), from a fresh
  // createState(world), TWICE -- h32(serializeState(...)) must be
  // byte-identical across the live session + both replays. Adventure's
  // deriveWorld never reads state (doctrine #1 -- one static, pack-
  // derived World for the whole game), so unlike some-hero's segmented
  // ow<->tomb replay, one plain replay() over one World suffices here
  // (the same posture module.test.js's own determinism tests take). ──
  assert.ok(events.length > 0, "the walkthrough must have produced at least one committed event to replay");
  const liveHash = h32(serializeState(finalState));

  const replay1 = replay(module, world, events, createState(world));
  const replay1Hash = h32(serializeState(replay1));
  assert.equal(serializeState(replay1), serializeState(finalState), "replay #1 must reproduce a structurally-identical state");
  assert.equal(replay1Hash, liveHash, "replay #1's hash must be byte-identical to the live run's hash");

  const replay2 = replay(module, world, events, createState(world));
  const replay2Hash = h32(serializeState(replay2));
  assert.equal(serializeState(replay2), serializeState(finalState), "replay #2 must reproduce a structurally-identical state");
  assert.equal(replay2Hash, liveHash, "replay #2's hash must be byte-identical to the live run's hash");

  // A record of the exact bit-identical hash + the command/event counts,
  // for the task report (no assertion below this line -- documentation-
  // by-log, same convention full-route.test.js's own tail uses).
  assert.equal(commands.length, 37);
  assert.equal(events.length, 35, "35 of the 37 scripted commands committed an event; the other 2 are the asserted denials");
});
