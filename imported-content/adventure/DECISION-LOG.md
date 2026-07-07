# Adventure import — decision log (DELTA A3 PR1)

Disposition table for every `imported-content/adventure/AUDIT.md` entry
(16 `func:` occurrences + 1 `condition:` + the `Computer`/
`InteractiveConsole` hazard, plus the eval/exec loader mechanism itself
that AUDIT.md documents as the single reachability path for all of the
above). Every row cites its AUDIT.md line locator (which itself cites the
exact `world.yaml`/`adventure.py`/`items.py` line — see AUDIT.md for the
grep commands that produced those). `imported-content/adventure/tests/
decision-log-completeness.test.js` parses AUDIT.md's own cited locators
and asserts every one of them is referenced (as a literal substring)
somewhere in this file — so "decision log required" is machine-checkable,
not just prose.

Disposition key: **(a)** re-expressed as a declarative content
component (`OnUse`/`Toggle`/`Spawns`/`Interactable.enabledWhen`) — no
`func:`/`eval`/`exec` body is ever carried into `content/entities.mjs`.
**(b)** re-expressed as a condition (`packages/content`'s `all/any/not/
fact/cmp` AST — the same closed, non-Turing-complete grammar the secret
portal's door uses). **(c)** explicitly dropped — the mechanic is not
ported in any form (not even inert).

## func: (world.yaml) — 16 occurrences (15 live, 1 dead/commented)

| AUDIT.md line | Owner | What it did | Disposition | Reason |
|---|---|---|---|---|
| `world.yaml:103` | `rare mushroom` | Sets `player.mushroom_insight = True` on eat. | **(a)** component | `entity:item_rare_mushroom` gets `OnUse:{setFact:"mushroom_insight"}`. Fact name reuses legacy's own literal `setattr()` string — no rename needed, unlike some-hero's `credential_*` prefixing (legacy never composed such a name itself there; here it already does). |
| `world.yaml:137` | `whispering skull` | Branches narrative prose on `mushroom_insight`/`potion_insight`/neither. | **(c)** drop | The three-way branching monologue is dropped wholesale — that is prose/golem territory (doctrine #4/#7: "the generator is a librarian, not a writer"; a content pack must not itself carry conditional narrative text). `entity:item_whispering_skull` keeps a single neutral `Interactable.prompt`, re-expressed from the func's own no-insight fallback line (world.yaml:143) — not gated, not branching. |
| `world.yaml:197` | `sparkling fish` | Conditionally moves the item into inventory and attaches a `drop` verb at runtime, gated on `mushroom_insight`/`potion_insight`. | **(a)** component (Portable+Interactable) | `entity:item_sparkling_fish` gets an unconditional `Portable{}` plus `Interactable.enabledWhen` carrying the SAME insight condition the secret portal below uses — the locked decision's literal disposition ("sparkling fish (Portable+Interactable)"). Supersedes the yaml's static `takeable: False`, since legacy's own behavior is "sometimes takeable." |
| `world.yaml:237` | `forbidden potion` | Sets `player.potion_insight = True` on drink. | **(a)** component | `OnUse:{setFact:"potion_insight"}` — same pattern as the mushroom, literal fact-name reuse. |
| `world.yaml:259` | `sarcophagus` | Conditionally constructs a `Weapon("rusty sword", ..., 1)` and spawns it into the room, gated on `player.mutant`. | **(a)** component + **(b)** condition | `entity:item_sarcophagus` gets `Spawns:{when:{fact:"mutant"}, entity:{$ref:"entity:item_rusty_sword"}}` — a real, ref-checked pointer to a newly-authored `entity:item_rusty_sword` (Identity+Portable+`ItemStats:{damage:1}`, transcribed from the func body's own `Weapon(...)` call args). `Interactable.prompt` is re-expressed from the func's condition-unmet fallback line (world.yaml:267). |
| `world.yaml:296` | `paintbrush` | Sets `player.big_ol_hippy = True` and calls `news.publish(...)`. | **(a)** component (news dropped) | `OnUse:{setFact:"big_ol_hippy"}`. The `news.publish(...)` call is DROPPED — no news/bulletin system exists anywhere in the content pack; A3 is content-only, and a global bulletin-board mechanic is out of scope. |
| `world.yaml:304` | `book` (commented out, dead) | `import subprocess, os; ... subprocess.run('fortune', env=env)` — shells out to the OS. | **(c)** drop | Already dead/commented in `world.yaml:299-313`; not instantiated by legacy, and NOT ported here either — no `entity:item_book` exists in `content/entities.mjs`. The whole point of this compile target (per AUDIT.md) is proving this hazard is unreachable in the new grammar, which an omitted entity trivially satisfies. |
| `world.yaml:326` | `old hot dog` | Sets `player.mutant = True` and calls `news.publish(...)`. | **(a)** component (news dropped) | `OnUse:{setFact:"mutant"}`. Same news-dropping reasoning as the paintbrush. |
| `world.yaml:409` | `flashlight` | Flips a boolean `var.power_on` flag on each use (stateful toggle scoped to the invocation closure). | **(a)** component | `Toggle:{on:false}` — the pack's initial state. `Interactable.prompt` re-expressed from the func's "turning on" branch (world.yaml:418). |
| `world.yaml:453` | `antidote potion` | Conditionally clears `player.mutant` (`delattr`) and calls `news.publish(...)`, only if the player is currently mutant. | **(a)** component + **(b)** condition (news dropped) | `OnUse:{clearFact:"mutant", when:{fact:"mutant"}}` — `clearFact` fires only when `when` holds, mirroring the `delattr` only running inside the `if hasattr(player,'mutant')` branch. News dropped, same reasoning as above. |
| `world.yaml:516` | `spiderweb` | Summons/mutates the `spider` `AICharacter` (rewrites its description, pushes prompt state, registers a player watcher, monkey-patches a `loopit` method) via `characters.AICharacter.get(...)`. | **(c)** drop (AICharacter, by type) | AICharacter summon/behavior is never ported (DELTA:360). `entity:item_spiderweb` survives as passive scenery (Identity+Interactable with its own static use_msg as prompt) with NO reference to any spider entity — there is no `entity:char_spider` in this pack at all. |
| `world.yaml:543` | `binoculars` | Calls `OpenAIClient.oneoff_prompt(...)` for a one-off LLM-generated flavor description. | **(c)** drop | AI-authority over world content/prose is never ported (doctrine #4: "the golem... cannot lie about the world" — an LLM call generating on-the-fly world description is exactly the authority doctrine forbids elsewhere in the engine). `entity:item_binoculars` survives with only its static use_msg as prompt; no generated continuation. |
| `world.yaml:590` | `wizard` | A long branching dialogue/quest-state machine: checks `player.mutant`/`potion_insight`/`mushroom_insight`, checks/sets session-local `var` flags, conjures an `Item("odd key")` into the room, calls `news.publish(...)`. | **(a)** component + **(b)** condition | `entity:char_wizard` keeps `Knowledge:{knows:["mutant","potion_insight","mushroom_insight"]}` (the facts the branch read), a single twin-stub `Interactable.prompt` (world.yaml:619's first-encounter greeting — the REST of the branching monologue is dropped, same "prose is golem territory" reasoning as the whispering skull), and `Spawns:{when:{all:[{fact:"has_rare_mushroom"},{not:{fact:"wizard_gave_key"}}]}, entity:{$ref:"entity:item_odd_key"}}` — the one mechanically meaningful outcome (the key handoff), pointing at a real, ref-checked `entity:item_odd_key`. `news.publish(...)` dropped. **Fact-naming note:** `has_rare_mushroom`/`wizard_gave_key` are DELIBERATE RENAMES, not literal reuse — legacy overloads the single name `has_mushroom` for two different things (a local var meaning "player currently holds the mushroom item" vs. `var.has_mushroom`, a session flag meaning "wizard already paid out"); reusing that name here would be actively confusing, and func:/condition: re-expression never requires literal string preservation (only `Identity.description` carries that bar). |
| `world.yaml:687` | `bartender` | A purchase handler: looks up/creates items, charges the player (`player.spend`), forwards the order into the bartender `AICharacter`'s prompt context. | **(c)** drop (AICharacter, by type; vendor mechanic dropped wholesale) | No `entity:char_bartender` exists. The entire Shop/vendor mechanic (and the `tables:[]` a Shop table would have wanted) is dropped with it — see the header note on `content/build-pack.mjs`. |
| `world.yaml:779` | `spider` | Dispatches an `AICharacter` attack against the player based on invocation-context `action`. | **(c)** drop (AICharacter, by type) | No `entity:char_spider` exists. |
| `world.yaml:790` | `alchemist` | Dynamically resolves an item type by name out of `globals()` (`item_type = globals()[var["type"]]`) and constructs+links a new item into the room. | **(c)** drop (AICharacter, by type; also a dynamic-type-instantiation hazard in its own right — the same `globals()[name]`-dispatch class AUDIT.md flags for `adventure.py:54`) | No `entity:char_alchemist` exists. |

## condition: (world.yaml) — 1 occurrence

| AUDIT.md line | Owner | What it did | Disposition | Reason |
|---|---|---|---|---|
| `world.yaml:578` (door `hidden: true` at `world.yaml:574`) | `secret portal` | `eval(` on `"hasattr(player, 'mushroom_insight') or hasattr(player, 'potion_insight')"` at `adventure.py:77`, deciding whether the hidden door is currently passable. | **(b)** condition | `entity:door_secret_portal`'s `Lock.unlockCondition` = `{any:[{fact:"mushroom_insight"},{fact:"potion_insight"}]}` — the exact same closed `all/any/not/fact/cmp` AST `packages/content/src/conditions.ts` walks and validates at compile time (no `eval`, structurally impossible to smuggle code through). This is the cleanest walkability proof in the whole pack: a real `eval(` string is replaced 1:1 by a schema-checked condition tree with identical truth-table behavior. No `key` — the portal is condition-gated, not keyed. |

## Known eval-equivalent hazard (`Computer`/`InteractiveConsole`) — 1 hazard, 4 supporting sites (`items.py:152-153`, `adventure.py:4`, `adventure.py:54`)

| AUDIT.md line | What it is | Disposition | Reason |
|---|---|---|---|
| `items.py:152`, `items.py:153` | `Computer.use()` merges `globals()`/`locals()` and hands the player a live `code.InteractiveConsole` — a full Python REPL over the running process. | **(c)** drop | No `Computer` item type, and no entity resembling it, exists anywhere in `content/entities.mjs`. |
| `adventure.py:4` | Import site making `Computer` resolvable by name. | **(c)** drop | N/A to a content pack — nothing in `imported-content/adventure/content/` imports or names `Computer`. |
| `adventure.py:54` | `item_class = globals()[item['type']]` — the dynamic-instantiation-by-name mechanism that would dispatch to `Computer` if any YAML ever declared `type: Computer`. | **(c)** drop | The entire world-loader (and its `globals()`-by-name dispatch) is dropped along with the rest of the Python runtime (see below) — hand-transcription (`content/entities.mjs`) has no analogous "resolve a class by string" mechanism at all, dynamic or otherwise. |
| `world.yaml:299-313` (the commented `book`/`computer` block) | The only YAML text that ever names `type: Computer`. | **(c)** drop | Commented out in legacy, and NOT ported here either — confirmed unreachable by construction (no `Computer`-shaped entity exists to reach). |

## The eval/exec loader mechanism itself — 3 occurrences (`adventure.py:57`, `adventure.py:77`, `adventure.py:93`)

`adventure.py:57`/`:93` wrap every item's/character's `func:` YAML block into
`exec(func, {...})`; `adventure.py:77` wraps a door's `condition:` into
`eval(condition, {...})`. This is the single mechanism (`item['func']`,
`door['condition']`, `character['func']`) by which arbitrary Python
embedded in `world.yaml` gets executed at runtime with the live game
objects in scope (AUDIT.md's own framing). **Disposition: (c) drop, in
full.** `content/entities.mjs` is hand-transcribed prose read by a human,
never a YAML file parsed and partially `exec`'d at load time — there is
no loader in this pack at all, eval/exec-based or otherwise (see tests/
no-dynamic-code.test.js). This is the mechanism-level disposition that
makes every individual `func:`/`condition:` row above possible to retire
without carrying its execution path forward.

## AICharacter — 5 of 9 characters dropped by TYPE (DELTA:360)

`bartender` (`world.yaml:633-705`), `carl` (`world.yaml:721-725`), `old
man` (`world.yaml:727-732`), `spider` (`world.yaml:734-783`), and
`alchemist` (`world.yaml:785-841`) are ALL `type: AICharacter` in
`world.yaml`. **Disposition: (c) drop, by TYPE, wholesale** — no
`entity:char_*` exists for any of the five in `content/entities.mjs`, and
none of their prompts/personas/LLM-backed behavior is ported in any form
(not even as inert flavor text — an `AICharacter`'s entire `description`/
`prompt` pair is written to be consumed by an LLM backend that itself
does not exist in this engine; there is nothing safely inert to keep).
The three survivors are `type: NonPlayerCharacter`/`WalkerCharacter`:
`wizard` (kept — see the `func:` table above, twin-stub disposition) and
the three ambient `WalkerCharacter`s `stray dog` (`world.yaml:624-631`),
`raven` (`world.yaml:707-712`), `cat` (`world.yaml:714-719`) — all three
get `Identity{name,description}` only, no behavior components, per the
design spec's locked decision.

## Totals (cross-check against AUDIT.md's own totals + the design spec's locked decisions)

- **(a) components: 9** — rare mushroom, sparkling fish, forbidden
  potion, sarcophagus, paintbrush, old hot dog, flashlight, antidote
  potion, wizard (the `Spawns`/key-handoff half of its disposition).
- **(b) conditions: 3+** — secret portal (the door's own `condition:`),
  sarcophagus's `when` gate, antidote potion's `when` gate (wizard's
  `Spawns.when` is a 4th, not separately called out by the locked
  decision's "3+" but consistent with it).
- **(c) explicit drop: 8** — whispering skull, book/subprocess, spiderweb
  (spider summon), binoculars (OpenAIClient), bartender (vendor
  mechanic), spider (attack dispatch), alchemist (dynamic type
  instantiation + AICharacter conjuring). (whispering skull + book +
  spiderweb + binoculars + bartender + spider + alchemist = 7 items, plus
  the Computer/InteractiveConsole hazard row = 8, matching the design
  spec's "(c) explicit drop (8)" exactly.)
- **AICharacter dropped by type: 5** (bartender/carl/old man/spider/
  alchemist) of 9 total characters; 4 survive (wizard + 3 walkers).
- **Every AUDIT.md func:/condition:/hazard locator is cited above** —
  see `tests/decision-log-completeness.test.js` for the machine-checked
  proof (it parses AUDIT.md's own backtick-quoted `path:line` locators
  and asserts each appears verbatim in this file).
