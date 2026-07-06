/* Type-level compile check for @golem-engine/kernel's component
 * vocabulary (DELTA C3). Mirrors types.check.ts's pattern: checked by
 * `tsc -p tsconfig.tests.json` (see this package's "pretest") — NOT
 * executed by `node --test` (deliberately named `.check.ts`, not
 * `*.test.ts`, so node's test-file glob skips it). A failing build
 * here IS the test failing.
 *
 * It constructs one literal value per component interface (Identity,
 * GridPosition, RegionMembership, Actor, Health, Inventory, Portable,
 * Portal, Lock, Credential, Interactable, Perception, Knowledge) and
 * one `Entity<C>` combining 3+ of them, exactly as this file's brief
 * requires.
 */
import type {
  Identity,
  GridPosition,
  RegionMembership,
  Actor,
  Health,
  Inventory,
  Portable,
  Portal,
  Lock,
  Credential,
  Interactable,
  Perception,
  Knowledge,
  ComponentName,
  ComponentDataMap,
  Entity,
} from "../src/index.js";

const identity: Identity = { name: "Door Golem", description: "a golem" };
void identity;

const gridPosition: GridPosition = { x: 3, y: 4 };
void gridPosition;

const regionMembership: RegionMembership = { region: "east-wing" };
void regionMembership;

const actor: Actor = { controlledBy: "player" };
void actor;
const actorNpc: Actor = { controlledBy: "npc" };
void actorNpc;
const actorBare: Actor = {};
void actorBare;

const health: Health = { hp: 8, max: 10 };
void health;

const inventory: Inventory = { items: ["torch", "key"] };
void inventory;

const portable: Portable = {};
void portable;

const portal: Portal = { to: "map:2", at: { x: 0, y: 0 } };
void portal;

const lock: Lock = { unlockCondition: { op: "has", entity: "entity:credential_stamp" }, key: "entity:credential_stamp" };
void lock;

const credential: Credential = { tier: 1 };
void credential;

const interactable: Interactable = { prompt: "approach the Door Golem", enabledWhen: { op: "always" } };
void interactable;

const perception: Perception = { seen: [{ x: 1, y: 1 }], lit: [{ x: 1, y: 1 }] };
void perception;

const knowledge: Knowledge = { knows: ["the-password"] };
void knowledge;

// The closed vocabulary and its name -> shape map.
const names: ComponentName[] = [
  "Identity", "GridPosition", "RegionMembership", "Actor", "Health",
  "Inventory", "Portable", "Portal", "Lock", "Credential",
  "Interactable", "Perception", "Knowledge",
];
void names;

const dataMap: ComponentDataMap = {
  Identity: identity,
  GridPosition: gridPosition,
  RegionMembership: regionMembership,
  Actor: actor,
  Health: health,
  Inventory: inventory,
  Portable: portable,
  Portal: portal,
  Lock: lock,
  Credential: credential,
  Interactable: interactable,
  Perception: perception,
  Knowledge: knowledge,
};
void dataMap;

// An Entity<C> combining 3+ components — the shape golem-grid's
// entities.js and a future authored EntityDef both build.
type PlayerEntity = Entity<"Identity" | "GridPosition" | "Inventory" | "Actor">;
const playerEntity: PlayerEntity = {
  id: "entity:player:p1",
  components: {
    Identity: { name: "Wanderer" },
    GridPosition: { x: 2, y: 2 },
    Inventory: { items: [] },
    Actor: { controlledBy: "player" },
  },
};
void playerEntity;

// The default (unconstrained) Entity<C> accepts any subset of the
// closed vocabulary.
const genericEntity: Entity = {
  id: "entity:door_golem",
  components: {
    Identity: identity,
    Lock: lock,
    Interactable: interactable,
  },
};
void genericEntity;
