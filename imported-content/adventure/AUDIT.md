# Adventure content audit

Hand-written inventory of the `adventure` legacy snapshot's world content
and every dynamic-code hook (`func:` in YAML, `eval(`/`exec(` in Python).
These are the compile targets for tasks A3/C3 — turning ad hoc
Python-in-YAML into a real, sandboxed action grammar. Completeness
matters more than prose; every occurrence below was located by grep and
confirmed against `legacy/world.yaml` and `legacy/adventure.py` at the
pinned SHA (e720d388f055e153ec9a3ea85526d636c2b1d450).

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
- Bonus/related: `condition:` occurrences in YAML: **1** (feeds the `eval(` at `adventure.py:77`).
