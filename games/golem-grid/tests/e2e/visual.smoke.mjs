// Visual-pinning smoke (K5 brief decision 5): captures a DETERMINISTIC
// rendering of the light-feel — fixed seed, scripted moves, fixed
// viewport, `prefers-reduced-motion: reduce` emulated (which the app's
// own code reads via `matchMedia` into `instant`, disabling the only
// two Math.random() calls in drawGrid — the flame jitter and the rim
// gutter-flicker — so the canvas becomes a pure function of game state,
// not wall-clock time) — against the REAL single-file build, in a REAL
// Chromium, over file://, same harness as two-tab.smoke.mjs.
//
// Run by the same make target as the two-tab smoke: `make smoke-e2e`.
//
//   node games/golem-grid/tests/e2e/visual.smoke.mjs capture <outDir>
//   node games/golem-grid/tests/e2e/visual.smoke.mjs compare <dirA> <dirB>
//
// Procedure used for K5 (see k5-report.md): `capture` was run against
// the PRE-restructure build (k4-net tip) into a scratch dir, then again
// against the POST-restructure build into a second scratch dir, then
// `compare` diffed them. Primary gate: byte-equality of the canvas's
// own `toDataURL()` output (lossless PNG straight from the pixel
// buffer — not an OS-level screenshot, so it isn't subject to
// compositor/devicePixelRatio nondeterminism). Fallback (if bytes ever
// differ): DOM/text assertions on the full feed + status line, plus the
// #lightfill element's inline style (transform/background — the pure,
// synchronous output of topbar(), which is what its CSS transition is
// chasing) at 3 light tiers (the CSS branches in topbar(): frac>0.4
// amber, 0.15<frac<=0.4 "#ff7b3d", frac<=0.15 deny-red) — captured
// unconditionally below so the evidence exists either way.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const DIST = fileURLToPath(new URL("../../dist/golem-grid.html", import.meta.url));
const LEGACY_PKG = fileURLToPath(
  new URL("../../../some-hero/legacy/package.json", import.meta.url),
);

