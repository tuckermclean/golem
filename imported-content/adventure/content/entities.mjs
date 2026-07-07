/* ── adventure content — entities (DELTA A3 PR1).
   Hand-transcribed from `imported-content/adventure/legacy/world.yaml`
   (the one live game world — 33 rooms, 5 doors, 9 characters) by a human
   reading the legacy source, per `imported-content/adventure/AUDIT.md`
   (the P0.2 func: audit) and `imported-content/adventure/DECISION-LOG.md`
   (the disposition table for every audited func:/condition:/hazard
   entry). This file imports NOTHING from legacy/ (see tests/
   no-dynamic-code.test.js and the design spec's "Method: hand-
   transcription" section) — every citation below is a `world.yaml:line`
   comment, not a mechanical read.

   Descriptions are transcribed BYTE-IDENTICAL to world.yaml (they are
   authored content — see tests/content-pack.test.js's spot checks).
   use_msg strings are transcribed faithfully but are NOT held to the
   same byte-identical bar (design spec: "func:/use_msg/condition: are
   re-expressed or dropped per the decision log"). Every `func:` body is
   DROPPED and re-expressed (per DECISION-LOG.md) as a declarative
   component — OnUse{setFact|clearFact,when?}, Toggle{on}, or
   Spawns{when,entity} — never as executable code. Fact keys reuse
   legacy's own setattr()-literal strings where legacy already names them
   (mushroom_insight/potion_insight/mutant/big_ol_hippy); the wizard's
   session-local var flags are deliberately RENAMED (has_rare_mushroom /
   wizard_gave_key), documented at the wizard entity below, because
   legacy overloads a single name ("has_mushroom") for two different
   things there.

   Component vocabulary used: packages/kernel/src/components.ts's C3
   set (Identity/RegionMembership/Portable/Lock/Interactable/Knowledge)
   PLUS four adventure-local, opaque-data components (component data is
   DELIBERATELY generic JsonValue — C1 does not validate shape; see
   games/topdown-puzzle/content/entities.mjs and games/some-hero/
   content/entities.mjs's own opaque `Actor{}` bag for this exact
   precedent):
     - `Exits`  — array of `{ to: {$ref: EntityId} }`. Kernel's own
       `Portal.to/at` assumes grid coordinates that don't exist in this
       free-form room graph (design spec, "exit/link"); rooms can have
       more than one outgoing link, so this is plural/array-valued
       rather than the spec prose's singular "Exit:{to}" shape (a
       necessary adaptation — see the A3 PR1 report's "hard cases").
       Doors reuse the exact same shape for their two endpoints.
     - `Contains` — `{ items?: [{$ref}], characters?: [{$ref}] }` on
       room entities: which item/character entities start in that room.
       Not spelled out in the design spec's bullet list, but necessary
       for the content pack to actually describe a world (otherwise no
       entity anywhere records room/item/character placement) — added
       deliberately, documented here and in the PR1 report.
     - `ItemStats` — opaque type-specific numeric/string fields legacy's
       Money/Weapon/Wearable item types carried (amount/damage/wearMsg/
       removeMsg) that have no dedicated C3 component yet. Same "C1
       doesn't validate component shape" latitude as some-hero's Actor.
     - `OnUse` / `Toggle` / `Spawns` — the three declarative behavior
       shapes DECISION-LOG.md's (a) disposition calls for, verbatim per
       the design spec's bullet list.

   Scope: PR1 only — content pack ONLY. No GameModule, no verb
   mechanics, no terminal client (PR2). No sample-world walkthrough
   (PR3). AICharacter entities (bartender/carl/old man/spider/alchemist)
   are OMITTED BY TYPE (DELTA:360) — see DECISION-LOG.md. */

// ── Rooms (33) — world.yaml:1-546 ───────────────────────────────────────
// Each room: Identity{name,description} (description byte-identical to
// world.yaml), RegionMembership{region:<slug>}, Exits (unlocked links
// only — locked/hidden connections are modeled as separate door entities
// below, per world.yaml's own `doors:` section being disjoint from every
// room's `links:` list), and Contains (item/character placement).

