// The single mutable game-state aggregate, plus run setup.

import { T, ST, VIL } from '../constants.js';
import { createPlayer, resetPlayer } from '../entities/player.js';
import { generateOverworld } from '../world/overworld.js';
import { createMeta } from './meta.js';
import { newRunStats } from '../systems/ledger.js';
import { spawnOverworld } from '../world/spawn.js';

export function createGame({ rng = Math.random } = {}) {
  return {
    rng,
    skin: null,   // active skin name; null = the registry's default
    state: ST.MENU,
    t: 0,
    zone: 'ow', floorNum: 0, deepest: 0, owSave: null,
    floorCache: {},   // floors hold for the whole run; Skritch redecorates between days
    world: null,
    enemies: [], npcs: [], pickups: [], parts: [],
    boss: null,
    blocks: [], plates: [], torches: [], traps: [], props: [], puzzle: null,
    pushCd: 0,
    input: { atkBuf: 0 },
    cam: { x: 0, y: 0 },
    player: createPlayer(),
    quest: { stage: 0, kills: 0, need: 5 }, // 0 none, 1 hunting, 2 claim, 3 seek boss, 4 done
    meta: createMeta(),       // survives death AND newRun: knowledge is permanent
    runStats: newRunStats(),  // per-dungeon-run; the Ledger grades from this
    lastHitBy: null,
    debug: { god: false, reveal: false, forceSeal: null }  // the cheat menu's levers

  };
}

/** Fresh run: new overworld, repopulate, reset player + quest. Doesn't touch game.state. */
export function newRun(game) {
  game.zone = 'ow'; game.floorNum = 0; game.deepest = 0; game.owSave = null;
  game.floorCache = {};
  game.blocks = []; game.plates = []; game.torches = []; game.traps = []; game.props = []; game.puzzle = null; game.pushCd = 0;
  game.world = generateOverworld(game.rng);
  const s = spawnOverworld(game.world, game.rng);
  game.enemies = s.enemies; game.boss = s.boss; game.npcs = s.npcs;
  game.pickups = []; game.parts = [];
  resetPlayer(game.player);
  game.player.x = (VIL.x + 1.5) * T;
  game.player.y = (VIL.y + 1.5) * T;
  game.player.tk = Math.floor(game.player.x / T) + ',' + Math.floor(game.player.y / T);
  game.quest.stage = 0; game.quest.kills = 0;
  game.input.atkBuf = 0;
  game.runStats = newRunStats();
  game.lastHitBy = null;
  // game.meta deliberately untouched: items are temporary, knowledge is permanent
  return game;
}
