// Two-tab Playwright smoke test (K4's required DoD): proves the extracted
// @golem-engine/net package still delivers "two-tab play works exactly as
// today" against the REAL single-file build, in a REAL Chromium, over
// file://, exactly like a person opening the same file in two tabs.
//
// Not wired into `npm test`/CI (see K4 brief decision 6 — flake budget is
// O1's call). Run locally via `make smoke-e2e`.
//
//   node games/golem-grid/tests/e2e/two-tab.smoke.mjs
//
// Uses the Playwright already installed under games/some-hero/legacy/
// node_modules (via createRequire) — NOT a root/golem-grid dependency.
// If it's missing: `cd games/some-hero/legacy && npm ci`.
//
// What it drives, through the real DOM only (no test hooks added to
// main.js):
//   1. Tab A hosts a fixed-seed world ("k4smoke-0" — its dungeon is
//      precomputed offline below so the walk directions are known).
//   2. Tab B joins (HELLO -> SNAPSHOT round trip).
//   3. Tab A walks 3 steps toward a wall; tab B's `/who` output (a plain
//      client command, real UI) proves the EVENT stream rendered tab A's
//      new position in tab B — the cross-tab movement assertion.
//   4. Tab B (the peer, NOT the host) walks the same 3 open steps then a
//      4th into the wall. That 4th step's CMD goes to the host over the
//      wire, the host denies it, and the DENY message comes back over
//      the wire to tab B, where it renders locally — the real wire-DENY
//      assertion (not a client-side "unknown command" parse error).

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DIST = fileURLToPath(new URL("../../dist/golem-grid.html", import.meta.url));
const LEGACY_PKG = fileURLToPath(
  new URL("../../../some-hero/legacy/package.json", import.meta.url),
);

if (!existsSync(DIST)) {
  console.error(
    `two-tab.smoke: missing ${DIST}\n` +
      "Build it first: `make html` (this is what `make smoke-e2e` does automatically).",
  );
  process.exit(1);
}
if (!existsSync(LEGACY_PKG)) {
  console.error(
    `two-tab.smoke: Playwright's host package not found at ${LEGACY_PKG}\n` +
      "Install it: `cd games/some-hero/legacy && npm ci` (Playwright is deliberately " +
      "NOT a root or golem-grid dependency — see K4 brief).",
  );
  process.exit(1);
}

const legacyRequire = createRequire(LEGACY_PKG);
let chromium;
try {
  ({ chromium } = legacyRequire("playwright"));
} catch (e) {
  console.error(
    "two-tab.smoke: `playwright` isn't installed under games/some-hero/legacy/node_modules.\n" +
      "Run: cd games/some-hero/legacy && npm ci",
  );
  console.error(e.message);
  process.exit(1);
}

// The seed's dungeon is deterministic (worldgen doctrine) — precomputed
// offline (see this file's git history / k4-report.md for the script)
// rather than imported live, so this test has zero dependency on
// golem-grid's shared/ modules resolving inside the Playwright process.
// Stairs sit at (19,17); "up" is open for exactly 3 steps, then a wall.
const SEED = "k4smoke-0";
const STAIRS = { x: 19, y: 17 };
const OPEN_STEPS = 3; // ArrowUp x3 lands on (19,14), still floor
const WALL_STEP_TARGET = { x: STAIRS.x, y: STAIRS.y - (OPEN_STEPS + 1) }; // (19,13), wall

const feedText = (page) => page.evaluate(() => document.getElementById("feed").textContent);

async function waitForFeed(page, needle, label) {
  try {
    await page.waitForFunction(
      (n) => document.getElementById("feed").textContent.includes(n),
      needle,
      { timeout: 10_000 },
    );
  } catch (e) {
    const text = await feedText(page);
    throw new Error(
      `timed out waiting for ${label} (looking for ${JSON.stringify(needle)})\n` +
        `--- feed contents ---\n${text}\n---------------------`,
    );
  }
}

async function who(page) {
  await page.fill("#cmd", "/who");
  await page.press("#cmd", "Enter");
}

const executablePath =
  process.env.CHROME_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

const browser = await chromium.launch({ executablePath });
const transcript = [];
function log(line) {
  transcript.push(line);
  console.log(line);
}

try {
  const context = await browser.newContext();
  const tabA = await context.newPage(); // host
  const tabB = await context.newPage(); // peer

  const fileUrl = "file://" + DIST;
  await tabA.goto(fileUrl);
  await tabB.goto(fileUrl);
  log(`opened ${fileUrl} in two tabs of the same browser context`);

  // ---- 1. host tab A on a fixed seed ----
  await tabA.fill("#st-seed", SEED);
  await tabA.click("#bt-host");
  await waitForFeed(tabA, `world "${SEED}" is open`, "tab A host-open message");
  log(`tab A: hosted world "${SEED}"`);

  // ---- 2. join tab B ----
  await tabB.click("#bt-join");
  await waitForFeed(tabB, `joined "${SEED}"`, "tab B join confirmation");
  log(`tab B: joined "${SEED}" (HELLO -> SNAPSHOT round trip over the net package)`);

  // ---- 3. tab A walks toward the wall, 3 open steps ----
  for (let i = 0; i < OPEN_STEPS; i++) {
    await tabA.keyboard.press("ArrowUp");
  }
  log(`tab A: pressed ArrowUp x${OPEN_STEPS} (host, local hostCommit path)`);

  // cross-tab movement assertion: tab B's OWN /who output (real UI,
  // no test hooks) must reflect tab A's new position, proving the
  // EVENT messages flowed net-package -> reducer -> render in tab B.
  const wantPos = `@ ${STAIRS.x},${STAIRS.y - OPEN_STEPS}`;
  await who(tabB);
  await waitForFeed(tabB, wantPos, `tab B /who showing tab A at ${wantPos}`);
  log(`tab B: /who confirms tab A's move rendered cross-tab (found "${wantPos}")`);

  // ---- 4. tab B (the peer) walks the same 3 open steps, then a 4th
  // into the wall — this CMD goes over the wire to the host, gets
  // denied, and the DENY comes back over the wire to tab B. ----
  for (let i = 0; i < OPEN_STEPS; i++) {
    await tabB.keyboard.press("ArrowUp");
  }
  await who(tabB);
  // "(you)" marks tab B's own /who line — distinguishes "B actually
  // moved" from "A's earlier move already put someone at this tile".
  await waitForFeed(
    tabB,
    `(you) @ ${STAIRS.x},${STAIRS.y - OPEN_STEPS}`,
    "tab B /who showing tab B's own pre-wall position",
  );
  log(`tab B: walked its own ${OPEN_STEPS} open steps toward (${WALL_STEP_TARGET.x},${WALL_STEP_TARGET.y})`);

  await tabB.keyboard.press("ArrowUp"); // the 4th step, into the wall
  await waitForFeed(tabB, "Stone does not negotiate.", "tab B wire-DENY rendering");
  const denyIsRendered = await tabB.evaluate(() => {
    const nodes = [...document.getElementById("feed").children];
    return nodes.some(
      (n) => n.className === "deny" && n.textContent === "Stone does not negotiate.",
    );
  });
  assert.equal(
    denyIsRendered,
    true,
    "expected a .deny feed line with the exact wire DENY reason string",
  );
  log(
    'tab B: CMD "move 0 -1" into the wall -> host validate -> DENY over the wire -> ' +
      'rendered locally as .deny "Stone does not negotiate." — wire DENY path confirmed',
  );

  log("two-tab.smoke: PASS");
} catch (e) {
  console.error("two-tab.smoke: FAIL —", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

if (process.exitCode) process.exit(process.exitCode);
