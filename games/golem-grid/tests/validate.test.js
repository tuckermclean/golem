/* Characterization test for shared/module.js#validate, ported from
 * src/main.js's hostCmd (main.js:96+, pre-K2). Every denial string and
 * event shape below was READ FROM the current main.js source, not
 * invented — this test pins hostCmd's exact behavior so the K2 port
 * (validate(ctx, cmd) -> Event[] | Denial) can be checked for byte-exact
 * parity, branch by branch.
 *
 * hostCmd has 17 distinct return branches (counted directly from its
 * source): the top-level over-guard, the silent unknown-player return,
 * 3 in "move" (silent bad-magnitude, wall denial, legal MOVE), 4 in
 * "take" (legal TAKE_PRIZE, empty-tile denial, wrong-item denial, legal
 * TAKE), 2 in "read" (legal READ, denial), 1 "say", 1 "party", 2 in
 * "whisper" (no-target denial, legal WHISPER), 1 "emote", 1 default
 * (unknown verb denial). All 17 are pinned below. Additionally, three
 * derived-event scenarios pin hostCommit's recursive LIGHT_WARN/WIN/LOSE
 * emission (main.js:83-93), which validate must reproduce as trailing
 * events in the same array, in the same order, without hostCommit's
 * seq-stamping (validate never stamps seq — main.js's hostCommit still
 * does that on commit).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { genDungeon, GW, GH } from "../shared/worldgen.js";
import { createState, applyEvent, getP } from "../shared/reducer.js";
import { validate } from "../shared/module.js";

const dun = genDungeon("plagueis");

function stateWith(joins) {
  const st = createState();
  let seq = 0;
  for (const { pid, name } of joins) applyEvent(st, dun, { t: "JOIN", pid, name, seq: ++seq });
  return st;
}

function placeAt(st, pid, x, y) {
  const p = getP(st, pid);
  p.x = x;
  p.y = y;
}

// A passable direction out of the stairs tile (stairs always sit inside
// a room, so at least one of the 4 neighbors is floor).
function passableDirFrom(x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && dun.grid[ny][nx] !== "#") return [dx, dy];
  }
  throw new Error("no passable neighbor of " + x + "," + y);
}

// A floor tile with at least one wall neighbor, plus the direction that
// walks into that wall — for the "Stone does not negotiate." denial.
function floorAdjacentToWall() {
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      if (dun.grid[y][x] === "#") continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const wx = x + dx, wy = y + dy;
        if (wx < 0 || wy < 0 || wx >= GW || wy >= GH || dun.grid[wy][wx] === "#") {
          return { x, y, dx, dy };
        }
      }
    }
  }
  throw new Error("no floor tile adjacent to a wall/boundary found");
}

const [firstItemKey, firstItem] = [...dun.items.entries()][0];
const [itemX, itemY] = firstItemKey.split(",").map(Number);
const [firstLoreKey] = [...dun.lore.keys()];
const [loreX, loreY] = firstLoreKey.split(",").map(Number);

test("validate: top-level guard — st.over denies every command with the exact reason", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  st.over = true;
  const r = validate({ st, dun, from: "p1" }, "say hi");
  assert.deepEqual(r, { deny: "The delve is over. Host a new world." });
});

test("validate: unknown player — silent no-op (no event, no denial)", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  const r = validate({ st, dun, from: "ghost" }, "say hi");
  assert.deepEqual(r, []);
});

test("validate: move — non-unit-magnitude step is a silent no-op", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  const r = validate({ st, dun, from: "p1" }, "move 1 1");
  assert.deepEqual(r, []);
});

test("validate: move — walking into a wall/boundary is denied", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  const { x, y, dx, dy } = floorAdjacentToWall();
  placeAt(st, "p1", x, y);
  const r = validate({ st, dun, from: "p1" }, `move ${dx} ${dy}`);
  assert.deepEqual(r, { deny: "Stone does not negotiate." });
});

test("validate: move — legal step onto passable ground emits exactly one MOVE event", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  const { x, y } = dun.stairs;
  const [dx, dy] = passableDirFrom(x, y);
  const r = validate({ st, dun, from: "p1" }, `move ${dx} ${dy}`);
  assert.deepEqual(r, [{ t: "MOVE", pid: "p1", x: x + dx, y: y + dy }]);
});

test("validate: move — crossing a light tier appends a LIGHT_WARN after the MOVE, matching hostCommit's tier scan", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  st.D.set("light", 181); // one non-carrier MOVE burns 1 -> 180, crossing the 180 tier
  const { x, y } = dun.stairs;
  const [dx, dy] = passableDirFrom(x, y);
  const r = validate({ st, dun, from: "p1" }, `move ${dx} ${dy}`);
  assert.deepEqual(r, [
    { t: "MOVE", pid: "p1", x: x + dx, y: y + dy },
    { t: "LIGHT_WARN", pid: "p1", tier: 180 },
  ]);
});

test("validate: move — draining the last light appends LOSE after the MOVE (no WIN check)", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  st.D.set("light", 1);
  const { x, y } = dun.stairs;
  const [dx, dy] = passableDirFrom(x, y);
  const r = validate({ st, dun, from: "p1" }, `move ${dx} ${dy}`);
  assert.deepEqual(r, [
    { t: "MOVE", pid: "p1", x: x + dx, y: y + dy },
    { t: "LOSE", pid: "p1" },
  ]);
});

test("validate: move — stepping onto the stairs while carrying the prize appends WIN after the MOVE", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  applyEvent(st, dun, { t: "TAKE_PRIZE", pid: "p1", seq: 2 });
  const stairs = dun.stairs;
  const [dx, dy] = passableDirFrom(stairs.x, stairs.y);
  placeAt(st, "p1", stairs.x + dx, stairs.y + dy);
  const r = validate({ st, dun, from: "p1" }, `move ${-dx} ${-dy}`);
  assert.deepEqual(r, [
    { t: "MOVE", pid: "p1", x: stairs.x, y: stairs.y },
    { t: "WIN", pid: "p1" },
  ]);
});

test("validate: take — standing on the prize tile with no carrier emits TAKE_PRIZE", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  placeAt(st, "p1", dun.prize.x, dun.prize.y);
  const r = validate({ st, dun, from: "p1" }, "take");
  assert.deepEqual(r, [{ t: "TAKE_PRIZE", pid: "p1" }]);
});

test("validate: take — empty tile is denied", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  // stairs tile is never an item/prize tile in this fixture's dungeon.
  placeAt(st, "p1", dun.stairs.x, dun.stairs.y);
  const r = validate({ st, dun, from: "p1" }, "take");
  assert.deepEqual(r, { deny: "Your fingers close on empty air." });
});

test("validate: take — wrong item name at an occupied tile is denied, naming the real item", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  placeAt(st, "p1", itemX, itemY);
  const r = validate({ st, dun, from: "p1" }, "take not-a-real-item-xyz");
  assert.deepEqual(r, { deny: `No not-a-real-item-xyz here — but there is a ${firstItem}.` });
});

test("validate: take — legal take of the item actually there emits TAKE", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  placeAt(st, "p1", itemX, itemY);
  const r = validate({ st, dun, from: "p1" }, "take");
  assert.deepEqual(r, [{ t: "TAKE", pid: "p1", item: firstItem, x: itemX, y: itemY }]);
});

test("validate: read — adjacent to lore emits READ with the tier", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  placeAt(st, "p1", loreX, loreY);
  const r = validate({ st, dun, from: "p1" }, "read");
  assert.deepEqual(r, [{ t: "READ", pid: "p1", tier: dun.lore.get(firstLoreKey), x: loreX, y: loreY }]);
});

test("validate: read — nowhere near lore is denied", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  placeAt(st, "p1", dun.stairs.x, dun.stairs.y);
  // Guard: only meaningful if the stairs aren't themselves lore-adjacent.
  const nearLore = [...dun.lore.keys()].some(k => {
    const [lx, ly] = k.split(",").map(Number);
    return Math.abs(lx - dun.stairs.x) <= 1 && Math.abs(ly - dun.stairs.y) <= 1;
  });
  assert.equal(nearLore, false, "test fixture assumption broken: stairs are lore-adjacent");
  const r = validate({ st, dun, from: "p1" }, "read");
  assert.deepEqual(r, { deny: "Nothing here is written for you." });
});

test("validate: say — always emits a room-scoped SAY at the actor's tile", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  const { x, y } = dun.stairs;
  const r = validate({ st, dun, from: "p1" }, "say hello there");
  assert.deepEqual(r, [{ t: "SAY", pid: "p1", text: "hello there", x, y, scope: "room" }]);
});

test("validate: party — emits a party-scoped SAY with no x/y fields", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  const r = validate({ st, dun, from: "p1" }, "party regroup at stairs");
  assert.deepEqual(r, [{ t: "SAY", pid: "p1", text: "regroup at stairs", scope: "party" }]);
});

test("validate: whisper — unknown target name is denied", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  const r = validate({ st, dun, from: "p1" }, "whisper Nobody hey");
  assert.deepEqual(r, { deny: "No one called Nobody is down here." });
});

test("validate: whisper — known target (case-insensitive) emits WHISPER", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }, { pid: "p2", name: "Brine" }]);
  const r = validate({ st, dun, from: "p1" }, "whisper brine psst");
  assert.deepEqual(r, [{ t: "WHISPER", pid: "p1", to: "p2", text: "psst" }]);
});

test("validate: emote — emits EMOTE at the actor's tile", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  const { x, y } = dun.stairs;
  const r = validate({ st, dun, from: "p1" }, "emote waves");
  assert.deepEqual(r, [{ t: "EMOTE", pid: "p1", text: "waves", x, y }]);
});

test("validate: unknown verb is denied, naming the verb", () => {
  const st = stateWith([{ pid: "p1", name: "Ash" }]);
  const r = validate({ st, dun, from: "p1" }, "dance");
  assert.deepEqual(r, { deny: 'The world does not know the verb "dance".' });
});
