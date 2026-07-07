/* ── TERMINAL SESSION (DELTA A3 PR2 — docs/superpowers/specs/
 * 2026-07-07-a3-pr2-module-terminal-design.md's "The terminal client").
 * Pure, headless-testable text-adventure front end over ANY GameModule
 * whose Cmd shape is `{verb, noun}` and whose observe()/affordances()
 * hooks follow the adventure module's own Obs/Affordance shapes
 * (packages/kernel's canonical Affordance — {verb,target,name,enabled,
 * reason?}). No `process.stdin`/readline here (that is
 * imported-content/adventure/bin/play.mjs's one, untested, TTY-only
 * job) and no browser/DOM either — this file is plain string logic, the
 * same "I/O at the edges" split games/some-hero's host.js/module.js
 * pairing documents for its own kernel: `createTerminalSession` owns a
 * local mutable `state` (like a single-player host loop would) and
 * turns free-text lines into validate()->reduce() calls, but never
 * touches a socket, a file, or a DOM node itself.
 *
 * ── The ONE alias table (deliberately not @golem-engine/language's
 * CanonicalVerb) ──
 * The adventure GameModule's own `validate(ctx,cmd)` only ever accepts
 * SIX canonical verbs: go/take/drop/use/look/talk (imported-content/
 * adventure/module/module.js). Every other adventure-flavored surface
 * word a player might type (eat/drink/light/read/lick/wear/remove/pet/
 * catch/toss/swing/listen/watch/flush/ring/open/toggle/examine/...) is
 * folded down to one of those six HERE, once, by `VERB_ALIASES` below —
 * this is the "small adventure-local verb-alias table" the design spec
 * calls for, and it is intentionally NOT an extension of
 * @golem-engine/language's closed CanonicalVerb union (that package's
 * vocabulary is a different, general-purpose closed set; this table is
 * local surface-word collapsing for one game's own six-verb grammar). */
import { compileEnvelope, renderStubReply } from "@golem-engine/language";

const VERB_ALIASES = {
  go: "go",
  move: "go",
  walk: "go",
  head: "go",
  enter: "go",
  take: "take",
  get: "take",
  grab: "take",
  pick: "take",
  drop: "drop",
  leave: "drop",
  put: "drop",
  look: "look",
  examine: "look",
  l: "look",
  x: "look",
  talk: "talk",
  speak: "talk",
  chat: "talk",
  // Every remaining Interactable.verb the content pack authors, plus
  // common English synonyms of the same physical action, all collapse
  // to the module's generic "use" verb (module.js's own "use" case is
  // driven entirely by the target item's OnUse/Toggle/Interactable
  // component data, never by which surface word got typed).
  use: "use",
  eat: "use",
  drink: "use",
  light: "use",
  read: "use",
  lick: "use",
  wear: "use",
  remove: "use",
  pet: "use",
  catch: "use",
  toss: "use",
  swing: "use",
  listen: "use",
  watch: "use",
  flush: "use",
  ring: "use",
  open: "use",
  toggle: "use",
  inspect: "use",
};

function resolveVerb(word) {
  return VERB_ALIASES[word.toLowerCase()];
}

// Region slugs are the underscored form of a room's own display name
// (e.g. "forest_road" / "forest road") — treat "_" as a word separator
// so a typed region id ("go forest_road") grounds the same as its
// display name ("go forest road") would.
function normalize(s) {
  return String(s).toLowerCase().replace(/_/g, " ").trim();
}

/** A small local noun scorer — grounds a free-text phrase against a
 *  candidate list of `{id, name}` (observe()'s own item/exit/npc/
 *  inventory shape). Exact name match scores highest, then substring
 *  containment either direction, then word-overlap; anything scoring 0
 *  is "no match" (the caller returns a helpful denial). This is NOT
 *  @golem-engine/language's ground.ts (that package's grounding is a
 *  general Affordance-list scorer with its own aliasing rules this
 *  package deliberately does not import — see this file's header). */
