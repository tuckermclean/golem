# SOME HERO
### *(title: final. do not improve. — the Ledger)*
Story & puzzle design doc, v3 — formerly "The Dungeon of Perpetual Renewal," a name that has been retired with honors to the suggestion box.

**Splash screen:** cinematic, played 100% straight — torchlit black, "THE KINGDOM OF GREATER PFLUM PRESENTS," a modest little SOME above a colossal golden HERO, and just as the shine sweep finishes, a rubber stamp slams across it: *TICKET #44,107 — ASSIGNED (resurrection plan: standard, deductible applies)*. Tagline: **"Somebody has to. Apparently it's you."** The Ledger narrates from the corner and reacts, with steadily collapsing patience, to every key you press that isn't Start (Start is Enter; the Ledger will eventually crack and tell you). See `some-hero-splash.html` for the working mockup.

---

## The Premise (unchanged, still good)

Forty years ago the Dread Sovereign Malgrath the Unending was slain. Everyone went home. Nobody cancelled anything.

The dungeon under the kingdom of Greater Pflum still runs itself: layouts regenerate quarterly ("contractually obligated content refreshes"), an automated treasury pays the monsters, and the Apocalypse Curse auto-renews annually because Malgrath never turned that off and the cancellation desk is on the bottom floor. Behind the boss.

You're the Adventurers' Guild's newest hire — hired because every qualified hero is on strike. Your ticket:

> *TICKET #44,107 — "Go downstairs and cancel the apocalypse. Should be quick."*

---

## THE TWO MODES (new)

The game is two games wearing one trenchcoat, and the story treats that as literal.

### ⬆️ THE TOPSIDE — RPG Mode
The kingdom of Greater Pflum: persistent overworld, fixed map, story quests, adventure puzzles, shops, weirdos. **No permadeath topside** — in-world, because the surface is "a certified Safe Workplace" (there is a banner; the banner is on fire a little).

### ⬇️ THE DOWNSTAIRS — Roguelike Mode
The dungeon. Runs, deaths, regenerated layouts, the works. Entering it requires walking past a sign that says "NOW LEAVING: SAFETY."

### How they interlock
- **Death sends you Topside.** Resurrection happens at the Guild Hall, so the overworld IS the hub — every death is also an invitation to do surface stuff.
- **Items don't survive the dungeon, knowledge does, and *story keys* move both ways.** Some main-quest objects live topside (the museum skull), some intel only exists downstairs (Malgrath's pet), so the plot forces commuting.
- **Customs.** Dungeon loot brought topside must be declared to the Door Golem, who inspects it with agonizing seriousness. Smuggling is possible, builds your Menace Résumé, and the golem *always knows* but can't prove it. He keeps a little book of suspicions. You can read the book. Every page is about you.
- **Time gag:** each dungeon run advances the surface by one day, which matters for exactly one questline (the Letter to Lesser Pflum, below) and is otherwise just how Skritch schedules renovations.

---

## Tone Rules v2 (the comedy changed species)

v1's jokes were observational ("office life, am I right"). v2's jokes are **character-driven nonsense**: everyone is committed to one wrong bit with absolute confidence, and the world never blinks. Rules:

1. **Every named character gets: a bit, a catchphrase, and one wrong belief they will defend forever.** Function follows bit, not the other way around.
2. **Mundane containers, insane contents.** Suggestion boxes, incident reports, museum plaques, sponsor reads — boring formats are the delivery vehicle for the dumbest possible payloads.
3. **Confidence over cleverness.** A character being *certain* is funnier than a character being witty. Nobody in this game has ever doubted themselves.
4. **Failure is content.** Deaths, wrong answers, and bad ideas always produce a unique reaction. The player should do dumb things on purpose to see what happens, and be rewarded every time.
5. **The dinner-table test:** every zone should contain at least one line an eleven-year-old will repeat at dinner for a month. This is the actual success metric and should be QA'd as such.
6. **No current slang, ever.** The vibe is timeless committed stupidity, not borrowed vocabulary.

---

## THE NARRATOR: The Ledger (massively promoted)

Your Guild-issued auto-biographing ledger, and the closest thing the game has to a Strong Bad. The Ledger:

