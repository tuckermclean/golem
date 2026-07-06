/* Shared Affordance[] fixture for grounding tests (unit + corpus). A
 * lantern (takeable and lookable, with a "lamp" alias), a stone sign
 * (lookable, an "inscription" per its own alias), a door (lookable),
 * two other players "Aria"/"Bram" (lookable — a generic parser doesn't
 * know golem-grid's lookAt() doesn't currently narrate players by name;
 * that's a golem-grid-adapter concern, not a packages/language one),
 * and — deliberately — two same-verb ("take") items ("rusty sword" /
 * "silver sword") that both substring-match the bare noun "sword", to
 * exercise the ambiguous path (design doc §"Matching algorithm"). */
export const affordances = [
  { verb: "take", target: "lantern", name: "lantern", aliases: ["lamp"] },
  { verb: "look", target: "lantern", name: "lantern", aliases: ["lamp"] },
  { verb: "look", target: "sign", name: "stone sign", aliases: ["sign", "inscription"] },
  { verb: "look", target: "door", name: "door" },
  { verb: "look", target: "aria", name: "Aria" },
  { verb: "look", target: "bram", name: "Bram" },
  { verb: "take", target: "sword-a", name: "rusty sword" },
  { verb: "take", target: "sword-b", name: "silver sword" },
];
