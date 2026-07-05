/* ── THEMES: the history layer. Key order is load-bearing: theme choice
   is pick(rng, Object.keys(THEMES)). Reordering = worldgen MAJOR bump. ── */
export const THEMES={
  drowned_monastery:{label:"the drowned monastery",prize:"the Quiet Bell",
    loot:["wax stub","offering bowl","salt-crusted rosary","verdigris censer"],
    mob:"pale eel",adjs:["water-stained","hushed","candle-blackened","weeping"],
    lore:["The Order of the Quiet Bell raised these halls over the spring, {A}.",
          "They began ringing the bell for the living, {A}. The water listened.",
          "The drowned came up the cistern stair to answer the last ringing, {A}."],
    loreSlots:["to count the hours of the dead","in the wet year","when the abbot went below",
               "against all writ","and none forbade it"]},
  salt_counting_house:{label:"the salt counting house",prize:"the Final Ledger",
    loot:["green coin","cracked seal","brass stylus","tally stick"],
    mob:"clerk-thing",adjs:["ledger-lined","dust-dry","ink-stained","airless"],
    lore:["The Counting House was dug deep to keep the salt-debts cool, {A}.",
          "The clerks began recording debts before they were owed, {A}.",
          "On the last page someone wrote a sum that has not finished being paid, {A}."],
    loreSlots:["by royal writ","in the ninth audit","against the factor's word",
               "the year of the short harvest","and sealed it twice"]},
  deep_mine:{label:"the deep mine",prize:"the First Lode",
    loot:["slag ingot","cold lantern","split pick-haft","vein of fool's gold"],
    mob:"ember wisp",adjs:["soot-caked","props-groaning","hot-aired","narrow"],
    lore:["They followed the seam down past the marked depth, {A}.",
          "The foreman ordered the singing shaft sealed, {A}. Digging continued.",
          "What they struck at the bottom struck back, {A}."],
    loreSlots:["against the surveyor's oath","in the dry season","for the third charter",
               "when the canaries went quiet","and told no one above"]},
};
export const TONE_LINE={
  ominous:["Something here does not want company.","The dark has a texture, like held breath."],
  still:["Nothing has moved here for a very long time.","Your footsteps sound apologetic."],
  cold:["The cold gets into your teeth.","Breath hangs before you like a small ghost."],
  watchful:["You have the strong sense of being counted.","Attention turns toward you, somewhere."]};
export const TONES=Object.keys(TONE_LINE);
export const ROOM_KINDS=["hall","gallery","vault","stairwell","chapel","store"];