- Narrates your deeds in heroic prose it is **bad at and defensive about.** ("Our hero strode boldly into the— FINE. Walked. Walked into the wall. I'm not rewriting it.")
- **Grades every run** (letter grade, unfair, holds grudges). Dying to the same skeleton twice drops you a full grade. Petting Gregory raises it. The rubric is never shown and changes when questioned.
- **Misspells with total authority** and will not be corrected. The final boss is consistently rendered "the Origenal Hero."
- Goes ALL CAPS when excited, which is mostly about loot it considers "EXTREMELY THE GOOD KIND."
- **Reads the suggestion-box complaints aloud** when they arrive at each floor, doing voices. The voices are all the same voice.
- Writes occasional unsanctioned fiction about the Origenal Hero in the back pages. The player can find these. They are florid. The Hero, when finally met, has *read them.*

The Ledger is the connective comedy tissue across both modes — it's the one character who's always on screen, so it carries the tone even in empty corridors.

---

## THE TOPSIDE: Greater Pflum (new)

Capital: **Pflumton-upon-Dungeon.** Town sign: "Twinned with Lesser Pflum (legally required)." Nobody has ever been to Lesser Pflum. Everyone has opinions about it.

### Locations & residents

**The Guild Hall (hub).** Resurrection desk, job board, trophy wall of heroes who quit.
- **Clerk Hespeth** — processes your deaths. Bit: stamps things that don't need stamping; her stamp has a name (Stampathy) and is the only thing she loves. Catchphrase: *"Body bin's where it always is."* Wrong belief: that you will eventually stop dying. Her dialogue tracks your death count: #1 "Oh no." #30 "Stampathy and I were just talking about you."

**The Picket Line** (outside the Guild, permanent). The professional heroes on strike. Bit: their chants don't scan — *"WHAT DO WE WANT!" "A REASONABLE DEDUCTIBLE!" "WHEN DO WE WANT IT!" "FOLLOWING STANDARD PROCESSING TIMES!"* They heckle your gear every time you pass. They are heckling a child's job. They know. They're not proud. They're a little proud.

**The Royal Museum of Having Defeated Evil.** Where the skull of Malgrath sits labeled "SKULL (HEROIC CONTEXT)."
- **Docent Brell** — narrates every exhibit wrong with enormous confidence. Bit: all her facts are off by exactly one ("Malgrath was slain forty-ONE years ago by a hero wielding the legendary sword Thirstbringer" — it was Dirgebringer, and she will die on this hill). Wrong belief: that she wrote the plaques. The plaques disagree with her *out loud* if you read them after she speaks. Catchphrase: *"And THAT'S museum science."*

**The Royal Palace.**
- **King Pfilbert the Adequate** — bit: aggressively, suspiciously fine with everything. The apocalypse renews annually and his entire policy is "we'll get 'em next year, champ." Catchphrase: *"Sounds like a downstairs problem!"* Wrong belief: that he has been down the dungeon ("I went once. Floor one. Bought a magnet."). The magnet is on the throne. He shows everyone the magnet.

**The Glurp Bottling Concern.** The Guild's sponsor. See BRANDS, below.

**Malgrath's Mother's cottage** moves topside in v2 (the retirement grotto was a commute). She's lovely, has no idea her son is dead, owns Gregory (a rock), and is the game's one source of actual warmth — the comedy parts the seas around her on purpose. Gregory persists through your deaths because *"rocks don't die, dear."*

### Topside quests (RPG-mode adventure puzzles, samples)

1. **The Skull Job** (main quest, Stratum II requirement). Proof of Malgrath's death = his skull = museum exhibit. Stealing is a Menace option; the *clean* solution is a plaque-logic puzzle: museum policy auto-deaccessions any exhibit whose plaque contains an error, so you must get Docent Brell to "correct" the skull's (accurate) plaque — by agreeing with her loudly until she updates it to be off by one. The museum then legally hands you the skull at the gift shop window, in a bag that says THANK YOU FOR EVILING WITH US.