const SEED = "k4smoke-0"; // same fixed seed as two-tab.smoke.mjs; stairs (19,17),
// (19,16)/(19,18) both open floor in the same room — safe indefinite shuttle.
// `movesBeforeCapture` is INCREMENTAL (moves to make since the previous
// checkpoint, then capture) — cumulative burn 0+260+60=320, ending at
// light=40, well clear of the light<=0 LOSE threshold.
const CHECKPOINTS = [
  { name: "tier1-full", movesBeforeCapture: 0 },   // light=360 frac=1.00  -> amber
  { name: "tier2-mid", movesBeforeCapture: 260 },  // light=100 frac=0.28  -> "#ff7b3d"
  { name: "tier3-low", movesBeforeCapture: 60 },   // light=40  frac=0.11  -> deny-red
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function capture(outDir) {
  if (!existsSync(DIST)) {
    console.error(`visual.smoke: missing ${DIST}\nBuild it first: \`make html\`.`);
    process.exit(1);
  }
  if (!existsSync(LEGACY_PKG)) {
    console.error(
      `visual.smoke: Playwright's host package not found at ${LEGACY_PKG}\n` +
        "Install it: `cd games/some-hero/legacy && npm ci`.",
    );
    process.exit(1);
  }
  const legacyRequire = createRequire(LEGACY_PKG);
  const { chromium } = legacyRequire("playwright");

  mkdirSync(outDir, { recursive: true });

  const executablePath =
    process.env.CHROME_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({ executablePath });
  const manifest = { seed: SEED, checkpoints: [] };
  try {
    const context = await browser.newContext({
      viewport: { width: 900, height: 700 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto("file://" + DIST);

    await page.fill("#st-seed", SEED);
    await page.click("#bt-host");
    await page.waitForFunction(
      (seed) => document.getElementById("feed").textContent.includes(`world "${seed}" is open`),
      SEED,
      { timeout: 10_000 },
    );

    for (const cp of CHECKPOINTS) {
      for (let i = 0; i < cp.movesBeforeCapture; i++) {
        // alternate so position stays put; only light burns
        await page.keyboard.press(i % 2 === 0 ? "ArrowUp" : "ArrowDown");
      }
      const snap = await page.evaluate(() => {
        const cv = document.getElementById("cv");
        const lf = document.getElementById("lightfill");
        return {
          canvasDataUrl: cv.toDataURL("image/png"),
          feedText: document.getElementById("feed").textContent,
          statusText: {
            seed: document.getElementById("tb-seed").textContent,
            theme: document.getElementById("tb-theme").textContent,
            role: document.getElementById("tb-role").textContent,
            party: document.getElementById("tb-party").textContent,
          },
          // NOTE: getComputedStyle(lf).transform/backgroundColor is NOT used
          // here — #lightfill has `transition:transform .3s, background .3s`
          // in style.css, ungated by prefers-reduced-motion (a pre-existing
          // quirk, not introduced by K5), so a computed-style read mid-flight
          // reports whatever frame the transition happened to reach, which is
          // wall-clock-dependent, not a pure function of game state. The
          // element's OWN inline style (set synchronously and only by
          // topbar(), a pure function of light/START_LIGHT) is the
          // deterministic source of truth the transition is chasing, so we
          // pin that instead.
          lightfill: {
            transform: lf.style.transform,
            background: lf.style.background,
          },
        };
      });
      const pngBytes = Buffer.from(snap.canvasDataUrl.split(",")[1], "base64");
      const pngPath = `${outDir}/${cp.name}.png`;
      writeFileSync(pngPath, pngBytes);
      const domPath = `${outDir}/${cp.name}.dom.json`;
      const domRecord = {
        feedText: snap.feedText,
        statusText: snap.statusText,
        lightfill: snap.lightfill,
      };
      writeFileSync(domPath, JSON.stringify(domRecord, null, 2));
      manifest.checkpoints.push({
        name: cp.name,
        png: `${cp.name}.png`,
        pngSha256: sha256(pngBytes),
        dom: `${cp.name}.dom.json`,
      });
      console.log(`visual.smoke: captured checkpoint "${cp.name}" -> ${pngPath} (sha256 ${sha256(pngBytes)})`);
    }
    writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
    console.log(`visual.smoke: capture complete -> ${outDir}/manifest.json`);
  } finally {
    await browser.close();
  }
}

function compare(dirA, dirB) {
  const manA = JSON.parse(readFileSync(`${dirA}/manifest.json`, "utf8"));
  const manB = JSON.parse(readFileSync(`${dirB}/manifest.json`, "utf8"));
  assert.equal(manA.checkpoints.length, manB.checkpoints.length, "checkpoint count differs");
  let anyPixelMismatch = false;
  for (let i = 0; i < manA.checkpoints.length; i++) {
    const a = manA.checkpoints[i], b = manB.checkpoints[i];
    assert.equal(a.name, b.name, "checkpoint name/order differs");
    const pixelMatch = a.pngSha256 === b.pngSha256;
    console.log(
      `visual.smoke compare [${a.name}]: canvas PNG sha256 ${pixelMatch ? "MATCH" : "MISMATCH"} ` +
        `(${a.pngSha256} vs ${b.pngSha256})`,
    );
    const domA = JSON.parse(readFileSync(`${dirA}/${a.dom}`, "utf8"));
    const domB = JSON.parse(readFileSync(`${dirB}/${b.dom}`, "utf8"));
    const domMatch = JSON.stringify(domA) === JSON.stringify(domB);
    console.log(`visual.smoke compare [${a.name}]: DOM/status/lightfill fallback ${domMatch ? "MATCH" : "MISMATCH"}`);
    if (!pixelMatch) {
      anyPixelMismatch = true;
      assert.equal(domMatch, true, `checkpoint ${a.name}: pixel gate failed AND DOM fallback failed`);
    }
  }
  if (anyPixelMismatch) {
    console.log("visual.smoke: PASS (pixel gate regressed on at least one checkpoint; DOM fallback held)");
  } else {
    console.log("visual.smoke: PASS (pixel gate held on every checkpoint — canvas toDataURL byte-identical)");
  }
}

const [, , mode, ...rest] = process.argv;
try {
  if (mode === "capture") {
    await capture(rest[0] || fileURLToPath(new URL("./.visual-out", import.meta.url)));
  } else if (mode === "compare") {
    compare(rest[0], rest[1]);
  } else {
    console.error("usage: visual.smoke.mjs capture <outDir> | compare <dirA> <dirB>");
    process.exit(1);
  }
} catch (e) {
  console.error("visual.smoke: FAIL —", e.message);
  process.exitCode = 1;
}
