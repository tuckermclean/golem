# SOME HERO
*(title: final. do not improve. — the Ledger)*

**"Somebody has to. Apparently it's you."**

A playable vertical slice of the SOME HERO design doc, built by gutting the
Amulet of the Sands atomic engine. Covers Build Order v2 steps 1–5 plus both
engine prerequisites. The game now wears its real setting — Greater Pflum
topside, the Front Office below; the original desert look is preserved as a
switchable skin.

## Run / test

```
npm start         # any static server works
npm test          # 165+ unit tests, zero runtime dependencies, node --test
npm run test:e2e  # drives the real game in headless Chromium (Playwright dev-dep;
                  # uses $CHROME_PATH, /usr/bin/chromium, or Playwright's download)
```

The e2e suite (`tests/e2e/game.e2e.mjs`) covers the seams unit tests can't:
the splash timeline and the Ledger's key reactions, Enter-to-start, the Door
Golem's stamp ceremony playing *topside* before descent, the trap-counter
room, customs happening *at the door* before daylight, the cheat menu, and
the live skin toggle. It screenshots each beat into `tests/e2e/shots/`. The
game exposes its state for the test only when loaded with `?test`.

## Skins (`src/render/skins/`)

All art is procedural Canvas 2D, organized as skins: `pflum` (default —
meadow kingdom, hedgerows, Chauncey's fountain; carpet-and-filing-cabinet
Front Office with EXIT-green accents) and `desert` (the original Amulet of
the Sands look, preserved verbatim — `tests/skin-snapshot.test.js` pins its
draw output by hash). A skin owns tile fills + decorations, object/actor
palettes, the lantern, and the CSS UI vars (`body.skin-*`). The retired
desert monster drawings are parked in `desert.enemyDraw`. Switch skins from
the cheat menu; the choice persists in localStorage.

## The economy

You start unarmed (a slap: damage 1, slap-sized reach, does not launch a
goose). Hermit Gorse in the west meadow grants Pointy, the pointy stick.
The goose bounty (15 g, hazard rate) is payroll — payroll verifies income —
and income is what the **Guild Revolving Credit Account** lends against:
limits at 4x verified income by tier, a 300-850 credit score with quantified
APRs (9.99% preferred to 99.99% "adventurous"), interest compounding per
excursion, resurrection garnishment with a 1 g convenience fee for paying
by death, and a TRUTH IN LENDING form accurate to the gold piece
(`systems/credit.js`, fully unit-tested). The dungeon drops no heals; the
break room's GLURP-O-MATIC sells (cash or credit) and remembers being
kicked. Weapon ladder: slap / Pointy / DIRK!(tm) 60g / DIRK! ULTRA(tm) 400g /
sun-steel (dungeon find); reach scales with the tier.

## The OST (`assets/audio/`, lo-fi electronic, light & dark)

Music is **diegetic** — every track comes from somewhere and is louder the
closer you are (`audio/music.js`; selection logic is pure and unit-tested).
*Ledger Lightning Bolt* scores the title screen non-spatially, and the
splash reacts to its own soundtrack: the stamp re-slams on the 10s drum
hit, shudders through the 18/19 pickups, and the shine sweeps on the big
hit at 20. *Audit Microwave* plays from the Guild Hall radio on Hespeth's
desk (she did not choose it); *Factory Synesthesia* from the imp break
room's radio on every floor; *Performance Review* radiates from the Warden
himself — you hear the review approaching; *Apocalypse Cancel* awaits the
final boss (interim: floor 12). *Gumdrop Verdict* strikes up when the
Reenactor activates and **hideously winds down** (tape-stop pitch dive)
when he's killed. And the *GLURP jingle* — the hit single — hums from
everything that dispenses Glurp: the gift shop topside, every
GLURP-O-MATIC below (over the imps' radio; that's the joke). Several
sources can be audible at once; each track fades to its loudest source.
Shipped as 128k mp3 with auto-trimmed loop points; WAV masters live
untracked in `assets/audio/masters/`.

**Knowledge persists across the tab too**: `meta` (deaths, day, credit,
menace, credentials, the stamp ceremony) autosaves to localStorage
(`core/save.js`, versioned, forward-compatible merge). Items stay
temporary. The cheat panel has a Wipe save row. The GLURP jingle is on the album
(see The OST below) and ends with a really wet *glurp* — which is the
sound of drinking one. Mute button
(or M) silences everything, persistently.

## The roster

Front Office: `skeleton` (Local 206, rattles), `mailbat` (URGENT),
`consultant` (ghost; walls are for employees), `cabinet` (retaliates —
inert archival furniture placed in rows along walls; strike one and the
wave of waking travels down the row), and the `slime` — the intern,
fully passive, TECHNICALLY doing its best; killing it silently costs a
letter grade. Topside: `pigeon` (retaliates; the flock remembers),
`goose` (the one topside danger; declined certification), `veteran`
(ghosts still securing the Victory Site). The overworld boss is **the
Reenactor** (announces the Famous Charge); **the Middle Manager** is the
floor-4 warden, circle-back telegraph intact. Behavior flags (`passive`,
`retaliates`, `still`) live in `entities/enemy.js` / `systems/enemies.js`.