2. **The Seal of Office.** King Pfilbert has lost the royal seal needed to validate your dungeon paperwork. The royal seal is a literal seal. Named Chauncey. Chauncey has relocated to the fountain and has demands (fish-based; presented via interpretive barking; the Ledger translates, badly). Negotiation puzzle where every option is wrong except respect.

3. **The Letter to Lesser Pflum** (long con, surface edition). The post office pays well for one delivery to Lesser Pflum. The road is closed. The reason changes every in-game day — bridge out, bridge haunted, bridge "in a mood," bridge fine but the toll troll is at a wedding — for *twenty days* of escalating excuses. On day 21 the road simply opens, you walk ten feet, and a sign says "WELCOME TO LESSER PFLUM, twinned with Greater Pflum (we didn't ask)." What's in Lesser Pflum is one mailbox and the game's single best item. This is the topside's suggestion-box equivalent: patience as a puzzle.

4. **End the Strike** (cross-mode). The heroes' demands can only be implemented as dungeon policy — via the suggestion box, twelve runs deep. A topside quest whose solution is a roguelike mechanic. Reward: the picket line starts heckling *enemies* on your behalf, audibly, from the surface, through the floor.

---

## GERALD (his own section now; he earned it)

Roaming dungeon shopkeeper. Appears in impossible places — sealed vaults, mid-boss-arena, once inside a mimic ("we have an arrangement").

- **Bit:** Gerald has a permit. Gerald pronounces it "per-MIT," every time, and physically winces if you say it correctly, like you're the one being weird.
- **Catchphrase:** *"All legal. Got the per-MIT."*
- **Wrong belief:** that the permit is airtight.

**The Permit (late-game examine payoff):** a crayon drawing of a dragon. Specifically:

> A green dragon with **two** extremely beefy arms ("two, for legal reasons," Gerald says, unprompted), back spikes that are clearly lowercase m's, and angry eyebrows floating slightly off the head. Crayon caption: **"SCORCHGOR THE CROMULENT. ORIGENAL CHARACTER. DO NOT STEAL."** (The Ledger's spelling. The Ledger notarized it. This is the only document the Ledger has ever notarized and it is SO proud.)

If the player so much as pauses on the resemblance to any other crayon dragon they may be thinking of, Gerald, sweating: *"Completely different guy. Scorchgor doesn't even burninate— he doesn't even know that word. He flame-broils the PHEASANTRY. Birds. He's bird-based. Per-MIT, please."*

> **Legal sidebar (real talk, for the dev):** the homage stays safe because the joke *is* the legal distinctness — different name, different design (two arms, m-spikes, no consummate anything), and the character's defining trait is everyone insisting he's original. You're parodying "original character do not steal" culture, not reproducing anyone's dragon. Never use the source name, design, or quotes in-game; the wink lands harder unspoken.

---

## BRANDS (new — fake sponsors, real jingle)

The Guild runs on sponsorships. Every potion in the game is:

**GLURP™ Brand Adventure Fluid** — *"Now With Fewer Eels!"*
The label lists ingredients as "fluid, attitude, eels (fewer)." Drinking it plays a half-second of the jingle. The full jingle plays in the Guild gift shop on loop, and it goes:

> 🎵 *GLURP! It's adventure fluid!*
> *GLURP! Don't ask what's in it!*
> *If you're hurt or sad or cursed or dead-ish,*
> *GLURP'll fix you in a minute!**
> *(*sung at speed, in tiny print:* Glurp will not fix you.)* 🎵

This is the game's one terrible song and it should be *catchy*, because the dinner-table test applies double to songs. Secondary brand for equipment: **DIRK!** brand swords ("DIRK! It's basically a sword!"), whose mascot is a dirk with arms drawn by, the art style suggests, the same hand that drew Scorchgor.

---

## THE DOWNSTAIRS: Three Strata (structure unchanged, cast re-voiced)

Strata persist; layouts within them regenerate. Story beats live in fixed "load-bearing rooms" the renovation imps can't move.

