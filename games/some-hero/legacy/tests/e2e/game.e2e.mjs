// End-to-end test: drives the real game in headless Chromium via Playwright.
//
//   npm run test:e2e
//
// Covers what node:test can't — the seams between DOM, input routing, and
// game state: the splash timeline + the Ledger's key reactions + Enter-to-
// start, the Door Golem's stamp ceremony playing TOPSIDE before descent,
// the trap-counter room, and customs happening AT the door before daylight.
//
// Needs Playwright (`npm i --no-save playwright` if it isn't installed) and
// a Chromium: $CHROME_PATH, /usr/bin/chromium, or Playwright's own download.
// The game exposes window.__sh = { game, fx } only under ?test (see main.js);
// the test uses it to grant credentials and teleport — every observation is
// made through the real DOM and render loop.

import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = join(ROOT, 'tests/e2e/shots');
const TARGET = process.env.E2E_TARGET;              // e.g. 'dist/some-hero.html'
const PAGE   = TARGET ? `/${TARGET}?test` : '/?test';
await mkdir(SHOTS, { recursive: true });

// ---------- a tiny static server (no dependencies) ----------
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav'
};
const server = http.createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^[/\\]+/, '') || 'index.html';
    const file = join(ROOT, rel);
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

// ---------- browser ----------
const executablePath = process.env.CHROME_PATH ||
  (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
// the OST is diegetic: each track is fetched lazily when its source first
// exists — so reaching each zone proves its music wiring
const fetchedTracks = {};
page.on('response', r => {
  const m = r.url().match(/assets\/audio\/(.+)\.mp3$/);
  if (m) fetchedTracks[m[1]] = r.status();
});

const shot = name => page.screenshot({ path: join(SHOTS, name + '.png') });
const ledger = () => page.evaluate(() => document.getElementById('splashLedger').innerText);
const dlgName = () => page.evaluate(() => document.getElementById('dlgName').innerText);
const dlgText = () => page.evaluate(() => document.getElementById('dlgText').innerText);
const toast = () => page.evaluate(() => document.getElementById('toast').innerText);
// toasts queue now — wait for the one we mean instead of reading whatever's up
const waitToast = re => page.waitForFunction(
  src => new RegExp(src).test(document.getElementById('toast').innerText),
  re.source, { timeout: 9000 });
const quest = () => page.evaluate(() => document.getElementById('quest').innerText);
const G = () => page.evaluate(() => {
  const { game } = window.__sh;
  return { zone: game.zone, state: game.state, floor: game.floorNum };
});

let steps = 0;
const step = name => console.log('  ✓ ' + (++steps + '').padStart(2) + ' ' + name);

try {
  await page.goto(`http://localhost:${port}${PAGE}`);

  // ---------- the splash ----------
  await page.waitForTimeout(8200);   // full timeline: stamp 5.2s, press 6.4s, note 7s
  await shot('01-splash-full');
  assert.match(await ledger(), /gazed upon the title screen/);
  step('splash timeline plays; the Ledger is narrating');

  await page.keyboard.press('x');
  assert.equal(await page.evaluate(() =>
    document.getElementById('splashStamp').classList.contains('wobble')), true);
  await page.waitForTimeout(1500);
  assert.match(await ledger(), /pressed a key\. boldly/);
  step('a wrong key wobbles the stamp and is noted');

  await page.keyboard.press(' ');
  await page.waitForTimeout(1800);
  assert.match(await ledger(), /ANOTHER key/);
  assert.equal(await page.evaluate(() =>
    document.getElementById('splash').classList.contains('fadeout')), false);
  step('Space does not start the game (it is also noted)');

  await page.mouse.click(200, 80);
  await page.waitForTimeout(1500);
  assert.match(await ledger(), /that was the screen/);
  step('clicking the screen is, correctly, not a key');

  // the first gesture already happened — the band must be playing by now
  const audio = await page.evaluate(() => {
    const { getAC, masterOut, musicDebug } = window.__sh;
    return { ac: getAC().state, master: masterOut().gain.value, ...musicDebug() };
  });
  assert.equal(audio.ac, 'running', 'the AudioContext resumed on the first key');
  assert.equal(audio.master, 1, 'unmuted');
  assert.ok(audio.channels.lightning > 0.2, 'the title track is audibly up: ' + audio.channels.lightning);
  assert.deepEqual(audio.failed, [], 'no tracks failed to decode');
  step('the band started on the first key (context running, title channel up)');

  for (let k = 0; k < 4; k++) { await page.keyboard.press('q'); await page.waitForTimeout(1900); }
  assert.match(await ledger(), /the Start key is Enter/);
  await shot('02-splash-ledger-cracked');
  step('the Ledger cracks and names Enter');

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');   // double-Enter must not double-start
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() =>
    document.getElementById('splash').classList.contains('fadeout')), true);
  assert.equal((await G()).state, 1, 'PLAY behind the fade');
  await page.waitForTimeout(1700);
  assert.equal(await page.evaluate(() =>
    getComputedStyle(document.getElementById('splash')).display), 'none');
  await shot('03-overworld-after-start');
  step('Enter starts; the splash fades off the live overworld');

  // ---------- the village reads: a stand on the road, a line that pickets ----------
  const village = await page.evaluate(() => {
    const { game } = window.__sh;
    const T = 36;
    const gnoll = game.npcs.find(n => n.name === 'Gift Shop Gnoll');
    const picketers = game.npcs.filter(n => n.name === 'Picketing Hero');
    return {
      stand: !!gnoll.stand,
      onRoad: game.world.map[Math.floor((gnoll.y + 4) / T) * game.world.w + Math.floor(gnoll.x / T)] === 9,
      picketers: picketers.length,
      signs: picketers.every(n => n.sign)
    };
  });
  assert.deepEqual(village, { stand: true, onRoad: true, picketers: 3, signs: true });
  await page.evaluate(() => {
    const { game } = window.__sh;
    const g = game.npcs.find(n => n.name === 'Gift Shop Gnoll');
    game.player.x = g.x - 40; game.player.y = g.y + 30;
    game.player.tk = Math.floor(game.player.x / 36) + ',' + Math.floor(game.player.y / 36);
  });
  await page.waitForTimeout(300);
  await shot('03b-glurp-stand');
  step('the Glurp stand is ON the road; the picket line pickets, signed');

  // ---------- the Door Golem: ceremony topside, THEN descent ----------
  await page.evaluate(() => {
    const { game } = window.__sh;
    game.meta.credentials.backstory = true;
    game.meta.credentials.debt = true;
    game.player.swordLv = 1;   // the golem checks your hands
    const T = 36;
    const tx = Math.floor(game.player.x / T) + 2, ty = Math.floor(game.player.y / T);
    game.world.map[ty * game.world.w + tx] = 12;   // TL.SD: a trapdoor
    game.player.x = tx * T + T / 2; game.player.y = ty * T + T / 2;
  });
  await page.waitForTimeout(400);
  assert.deepEqual(await G(), { zone: 'ow', state: 2, floor: 0 },
    'still topside, in dialog, during the stamp ceremony');
  assert.match(await dlgName(), /DOOR GOLEM/i);
  assert.match(await dlgText(), /HALT\. Credential verification/);
  await shot('04-ceremony-over-overworld');
  step('the stamp ceremony plays over the overworld (no early dark screen)');

  for (let k = 0; k < 12; k++) { await page.mouse.click(500, 120); await page.waitForTimeout(140); }
  await page.waitForTimeout(600);
  assert.deepEqual(await G(), { zone: 'tomb', state: 1, floor: 1 });
  await shot('05-tomb-after-ceremony');
  step('descent happens only after the stamp');

  // ---------- the break room: furnished, supplied by the machine only ----------
  const breakroom = await page.evaluate(() => {
    const { game } = window.__sh;
    return {
      tables: game.props.filter(p => p.kind === 'table').length,
      chairs: game.props.filter(p => p.kind === 'chair').length,
      loosePotions: game.pickups.filter(p => p.kind === 'potion').length,
      radioByDoor: !!game.npcs.find(n => n.kind === 'radio')
    };
  });
  assert.deepEqual(breakroom, { tables: 1, chairs: 3, loosePotions: 0, radioByDoor: true });
  await page.evaluate(() => {
    const { game } = window.__sh;
    const m = game.npcs.find(n => n.kind === 'machine');
    game.player.x = m.x + 50; game.player.y = m.y + 30;
    game.player.tk = Math.floor(game.player.x / 36) + ',' + Math.floor(game.player.y / 36);
  });
  await page.waitForTimeout(300);
  await shot('05b-breakroom-furnished');
  await page.evaluate(() => {   // back to the stairs; the tour is over
    const { game } = window.__sh;
    game.player.x = game.floorSpawn.cx * 36 + 18;
    game.player.y = game.floorSpawn.cy * 36 + 18;
    game.player.tk = game.floorSpawn.cx + ',' + game.floorSpawn.cy;
  });
  step('the break room: table, chairs, zero loose Glurp; Skritch greets at the door');

  // ---------- the Room That Renovation Forgot ----------
  await page.evaluate(() => {
    const { game } = window.__sh;
    const T = 36;
    const ptx = Math.floor(game.player.x / T), pty = Math.floor(game.player.y / T);
    game.world.map[pty * game.world.w + (ptx + 1)] = 10;   // TL.TF
    game.world.map[pty * game.world.w + (ptx + 2)] = 10;
    game.puzzle = { type: 'traps', need: 2, done: 0, solved: false };
    game.traps = [{ tx: ptx + 1, ty: pty, hit: false }, { tx: ptx + 2, ty: pty, hit: false }];
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__sh.game.player.x += 36; });
  await page.waitForTimeout(350);
  await waitToast(/CLICK\. No dart\. INCIDENT #1 OF 2/);
  assert.match(await quest(), /incidents 1 \/ 2/);
  await shot('06-trap-counter');
  step('stepping on a dartless trap files an incident');

  await page.evaluate(() => { window.__sh.game.player.x += 36; });
  await page.waitForTimeout(350);
  await waitToast(/INCIDENT QUOTA MET \(2\/2\)/);
  assert.equal(await page.evaluate(() => window.__sh.game.puzzle.solved), true);
  step('the quota opens the seal');

  // ---------- customs: AT the door, daylight after ----------
  await page.evaluate(() => {
    const { game } = window.__sh;
    game.runStats.goldGained = 12;
    const T = 36;
    for (let i = 0; i < game.world.map.length; i++) if (game.world.map[i] === 13) {  // TL.SU
      game.player.x = (i % game.world.w) * T + T / 2;
      game.player.y = ((i / game.world.w) | 0) * T + T / 2;
      game.player.tk = 'stale';
      break;
    }
  });
  await page.waitForTimeout(400);
  assert.deepEqual(await G(), { zone: 'tomb', state: 2, floor: 1 },
    'inspection happens at the door, not in daylight');
  assert.match(await dlgText(), /HALT\. Customs.*exactly 12 gold/);
  await shot('07-customs-at-the-door');
  step('customs plays in the tomb, not over the overworld');

  await page.mouse.click(500, 120); await page.waitForTimeout(250);
  await page.mouse.click(500, 120); await page.waitForTimeout(350);
  assert.equal(await dlgText(), 'Anything to declare?');

  // the little book is a peek, not an answer
  await page.getByText('Read his little book').click();
  await page.waitForTimeout(250);
  assert.match(await dlgText(), /They are all about you/);
  await page.mouse.click(500, 120); await page.waitForTimeout(350);
  assert.equal(await dlgText(), 'Anything to declare?');
  assert.equal((await G()).zone, 'tomb', 'reading the book does not skip customs');
  step('the suspicion book returns to the question');

  await page.getByText('Declare it').click();
  await page.waitForTimeout(300);
  assert.match(await dlgText(), /Declared: 12 g/);
  assert.equal((await G()).zone, 'tomb');
  await page.mouse.click(500, 120); await page.waitForTimeout(500);
  assert.deepEqual(await G(), { zone: 'ow', state: 1, floor: 0 });
  await waitToast(/Daylight\. Depth record: 1\. Run grade: [SABCDF]/);
  await shot('08-daylight-after-customs');
  step('declaring releases you into daylight, graded');

  // ---------- the cheat panel (?test implies ?cheats) ----------
  await page.click('#cheatBtn');
  await page.getByText('Floor 4').click();
  await page.waitForTimeout(600);
  assert.deepEqual(await G(), { zone: 'tomb', state: 1, floor: 4 });
  assert.equal(await page.evaluate(() => !!window.__sh.game.boss), true, 'floor 4 has its warden');
  assert.equal(await page.evaluate(() => window.__sh.game.meta.runs), 2, 'jump started exactly one new run');
  await shot('09-cheat-floor4');
  step('cheat: Floor 4 jump keeps run invariants');

  // ---------- the OST: every source fetched its track in its zone ----------
  await page.click('#cheatBtn');
  await page.getByText('Floor 12').click();
  await page.waitForTimeout(1500);
  assert.deepEqual(await G(), { zone: 'tomb', state: 1, floor: 12 });
  if (!TARGET) {
    for (const t of ['ledger-lightning-bolt', 'audit-microwave', 'factory-synesthesia',
                     'performance-review', 'apocalypse-cancel']) {
      assert.equal(fetchedTracks[t], 200, t + ' fetched by its zone (sources pre-load even out of earshot)');
    }
    step('the OST: title, topside radio, breakroom radio, the review, the apocalypse — all sourced');
  } else {
    step('the OST: audio wiring confirmed via source e2e (inlined data: URIs emit no network response)');
  }

  await page.click('#cheatBtn');
  await page.locator('#cheatPanel button', { hasText: 'God' }).click();
  await page.locator('#cheatPanel button', { hasText: 'Die now' }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() =>
    document.getElementById('over').classList.contains('hidden')), true, 'god mode shrugs off death');
  await page.click('#cheatBtn');
  await page.locator('#cheatPanel button', { hasText: 'God' }).click();   // back off
  await page.locator('#cheatPanel button', { hasText: 'Die now' }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.getElementById('overTitle').innerText), 'INCIDENT REPORT');
  await page.mouse.click(500, 120); await page.waitForTimeout(300);       // resurrect
  assert.deepEqual(await G(), { zone: 'ow', state: 1, floor: 0 });
  step('cheat: god mode blocks death; without it the incident report files');

  await page.click('#cheatBtn');
  await page.locator('#cheatPanel button', { hasText: 'Win' }).click();
  await page.waitForTimeout(400);                                          // the magnet does the rest
  assert.match(await page.evaluate(() => document.getElementById('overTitle').innerText), /TICKET #44,107: STAMPED/);
  await page.mouse.click(500, 120); await page.waitForTimeout(200);
  step('cheat: Win drops the medallion through the real collect path');

  await page.click('#cheatBtn');
  await page.locator('#cheatPanel button', { hasText: 'Skin' }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.body.classList.contains('skin-desert')), true);
  assert.equal(await page.evaluate(() => window.__sh.game.skin), 'desert');
  await shot('10-classic-skin');
  await page.locator('#cheatPanel button', { hasText: 'Skin' }).click();   // back to pflum
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__sh.game.skin), 'pflum');
  await page.click('#cheatBtn');                                           // close the panel
  step('cheat: skin toggles to classic desert and back, live');

  // ---------- knowledge survives the tab; so does mute ----------
  await page.evaluate(() => {
    const { game } = window.__sh;
    game.meta.deaths = 9;
    game.meta.credit.balance = 33;
    game.meta.income = 15;
  });
  await page.click('#muteBtn');
  await page.waitForTimeout(5600);          // the 5s dirty-check autosave
  await page.reload();
  await page.waitForTimeout(900);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const persisted = await page.evaluate(() => {
    const { game } = window.__sh;
    return {
      deaths: game.meta.deaths,
      balance: game.meta.credit.balance,
      income: game.meta.income,
      mute: localStorage.getItem('sh-mute'),
      btn: document.getElementById('muteBtn').textContent
    };
  });
  assert.deepEqual(persisted, { deaths: 9, balance: 33, income: 15, mute: '1', btn: '🔇' });
  step('knowledge survives the tab (deaths, balance, income); so does mute');

  // ---------- the heist triangle + final boss + endings ----------
  // At this point: post-reload, overworld, meta known (deaths:9 etc). The page
  // is at quest stage 0 and zone 'ow'. We'll use cheats for speed.

  // Grant the three Act II tokens
  await page.click('#cheatBtn');
  await page.locator('#cheatPanel button', { hasText: 'Grant triangle' }).click();
  await page.waitForTimeout(300);
  const triangle = await page.evaluate(() => {
    const { game } = window.__sh;
    return { ...game.meta.heist };
  });
  assert.deepEqual(triangle, { skull: true, gregory: true, signature: true });
  await page.click('#cheatBtn');  // close panel
  step('Grant triangle: all three heist tokens granted');

  // Jump to floor 12 and verify the final floor
  await page.click('#cheatBtn');
  await page.getByText('Floor 12').click();
  await page.waitForTimeout(1500);
  assert.deepEqual(await G(), { zone: 'tomb', state: 1, floor: 12 });
  const finalFloor = await page.evaluate(() => {
    const { game } = window.__sh;
    const TL_SD = 12;
    const noSD = !game.world.map.some(v => v === TL_SD);
    return {
      puzzleType: game.puzzle.type,
      bossName: game.boss && game.boss.name,
      noSD,
      deskNpc: !!game.npcs.find(n => n.kind === 'desk')
    };
  });
  assert.equal(finalFloor.puzzleType, 'final');
  assert.match(finalFloor.bossName, /Origenal Hero/);
  assert.equal(finalFloor.noSD, true, 'no down-stairs on the final floor');
  assert.equal(finalFloor.deskNpc, true, 'Cancellation Desk NPC present');
  await shot('11-final-floor');
  step('Floor 12: final puzzle, Origenal Hero, no SD tile, desk present');

  // Kill the boss via cheat (re-open panel — Floor 12 closed it)
  await page.click('#cheatBtn');
  await page.locator('#cheatPanel button', { hasText: 'Kill boss' }).click();
  await page.waitForTimeout(400);
  const bossState = await page.evaluate(() => {
    const { game } = window.__sh;
    return { dead: game.boss.dead, bossDead: game.puzzle.bossDead };
  });
  assert.equal(bossState.dead, true, 'boss dead');
  assert.equal(bossState.bossDead, true, 'puzzle.bossDead set');
  await page.click('#cheatBtn');  // close panel
  step('Kill boss cheat: boss dead, puzzle.bossDead set');

  // Teleport to the desk and trigger the talk
  await page.evaluate(() => {
    const { game, fx } = window.__sh;
    const desk = game.npcs.find(n => n.kind === 'desk');
    // requestTalk goes through the real talkTo path, opening the dialog box
    fx.requestTalk(desk);
  });
  await page.waitForTimeout(400);
  assert.deepEqual(await G(), { zone: 'tomb', state: 2, floor: 12 }, 'in dialog at floor 12');
  // advance through the opening lines to reach the choice
  await page.mouse.click(500, 120); await page.waitForTimeout(200);
  await page.mouse.click(500, 120); await page.waitForTimeout(300);
  await shot('12-desk-choice');
  step('Cancellation Desk: dialogue opened, waiting for ending choice');

  // ---- Ending B: Transfer ownership (New Game+) ----
  await page.getByText('Transfer ownership').click();
  await page.waitForTimeout(400);
  assert.match(
    await page.evaluate(() => document.getElementById('overTitle').innerText),
    /OWNERSHIP TRANSFERRED/
  );
  const ownerSet = await page.evaluate(() => window.__sh.game.meta.owner);
  assert.equal(ownerSet, true, 'meta.owner set');
  await shot('13-ending-transfer');
  step('Transfer ownership: OWNERSHIP TRANSFERRED screen, meta.owner = true');

  // Close the screen → NG+: fresh run, meta preserved
  await page.mouse.click(500, 120);
  await page.waitForTimeout(400);
  const ngPlus = await page.evaluate(() => {
    const { game } = window.__sh;
    return { zone: game.zone, floor: game.floorNum, owner: game.meta.owner,
             skull: game.meta.heist.skull, gregory: game.meta.heist.gregory };
  });
  assert.equal(ngPlus.zone, 'ow', 'back to overworld after NG+');
  assert.equal(ngPlus.floor, 0, 'floor reset');
  assert.equal(ngPlus.owner, true, 'meta.owner survives newRun');
  assert.equal(ngPlus.skull, true, 'heist tokens survive newRun');
  // panel is still open from before; close it now
  await page.click('#cheatBtn');
  step('New Game+: overworld reset, meta.owner and heist tokens persist');

  // ---- Ending A: Cancel everything (heist tokens survive from NG+, re-run the boss) ----
  // Tokens are still in meta, so jump straight to floor 12 and kill the boss again
  await page.click('#cheatBtn');   // open panel
  await page.getByText('Floor 12').click();   // closes panel on click
  await page.waitForTimeout(1500);
  assert.deepEqual(await G(), { zone: 'tomb', state: 1, floor: 12 });
  await page.click('#cheatBtn');   // re-open panel
  await page.locator('#cheatPanel button', { hasText: 'Kill boss' }).click();  // closes panel
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const { game, fx } = window.__sh;
    fx.requestTalk(game.npcs.find(n => n.kind === 'desk'));
  });
  await page.waitForTimeout(400);
  await page.mouse.click(500, 120); await page.waitForTimeout(200);
  await page.mouse.click(500, 120); await page.waitForTimeout(300);

  await page.getByText('Cancel everything').click();
  await page.waitForTimeout(400);
  assert.match(
    await page.evaluate(() => document.getElementById('overTitle').innerText),
    /APOCALYPSE IS CANCELLED/
  );
  const cancelSet = await page.evaluate(() => window.__sh.game.meta.cancelled);
  assert.equal(cancelSet, true, 'meta.cancelled set');
  await shot('14-ending-cancel');
  step('Cancel everything: APOCALYPSE IS CANCELLED screen, meta.cancelled = true');

  assert.deepEqual(pageErrors, [], 'no uncaught page errors');
  console.log(`\ne2e: all ${steps} steps passed. screenshots in tests/e2e/shots/`);
} catch (err) {
  await shot('99-failure');
  console.error('\ne2e FAILED at step ' + (steps + 1) + ' — see tests/e2e/shots/99-failure.png');
  if (pageErrors.length) console.error('page errors:', pageErrors);
  throw err;
} finally {
  await browser.close();
  server.close();
}
