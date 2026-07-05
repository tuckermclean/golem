# Adventure content audit

Hand-written inventory of the `adventure` legacy snapshot's world content
and every dynamic-code hook. These are the compile targets for tasks
A3/C3 — turning ad hoc Python-in-YAML into a real, sandboxed action
grammar. Completeness matters more than prose.

**Scope:** literal `func:` (YAML) and `eval(`/`exec(` (Python) greps,
**plus** known eval-equivalents found by inspection — mechanisms that
execute arbitrary code without literally spelling `eval(`/`exec(`
(`code.InteractiveConsole`, `subprocess`, and `globals()`-based dynamic
type instantiation that makes such a mechanism reachable by name from
YAML). A pure string grep for `eval(`/`exec(` would miss these; they are
just as much a compile target for A3/C3's sandboxing work. Every
occurrence below was located by grep or targeted read and confirmed
against `legacy/world.yaml`, `legacy/adventure.py`, and `legacy/items.py`
at the pinned SHA (e720d388f055e153ec9a3ea85526d636c2b1d450).

All paths below are relative to `imported-content/adventure/legacy/`.

## (a) World/content YAML inventory

| Path | Defines |
|---|---|
| `world.yaml` | The one live game world: 33 rooms, 5 doors (one hidden, condition-gated), 9 characters (mix of `NonPlayerCharacter`, `WalkerCharacter`, and `AICharacter` types), and all room items — the full content graph the game runs on. |
| `tests/fixtures/test_world.yaml` | A minimal synthetic test fixture (3 rooms, a handful of `Item`/`Money`/`Wearable` entries) used by `tests/test_adventure.py` and friends; contains no `func:`/dynamic-code hooks. |

Grep used to find all YAML world files:
```
git ls-files | grep -i '\.ya\?ml$'
```
Total: 2 files (both listed above).

## (b) `func:` (YAML) and `eval(`/`exec(` (Python) occurrences

### `func:` in `world.yaml` — 16 occurrences (1 commented out / dead)

Grep used:
```
grep -n "func:" world.yaml
```

| Line | Owner (item/character) | Line text | Category |
|---|---|---|---|
| `world.yaml:103` | item `rare mushroom` | `        func: |` | condition/state — sets a player insight flag on eat |
| `world.yaml:137` | item `whispering skull` | `        func: |` | dynamic action — branches narrative on player's insight flags |
| `world.yaml:197` | item `sparkling fish` | `        func: |` | dynamic action — conditionally moves the item into inventory and attaches a new `drop` verb at runtime |
| `world.yaml:237` | item `forbidden potion` | `        func: |` | condition/state — sets a player insight flag on drink |
| `world.yaml:259` | item `sarcophagus` | `        func: |` | dynamic action — conditionally constructs and spawns a new `Weapon` item into the room |
| `world.yaml:296` | item `paintbrush` | `        func: |` | condition/state — sets a player mutation flag and publishes a news event |
| `world.yaml:304` | item `book` (**commented out**) | `      #  func: |` | dead code — disabled block whose body (`import subprocess, os; ...`) shells out to the OS; not reachable but present in source as a compile-target for "should be impossible in the new grammar" |
| `world.yaml:326` | item `old hot dog` | `        func: |` | condition/state — sets a player mutation flag and publishes a news event |
| `world.yaml:409` | item `flashlight` | `        func: |` | stateful toggle — flips a boolean flag on the invocation context (`var`) each use |
| `world.yaml:453` | item `antidote potion` | `        func: |` | condition/state — conditionally clears the player mutation flag |
| `world.yaml:516` | item `spiderweb` | `        func: |` | dynamic action — summons/looks up an `AICharacter` ("spider") via the `characters` module |
| `world.yaml:543` | item `binoculars` | `        func: |` | dynamic action — calls out to `OpenAIClient.oneoff_prompt(...)` for a one-off LLM-generated flavor description |
| `world.yaml:590` | character `wizard` | `    func: |` | dynamic action — a long branching dialogue/quest-state machine (checks player flags/inventory, conjures a new `Item` ("odd key") into the room, publishes news) |
| `world.yaml:687` | character `bartender` | `    func: |` | dynamic action — a purchase handler: looks up/creates items, charges the player (`player.spend`), and forwards the order into another `AICharacter`'s ("bartender") prompt context |
| `world.yaml:779` | character `spider` | `    func: |` | dynamic action — dispatches an `AICharacter` ("spider") attack against the player based on the invocation context's `action` |
| `world.yaml:790` | character `alchemist` | `    func: |` | dynamic action — dynamically resolves an item type by name out of `globals()` and constructs+links a new item into the room |

Total live (non-commented) `func:` blocks: **15**. Total occurrences of the
literal string `func:` in the file (including the 1 commented-out): **16**.

### `eval(`/`exec(` in Python — 3 occurrences, all in `adventure.py`