### Stratum I — The Front Office (Floors 1–4)
Reception, gift shop, orientation traps ("MIND THE GAP" over a 40-foot pit; the gap has a guestbook). Entry-level monsters: skeletons of **Rattling Brotherhood Local 206** (union pins, magazine subscriptions, a slime that's technically an intern and TECHNICALLY doing its best).

**Gate:** the Door Golem of Credential Verification (puzzle #1, below). Bit: agonizing seriousness, the suspicion book, and a tiny stamp he is not as good with as Hespeth, which haunts him.

**Boss: The Middle Manager** — a minotaur whose maze is an open-plan office. Re-voiced bit: he says "let's circle back" and then **physically circles back**, which is the tell for his charge attack — the meeting jargon IS the boss-fight readability. Defeating him unlocks his catchphrase as a player taunt: *"per my last attack."* (Kid-readable: big bull man announces his moves in business voice. Adult-readable: you have met this man.)

### Stratum II — Operations (Floors 5–8)
Payroll vault, curse boiler room, imp break area, Department of Prophecy (outsourced).

- **Foreman Skritch** (renovation imp) — re-voiced as a tortured auteur. Calls layouts "pieces." Refers to a corridor as "my blue period." Bit: savages his own work ("WHO put a treasure room next to a spike hall?? ...I did. It was brave."). Questline: help him win **Layout of the Quarter**, after which the player votes on next run's generation parameters — mechanic as narrative, now with an awards ceremony. Catchphrase: *"It's not done. It's NEVER done."*
- **The Prophecy Intern** — every prophecy about you is off by one. Catchphrase: *"It was SUPPOSED to be a Tuesday."* Wrong belief: that the next one will be right. Late-game payoff: their final prophecy is off by one in your *favor*, and they take it worse than any failure.

**Act II is the heist:** cancellation requires (1) the account holder's signature, (2) proof of death — the skull, topside, see The Skull Job — and (3) the security answer: *"What was Malgrath's first pet?"*

**Boss: The Auditor** — lich, immortal via tax law, **re-staged for kid-readability:** his lair is a fortress of filing cabinets, he attacks by burying you in paper, his red-tape lasers are literal red tape, and his berserk trigger is any crumpled form — crumple paper to enrage-and-expose him. An adult reads "tax lich"; a kid reads "screaming paper skeleton who hates mess." Both are correct.

### Stratum III — Legacy Code (Floors 9–12)
The original 40-year-old dungeon, played almost straight — dark, ominous, held together with imp warning signs ("DO NOT REFACTOR," "LOAD-BEARING CURSE," "skritch was here"). After eight floors of bits, sincerity is the funniest thing left.

**Final boss: the Origenal Hero** (per the Ledger; he has given up correcting it). Slew Malgrath, found the cancellation desk, realized cancelling the apocalypse also cancels the dungeon, the monster jobs, the Guild, and his pension — and chose to staff the desk and tell everyone the line was busy. For forty years. He fights you because he is **three weeks from retirement**, and his boss dialogue is the game's best tantrum:

> *"Forty years I held this line. THREE WEEKS, kid. You couldn't have been incompetent for THREE MORE WEEKS?"*

He has read the Ledger's fiction about him. Mid-fight, he critiques it. The Ledger, narrating the fight, gets defensive. They argue *over your head, during the boss fight.* This is the comedy thesis of the whole game executed at maximum stakes.

**Ending choice:**
- **Cancel everything.** Dungeon powers down; monsters hit the surface job market; epilogue slides (skeletons in customer service; the slime intern gets promoted; Gerald opens a permit office; Scorchgor merchandising empire).
- **Transfer ownership.** You sign as the new account holder. New Game+ justification: you now roguelike through a dungeon you *own*, monsters greet you as "boss," and Hespeth's first line is "Oh no. Sir."

---

## Puzzle Philosophy (unchanged — it's the load-bearing wall)

**Items are temporary; knowledge is permanent.** Solutions are *information*, so adventure puzzles coexist with permadeath instead of fighting it. Gregory the rock is the one designed exception (persists through death), which is what makes the rule visible — and gives you and your co-op partner a shared pet to argue about carrying.

Tiers: **Room puzzles** (per-run seeded variants of a learned rule), **Strata puzzles** (fixed-room, story-gating), **Long Cons** (multi-run meta-puzzles), plus now **Topside puzzles** (classic fixed adventure-game puzzles, since the surface doesn't regenerate).

## The Eight Dungeon Puzzles (intact from v1, re-voiced where noted)

1. **The Door Golem of Credential Verification** — entry requires (a) a sword: any sword-shaped object passes (swordfish, gift-shop sign, a DIRK!); (b) a tragic backstory: notarized, written by the bard, who must first be made to cry (show him the Prophecy Intern's error log); (c) crippling debt: buy anything from Gerald on credit. Bringing all three *real* items: achievement, "Overqualified." The golem's stamp scene is sacred; do not cut the pause.
2. **The Riddle Door That Learned Its Lesson** — asks about things that happened *this run* ("What was the third skeleton holding?"). Wrong answers: the door sighs and asks an easier one, more disappointed each time. Third wrong answer, it just asks your name, and being asked your name by a disappointed door is a worse punishment than damage.
3. **The Payroll Diversion** — reroute pneumatic pay-tubes so the vault guardians get paid early and take lunch. Pipe-logic puzzle dressed as an org chart. Misroute to double-pay the boss: harder fight, double loot, both valid.
4. **Malgrath's First Pet** — five elderly monsters, five conflicting answers, each testimony with one checkable detail; eliminate logically. Answer: **Gregory the rock**, confirmed by Malgrath's mother, who asks you to take him for walks. An 11-year-old can solve this solo and should be allowed to.
5. **The Signature** — the desk checks souls, not ink; a signature is valid if signed by the hand that made it; the hand requires Malgrath's animate gauntlet; the gauntlet requires "appropriate menace"; menace is earned via documented petty crimes (jaywalk through the minotaur's office, return a scroll late, remove a DO NOT REMOVE tag), tracked in the **Menace Résumé** — the funniest document in the game and the most kid-magnetic system in it.
6. **The Break Room Standoff** — two ogres, one mug, years of stalemate. Washing it: both turn on you. Breaking it: small funeral, shared grief, eternal passage (they remember across runs). The helpful action and the correct action diverge; this room teaches it.
7. **The Room That Renovation Forgot** — legacy traps with no darts left, but the incident counter still counts; exit opens at exactly N triggers. Step ON the traps. Different N per run, same rule forever — the moment the game's philosophy clicks.
8. **The Long Con: The Complaint That Reaches the Bottom** — suggestion box on Floor 1; complaints descend one floor per run; any complaint reaching Sub-Level Ω becomes policy. Twelve runs after writing "more Gerald," there is more Gerald, and the Origenal Hero reads your complaint aloud, verbatim, with resentment, in the Ledger's transcription, with the Ledger's spelling. Screenshot engine.

---

## Death Messages (the incident reports — sample set)

- *"Cause of death: skeleton. Contributing factor: hubris. Recommended action: less hubris."*
- *"Employee attempted to pet the fire. Fire did not consent."*
- *"Deceased was warned about the gap. Gap was minded insufficiently. Gap guestbook signed, at least."*
- *"Cause of death: lunch (was someone else's)."*
- *"Cause of death: per the Middle Manager's last attack."*
- *"Drank Glurp. (See label.)"*
- After death #50, the reports stop trying: *"Yeah."*

---

## Build Order v2

1. **The Ledger + death messages + Hespeth's counter dialogue** — installs the voice into both modes immediately. Everything else inherits it.
2. **Topside hub slice** — Guild Hall, picket line, gift shop with the Glurp jingle. Cheap, and it makes death-respawn feel like arriving somewhere instead of losing.
3. **Door Golem puzzle + customs** — proves adventure puzzles work in the crawler AND stitches the two modes at the seam.
4. **Stratum I + Middle Manager** — first full beat, first quotable boss.
5. **Knowledge-puzzle framework** (riddle door, trap counter).
6. **The Act II heist triangle** — skull (topside), signature (menace system), Gregory (deduction). This is where both modes start trading keys and the game becomes itself.
7. **Suggestion box + Lesser Pflum** last — pure payoff, and they need the run/day counter plumbing anyway.

Engine prerequisites, same as before plus one: the generator must support **pinned rooms**, and the topside needs a **persistent day counter** ticked by dungeon runs. If you can do those two things, every system in this doc is buildable on what you have.
