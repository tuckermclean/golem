# A3 PR1 — Adventure import: decision log + YAML→content pack (design)

Date: 2026-07-07
Roadmap: DELTA PHASE 5 **A3** (Adventure import), **PR1 of 3**. Headless.
Imports adventure's one live YAML world (`imported-content/adventure/
legacy/world.yaml`, 33 rooms) into a C1-compiled content pack, applying
the P0.2 `func:` audit's disposition (re-express as components/conditions
or explicitly drop). PR2 = GameModule + terminal client; PR3 = sample-
world E2E. Content-only — the Python runtime/eval/exec/AICharacter/AI-
authority is NEVER ported (DELTA:360).

## Method: hand-transcription (not a YAML parser)

Like S1 (some-hero content), the importer is **hand-authored `entities.
mjs`** transcribed from `world.yaml` + `AUDIT.md` + the decision log —
NOT a build-time YAML reader. Rationale: the `func:` disposition needs
per-item human judgment (drop vs component vs condition), and "zero
dynamic code" means the `func:` bodies must never be mechanically carried
across. Room/item **descriptions are transcribed byte-identical** (they
are authored content); `func:`/`use_msg`/`condition:` are re-expressed or
dropped per the decision log; commented-out YAML (e.g. the `payphone`,
the `subprocess` book) is NOT ported.

## The decision log (required)

`imported-content/adventure/DECISION-LOG.md` — the disposition table for
every `AUDIT.md` entry (16 `func:` + 1 `condition:` + 1 `Computer`/
InteractiveConsole hazard), each row: `{AUDIT.md line, what it did,
disposition (a) component / (b) condition / (c) drop, reason}`. Locked
decisions from the A3 brief:
- **(a) components** (9): mushroom/potion insight sets (`OnUse:{setFact}`),
  sparkling fish (`Portable`+`Interactable`), sarcophagus spawn
  (`Spawns:{when,entity}`), paintbrush/hotdog mutation, flashlight toggle,
  antidote (`OnUse:{clearFact,when}`).
- **(b) conditions** (3+): the secret-portal hidden door
  `{any:[{fact:"mushroom_insight"},{fact:"potion_insight"}]}` (the
  cleanest walkability proof), antidote/sarcophagus `when` gates.
- **(c) explicit drop** (8): the dead `subprocess` book, the `Computer`/
  InteractiveConsole hazard (dropped entirely, not even inert), spider/
  alchemist/bartender summons (AICharacter, by type), binoculars
  `OpenAIClient` call, whispering-skull bespoke prose branch.
- **AICharacter (5 of 9: bartender/carl/old man/spider/alchemist) dropped
  by TYPE** (DELTA:360) → inert flavor scenery or omitted. Survivors:
  `wizard` (NonPlayerCharacter — keep its fact-gate + the one `odd key`
  handoff, drop the bespoke branching prose → twin stub) + 3
  `WalkerCharacter`s (stray dog/raven/cat — ambient, `Identity` only).
  Drop the bartender vendor mechanic wholesale.

**A completeness test** asserts every `AUDIT.md` `func:`/hazard line
number is referenced in `DECISION-LOG.md` — making "decision log
required" machine-checkable, not just prose.

## The content pack (`imported-content/adventure/content/`)

Mirror `games/topdown-puzzle/content/` file layout (`entities.mjs`/
`build-pack.mjs`/`build.mjs`/`index.mjs`/`pack.json`). Adventure is a
free-form room **graph**, not a grid — so **`maps: []`** (schema-legal;
no grid coords) and model everything as `entities`:
- **room** → `EntityDef` `{Identity:{name,description}, RegionMembership:
  {region:<room-slug>}}` (RegionMembership from C3/A2 — exercised
  structurally; `assignRegions`'s bbox derivation has no input here, and
  that's fine).
- **exit/link** → for an unlocked link, an adventure-local **`Exit:{to:
  <region-id>}`** component (kernel's `Portal.to/at` assumes grid coords
  that don't apply — a coordinate-free `Exit` is the right fit; C1 treats
  component data as opaque). For a locked door, kernel's coordinate-free
  `Lock:{unlockCondition, key}`.
- **item** → `Identity` + `Portable` (takeable) + `Interactable:{prompt,
  verb}` + declarative behavior components per the disposition (`OnUse:
  {setFact|clearFact, when?}`, `Toggle:{on}`, `Spawns:{when,entity}`) —
  NO `func:` bodies.
- **NPC** → `wizard`: `Identity`+`Knowledge`+condition-gated
  `Interactable` + a pre-authored `odd key` `Spawns`/handoff; walkers:
  `Identity` only. AICharacters: omitted or `Identity`-only scenery.
- `tables: []` (no natural table use; bartender-Shop dropped).

`build.mjs` compiles via `@golem-engine/content`'s `compile()` and writes
a frozen `pack.json` (hash-pinned; regen a no-op — `git diff --exit-code`).

## Tests (`imported-content/adventure/tests/`)

- **pack compiles** with zero C1 errors; expected entity count / a spot
  of key entities (village square room, the secret-portal door with its
  `any` condition, the wizard, the `odd key`).
- **decision-log completeness**: every `AUDIT.md` `func:`/hazard line is
  cited in `DECISION-LOG.md`.
- **no-dynamic-code hygiene**: grep `imported-content/adventure/{content,
  tests}` (NOT `legacy/`, which is frozen historical evidence) for
  `eval(`/`exec(`/`new Function`/`Function(`/`node:vm` — none (the A3
  belt-and-suspenders, since `check-bans` doesn't scan
  `imported-content/**`).
- **hash-stability**: rerun `build.mjs` → `git diff --exit-code
  content/pack.json` clean.
- Descriptions byte-identical: spot-check a couple room/item descriptions
  vs `world.yaml`.

## Gates

`npm test` all workspaces fail 0 (adventure content tests are a new
workspace `@golem-engine/adventure` or run via node --test — mirror how
some-hero content is wired); `freeze:verify` green (A3 touches no other
game); `check-bans` clean; the pack imports nothing executable; existing
games/fixtures unchanged.

## Scope boundaries (PR1)

Decision log + hand-transcribed content pack + frozen pack.json + the 4
tests ONLY. **NO GameModule / no verb mechanics / no terminal client**
(PR2). **NO sample-world walkthrough** (PR3). No YAML parser dependency.
No porting of Python runtime/eval/exec/AICharacter behavior. No
`games/adventure/` (it stays `imported-content/adventure/`).