function scoreMatch(nounPhrase, candidateName) {
  const n = normalize(nounPhrase);
  const c = normalize(candidateName || "");
  if (!n || !c) return 0;
  if (n === c) return 100;
  if (c.includes(n)) return 80;
  if (n.includes(c)) return 70;
  const nWords = new Set(n.split(/\s+/));
  const overlap = c.split(/\s+/).filter((w) => nWords.has(w)).length;
  return overlap > 0 ? 40 + overlap * 10 : 0;
}

function groundNoun(nounPhrase, candidates) {
  let best = null;
  let bestScore = 0;
  for (const cand of candidates) {
    const s = scoreMatch(nounPhrase, cand.name || cand.id);
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }
  return bestScore > 0 ? best : null;
}

function describeEvent(ev, target) {
  switch (ev.t) {
    case "MOVED":
      return `You go to ${target.name || target.id}.`;
    case "TOOK":
      return `You take the ${target.name || target.id}.`;
    case "DROPPED":
      return `You drop the ${target.name || target.id}.`;
    case "USED":
      return `You use the ${target.name || target.id}.`;
    case "TOGGLED":
      return ev.on ? `The ${target.name || target.id} is now on.` : `The ${target.name || target.id} is now off.`;
    case "SPAWNED":
      return `Something new has appeared.`;
    default:
      return `OK.`;
  }
}

/** createTerminalSession({module, world, state, seed}) → {render,
 *  submit}. `module` is the full adventure GameModule (deriveWorld/
 *  validate/reduce/observe/affordances/narrativeFacts); `world`/`state`
 *  are already-derived World/State values (the caller — bin/play.mjs or
 *  a test — owns createState()/deriveWorld() itself, this function just
 *  drives them); `seed` is the twin's deterministic-selection seed
 *  (@golem-engine/language's renderStubReply). */
export function createTerminalSession({ module, world, state, seed }) {
  let current = state;

  function render() {
    const obs = module.observe(current, world);
    const lines = [obs.description];
    if (obs.items.length) lines.push(`You see: ${obs.items.map((i) => i.name).join(", ")}.`);
    if (obs.npcs.length) lines.push(`Also here: ${obs.npcs.map((n) => n.name).join(", ")}.`);
    const menu = module.affordances({ state: current, world }, "player");
    lines.push("You can:");
    for (const a of menu) {
      const suffix = a.enabled === false ? ` (${a.reason || "not available"})` : "";
      lines.push(`  ${a.verb} ${a.name}${suffix}`);
    }
    return lines;
  }

  function narrateTalk(npcTarget, question) {
    const npc = world.npcs && world.npcs[npcTarget.id];
    const knowledge = (npc && npc.knowledge) || { knows: [] };
    const factUniverse = world.factUniverse || [];
    const envelope = compileEnvelope(knowledge, factUniverse);
    return renderStubReply(envelope, (npc && npc.name) || npcTarget.id, question, seed, npcTarget.id);
  }

  function submit(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) return ["I didn't catch that."];

    const [verbWord, ...rest] = trimmed.split(/\s+/);
    const nounPhrase = rest.join(" ");
    const verb = resolveVerb(verbWord);
    if (!verb) return [`I don't know how to "${verbWord}".`];
    if (verb === "look") return render();

    const obs = module.observe(current, world);
    let candidates;
    if (verb === "go") candidates = obs.exits.map((e) => ({ id: e.to, name: e.name || e.to }));
    else if (verb === "take") candidates = obs.items;
    else if (verb === "drop") candidates = obs.inventory;
    else if (verb === "talk") candidates = obs.npcs;
    else candidates = [...obs.items, ...obs.inventory]; // "use"

    if (!nounPhrase) return [`${verb} what?`];
    const target = groundNoun(nounPhrase, candidates);
    if (!target) return [`I don't see "${nounPhrase}" here.`];

    const result = module.validate({ state: current, world, seed }, { verb, noun: target.id });
    if (!Array.isArray(result)) return [result.deny];

    const lines = [];
    for (const ev of result) {
      const stamped = { ...ev, seq: current.seq + 1 };
      current = module.reduce(current, world, stamped);
      lines.push(describeEvent(stamped, target));
    }

    if (verb === "talk") {
      lines.push(narrateTalk(target, nounPhrase));
    }
    if (verb === "go" && result.length) {
      lines.push(...render());
    }

    return lines;
  }

  return { render, submit };
}
