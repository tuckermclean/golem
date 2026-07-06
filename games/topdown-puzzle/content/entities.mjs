/* ── topdown-puzzle template entities (DELTA C2).
   One shared template entity per KyeScene.js token archetype
   (games/topdown-puzzle/legacy/src/scenes/KyeScene.js,
   buildLevelFromLines()'s switch — case labels ~858-891 — and each
   token's add*() method, cited per-entity below). @golem-engine/
   content's `components` field is deliberately opaque JsonValue (C1
   design doc, orchestrator decision #4: C3's component vocabulary does
   not exist yet, so C1 does not validate component shape). These are
   therefore PROVISIONAL, OPAQUE data: no schema is invented here, just
   a documented, KyeScene-grounded shape every template shares
   (`Identity: { name }` plus an `Actor` semantic tag, using component
   names lifted from C3's planned vocabulary per DELTA — Identity,
   Portable, Actor).

   Directional movers (E/W/N/S) share ONE template, `entity:moving_block`
   — KyeScene's addMovingBlock(x, y, direction) is the same behavior for
   all four tokens, just parameterized by direction. The compass
   direction is therefore not baked into the template; it is recorded
   per grid occurrence via MapLegendEntry.facing in build-pack.mjs,
   where each of the four tokens references this one template with a
   different `facing`. */

export const ENTITY_TEMPLATES = [
  {
    id: "entity:wall",
    components: {
      Identity: { name: "Wall" },
      // addWall(): a static, immovable body placed on the grid
      // (this.grid.setEntity). Never destroyed, never part of any push
      // chain (getPushChain only recognizes 'block'/'diamond'/
      // 'movingblock' as chain members) — a hard, permanent obstacle.
      Actor: { kind: "wall", solid: true, pushable: false },
    },
  },
  {
    id: "entity:block",
    components: {
      Identity: { name: "Block" },
      // addBlock(): body.setImmovable(true) (immovable to physics) but
      // tagged type 'block', which getPushChain/pushBlocks explicitly
      // recognize — the player CAN push it (one tile per push, chains
      // up to length 2 with getPushChain).
      Portable: { pushable: true },
      Actor: { kind: "block", solid: true },
    },
  },
  {
    id: "entity:diamond",
    components: {
      Identity: { name: "Diamond" },
      // addDiamond(): tryMove's own comment reads "Always pick up
      // diamond, never push" — walking directly onto a diamond always
      // collects it (checkDiamondPickup -> addScore(10);
      // onAllDiamondsCollected() once none remain). It is nonetheless a
      // recognized chain member in getPushChain/pushBlocks, so a block
      // pushed toward a diamond shoves the diamond along too (and
      // destroys it if shoved into a memory hole) — both behaviors are
      // recorded below.
      Portable: { pushable: true },
      Actor: { kind: "diamond", collectible: true },
    },
  },
  {
    id: "entity:player_start",
    components: {
      Identity: { name: "Player" },
      // addPlayer(): the single '@' marker buildLevelFromLines() reads
      // to spawn `this.player`; not a persistent grid occupant like the
      // others (exactly one per level) but included for legend
      // completeness/uniformity across all token archetypes.
      Actor: { kind: "player_start" },
    },
  },
  {
    id: "entity:memory_hole",
    components: {
      Identity: { name: "Memory Hole" },
      // addMemoryHole(): explicitly NOT stored in the collision grid
      // ("Do NOT store in grid array" — this.grid.setEntity is never
      // called for it); isMemoryHole() is instead consulted directly by
      // tryMove/pushBlocks/updateBaddie/startMovingBlock. Anything that
      // steps, is pushed, or moves into one is destroyed/killed
      // (playerDeath / baddie destroy / block destroy — each paired
      // with flashAt + an explode/player_death sound).
      Actor: { kind: "memory_hole", hazard: true },
    },
  },
  {
    id: "entity:baddie_horizontal",
    components: {
      Identity: { name: "Baddie (horizontal)" },
      // 'H' -> addBaddie(x, y, 'horizontal'): patrols the x axis,
      // reversing direction on hitting a wall/block/baddie/player
      // (updateBaddie), damaging the player on contact
      // (updateHealth(-10) in update()), and can be shoved
      // perpendicular to its axis by a pushed block
      // (shoveBaddiePerpendicular) or destroyed by a memory hole.
      Actor: { kind: "baddie", axis: "horizontal", hostile: true },
    },
  },
  {
    id: "entity:baddie_vertical",
    components: {
      Identity: { name: "Baddie (vertical)" },
      // 'V' -> addBaddie(x, y, 'vertical'): identical behavior to the
      // horizontal baddie, patrolling the y axis instead.
      Actor: { kind: "baddie", axis: "vertical", hostile: true },
    },
  },
  {
    id: "entity:moving_block",
    components: {
      Identity: { name: "Moving Block" },
      // 'E'/'W'/'N'/'S' -> addMovingBlock(x, y, direction):
      // continuously advances one tile per cycle in its fixed direction
      // (startMovingBlock's tryMoveBlock loop), halting only when
      // blocked (wall/block/player/memory-hole-destroyed), and can
      // itself be pushed by the player like a plain block
      // (pushBlocks' 'movingblock' branch) — after being pushed it
      // resumes its own autonomous movement cycle from the new tile.
      Portable: { pushable: true },
      Actor: { kind: "moving_block", moves: true },
    },
  },
];