const ROOM_DEFS = [
  {
    // world.yaml:2-21 (payphone at :16-21 is commented out — not ported)
    id: "entity:room_village_square",
    components: {
      Identity: {
        name: "village square",
        description: `A bustling, open square at the center of the village. Street performers, questionable food carts, and a faint smell of potatoes linger in the air.`,
      },
      RegionMembership: { region: "village_square" },
      Exits: [
        { to: { $ref: "entity:room_shop" } },
        { to: { $ref: "entity:room_tavern" } },
        { to: { $ref: "entity:room_back_alley" } },
        { to: { $ref: "entity:room_forest_road" } },
      ],
      Contains: { items: [{ $ref: "entity:item_fountain" }] },
    },
  },
  {
    // world.yaml:23-36
    id: "entity:room_shop",
    components: {
      Identity: {
        name: "shop",
        description: `A cramped general store with shelves overflowing with odds and ends. A faint smell of mothballs permeates the stale air.`,
      },
      RegionMembership: { region: "shop" },
      Exits: [{ to: { $ref: "entity:room_village_square" } }],
      Contains: {
        items: [{ $ref: "entity:item_silver_coins" }, { $ref: "entity:item_dusty_lantern" }],
      },
    },
  },
  {
    // world.yaml:38-42
    id: "entity:room_tavern",
    components: {
      Identity: {
        name: "tavern",
        description: `A cozy, dimly lit tavern. Wooden tables, a roaring fireplace, and the scent of ale mix with boisterous chatter.`,
      },
      RegionMembership: { region: "tavern" },
      Exits: [{ to: { $ref: "entity:room_village_square" } }],
      Contains: { characters: [{ $ref: "entity:char_stray_dog" }] },
    },
  },
  {
    // world.yaml:44-51
    id: "entity:room_back_alley",
    components: {
      Identity: {
        name: "back alley",
        description: `A narrow alleyway between tall, leaning buildings. Broken barrels and an old stray cat complete the picture.`,
      },
      RegionMembership: { region: "back_alley" },
      Exits: [{ to: { $ref: "entity:room_village_square" } }],
      Contains: { items: [{ $ref: "entity:item_broken_crate" }] },
    },
  },
  {
    // world.yaml:53-62
    id: "entity:room_forest_road",
    components: {
      Identity: {
        name: "forest road",
        description: `A winding dirt road that meanders from the village square into the deeper forest. Lantern posts line the way, though most stand unlit.`,
      },
      RegionMembership: { region: "forest_road" },
      Exits: [
        { to: { $ref: "entity:room_village_square" } },
        { to: { $ref: "entity:room_forest_clearing" } },
      ],
      Contains: { items: [{ $ref: "entity:item_signpost" }] },
    },
  },
  {
    // world.yaml:64-74
    id: "entity:room_old_oak_clearing",
    components: {
      Identity: {
        name: "old oak clearing",
        description: `An ancient oak stands in the center. Its trunk is massive, and a rope swing dangles invitingly from a sturdy branch.`,
      },
      RegionMembership: { region: "old_oak_clearing" },
      Exits: [
        { to: { $ref: "entity:room_spooky_house" } },
        { to: { $ref: "entity:room_enchanted_pond" } },
      ],
      Contains: { items: [{ $ref: "entity:item_rope_swing" }] },
    },
  },
  {
    // world.yaml:76-85
    id: "entity:room_enchanted_pond",
    components: {
      Identity: {
        name: "enchanted pond",
        description: `A shimmering pond reflecting the treetops and sky. Water lilies float serenely, occasionally bobbing with unseen fish below.`,
      },
      RegionMembership: { region: "enchanted_pond" },
      Exits: [
        { to: { $ref: "entity:room_old_oak_clearing" } },
        { to: { $ref: "entity:room_forest_clearing" } },
        { to: { $ref: "entity:room_deep_forest_path" } },
      ],
      Contains: { items: [{ $ref: "entity:item_sparkling_stone" }] },
    },
  },
  {
    // world.yaml:87-104
    id: "entity:room_deep_forest_path",
    components: {
      Identity: {
        name: "deep forest path",
        description: `A narrow footpath winding through towering evergreens. The sunlight barely reaches the mossy ground, and shadows dance in the breeze.`,
      },
      RegionMembership: { region: "deep_forest_path" },
      Exits: [
        { to: { $ref: "entity:room_enchanted_pond" } },
        { to: { $ref: "entity:room_misty_glen" } },
      ],
      Contains: {
        items: [{ $ref: "entity:item_hollow_log" }, { $ref: "entity:item_rare_mushroom" }],
      },
    },
  },
  {
    // world.yaml:106-116
    id: "entity:room_misty_glen",
    components: {
      Identity: {
        name: "misty glen",
        description: `A silent glen shrouded in fog. Pale light filters through the canopy, revealing wispy shapes that vanish when you look twice.`,
      },
      RegionMembership: { region: "misty_glen" },
      Exits: [
        { to: { $ref: "entity:room_deep_forest_path" } },
        { to: { $ref: "entity:room_fae_circle" } },
      ],
      Contains: { items: [{ $ref: "entity:item_eerie_lantern" }] },
    },
  },
  {
    // world.yaml:118-126
    id: "entity:room_fae_circle",
    components: {
      Identity: {
        name: "fae circle",
        description: `A ring of ancient toadstools glowing faintly in the twilight. A soft chime resonates in the air, beckoning wanderers closer.`,
      },
      RegionMembership: { region: "fae_circle" },
      Exits: [
        { to: { $ref: "entity:room_misty_glen" } },
        { to: { $ref: "entity:room_haunted_grove" } },
      ],
      Contains: { items: [{ $ref: "entity:item_moonstone" }] },
    },
  },
  {
    // world.yaml:128-145
    id: "entity:room_haunted_grove",
    components: {
      Identity: {
        name: "haunted grove",
        description: `Twisted trees and gnarled roots give this grove a menacing aura. Faint whispers echo, though no one is visible. The air grows colder.`,
      },
      RegionMembership: { region: "haunted_grove" },
      Exits: [{ to: { $ref: "entity:room_fae_circle" } }],
      Contains: { items: [{ $ref: "entity:item_whispering_skull" }] },
    },
  },
  {
    // world.yaml:147-172
    id: "entity:room_ancient_ruin",
    components: {
      Identity: {
        name: "ancient ruin",
        description: `Crumbled stone pillars and toppled statues hint at a lost civilization. Vines wrap around broken walls, nature reclaiming what was once grand.`,
      },
      RegionMembership: { region: "ancient_ruin" },
      Exits: [
        { to: { $ref: "entity:room_hidden_waterfall" } },
        { to: { $ref: "entity:room_arions_tomb" } },
      ],
      Contains: { items: [{ $ref: "entity:item_stone_tablet" }] },
    },
  },
  {
    // world.yaml:174-186
    id: "entity:room_arions_tomb",
    components: {
      Identity: {
        name: "arion's tomb",
        description: `A hidden tomb shrouded in mist. The air is thick with sorrow, and the ground is littered with broken stones.`,
      },
      RegionMembership: { region: "arions_tomb" },
      Exits: [{ to: { $ref: "entity:room_ancient_ruin" } }],
      Contains: {
        items: [{ $ref: "entity:item_crypt" }, { $ref: "entity:item_arions_sword" }],
      },
    },
  },
  {
    // world.yaml:188-206
    id: "entity:room_hidden_waterfall",
    components: {
      Identity: {
        name: "hidden waterfall",
        description: `A tumbling cascade of water concealed behind dense foliage. The spray cools the air, creating rainbows in dappled sunlight.`,
      },
      RegionMembership: { region: "hidden_waterfall" },
      Exits: [{ to: { $ref: "entity:room_ancient_ruin" } }],
      Contains: { items: [{ $ref: "entity:item_sparkling_fish" }] },
    },
  },
  {
    // world.yaml:208-214
    id: "entity:room_forest_clearing",
    components: {
      Identity: {
        name: "forest clearing",
        description: `A serene clearing in the woods, dappled with sunlight. Birds chirp overhead, and a gentle breeze rustles the leaves.`,
      },
      RegionMembership: { region: "forest_clearing" },
      Exits: [
        { to: { $ref: "entity:room_wizards_tower" } },
        { to: { $ref: "entity:room_forest_road" } },
        { to: { $ref: "entity:room_enchanted_pond" } },
      ],
      Contains: { characters: [{ $ref: "entity:char_raven" }] },
    },
  },
  {
    // world.yaml:216-225
    id: "entity:room_wizards_tower",
    components: {
      Identity: {
        name: "wizard's tower",
        description: `A tall, crooked tower with arcane symbols etched into the stone walls. A faint hum of magical energy fills the air.`,
      },
      RegionMembership: { region: "wizards_tower" },
      Exits: [{ to: { $ref: "entity:room_forest_clearing" } }],
      Contains: {
        items: [{ $ref: "entity:item_dusty_tome" }],
        characters: [{ $ref: "entity:char_wizard" }],
      },
    },
  },
  {
    // world.yaml:227-247
    id: "entity:room_secret_hideout",
    components: {
      Identity: {
        name: "secret hideout",
        description: `A hidden room under the alley, filled with contraband potions and bizarre contraptions. Strange runes glow on the walls.`,
      },
      RegionMembership: { region: "secret_hideout" },
      Exits: [{ to: { $ref: "entity:room_catacombs" } }],
      Contains: {
        items: [
          { $ref: "entity:item_forbidden_potion" },
          { $ref: "entity:item_loot" },
          { $ref: "entity:item_tv" },
        ],
      },
    },
  },
  {
    // world.yaml:249-268
    id: "entity:room_catacombs",
    components: {
      Identity: {
        name: "catacombs",
        description: `A labyrinth of ancient tunnels beneath the village. The air is thick with dust and the distant sound of dripping water.`,
      },
      RegionMembership: { region: "catacombs" },
      Exits: [{ to: { $ref: "entity:room_secret_hideout" } }],
      Contains: { items: [{ $ref: "entity:item_sarcophagus" }] },
    },
  },
  {
    // world.yaml:269-277 (front door to foyer is a separate door entity —
    // spooky house's own `links:` never lists foyer, see DECISION-LOG.md)
    id: "entity:room_spooky_house",
    components: {
      Identity: {
        name: "spooky house",
        description: `A weirdly spooky, hilariously cursed house. Rumor has it an eccentric alchemist lives here. The front door has a weird, fish-shaped lock.`,
      },
      RegionMembership: { region: "spooky_house" },
      Exits: [
        { to: { $ref: "entity:room_garden" } },
        { to: { $ref: "entity:room_old_oak_clearing" } },
      ],
      Contains: { items: [{ $ref: "entity:item_doormat" }] },
    },
  },
  {
    // world.yaml:279-283
    id: "entity:room_foyer",
    components: {
      Identity: {
        name: "foyer",
        description: `A grand foyer with a high ceiling and a dusty whatever-it-is on the ceiling. Goofy footprints in the dust suggest recent paranormal activity.`,
      },
      RegionMembership: { region: "foyer" },
      Exits: [{ to: { $ref: "entity:room_living_room" } }],
    },
  },
  {
    // world.yaml:285-313 (book at :299-313 is commented out — not ported)
    id: "entity:room_living_room",
    components: {
      Identity: {
        name: "living room",
        description: `A dingy living room with old furniture. It smells like there was a puking party in here a while ago.`,
      },
      RegionMembership: { region: "living_room" },
      Exits: [
        { to: { $ref: "entity:room_foyer" } },
        { to: { $ref: "entity:room_dining_room" } },
        { to: { $ref: "entity:room_hallway" } },
      ],
      Contains: {
        items: [{ $ref: "entity:item_paintbrush" }],
        characters: [{ $ref: "entity:char_cat" }],
      },
    },
  },
  {
    // world.yaml:315-339 (cell phone at :334-339 is commented out — not
    // ported)
    id: "entity:room_dining_room",
    components: {
      Identity: {
        name: "dining room",
        description: `This dining room has rotten food all over. It's disgusting!`,
      },
      RegionMembership: { region: "dining_room" },
      Exits: [
        { to: { $ref: "entity:room_kitchen" } },
        { to: { $ref: "entity:room_hallway" } },
        { to: { $ref: "entity:room_living_room" } },
      ],
      Contains: {
        items: [{ $ref: "entity:item_old_hot_dog" }, { $ref: "entity:item_spoon" }],
      },
    },
  },
  {
    // world.yaml:341-361
    id: "entity:room_hallway",
    components: {
      Identity: {
        name: "hallway",
        description: `A dimly lit hallway that smells of dusty old ladies and even older cheese.`,
      },
      RegionMembership: { region: "hallway" },
      Exits: [
        { to: { $ref: "entity:room_dining_room" } },
        { to: { $ref: "entity:room_bathroom" } },
        { to: { $ref: "entity:room_living_room" } },
        { to: { $ref: "entity:room_library" } },
      ],
      Contains: {
        items: [
          { $ref: "entity:item_candlestick" },
          { $ref: "entity:item_wig" },
          { $ref: "entity:item_shoe" },
        ],
      },
    },
  },
  {
    // world.yaml:363-380
    id: "entity:room_bathroom",
    components: {
      Identity: {
        name: "bathroom",
        description: `A nasty bathroom that hasn't been cleaned in decades.`,
      },
      RegionMembership: { region: "bathroom" },
      Exits: [{ to: { $ref: "entity:room_hallway" } }],
      Contains: {
        items: [
          { $ref: "entity:item_toilet" },
          { $ref: "entity:item_bathtub" },
          { $ref: "entity:item_key" },
        ],
      },
    },
  },
  {
    // world.yaml:382-397
    id: "entity:room_kitchen",
    components: {
      Identity: {
        name: "kitchen",
        description: `A centuries-old kitchen. The flies have long since died.`,
      },
      RegionMembership: { region: "kitchen" },
      Exits: [
        { to: { $ref: "entity:room_dining_room" } },
        { to: { $ref: "entity:room_pantry" } },
      ],
      Contains: {
        items: [
          { $ref: "entity:item_pan" },
          { $ref: "entity:item_knife" },
          { $ref: "entity:item_quarters" },
        ],
      },
    },
  },
  {
    // world.yaml:399-424
    id: "entity:room_pantry",
    components: {
      Identity: {
        name: "pantry",
        description: `A dark pantry lined with dusty cans and jars.`,
      },
      RegionMembership: { region: "pantry" },
      Exits: [
        { to: { $ref: "entity:room_kitchen" } },
        { to: { $ref: "entity:room_basement" } },
      ],
      Contains: {
        items: [{ $ref: "entity:item_flashlight" }, { $ref: "entity:item_moldy_bread" }],
      },
    },
  },
  {
    // world.yaml:426-439 (basement door to living room is a separate door
    // entity — living room's own `links:` never lists basement)
    id: "entity:room_basement",
    components: {
      Identity: {
        name: "basement",
        description: `A cold, damp basement. The walls are lined with strange markings.`,
      },
      RegionMembership: { region: "basement" },
      Exits: [{ to: { $ref: "entity:room_pantry" } }],
      Contains: {
        items: [
          { $ref: "entity:item_basement_key" },
          { $ref: "entity:item_old_tapestry" },
          { $ref: "entity:item_rope" },
        ],
      },
    },
  },
  {
    // world.yaml:441-465
    id: "entity:room_library",
    components: {
      Identity: {
        name: "library",
        description: `A quiet library filled with dusty tomes. A ladder on rails runs along massive bookshelves.`,
      },
      RegionMembership: { region: "library" },
      Exits: [
        { to: { $ref: "entity:room_hallway" } },
        { to: { $ref: "entity:room_tower" } },
        { to: { $ref: "entity:room_secret_study" } },
      ],
      Contains: {
        items: [{ $ref: "entity:item_antidote_potion" }, { $ref: "entity:item_ancient_scroll" }],
      },
    },
  },
  {
    // world.yaml:467-479
    id: "entity:room_secret_study",
    components: {
      Identity: {
        name: "secret study",
        description: `A hidden room behind a sliding bookshelf. Strange contraptions fill the tables.`,
      },
      RegionMembership: { region: "secret_study" },
      Exits: [{ to: { $ref: "entity:room_library" } }],
      Contains: {
        items: [{ $ref: "entity:item_tower_key" }, { $ref: "entity:item_dusty_journal" }],
      },
    },
  },
  {
    // world.yaml:481-493
    id: "entity:room_garden",
    components: {
      Identity: {
        name: "garden",
        description: `A dead garden with one mysterious gold flower.`,
      },
      RegionMembership: { region: "garden" },
      Exits: [{ to: { $ref: "entity:room_spooky_house" } }],
      Contains: {
        items: [{ $ref: "entity:item_gold_flower" }, { $ref: "entity:item_hose" }],
      },
    },
  },
  {
    // world.yaml:495-504
    id: "entity:room_tower",
    components: {
      Identity: {
        name: "tower",
        description: `A towering spire that looms over the entire property. The wind howls ominously at the top.`,
      },
      RegionMembership: { region: "tower" },
      Exits: [{ to: { $ref: "entity:room_library" } }],
      Contains: { items: [{ $ref: "entity:item_doorbell" }] },
    },
  },
  {
    // world.yaml:506-531 (tower door to tower is a separate door entity —
    // tower's own `links:` never lists tower stairs)
    id: "entity:room_tower_stairs",
    components: {
      Identity: {
        name: "tower stairs",
        description: `A narrow, winding staircase that leads up to the tower.`,
      },
      RegionMembership: { region: "tower_stairs" },
      Exits: [{ to: { $ref: "entity:room_balcony" } }],
      Contains: { items: [{ $ref: "entity:item_spiderweb" }] },
    },
  },
  {
    // world.yaml:533-546
    id: "entity:room_balcony",
    components: {
      Identity: {
        name: "balcony",
        description: `A small balcony with a view of the forest and the wizard's tower.`,
      },
      RegionMembership: { region: "balcony" },
      Exits: [{ to: { $ref: "entity:room_tower_stairs" } }],
      Contains: { items: [{ $ref: "entity:item_binoculars" }] },
    },
  },
];