## Cheat menu (playtesting)

Load with `?cheats` (or `?test`) — a CHEAT button appears after the splash;
backtick toggles it. Go to any floor through the real zone functions (run
invariants intact), grant credentials/gold/sword, set quest stage, force the
next seal type, toggle god mode / lights / skin, trigger death, customs, or
the win, and wipe the save. Headless mutations live in `systems/debug.js` (unit-tested); the
panel is `ui/cheats.js` and ships zero markup when the param is absent.

## What's implemented (mapped to the design doc)

**Engine prerequisite #1 — pinned rooms.** `world/floorgen.js` accepts
`pinned: [{w, h, tag}]` — "load-bearing rooms the renovation imps can't
move." They always generate, join the corridor chain (so connectivity is
inherited and tested), never hold stairs, and come back tagged so story
content can be placed inside. Wired demo: every floor pins a `breakroom`
with a guaranteed Glurp cache.

**Engine prerequisite #2 — persistent day counter.** `core/meta.js` is the
"knowledge is permanent" half of the design: deaths, runs, surface day
(+1 per dungeon run), death-cause grudges, grades, best depth. It survives
death AND `newRun`. The HUD shows the day; Hespeth quotes it.

**Build step 1 — the Ledger + death messages + Hespeth's counter.**
- `systems/ledger.js`: cause-aware incident reports (deterministic, so the
  grudges are unit-tested, which the Ledger would hate), run grading
  (rubric never shown; dying to the same thing twice drops a full grade;
  after death #50 the reports just say "Yeah."), `ledgerize()` house
  spelling ("origenal," authoritative, will not be corrected), and
  ALL-CAPS loot lines for THE GOOD KIND.
- `content/hespeth.js`: death-count milestone dialogue, #1 "Oh no." →
  #30 "Stampathy and I were just talking about you."

**Build step 2 — topside hub slice.** Death is no longer game over:
`systems/respawn.js` files the incident report, applies the resurrection
deductible (half your gold, rounded up — per the ticket), resets
consumables to 1 Glurp (items are temporary), keeps your DIRK! (basically
immortal), and respawns you at the Guild Hall with the surface exactly as
you left it. Hub cast: Clerk Hespeth (quest + death processing), the Gift
Shop Gnoll (GLURP™ "Now With Fewer Eels!" and DIRK!™ "It's basically a
sword!"), and a Picketing Hero whose chants don't scan.

**Build step 3 (complete) — the Door Golem + customs.** The golem gates
the dungeon mouth (`systems/credentials.js`): a sword (any sword-shaped
object passes, with tier-appropriate commentary), a notarized tragic
backstory (the Ledger writes it, Hespeth stamps it — you don't get to read
it first), and crippling debt (one gift-shop purchase on credit suffices).
First credentialed entry triggers the stamp ceremony; the pause is sacred
and unit-tested (`>= 3` ellipsis lines, do not cut). Surfacing alive with
dungeon gold triggers customs: declare it (he inspects each coin,
individually, respectfully) or smuggle it — which the golem KNOWS, can't
prove, and writes in his little book. The book is the **Menace Résumé**
(`meta.menace`), readable in the customs dialogue; every page is about
you. Dying skips customs (the body bin has diplomatic status). The Ledger
also now grades every *survived* run on surfacing.

**Build step 5 (started) — the knowledge-puzzle framework.** The Riddle
Door That Learned Its Lesson (`systems/riddle.js`) joins the seal rotation
as a fourth puzzle type. It asks about things that happened THIS RUN —
kills by kind, Glurps consumed — all tracked in `runStats`. Wrong answers:
the door sighs and asks an easier one, more disappointed each time; the
third fallback is the floor number (it's written on the door); after three
misses it just asks your name, every answer is correct, and that is the
punishment.

**Re-voicing.** The overworld boss is the Middle Manager (he announces
"let's circle back" when he wakes — the telegraph IS the joke); the win
screen stamps TICKET #44,107; warden floors are "performance reviews."

## Not in this slice
The suggestion box long con, Gerald, Gregory, the museum, strata theming,
the Origenal Hero, menace-earning petty crimes beyond smuggling (the
Menace Résumé plumbing is in; puzzle #5 needs deeds to document). The bones for all of them exist:
pinned rooms hold fixed story content, `meta.day`/`meta.runs` drive the
long cons, and the effects interface is where the Ledger's narration
expands. The splash mockup (`some-hero-splash.html`) referenced in the doc
wasn't provided, so the title screen is a plain re-skin.

## Architecture
Unchanged from the engine README (three layers, injected effects, seedable
RNG). New atomic modules: `core/meta.js`, `systems/ledger.js`,
`systems/respawn.js`, `systems/credentials.js`, `systems/riddle.js`,
`content/hespeth.js`, `content/golem.js`. Death causes thread through
`hurtPlayer(game, dmg, fx, cause)`.
