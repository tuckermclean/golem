// Zone transitions: overworld <-> tomb, descending and ascending floors.

import { T, FINAL_FLOOR } from '../constants.js';
import { generateFloor } from './floorgen.js';
import { startRun, recordDepth } from '../core/meta.js';
import { newRunStats, gradeRun, gradeRemark } from '../systems/ledger.js';
import { accrueInterest } from '../systems/credit.js';
import { floorLine } from '../content/floors.js';

/** Restore the stashed overworld exactly (no grading, no customs — just the
 *  world swap). The single source of truth for climbing out. */
export function restoreSurface(game) {
  const s = game.owSave;
  game.world = s.world;
  game.enemies = s.enemies; game.pickups = s.pickups; game.npcs = s.npcs; game.boss = s.boss;
  game.blocks = []; game.plates = []; game.torches = []; game.traps = []; game.props = []; game.puzzle = null;
  game.parts = [];
  game.zone = 'ow';
  game.floorNum = 0;
}

/** Save the current floor into the run's cache before leaving it. Floors
 *  hold for the whole day; only Skritch's next renovation clears them. */
function stashFloor(game) {
  if (game.zone !== 'tomb' || game.floorNum < 1) return;
  game.floorCache[game.floorNum] = {
    world: game.world,
    enemies: game.enemies, pickups: game.pickups,
    blocks: game.blocks, plates: game.plates, torches: game.torches,
    traps: game.traps, props: game.props, puzzle: game.puzzle, boss: game.boss, npcs: game.npcs,
    spawn: game.floorSpawn, exit: game.floorExit
  };
}

/**
 * Apply floor f: restored from the run's cache when you've been here today,
 * generated fresh otherwise. Place the player at the up-stairs ('spawn',
 * descending) or the down-stairs ('exit' — the hole you came up through).
 */
export function applyFloor(game, f, arriveAt = 'spawn') {
  let g = game.floorCache[f];
  if (!g) {
    // load-bearing rooms the renovation imps can't move
    const pins = [{ w: 5, h: 4, tag: 'breakroom' }];   // the imp break area (Glurp lives here)
    if (f === 3) pins.push({ w: 4, h: 3, tag: 'gap' }); // MIND THE GAP (guestbook inside)
    if (f >= FINAL_FLOOR) pins.push({ w: 6, h: 5, tag: 'desk' }); // the Cancellation Desk
    const gen = generateFloor(f, game.world.h2, game.rng, pins,
      { forceSeal: game.debug && game.debug.forceSeal });
    const npcs = [];
    // the break room's vending machine is an NPC: TALK to it. it's fine.
    const breakroom = gen.pinnedRooms.find(r => r.tag === 'breakroom');
    if (breakroom) npcs.push({ name: 'GLURP-O-MATIC', kind: 'machine', x: breakroom.cx * T + T / 2, y: breakroom.cy * T + T / 2 - 8 });
    // the Cancellation Desk: present but inert until the Origenal Hero falls
    const deskRoom = gen.pinnedRooms.find(r => r.tag === 'desk');
    if (deskRoom) npcs.push({ name: 'Cancellation Desk', kind: 'desk',
      x: deskRoom.cx * T + T / 2, y: deskRoom.cy * T + T / 2 - 4,
      col: '#5a4030', hat: '#3a2820' });
    // Skritch's radio sits by the entry stairs — the floor greets you with
    // its set, and the music thins out the deeper into the floor you walk
    npcs.push({ name: "Skritch's Radio", kind: 'radio', x: (gen.spawn.cx + 1) * T + T / 2, y: gen.spawn.cy * T + T / 2 - 4 });
    g = {
      world: gen.world,
      enemies: gen.enemies, pickups: gen.pickups,
      blocks: gen.blocks, plates: gen.plates, torches: gen.torches,
      traps: gen.traps, props: gen.props, puzzle: gen.puzzle, boss: gen.boss,
      npcs,
      spawn: gen.spawn, exit: gen.exit
    };
  }
  game.world = g.world;
  game.enemies = g.enemies; game.pickups = g.pickups; game.parts = [];
  game.blocks = g.blocks; game.plates = g.plates; game.torches = g.torches;
  game.traps = g.traps; game.props = g.props; game.puzzle = g.puzzle; game.boss = g.boss;
  game.npcs = g.npcs;
  game.floorSpawn = g.spawn; game.floorExit = g.exit;
  const at = arriveAt === 'exit' ? g.exit : g.spawn;
  game.player.x = at.cx * T + T / 2;
  game.player.y = at.cy * T + T / 2;
  game.player.tk = at.cx + ',' + at.cy;
}

/** Go one floor deeper. */
export function descend(game, fx) {
  if (game.floorNum >= FINAL_FLOOR) return;  // nowhere deeper; the desk is here
  stashFloor(game);
  game.floorNum++;
  game.deepest = Math.max(game.deepest, game.floorNum);
  game.runStats.depth = Math.max(game.runStats.depth, game.floorNum);
  const revisit = !!game.floorCache[game.floorNum];
  applyFloor(game, game.floorNum, 'spawn');
  fx.toast(floorLine(game.floorNum) + (revisit ? ' (As you left it.)' : ''));
  if (game.floorNum % 4 === 0) fx.sfx('boss');
}

/** Go one floor up, emerging from the hole you originally went down. */
export function ascend(game, fx) {
  stashFloor(game);
  game.floorNum--;
  applyFloor(game, game.floorNum, 'exit');
  fx.toast(floorLine(game.floorNum) + ' (As you left it.)');
}

/** Step onto the trapdoor in the overworld: stash the overworld, descend to floor 1. */
export function enterTomb(game, fx) {
  game.owSave = {
    world: game.world,
    enemies: game.enemies, pickups: game.pickups, npcs: game.npcs, boss: game.boss,
    x: game.player.x, y: game.player.y
  };
  game.npcs = [];
  game.zone = 'tomb';
  game.floorNum = 0;
  game.floorCache = {};   // a new day: Skritch has redecorated
  game.runStats = newRunStats();
  startRun(game.meta);
  // one excursion = one month (see the Truth in Lending form, clause 3)
  const interest = accrueInterest(game.meta);
  fx.toast('Day ' + game.meta.day + '. Run #' + game.meta.runs + '. NOW LEAVING: SAFETY.' +
    (game.meta.runs > 1 ? ' (Skritch has redecorated.)' : ''));
  if (interest > 0) fx.toast('Your account has accrued ' + interest + ' g interest. (See Schedule B.)');
  descend(game, fx);
}

/** Climb out of floor 1 back into the saved overworld. */
export function exitTomb(game, fx) {
  const surface = () => {
    const s = game.owSave;
    game.player.x = s.x; game.player.y = s.y;
    game.player.tk = Math.floor(s.x / T) + ',' + Math.floor(s.y / T);
    restoreSurface(game);
    // the Ledger grades the run BEFORE recording the depth, so a personal best
    // counts in your favor exactly once
    const grade = gradeRun(game.meta, { ...game.runStats, died: false });
    game.meta.grades.push(grade);
    recordDepth(game.meta, game.deepest);
    fx.toast('Daylight. Depth record: ' + game.deepest + '. Run grade: ' + grade + '. ' + gradeRemark(grade));
    fx.questChanged();
  };
  // customs: the Door Golem would like a word about that gold — AT the door,
  // before you see daylight, so the inspection happens where inspections happen
  if (game.runStats.goldGained > 0) fx.onGolemCustoms(game.runStats.goldGained, surface);
  else surface();
}