// ── Doors (5) — world.yaml:548-578 ──────────────────────────────────────
// Every physical door bridges exactly two rooms that DON'T list each
// other in their own `links:` (confirmed by reading every room above —
// e.g. `back alley`'s links are just [village square], `secret hideout`'s
// are just [catacombs]; the back-door connection exists ONLY here). Each
// door: Identity{name}, Exits (its two endpoints, same shape rooms use),
// Lock{unlockCondition,key}. The 4 keyed doors' `key` resolves to the
// real item entity of that name (all four key items also exist as room
// items below, so `key` is a real, ref-checked pointer, not a string
// copy) with unlockCondition re-expressed as "player holds that key" per
// DECISION-LOG.md. The secret portal is condition-gated, not keyed.

const DOOR_DEFS = [
  {
    // world.yaml:549-553
    id: "entity:door_back_door",
    components: {
      Identity: { name: "back door" },
      Exits: [
        { to: { $ref: "entity:room_back_alley" } },
        { to: { $ref: "entity:room_secret_hideout" } },
      ],
      Lock: {
        unlockCondition: { fact: "has_odd_key" },
        key: { $ref: "entity:item_odd_key" },
      },
    },
  },
  {
    // world.yaml:555-559
    id: "entity:door_front_door",
    components: {
      Identity: { name: "front door" },
      Exits: [
        { to: { $ref: "entity:room_foyer" } },
        { to: { $ref: "entity:room_spooky_house" } },
      ],
      Lock: {
        unlockCondition: { fact: "has_sparkling_fish" },
        key: { $ref: "entity:item_sparkling_fish" },
      },
    },
  },
  {
    // world.yaml:561-565
    id: "entity:door_basement_door",
    components: {
      Identity: { name: "basement door" },
      Exits: [
        { to: { $ref: "entity:room_living_room" } },
        { to: { $ref: "entity:room_basement" } },
      ],
      Lock: {
        unlockCondition: { fact: "has_basement_key" },
        key: { $ref: "entity:item_basement_key" },
      },
    },
  },
  {
    // world.yaml:567-571
    id: "entity:door_tower_door",
    components: {
      Identity: { name: "tower door" },
      Exits: [
        { to: { $ref: "entity:room_tower_stairs" } },
        { to: { $ref: "entity:room_tower" } },
      ],
      Lock: {
        unlockCondition: { fact: "has_tower_key" },
        key: { $ref: "entity:item_tower_key" },
      },
    },
  },
  {
    // world.yaml:573-578 (`hidden: true` at :574, `condition:` at :578 —
    // the cleanest walkability proof per DECISION-LOG.md's (b) bullet)
    id: "entity:door_secret_portal",
    components: {
      Identity: { name: "secret portal" },
      Exits: [
        { to: { $ref: "entity:room_haunted_grove" } },
        { to: { $ref: "entity:room_ancient_ruin" } },
      ],
      Lock: {
        unlockCondition: {
          any: [{ fact: "mushroom_insight" }, { fact: "potion_insight" }],
        },
      },
    },
  },
];

