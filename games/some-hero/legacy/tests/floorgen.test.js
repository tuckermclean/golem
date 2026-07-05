import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TL, TOMB, FINAL_FLOOR } from '../src/constants.js';
import { generateFloor } from '../src/world/floorgen.js';
import { mulberry32, makeHash2 } from '../src/core/rng.js';

const h2 = makeHash2(1, 2);

function findTile(world, v) {
  for (let i = 0; i < world.map.length; i++) {
    if (world.map[i] === v) return { tx: i % world.w, ty: (i / world.w) | 0 };
  }
  return null;
}

function reachable(world, from, to) {
  const pass = v => v === TL.TF || v === TL.PLATE || v === TL.SU || v === TL.SD;
  const seen = new Uint8Array(world.map.length);
  const q = [from.ty * world.w + from.tx];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop();
    const x = i % world.w, y = (i / world.w) | 0;
    if (x === to.tx && y === to.ty) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
      const j = ny * world.w + nx;
      if (seen[j] || !pass(world.map[j])) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return false;
}

test('floors have exactly one SU and one SD, connected (floors 1-8, 5 seeds)', () => {
  for (let seed = 1; seed <= 5; seed++) {
    for (let f = 1; f <= 8; f++) {
      const g = generateFloor(f, h2, mulberry32(seed * 100 + f));
      const su = findTile(g.world, TL.SU), sd = findTile(g.world, TL.SD);
      assert.ok(su && sd, `f${f} seed${seed}: missing stairs`);
      assert.equal(g.world.map.filter(v => v === TL.SU).length, 1);
      assert.equal(g.world.map.filter(v => v === TL.SD).length, 1);
      assert.ok(reachable(g.world, su, sd), `f${f} seed${seed}: SD unreachable from SU`);
      assert.equal(g.world.w, TOMB.W);
      assert.equal(g.spawn.cx, su.tx);
      assert.equal(g.spawn.cy, su.ty);
    }
  }
});

test('every 4th floor is a Warden floor with a boss and no other puzzle props', () => {
  const g = generateFloor(4, h2, mulberry32(11));
  assert.equal(g.puzzle.type, 'warden');
  assert.ok(g.boss);
  assert.ok(!g.boss.dead);
  assert.equal(g.boss.state, 'sleep');
  assert.equal(g.plates.length, 0);
  assert.equal(g.torches.length, 0);
  // warden scales with floor
  const g8 = generateFloor(8, h2, mulberry32(11));
  assert.ok(g8.boss.maxhp > g.boss.maxhp);
});

test('non-warden floors have a consistent puzzle structure', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = generateFloor(3, h2, mulberry32(seed));
    assert.equal(g.boss, null);
    if (g.puzzle.type === 'key') {
      // either a key pickup exists, or it is the degenerate already-open fallback
      const hasKey = g.pickups.some(p => p.kind === 'key');
      assert.ok(hasKey || g.puzzle.have === true);
    } else if (g.puzzle.type === 'plates') {
      assert.equal(g.puzzle.need, g.plates.length);
      assert.equal(g.blocks.length, g.plates.length);
      assert.ok(g.plates.length >= 1);
      // plate tiles are stamped into the map
      for (const p of g.plates) assert.equal(g.world.map[p.ty * g.world.w + p.tx], TL.PLATE);
    } else if (g.puzzle.type === 'torch') {
      assert.equal(g.puzzle.n, g.torches.length || 1);
      assert.ok(g.torches.every(t => !t.lit));
      assert.ok(g.puzzle.time >= 6);
    } else if (g.puzzle.type === 'riddle') {
      assert.equal(g.puzzle.solved, false);
      assert.equal(g.puzzle.attempts, 0);
      assert.equal(g.plates.length, 0);
      assert.equal(g.torches.length, 0);
    } else if (g.puzzle.type === 'traps') {
      assert.equal(g.puzzle.need, g.traps.length);
      assert.ok(g.traps.length >= 1);
      assert.ok(g.traps.every(t => !t.hit));
      assert.equal(g.puzzle.done, 0);
      assert.equal(g.puzzle.solved, false);
      // traps sit on plain walkable floor
      for (const t of g.traps) assert.equal(g.world.map[t.ty * g.world.w + t.tx], TL.TF);
    } else {
      assert.fail('unexpected puzzle type ' + g.puzzle.type);
    }
  }
});

test('the gap room pin yields a guestbook inside its bounds', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const g = generateFloor(3, h2, mulberry32(seed), [{ w: 4, h: 3, tag: 'gap' }]);
    const r = g.pinnedRooms[0];
    const T = 36;
    const inRoom = p =>
      p.x >= r.x * T && p.x < (r.x + r.w) * T && p.y >= r.y * T && p.y < (r.y + r.h) * T;
    assert.ok(g.pickups.some(p => p.kind === 'guestbook' && inRoom(p)),
      `seed ${seed}: no guestbook in the gap room`);
  }
});

test('the incident quota differs between runs (different N, same rule forever)', () => {
  const needs = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const g = generateFloor(3, h2, mulberry32(seed));
    if (g.puzzle.type === 'traps') needs.add(g.puzzle.need);
  }
  assert.ok(needs.size > 1, 'expected varied incident quotas, got ' + [...needs]);
});

test('forceSeal overrides the seal type, including warden floors', () => {
  for (const t of ['key', 'plates', 'torch', 'riddle', 'traps']) {
    assert.equal(generateFloor(1, h2, mulberry32(7), [], { forceSeal: t }).puzzle.type, t, t + ' on floor 1');
    assert.equal(generateFloor(4, h2, mulberry32(7), [], { forceSeal: t }).puzzle.type, t, t + ' overrides the warden');
  }
  const w = generateFloor(2, h2, mulberry32(7), [], { forceSeal: 'warden' });
  assert.equal(w.puzzle.type, 'warden');
  assert.ok(w.boss, 'a forced warden brings the boss');
});