Grep used:
```
grep -rn "eval(\|exec(" --include="*.py" .
```
(No matches outside `adventure.py`.)

| Line | Line text | Category |
|---|---|---|
| `adventure.py:57` | `                                    return lambda var=None: exec(func, {` | world-loader hook — wraps each item's `func:` YAML block into a closure that `exec`s it with `game`/`player`/`world`/`news`/`var` bound in its globals |
| `adventure.py:77` | `                                    return lambda var=None: eval(condition, {` | world-loader hook — wraps a hidden door's `condition:` YAML value (see below) into a closure that `eval`s it the same way, to decide if the door is currently passable |
| `adventure.py:93` | `                                return lambda var=None: exec(func, {` | world-loader hook — identical wrapping for each character's `func:` YAML block |

All three are the single mechanism (`item['func']`, `door['condition']`,
`character['func']`) by which arbitrary Python embedded in `world.yaml`
gets executed at runtime with the live game objects in scope. This is the
whole surface A3/C3 needs to replace with a sandboxed grammar.

### Known eval-equivalents found by inspection — 1 hazard, 3 supporting sites

Not a literal `eval(`/`exec(` match, but functionally the same class of
hazard: an item type whose `use()` method drops the player into a live
Python REPL over the process's own globals/locals.

| Line | Line text | Category |
|---|---|---|
| `items.py:152` | `        variables = {**globals(), **locals()}` | eval-equivalent — merges live process globals and locals into a namespace for... |
| `items.py:153` | `        shell = code.InteractiveConsole(variables)` | ...a `code.InteractiveConsole`, then `shell.interact()` hands the player an interactive Python REPL scoped to that namespace — arbitrary code execution, functionally `eval`/`exec`-class |
| `adventure.py:4` | `from items import Money, Wearable, Useable, Eatable, Computer, Phone, Weapon` | import site — makes the `Computer` item type (containing the hazard above) resolvable by name in `adventure.py`'s module globals |
| `adventure.py:54` | `                            item_class = globals()[item['type']]` | world-loader hook — the same dynamic-instantiation-by-name mechanism used for every item; for a YAML item with `type: Computer` this would resolve to the class above |

**Reachability: dormant/dead, same as the `book` entry above.** The only
YAML reference to a `Computer` item is inside the same commented-out
block as `book` (`world.yaml:299-313`, commented lines only — see the
`book` row above for the `func:` line within it):

```
world.yaml:310:      #- name: computer
world.yaml:311:      #  type: Computer
world.yaml:312:      #  description: "Would you look at that?! It's an old computer."
world.yaml:313:      #  mobile: false
```

Since every line is commented out, `world.yaml` never actually
instantiates a `Computer` item today — but the class, its `use()` method,
and the `globals()`-based lookup that would dispatch to it are all live,
uncommented Python. If this item block (or a copy of it) were
un-commented, or any future YAML added a `type: Computer` item anywhere,
the loader at `adventure.py:54` would resolve it and the player would be
one `use` verb away from a full Python shell over the running game
process — no `eval(`/`exec(` string required. Same disposition as the
`book`/`subprocess` hazard: dormant, present in source, and a compile
target for "should be impossible in the new grammar."

Grep/read commands used to establish this:
```
grep -n "InteractiveConsole\|variables = {\*\*globals" items.py
grep -n "from items import" adventure.py
grep -n "item_class = globals" adventure.py
grep -n "name: computer\|type: Computer" world.yaml
```

### Related, not separately requested: `condition:` (YAML)

Not `func:`, but the direct counterpart consumed by `eval(` at
`adventure.py:77` — noted here for completeness since it's a hidden
compile target for the same replacement work:

| Line | Owner | Line text |
|---|---|---|
| `world.yaml:578` | door `secret portal` | `    condition: hasattr(player, 'mushroom_insight') or hasattr(player, 'potion_insight')` |

Grep used: `grep -n "condition:" world.yaml` — 1 occurrence, on a `hidden:
true` door (`world.yaml:574`).

## Totals

- YAML world/content files: **2** (`world.yaml`, `tests/fixtures/test_world.yaml`).
- `func:` occurrences in YAML: **16** (15 live, 1 commented-out/dead).
- `eval(`/`exec(` occurrences in Python: **3** (all in `adventure.py`; 2×`exec(`, 1×`eval(`).
- Known eval-equivalents found by inspection (not literal `eval(`/`exec(`
  matches): **1 hazard** (`items.py:152-153`, `Computer.use()`'s
  `code.InteractiveConsole`), with **4 supporting code sites**
  (`items.py:152`, `items.py:153`, `adventure.py:4` import,
  `adventure.py:54` dynamic-dispatch) — dormant/dead, reachable only
  through the same commented-out `world.yaml:299-313` block as the
  `book`/`subprocess` hazard.
- Bonus/related: `condition:` occurrences in YAML: **1** (feeds the `eval(` at `adventure.py:77`).