// ── Items ────────────────────────────────────────────────────────────
// Plain scenery `Item`/`Money`/`Weapon`/`Wearable` entries with no
// `func:` get Identity(+Portable if takeable)(+ItemStats for the
// type-specific fields C3 has no dedicated component for yet). Items
// with a `verb:`/`use_msg` but no `func:` add Interactable{prompt,verb}.
// Items with a `func:` (per DECISION-LOG.md's disposition) add the
// declarative OnUse/Toggle/Spawns component instead of any executable
// body. `takeable` defaults to true in legacy's Item class; only
// entries with an explicit `takeable: false` (or `False`) omit Portable.

const ITEM_DEFS = [
  // village square
  {
    // world.yaml:10-15
    id: "entity:item_fountain",
    components: {
      Identity: {
        name: "fountain",
        description: `An ornate fountain spouting slightly murky water. Town rumor says tossing a coin in grants luck, but nobody looks lucky here.`,
      },
      Interactable: { prompt: `You toss some water in the air. Nobody seems impressed.`, verb: "toss" },
    },
  },
  // shop
  {
    // world.yaml:28-31
    id: "entity:item_silver_coins",
    components: {
      Identity: {
        name: "silver coins",
        description: `A small stack of tarnished silver coins. The shopkeeper won't mind if you borrow these, right?`,
      },
      Portable: {},
      ItemStats: { amount: 1.5 },
    },
  },
  {
    // world.yaml:32-36
    id: "entity:item_dusty_lantern",
    components: {
      Identity: {
        name: "dusty lantern",
        description: `An old brass lantern covered in dust. Might brighten your path if it still works.`,
      },
      Portable: {},
      Interactable: { prompt: `You strike the lantern. After some sputtering, it glows faintly.`, verb: "light" },
    },
  },
  // back alley
  {
    // world.yaml:49-51
    id: "entity:item_broken_crate",
    components: {
      Identity: {
        name: "broken crate",
        description: `A shattered wooden crate. It's empty, but might hide a roach or two.`,
      },
      Portable: {},
    },
  },
  // forest road
  {
    // world.yaml:59-62 (takeable: false)
    id: "entity:item_signpost",
    components: {
      Identity: {
        name: "signpost",
        description: `A wooden sign with faded lettering: 'Beware the forest beyond. Mystery abounds.'`,
      },
    },
  },
  // old oak clearing
  {
    // world.yaml:70-74
    id: "entity:item_rope_swing",
    components: {
      Identity: {
        name: "rope swing",
        description: `A simple rope tied to the thickest branch of the oak. It creaks when you put weight on it.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You hop onto the rope swing and push off. For a moment, you're a carefree child again.`,
        verb: "swing",
      },
    },
  },
  // enchanted pond
  {
    // world.yaml:83-85
    id: "entity:item_sparkling_stone",
    components: {
      Identity: {
        name: "sparkling stone",
        description: `A small stone that catches the light just right, glinting with a silvery gleam.`,
      },
      Portable: {},
    },
  },
  // deep forest path
  {
    // world.yaml:93-98 (takeable: false)
    id: "entity:item_hollow_log",
    components: {
      Identity: {
        name: "hollow log",
        description: `A decaying log with a large hollow inside. Something might be lurking within.`,
      },
      Interactable: {
        prompt: `You peer into the log's damp interior. It's dark and smells like rotting leaves.`,
        verb: "inspect",
      },
    },
  },
  {
    // world.yaml:99-104. Disposition (a) — DECISION-LOG.md row 1:
    // OnUse{setFact:"mushroom_insight"} replaces
    // `setattr(player, 'mushroom_insight', True)`. Eatable, no explicit
    // `verb:` -> legacy's Eatable default verb "eat" (items.py:86).
    id: "entity:item_rare_mushroom",
    components: {
      Identity: {
        name: "rare mushroom",
        description: `A peculiar mushroom with swirling purple spots. It looks both delicious and dangerous.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You nibble the rare mushroom. A delightful tang tickles your palate, but you sense it might have mystical properties, too.`,
        verb: "eat",
      },
      OnUse: { setFact: "mushroom_insight" },
    },
  },
  // misty glen
  {
    // world.yaml:112-116
    id: "entity:item_eerie_lantern",
    components: {
      Identity: {
        name: "eerie lantern",
        description: `A ghostly lantern flickering blue. Strange runes adorn its rim.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You try to light the lantern. A cold flame sputters to life, illuminating the fog with an otherworldly glow.`,
        verb: "light",
      },
    },
  },
  // fae circle
  {
    // world.yaml:124-126
    id: "entity:item_moonstone",
    components: {
      Identity: {
        name: "moonstone",
        description: `A smooth, milky-white stone lying among the toadstools. It shines when touched by moonlight.`,
      },
      Portable: {},
    },
  },
  // haunted grove
  {
    // world.yaml:133-145. Disposition (c) — DECISION-LOG.md row 2: the
    // insight-gated bespoke narrative branch is DROPPED (that's golem/
    // prose territory, not content authority); the item survives with a
    // neutral static prompt re-expressed from the func body's own
    // no-insight fallback line (world.yaml:143).
    id: "entity:item_whispering_skull",
    components: {
      Identity: {
        name: "whispering skull",
        description: `An animal skull perched on a stump, faintly whispering incomprehensible words. You feel uneasy just being near it.`,
      },
      Interactable: {
        prompt: `You hold the skull and you can hear faint whispers, but you can't quite make them out. Maybe some magical insight would help?`,
        verb: "listen",
      },
    },
  },
  // ancient ruin
  {
    // world.yaml:153-172. The long use_msg (Arion/Selene legend) is
    // re-expressed faithfully but is NOT byte-identical (only
    // `description` carries that bar — see this file's header comment).
    id: "entity:item_stone_tablet",
    components: {
      Identity: {
        name: "stone tablet",
        description: `A moss-covered tablet with faded carvings, telling a near-forgotten story.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You trace the carvings with your fingers, and the story unfolds in your mind:
-------------
The hero Arion, with silver eyes, traveled across distant mountains to slay monsters born from shadow. Alongside him walked his companion Selene—a woman of great wisdom, whose heart knew no fear.

In forests of crystal, they faced the serpent Rimewyrm whose breath turned rivers into ice. Beneath crimson skies, they defeated the beast Dreamrender whose roar shattered dreams. Their legend grew with every victory, binding their fates tighter.

Yet whispers foretold tragedy. A cursed mirror showed Arion glimpses of treachery, twisted reflections he refused to believe.

In a ruined city cloaked in mist, they faced their final monster—the demon Malachor whose voice sowed seeds of doubt. Arion fought bravely, yet the whispers took root.

In the decisive moment, his trusted companion Selene turned blade against him. Her tearful eyes revealed the demon Malachor's dark truth: to defeat evil forever required the sacrifice of goodness itself.

He fell, betrayed but understanding, his silver eyes fading beneath a broken moon.

Selene lingered alone among the ruins, a hero no longer, carrying the weight of a world saved but forever lost.`,
        verb: "read",
      },
    },
  },
  // arion's tomb
  {
    // world.yaml:179-182 (takeable: false)
    id: "entity:item_crypt",
    components: {
      Identity: {
        name: "crypt",
        description: `A stone crypt with intricate carvings, hinting at a tragic tale of betrayal and sacrifice.`,
      },
    },
  },
  {
    // world.yaml:183-186
    id: "entity:item_arions_sword",
    components: {
      Identity: {
        name: "arion's sword",
        description: `A magically gleaming sword, strangely preserved. It seems to hum with a forgotten power.`,
      },
      Portable: {},
      ItemStats: { damage: 3 },
    },
  },
  // hidden waterfall
  {
    // world.yaml:193-206. Disposition (a) — DECISION-LOG.md row 3: the
    // fish is dynamically-catchable in legacy (moved into inventory only
    // when insight-gated); re-expressed as Portable{} (unconditional,
    // per the locked decision's literal "Portable+Interactable") +
    // Interactable.enabledWhen carrying the SAME insight condition the
    // secret portal uses. `takeable: False` in legacy is superseded by
    // this declarative gate.
    id: "entity:item_sparkling_fish",
    components: {
      Identity: {
        name: "sparkling fish",
        description: `A small fish shimmering with rainbow scales. It leaps through the waterfall spray, impossible to catch by normal means.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You catch the shimmering fish. It wriggles in your hands, and you feel a surge of energy. The fish seems to whisper secrets of the forest.`,
        verb: "catch",
        enabledWhen: { any: [{ fact: "mushroom_insight" }, { fact: "potion_insight" }] },
      },
    },
  },
  // wizard's tower
  {
    // world.yaml:221-225
    id: "entity:item_dusty_tome",
    components: {
      Identity: {
        name: "dusty tome",
        description: `A thick tome of archaic lore. The pages ruffle as if alive.`,
      },
      Portable: {},
      Interactable: {
        prompt: `The tome's letters swirl before your eyes, forming cryptic instructions and half-finished spells.`,
        verb: "read",
      },
    },
  },
  // secret hideout
  {
    // world.yaml:232-238. Disposition (a) — DECISION-LOG.md row 4:
    // OnUse{setFact:"potion_insight"} replaces
    // `setattr(player, 'potion_insight', True)`.
    id: "entity:item_forbidden_potion",
    components: {
      Identity: {
        name: "forbidden potion",
        description: `This neon-green concoction steams in its flask. You're not quite sure what's in it.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You gulp it down. You feel an intense rush of euphoria and dread... best not to dwell on it. You also feel a twinge of insight.`,
        verb: "drink",
      },
      OnUse: { setFact: "potion_insight" },
    },
  },
  {
    // world.yaml:239-242
    id: "entity:item_loot",
    components: {
      Identity: {
        name: "loot",
        description: `A little pile of gold doubloons. It's not yours, but who's counting?`,
      },
      Portable: {},
      ItemStats: { amount: 624 },
    },
  },
  {
    // world.yaml:243-247
    id: "entity:item_tv",
    components: {
      Identity: {
        name: "tv",
        description: `A dusty old TV set, flickering with static. It seems to be tuned to a channel of pure static.`,
      },
      Portable: {},
      Interactable: { prompt: `You watch the static for a while. It's oddly soothing, in a disconcerting way.`, verb: "watch" },
    },
  },
  // catacombs
  {
    // world.yaml:254-268 (takeable: false). Disposition (a)+(b) —
    // DECISION-LOG.md row 5: Spawns{when,entity} replaces the
    // conditional `Weapon("rusty sword", ...)` construction + room
    // placement; gated on the same "mutant" fact the antidote reads.
    // Interactable.prompt is re-expressed from the func's own
    // condition-unmet fallback line (world.yaml:267).
    id: "entity:item_sarcophagus",
    components: {
      Identity: {
        name: "sarcophagus",
        description: `A stone sarcophagus covered in cryptic carvings. It's sealed shut, but a faint glow emanates from within.`,
      },
      Interactable: {
        prompt: `You try to open the sarcophagus, but it's stuck. You might need some help.`,
        verb: "open",
      },
      Spawns: {
        when: { fact: "mutant" },
        entity: { $ref: "entity:item_rusty_sword" },
      },
    },
  },
  // (spawned by the sarcophagus above, not placed in any room's Contains
  // by this pack — it is derived-world content per Spawns{when,entity},
  // matching packages/content/src/types.ts's MapLegendEntry.components
  // doctrine note: instance derivation happens at deriveWorld/runtime,
  // never at content-compile time. See world.yaml:263.)
  {
    id: "entity:item_rusty_sword",
    components: {
      Identity: {
        name: "rusty sword",
        description: `A battered sword with a dull edge. It's seen better days.`,
      },
      Portable: {},
      ItemStats: { damage: 1 },
    },
  },
  // spooky house
  {
    // world.yaml:275-277
    id: "entity:item_doormat",
    components: {
      Identity: {
        name: "doormat",
        description: `A worn doormat that reads 'Welcome-ish'.`,
      },
      Portable: {},
    },
  },
  // living room
  {
    // world.yaml:292-298. Disposition (a) — DECISION-LOG.md row 6:
    // OnUse{setFact:"big_ol_hippy"} replaces
    // `setattr(player, 'big_ol_hippy', True)`; the `news.publish(...)`
    // call is DROPPED (no news/bulletin system exists in the content
    // pack — out of scope for A3). Useable, no explicit `verb:` ->
    // legacy's Useable default verb "use" (items.py:53).
    id: "entity:item_paintbrush",
    components: {
      Identity: {
        name: "paintbrush",
        description: `A very old, antique paintbrush. Looks like it was used by a big ol' hippy.`,
      },
      Portable: {},
      Interactable: { prompt: `OMG LOOK, A BIG OL' HIPPY!`, verb: "use" },
      OnUse: { setFact: "big_ol_hippy" },
    },
  },
  // dining room
  {
    // world.yaml:322-328. Disposition (a) — DECISION-LOG.md row 7:
    // OnUse{setFact:"mutant"} replaces `setattr(player, 'mutant', True)`;
    // the `news.publish(...)` call is DROPPED (same as paintbrush).
    // Eatable, no explicit `verb:` -> default "eat" (items.py:86).
    id: "entity:item_old_hot_dog",
    components: {
      Identity: {
        name: "old hot dog",
        description: `A 300-year-old hot dog. Possibly zombifying if eaten. You've eaten a few dry-aged steaks in your time, but this is ridiculous.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You barely choke it down. If not for your well-lubricated esophagus, you'd be dead. You feel your DNA mutating. You might be a superhero now. Or a zombie. Or a zombie superhero. You now have brute strength, and you look horrendous.`,
        verb: "eat",
      },
      OnUse: { setFact: "mutant" },
    },
  },
  {
    // world.yaml:329-333
    id: "entity:item_spoon",
    components: {
      Identity: {
        name: "spoon",
        description: `A crusty spoon. If you lick it, maybe it gets shiny.`,
      },
      Portable: {},
      Interactable: { prompt: `Did you like that? Was it satisfying for you?`, verb: "lick" },
    },
  },
  // hallway
  {
    // world.yaml:349-351
    id: "entity:item_candlestick",
    components: {
      Identity: {
        name: "candlestick",
        description: `So burned, it must have been used a hundred times.`,
      },
      Portable: {},
    },
  },
  {
    // world.yaml:352-356. Wearable's wear_msg/remove_msg preserved as
    // opaque ItemStats (no dedicated C3 wearable component exists yet).
    id: "entity:item_wig",
    components: {
      Identity: {
        name: "wig",
        description: `A suspicious wig. You can wear it if you dare.`,
      },
      Portable: {},
      ItemStats: {
        wearMsg: `You put on the wig. You look even weirder now.`,
        removeMsg: `You finally took off the wig. About time!`,
      },
    },
  },
  {
    // world.yaml:357-361
    id: "entity:item_shoe",
    components: {
      Identity: {
        name: "shoe",
        description: `Right shoe, size 10 1/2 wide.`,
      },
      Portable: {},
      ItemStats: {
        wearMsg: `You cram your foot in with all the might and muster of the prettiest of Cinderella's step sisters. OMG, It actually fits!`,
        removeMsg: `Relief! Your foot can breathe again. Your big toe might even stop throbbing.`,
      },
    },
  },
  // bathroom
  {
    // world.yaml:368-372
    id: "entity:item_toilet",
    components: {
      Identity: {
        name: "toilet",
        description: `This toilet once stood in the Met as an art installation. Now it's just a toilet. You're afraid to try the flush handle, but you know you want to.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You flush the toilet. It makes a sound like a dying whale. You're not sure if it's the toilet or the whale that's dying.`,
        verb: "flush",
      },
    },
  },
  {
    // world.yaml:373-377
    id: "entity:item_bathtub",
    components: {
      Identity: {
        name: "bathtub",
        description: `A grimy old bathtub. You can't see the bottom.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You climb in and take a bath. It's not as bad as you thought, but it's not great either. You get out feeling a little greasier than when you went in.`,
        verb: "use",
      },
    },
  },
  {
    // world.yaml:378-380
    id: "entity:item_key",
    components: {
      Identity: {
        name: "key",
        description: `A rather shiny key. You might need it for something.`,
      },
      Portable: {},
    },
  },
  // kitchen
  {
    // world.yaml:388-390
    id: "entity:item_pan",
    components: {
      Identity: {
        name: "pan",
        description: `Encrusted with ancient supper remains.`,
      },
      Portable: {},
    },
  },
  {
    // world.yaml:391-393
    id: "entity:item_knife",
    components: {
      Identity: {
        name: "knife",
        description: `It's duller than a bag of rocks.`,
      },
      Portable: {},
    },
  },
  {
    // world.yaml:394-397
    id: "entity:item_quarters",
    components: {
      Identity: {
        name: "quarters",
        description: `A small pile of quarters. I didn't say they were clean. Does George Washington look a little green to you?`,
      },
      Portable: {},
      ItemStats: { amount: 2.25 },
    },
  },
  // pantry
  {
    // world.yaml:405-420. Disposition (a) — DECISION-LOG.md row 8:
    // Toggle{on} replaces the `var.power_on` flip; `on: false` is the
    // pack's initial state (matches legacy's implicit first-toggle-to-
    // true behavior — see items.py's `var` closure convention).
    // Interactable.prompt re-expressed from the func's "turning on"
    // branch (world.yaml:418).
    id: "entity:item_flashlight",
    components: {
      Identity: {
        name: "flashlight",
        description: `An old flashlight, flickering occasionally.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You flick the switch, give it a smack, and the flashlight comes on.`,
        verb: "toggle",
      },
      Toggle: { on: false },
    },
  },
  {
    // world.yaml:421-424
    id: "entity:item_moldy_bread",
    components: {
      Identity: {
        name: "moldy bread",
        description: `Green fuzz covers the crust. Could be penicillin... or death.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You swallow a chunk. The taste is indescribable. You feel a bit funny, but you're not sure if it's the bread or the situation.`,
        verb: "eat",
      },
    },
  },
  // basement
  {
    // world.yaml:431-433 — also door_basement_door's key.
    id: "entity:item_basement_key",
    components: {
      Identity: {
        name: "basement key",
        description: `Looks like it might unlock something else around here.`,
      },
      Portable: {},
    },
  },
  {
    // world.yaml:434-436
    id: "entity:item_old_tapestry",
    components: {
      Identity: {
        name: "old tapestry",
        description: `A faded tapestry that depicts a knight fighting a dragon. The knight is losing. Badly. It's a bit sad, but also kind of funny. You start cheering for the dragon, but then you remember you're a human and you're supposed to like the knight. You feel conflicted.`,
      },
      Portable: {},
    },
  },
  {
    // world.yaml:437-439
    id: "entity:item_rope",
    components: {
      Identity: {
        name: "rope",
        description: `A sturdy rope. Maybe 10 feet long.`,
      },
      Portable: {},
    },
  },
  // library
  {
    // world.yaml:448-459. Disposition (a)+(b) — DECISION-LOG.md row 9:
    // OnUse{clearFact,when} replaces the `if hasattr(player,'mutant')`
    // branch; `clearFact` only fires when `when` holds (mirrors
    // `delattr(player, 'mutant')` only running in that branch). The
    // `news.publish(...)` call is DROPPED (same as paintbrush/hotdog).
    id: "entity:item_antidote_potion",
    components: {
      Identity: {
        name: "antidote potion",
        description: `A mysterious potion labeled 'Drink In Case of Mutancy'.`,
      },
      Portable: {},
      Interactable: { prompt: `*sip*`, verb: "drink" },
      OnUse: { clearFact: "mutant", when: { fact: "mutant" } },
    },
  },
  {
    // world.yaml:461-465
    id: "entity:item_ancient_scroll",
    components: {
      Identity: {
        name: "ancient scroll",
        description: `A scroll with cryptic runes. Might hold a secret.`,
      },
      Portable: {},
      Interactable: { prompt: `Glowing letters briefly light up, then fade away.`, verb: "read" },
    },
  },
  // secret study
  {
    // world.yaml:472-474 — also door_tower_door's key.
    id: "entity:item_tower_key",
    components: {
      Identity: {
        name: "tower key",
        description: `A key with a tower-shaped head.`,
      },
      Portable: {},
    },
  },
  {
    // world.yaml:475-479
    id: "entity:item_dusty_journal",
    components: {
      Identity: {
        name: "dusty journal",
        description: `Leather-bound notes on local legends.`,
      },
      Portable: {},
      Interactable: { prompt: `Each page crackles with age as you learn about ancient secrets.`, verb: "read" },
    },
  },
  // garden
  {
    // world.yaml:486-488
    id: "entity:item_gold_flower",
    components: {
      Identity: {
        name: "gold flower",
        description: `An odd golden flower that smells a bit like pee.`,
      },
      Portable: {},
    },
  },
  {
    // world.yaml:489-493
    id: "entity:item_hose",
    components: {
      Identity: {
        name: "hose",
        description: `A very drippy old hose with foul-smelling water.`,
      },
      Portable: {},
      Interactable: {
        prompt: `You guzzle brown stuff, telling yourself it's chocolate milk. It's not, but in your mind, it's deliciously gritty.`,
        verb: "drink",
      },
    },
  },
  // tower
  {
    // world.yaml:500-504
    id: "entity:item_doorbell",
    components: {
      Identity: {
        name: "doorbell",
        description: `A doorbell that looks like it's never been rung.`,
      },
      Portable: {},
      Interactable: { prompt: `*RAAAWWWRRR*`, verb: "ring" },
    },
  },
  // tower stairs
  {
    // world.yaml:511-531 (takeable: false). Disposition (c) —
    // DECISION-LOG.md row 10: the func's AICharacter ("spider") summon/
    // rewrite-in-place/`player.register_watcher` wiring is DROPPED
    // wholesale (AICharacter is never ported, DELTA:360); the item
    // survives as passive scenery with its own use_msg as prompt.
    // Eatable, no explicit `verb:` -> default "eat" (items.py:86).
    id: "entity:item_spiderweb",
    components: {
      Identity: {
        name: "spiderweb",
        description: `A big, hairy spiderweb. It's sticky and gross.`,
      },
      Interactable: {
        prompt: `You pop the spiderweb into your mouth. It's sticky and gross, but you manage to swallow it. You wonder if you'll get superpowers now. Probably not. I think you just made the spider mad. He was so chill, too.`,
        verb: "eat",
      },
    },
  },
  // balcony
  {
    // world.yaml:538-546 (takeable: false). Disposition (c) —
    // DECISION-LOG.md row 11: the func's `OpenAIClient.oneoff_prompt`
    // call is DROPPED wholesale (AI-authority over world content is
    // never ported — doctrine #4/#7); the item survives with only its
    // static use_msg as prompt, no generated continuation.
    id: "entity:item_binoculars",
    components: {
      Identity: {
        name: "binoculars",
        description: `A pair of binoculars. You can see even farther.`,
      },
      Interactable: {
        prompt: `You scan the horizon, spying on the neighbors:`,
        verb: "use",
      },
    },
  },
  // ── keys/artifacts not present in any room in world.yaml — conjured at
  // runtime in legacy, so they are pack content but not initial room
  // placement (no Contains reference points at these two).
  {
    // world.yaml:610 — the wizard's reward, conjured by his func (see
    // entity:char_wizard's Spawns below). Also door_back_door's key.
    id: "entity:item_odd_key",
    components: {
      Identity: {
        name: "odd key",
        description: `A swirling runic key conjured by the wizard. It glows slightly.`,
      },
      Portable: {},
    },
  },
];