test('absent or bogus forceSeal changes nothing (rng stream intact)', () => {
  const plain = generateFloor(3, h2, mulberry32(9));
  const bogus = generateFloor(3, h2, mulberry32(9), [], { forceSeal: 'nonsense' });
  assert.equal(bogus.puzzle.type, plain.puzzle.type);
  assert.deepEqual(bogus.world.map, plain.world.map);
});

test('cabinets line walls in contiguous runs on floors 3+, never below', () => {
  for (let s = 1; s <= 12; s++) {
    const g2 = generateFloor(2, h2, mulberry32(s));
    assert.equal(g2.enemies.filter(e => e.kind === 'cabinet').length, 0, 'no furniture upstairs');
  }
  let sawRun = false;
  for (let s = 1; s <= 12; s++) {
    const g = generateFloor(5, h2, mulberry32(s));
    const cabs = g.enemies.filter(e => e.kind === 'cabinet');
    if (!cabs.length) continue;
    sawRun = true;
    assert.ok(cabs.length >= 2, 'cabinets come in runs');
    for (const c of cabs) {
      const tx = Math.floor(c.x / 36), ty = Math.floor(c.y / 36);
      assert.equal(g.world.map[ty * g.world.w + tx], TL.TF, 'on the floor');
      // wall-adjacent: at least one cardinal neighbor is solid wall
      const solidNeighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
        g.world.map[(ty + dy) * g.world.w + (tx + dx)] === TL.TW);
      assert.ok(solidNeighbor, 'cabinet hugs a wall');
      // contiguous: at least one other cabinet exactly one tile away
      const neighborCab = cabs.some(o => o !== c && Math.hypot(o.x - c.x, o.y - c.y) <= 36.5);
      assert.ok(neighborCab, 'cabinet is part of a row');
    }
  }
  assert.ok(sawRun, 'rows do appear on deep floors');
});

test('enemy stats scale with floor depth', () => {
  const g1 = generateFloor(1, h2, mulberry32(2));
  const g9 = generateFloor(9, h2, mulberry32(2));
  const avg = es => es.reduce((s, e) => s + e.maxhp, 0) / es.length;
  assert.ok(avg(g9.enemies) > avg(g1.enemies));
  assert.ok(g9.enemies.length >= g1.enemies.length);
  // combatants get the dungeon aggro radius; the intern is exempt from quotas
  assert.ok(g9.enemies.filter(e => e.kind !== 'slime').every(e => e.aggro === 260));
});

test('enemies and loot spawn on walkable tiles', () => {
  const g = generateFloor(5, h2, mulberry32(13));
  const ok = (x, y) => {
    const v = g.world.map[Math.floor(y / 36) * g.world.w + Math.floor(x / 36)];
    return v === TL.TF || v === TL.PLATE || v === TL.SU || v === TL.SD;
  };
  for (const e of g.enemies) assert.ok(ok(e.x, e.y), 'enemy in a wall');
  for (const p of g.pickups) assert.ok(ok(p.x, p.y), 'pickup in a wall');
});

test("pinned rooms keep their distance: the radio doesn't room with the Glurp", () => {
  let okCount = 0, total = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = generateFloor(2, h2, mulberry32(seed),
      [{ w: 5, h: 4, tag: 'breakroom' }, { w: 4, h: 3, tag: 'radio' }]);
    if (g.pinnedRooms.length !== 2) continue;
    total++;
    const [a, b] = g.pinnedRooms;
    if (Math.hypot(a.cx - b.cx, a.cy - b.cy) >= 8) okCount++;
  }
  assert.ok(total >= 25, 'pins place reliably');
  assert.ok(okCount / total >= 0.9, 'separation holds on at least 90% of layouts (guard fallback allows rare crowding)');
});

test('the final floor has no down-stairs, a final puzzle, and the Origenal Hero', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const g = generateFloor(FINAL_FLOOR, h2, mulberry32(seed),
      [{ w: 6, h: 5, tag: 'desk' }]);
    assert.equal(g.puzzle.type, 'final', 'puzzle type');
    assert.equal(g.puzzle.bossDead, false, 'boss starts alive');
    assert.ok(g.boss, 'boss present');
    assert.equal(g.boss.name, 'the Origenal Hero');
    assert.match(g.boss.telegraph, /THREE WEEKS/);
    assert.equal(g.world.map.filter(v => v === TL.SD).length, 0,
      `seed ${seed}: no down-stairs on the final floor`);
    assert.equal(g.world.map.filter(v => v === TL.SU).length, 1, 'up-stairs still present');
    const desk = g.pinnedRooms.find(r => r.tag === 'desk');
    assert.ok(desk, 'desk room pinned');
  }
});

test('final floor generated without a desk pin falls back gracefully', () => {
  // generateFloor is callable directly without pins (e.g. old test code paths);
  // the boss should still place (using exitR as fallback)
  const g = generateFloor(FINAL_FLOOR, h2, mulberry32(42));
  assert.equal(g.puzzle.type, 'final');
  assert.ok(g.boss);
  assert.equal(g.boss.name, 'the Origenal Hero');
});

test('forceSeal still overrides the final floor for playtesting', () => {
  // a forced warden on floor 12 lets devs test the boss path without the final encounter
  const g = generateFloor(FINAL_FLOOR, h2, mulberry32(7), [], { forceSeal: 'warden' });
  assert.equal(g.puzzle.type, 'warden', 'forced warden overrides final floor');
  assert.ok(g.boss);
});
