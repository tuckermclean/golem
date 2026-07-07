# A3 PR2 — Adventure GameModule + terminal client (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 5 **A3**, PR2 of 3. Headless. A minimal, generic
adventure `GameModule` (declarative-component-driven — NO per-NPC bespoke
code) + a pure, headless-testable terminal client in `packages/clients`.
Builds on A3 PR1's content pack (92 entities: Identity/RegionMembership/
Exits/Contains/Lock/Interactable/Portable/ItemStats/OnUse/Spawns/Toggle/
Knowledge). PR3 = the walkable/affordance-listed/twin-narrated E2E.

## The state model

`imported-content/adventure/module/` (or `shared/` — mirror some-hero's
split). Five-tier is overkill; adventure's State is simple:

```
State = { region: string, inventory: string[], facts: string[], seq: number }
```

- `region` — the player's current room (a RegionMembership region id).
- `inventory` — entity ids the player carries (from `take`).
- `facts` — the set of set facts (mushroom_insight, wizard_gave_key, …),
  the closed-world truth the conditions/affordances read.
- Pure `reduce(state, world, event) → state` (fresh objects, no mutation);
  `createState()` (starts in the first/entry room); `serializeState()`
  (sorted inventory/facts → h32) for determinism.

## deriveWorld

`deriveWorld(worldState, pack) → World`: index the pack's entities by
region — `rooms[region] = {description, exits:[{to, lockedBy?}],
items:[ids], npcs:[ids]}`, plus item/npc lookup by id (Portable/OnUse/
Toggle/Interactable/Knowledge). Pure, from the frozen pack.

## validate — generic declarative mechanics (no bespoke code)

`validate(ctx, cmd) → Event[] | Denial`. `cmd` = `{verb, noun}` (the
terminal client tokenizes; see below). Verbs, each driven by components:
- **`go <room>`** — the current room's `Exits` links to `<room>`; if the
  exit has a `Lock`, evaluate `unlockCondition` via
  `@golem-engine/content`'s `evaluate()` against a `factLookup` over
  `state.facts`+`inventory`; pass → `MOVED{to}`, fail → `Denial{deny,
  reason}` (the locked-door message).
- **`take <item>`** — item in the current room + `Portable` → `TOOK{item}`
  (reduce: room→inventory). **`drop <item>`** → `DROPPED{item}`.
- **`use/eat/drink/light/... <item>`** — item with `OnUse{setFact|
  clearFact, when?}` (the `when` gate via `evaluate()`) → `USED{item,
  setFact?, clearFact?}` (reduce applies facts) + `Spawns{when,entity}` →
  `SPAWNED{entity}` (reduce adds the entity to the room). `Toggle` →
  `TOGGLED`. The verb aliases (use/eat/drink/light/lick/wear/…) all route
  to the item's own `Interactable.verb`/`OnUse` — a small alias table
  maps them (adventure-local).
- **`look`** — no event; the client renders `observe()`.
- **`talk <npc>`** — npc with `Knowledge`; no state event (or a `TALKED`
  no-op); the client calls the twin (below).
Denials for unknown verbs/nouns/unreachable exits carry a `reason`.

## observe / affordances / narrativeFacts

- **`observe(state, world) → Obs`** — `{region, description, items:[{id,
  name}], exits:[{to, locked}], npcs:[{id,name}], inventory:[{id,name}]}`.
  (Full-visibility, no fog — like some-hero.)
- **`affordances(observation, actor) → Affordance[]`** (A1 canonical
  shape) — one per current-room item (`take`, or its `Interactable.verb`),
  per exit (`go <room>`, `enabled` via the Lock condition + `reason` when
  locked), per npc (`talk`). This is "affordance-listed."
- **`narrativeFacts(state, world, event) → Facts`** — facts for `USED`
  (which fact was set) etc.; the twin/renderer phrases them. Facts-only
  (VISION law 5).

Add all six hooks to the exported `module` object (the full GameModule).

## The terminal client (`packages/clients/src/terminal.js`, plain JS)

Pure, I/O at the edges (like some-hero's host.js/module.js split):

```
createTerminalSession({ module, world, state, seed }) → {
  render(): string[],          // room description + item/exit/npc lists + the affordance verb menu
  submit(line: string): string[]  // tokenize → resolve → validate→reduce → return the response lines
}
```

- `render()` = `observe()` → description + `affordances()` rendered as a
  verb menu (satisfies "affordance-listed").
- `submit(line)` — tokenize into `verb` + noun phrase via a **small
  adventure-local verb-alias table** (`go/move/n`, `take/get`, `use/eat/
  drink/light/read/lick/wear/remove/pet`, `look/examine`, `talk`, `drop`);
  ground the noun against the current `affordances()`/`observe()` names
  (a small local scorer — do NOT extend `packages/language`'s closed
  CanonicalVerb union); call `module.validate`→`module.reduce`; for
  `talk`, call `compileEnvelope`/`renderStubReply` from
  `@golem-engine/language` for the narrated line. Returns response lines.
- **No `process.stdin`/readline in the tested core.** A thin
  `imported-content/adventure/bin/play.mjs` (node:readline) is the only
  TTY surface — untested.
- Export `createTerminalSession` from `packages/clients/src/index.js`.

## Tests (headless, node:test)

- **module verb tests** (`imported-content/adventure/tests/module.test.js`):
  `go` moves regions (and is denied at a locked door without the key,
  allowed with it); `take`/`drop` move items; `use` sets the insight
  fact; the secret-portal door's `go` is denied without insight, allowed
  with it (the walkability proof); determinism (replay → identical hash).
- **terminal-session tests** (`packages/clients/tests/terminal.test.js`
  or under adventure): `render()` lists the room + affordance menu;
  `submit("go shop")` moves + re-renders; `submit("take dusty lantern")`
  takes it; `submit("talk wizard")` returns a deterministic twin line;
  an unknown verb/noun returns a helpful denial. No browser/TTY.

## Gates

`npm test` all workspaces fail 0 (adventure + clients); `freeze:verify`
green; `test:ceremony` 62 / `test:ceremony-kernel` 60 unchanged;
`content/pack.json` byte-unchanged (PR2 adds module/client, not content);
`check-bans` clean; the module/client contain no eval/exec/Function
(the adventure no-dynamic-code test extended to cover `module/`);
`packages/clients` stays browser-safe (no node: imports in the tested
core beyond what's already there — terminal.js is pure string logic).

## Scope boundaries (PR2)

GameModule (6 hooks, generic declarative mechanics) + terminal client +
verb tests ONLY. **NO sample-world walkthrough E2E** (PR3). No
`content/pack.json` change. No bespoke per-NPC code. No L1/CanonicalVerb
extension (adventure-local verb table). No browser. No Python port.