// ── Characters (4 kept of 9; 5 AICharacters omitted by type) ────────────
// world.yaml:580-841. bartender (:633-705), carl (:721-725), old man
// (:727-732), spider (:734-783), and alchemist (:785-790) are ALL
// `type: AICharacter` — omitted entirely per DELTA:360 (AI-authority over
// world content/characters is never ported) and DECISION-LOG.md's
// AICharacter section. No entities exist for them in this pack.

const CHARACTER_DEFS = [
  {
    // world.yaml:581-622. Disposition (a) — DECISION-LOG.md row 12 (the
    // wizard survivor): Knowledge{knows} lists the facts his original
    // func branched on; Interactable is a single twin-stub greeting
    // (world.yaml:619) replacing the full branching monologue (dropped —
    // that is golem/prose territory, not content); Spawns{when,entity}
    // keeps the one mechanically meaningful outcome, the odd-key
    // handoff (world.yaml:601-613). Fact keys `has_rare_mushroom`/
    // `wizard_gave_key` are DELIBERATE RENAMES of legacy's own
    // `has_mushroom` (local var, "player holds the mushroom right now")
    // vs `var.has_mushroom` (session flag, "wizard already paid out") —
    // legacy overloads one name for two different things; re-expressing
    // func:/condition: never requires literal string reuse (see this
    // file's header comment), and reusing the same name here would be a
    // strictly worse, actively confusing choice.
    id: "entity:char_wizard",
    components: {
      Identity: {
        name: "wizard",
        description: `An eccentric wizard with a long beard and glittering eyes. He seems both wise and scatterbrained. But mostly ego-driven.`,
      },
      Knowledge: { knows: ["mutant", "potion_insight", "mushroom_insight"] },
      Interactable: {
        prompt: `The wizard peers at you with a sour twinkle in his eye, as you factor into his plans. He calls to you, "Greetings! I sense you have potential. But first, I must ask you to prove your worth. Bring me a rare mushroom, and we shall speak further."`,
        verb: "talk",
      },
      Spawns: {
        when: {
          all: [{ fact: "has_rare_mushroom" }, { not: { fact: "wizard_gave_key" } }],
        },
        entity: { $ref: "entity:item_odd_key" },
      },
    },
  },
  {
    // world.yaml:624-631 — WalkerCharacter, ambient, ashore only Identity
    // per DECISION-LOG.md.
    id: "entity:char_stray_dog",
    components: {
      Identity: {
        name: "stray dog",
        description: `A hungry-looking stray dog that noses around for scraps.`,
      },
    },
  },
  {
    // world.yaml:707-712
    id: "entity:char_raven",
    components: {
      Identity: {
        name: "raven",
        description: `A glossy-feathered raven hopping about, cawing cryptically.`,
      },
    },
  },
  {
    // world.yaml:714-719
    id: "entity:char_cat",
    components: {
      Identity: {
        name: "cat",
        description: `There's a sleek, black cat.`,
      },
    },
  },
];

export const ENTITY_DEFS = [...ROOM_DEFS, ...DOOR_DEFS, ...ITEM_DEFS, ...CHARACTER_DEFS];
