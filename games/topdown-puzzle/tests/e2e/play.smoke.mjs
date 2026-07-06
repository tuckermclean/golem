// Playability Playwright smoke (DELTA C4 PR3's DoD evidence): proves the
// thin canvas client (games/topdown-puzzle/src/*.js — no Phaser) is
// actually playable start-to-finish against the REAL single-file build,
// in a REAL Chromium, over file://, mirroring games/golem-grid/tests/e2e/
// two-tab.smoke.mjs's own harness and discipline.
//
// Not wired into `npm test`/CI (same flake-budget posture as golem-grid's
// smokes — see that file's own header). Run locally:
//
//   node games/topdown-puzzle/tests/e2e/play.smoke.mjs
//
// (or `make smoke-e2e-tdp`, which builds first).
//
// Uses the Playwright already installed under games/some-hero/legacy/
// node_modules (via createRequire) — NOT a root/topdown-puzzle
// dependency, exactly like golem-grid's own e2e smokes. If missing:
// `cd games/some-hero/legacy && npm ci`.
//
// What it drives, through the real DOM + the read-only window.__tdp
// testability hook src/main.js exposes (per the PR3 brief: "a state hook
// you expose on window for testability" is permitted — never written to
// by shared/*.js, which stays identity-blind and DOM-free):
//   1. The built dist/index.html loads level "001" and renders a
//      non-blank canvas (walls/floor/player/baddies all present).
//   2. Pressing ArrowUp moves the player one tile north (a real "move 0
//      -1" command, through validate() -> reduce(), same as any player
//      command) — asserted both via window.__tdp's state snapshot AND a
//      changed canvas pixel buffer (the actual rendered frame moved).
//   3. Waiting past one TICK_MS interval advances state.tick AND moves
//      at least one baddie (the fixed-step clock in src/host.js driving
//      shared/tick.js's resolveTick autonomously, with no player input)
//      — the tick bridge's real-time half, exercised end to end.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../../dist/index.html", import.meta.url));
const LEGACY_PKG = fileURLToPath(
  new URL("../../../some-hero/legacy/package.json", import.meta.url),
);

if (!existsSync(DIST)) {
  console.error(
    `play.smoke: missing ${DIST}\n` +
      "Build it first: `npm run build -w @golem-engine/topdown-puzzle` " +
      "(this is what `make smoke-e2e-tdp` does automatically).",
  );
  process.exit(1);
}
if (!existsSync(LEGACY_PKG)) {
  console.error(
    `play.smoke: Playwright's host package not found at ${LEGACY_PKG}\n` +
      "Install it: `cd games/some-hero/legacy && npm ci` (Playwright is deliberately " +
      "NOT a root or topdown-puzzle dependency — see games/golem-grid/tests/e2e/*.smoke.mjs).",
  );
  process.exit(1);
}

const legacyRequire = createRequire(LEGACY_PKG);
let chromium;
try {
  ({ chromium } = legacyRequire("playwright"));
} catch (e) {
  console.error(
    "play.smoke: `playwright` isn't installed under games/some-hero/legacy/node_modules.\n" +
      "Run: cd games/some-hero/legacy && npm ci",
  );
  console.error(e.message);
  process.exit(1);
}

const executablePath =
  process.env.CHROME_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

const browser = await chromium.launch({ executablePath });
const transcript = [];
function log(line) {
  transcript.push(line);
  console.log(line);
}

async function getSnapshot(page) {
  return page.evaluate(() => window.__tdp.getSnapshot());
}

async function canvasDataUrl(page) {
  return page.evaluate(() => document.getElementById("cv").toDataURL("image/png"));
}

try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();

  const fileUrl = "file://" + DIST;
  await page.goto(fileUrl);
  await page.waitForFunction(() => !!window.__tdp, undefined, { timeout: 10_000 });
  log(`opened ${fileUrl}`);

  // ---- 1. non-blank canvas + a real level loaded ----
  const before = await getSnapshot(page);
  assert.equal(before.tick, 0, "expects tick 0 immediately after LEVEL_LOADED, before any clock tick lands");
  assert.equal(before.over, false);
  const player0 = before.entities.find((e) => e.id === "entity:player");
  assert.ok(player0, "expected an entity:player in the loaded level's initial state");
  const baddiesBefore = before.entities.filter((e) => e.kind === "baddie");
  assert.ok(baddiesBefore.length >= 1, "expected at least one baddie in level 001's initial state");

  const png0 = await canvasDataUrl(page);
  const bytes0 = Buffer.from(png0.split(",")[1], "base64").length;
  assert.ok(bytes0 > 800, `expected a non-blank rendered canvas (got a suspiciously small PNG: ${bytes0} bytes)`);
  log(`canvas rendered non-blank (${bytes0} PNG bytes); player at (${player0.x},${player0.y}); ${baddiesBefore.length} baddie(s) present`);

  // ---- 2. arrow key moves the player one tile (level 001's player
  // start has open floor directly north — see this file's design doc
  // citation / tests/e2e header for the level-layout arithmetic) ----
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(
    (startY) => {
      const s = window.__tdp.getSnapshot();
      const p = s.entities.find((e) => e.id === "entity:player");
      return p && p.y === startY - 1;
    },
    player0.y,
    { timeout: 5_000 },
  );
  const afterMove = await getSnapshot(page);
  const player1 = afterMove.entities.find((e) => e.id === "entity:player");
  assert.equal(player1.x, player0.x, "ArrowUp should not change x");
  assert.equal(player1.y, player0.y - 1, "ArrowUp should move the player one tile north");
  log(`ArrowUp moved the player from (${player0.x},${player0.y}) to (${player1.x},${player1.y}) via validate()->reduce()`);

  const png1 = await canvasDataUrl(page);
  assert.notEqual(png1, png0, "expected the rendered canvas to change after the player moved");
  log("canvas pixel buffer changed after the move (real re-render, not just state)");

  // ---- 3. the fixed-step host clock advances ticks/baddies with NO
  // further player input — the tick bridge's real-time half. ----
  const beforeTick = await getSnapshot(page);
  const tickMs = await page.evaluate(() => window.__tdp.TICK_MS);
  await page.waitForFunction(
    (prevTick) => window.__tdp.getSnapshot().tick > prevTick,
    beforeTick.tick,
    { timeout: tickMs * 10 + 5_000 },
  );
  const afterTick = await getSnapshot(page);
  assert.ok(afterTick.tick > beforeTick.tick, "expected state.tick to advance from the host's TICK_MS clock alone");

  const baddieBefore = beforeTick.entities.find((e) => e.kind === "baddie" && e.id === baddiesBefore[0].id);
  const baddieAfter = afterTick.entities.find((e) => e.id === baddiesBefore[0].id);
  assert.ok(baddieAfter, "expected the tracked baddie to still exist (or have been destroyed — checked below)");
  const baddieMoved = baddieBefore.x !== baddieAfter.x || baddieBefore.y !== baddieAfter.y || baddieBefore.moveDir !== baddieAfter.moveDir;
  assert.ok(baddieMoved, `expected the baddie to have moved or reflected by tick ${afterTick.tick} (was (${baddieBefore.x},${baddieBefore.y}) moveDir ${baddieBefore.moveDir}, now (${baddieAfter.x},${baddieAfter.y}) moveDir ${baddieAfter.moveDir})`);
  log(`tick advanced ${beforeTick.tick} -> ${afterTick.tick} with NO player input; baddie ${baddiesBefore[0].id} moved/reflected autonomously`);

  log("play.smoke: PASS");
} catch (e) {
  console.error("play.smoke: FAIL —", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

if (process.exitCode) process.exit(process.exitCode);
