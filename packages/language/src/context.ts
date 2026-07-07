/* ── NPC CONTEXT COMPILER (L7 — see docs/superpowers/specs/
 * 2026-07-07-l7-context-compiler-design.md): engine state -> truth
 * envelope -> bounded reply. VISION's charter sentence: "NPC memory
 * lives in engine state; a deterministic context compiler decides what
 * the twin may know per turn." Law 5: the model "may not assert facts"
 * — it owns no truth. This module is the deterministic gate that makes
 * that enforceable; it is pure, stateless, and identity-blind, exactly
 * like ground.ts next to it.
 *
 * Facts are opaque lowercase slug tokens (the one real precedent in the
 * repo: tools/harvest.js's Task D KNOWS/DOESNT_KNOW vocabulary) — no
 * rich fact object is invented here, so a future twin never has to
 * learn two incompatible encodings.
 *
 * Kernel-type decision (resolved by the design doc): structurally
 * duplicate the `@golem-engine/kernel` `Knowledge` component's
 * `{knows: readonly string[]}` shape rather than importing it — this
 * package stays dependency-light (matches the `Affordance` idiom in
 * ground.ts: the caller shapes its own data, packages/language never
 * hardcodes any game's fact space). ─────────────────────────────────── */
import { channel, pick } from "@golem-engine/random";

/** One event the NPC has personally witnessed, already bounded/sliced
 *  by the caller — this module never reads an event log itself. */
export interface WitnessedEvent {
  readonly seq: number;
  readonly t: string; // event kind, kernel Event.t vocabulary
  readonly summary: string; // pre-slugged fact token(s), NOT the raw payload
}

/** The deterministic compiler's output: everything — and ONLY
 *  everything — an NPC's reply may draw on for one turn. `relationship`/
 *  `questState` ship shape-only (no relationship/quest system exists
 *  yet); their presence satisfies the DoD's category list without
 *  faking live population. */
export interface TruthEnvelope {
  readonly knows: readonly string[]; // fact tokens the NPC MAY assert
  readonly doesNotKnow: readonly string[]; // closed-world complement; for negative
  // testing/training only — never rendered positively
  readonly relationship?: Readonly<Record<string, unknown>>; // shape-only stub (no system yet)
  readonly questState?: Readonly<Record<string, unknown>>; // shape-only stub (no system yet)
  readonly recentEvents: readonly WitnessedEvent[]; // caller-supplied, already bounded
}

/** Dedupe + stabilize a token list, preserving first-occurrence order
 *  (NOT sorted — "order-stable" per the design doc's Test plan #3, i.e.
 *  a deterministic function of input order, not an independent sort). */
function normalizeTokens(tokens: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** compileEnvelope: the deterministic gate. Same inputs -> deep-equal,
 *  referentially-fresh output; no RNG, no clock, no module-level state.
 *  `knows` is normalized from (and therefore always a subset of)
 *  `npcKnowledge.knows` — the compiler can never invent a fact.
 *  `doesNotKnow` is `factUniverse` minus `knows`, order-stable over
 *  `factUniverse`'s own order — a closed-world complement over the
 *  caller-supplied universe (this package never hardcodes any game's
 *  fact space). */
export function compileEnvelope(
  npcKnowledge: { readonly knows: readonly string[] },
  factUniverse: readonly string[],
  recentEvents: readonly WitnessedEvent[] = [],
  relationship?: Readonly<Record<string, unknown>>,
  questState?: Readonly<Record<string, unknown>>,
): TruthEnvelope {
  const knows = normalizeTokens(npcKnowledge.knows);
  const knowsSet = new Set(knows);
  const doesNotKnow = normalizeTokens(factUniverse).filter((t) => !knowsSet.has(t));

  const envelope: TruthEnvelope = {
    knows,
    doesNotKnow,
    recentEvents: recentEvents.map((e) => ({ seq: e.seq, t: e.t, summary: e.summary })),
  };
  if (relationship !== undefined) (envelope as { relationship?: Readonly<Record<string, unknown>> }).relationship = relationship;
  if (questState !== undefined) (envelope as { questState?: Readonly<Record<string, unknown>> }).questState = questState;
  return envelope;
}

/** envelopeToControlString: the "NPC reply prompt" IS a control string
 *  in L3's exact Task D `KEY:VALUE` space-joined format (tools/
 *  harvest.js's `controlString()`/`taskDRow()`), so a future twin never
 *  learns two incompatible encodings. Matched field-for-field against
 *  harvest.js's Task D emission: `TASK:D`, `KNOWS:<+-joined tokens or
 *  "none">`, `DOESNT_KNOW:<+-joined tokens or "none">`, then this
 *  compiler's own `TOPIC`/`QUESTION` (harvest.js's Task D also carries
 *  a THEME field, but that's a golem-grid worldgen concept this
 *  game-agnostic package never touches — see the design doc's worked
 *  example, which omits THEME for the same reason).
 *
 *  Built ONLY from envelope.knows/envelope.doesNotKnow/topic/question —
 *  never from the raw factUniverse or the event log. `KNOWS` is
 *  *defined as* `envelope.knows.join("+")`, so it is by construction
 *  bounded to what the compiler decided the NPC knows — the structural
 *  half of "never contains a fact outside the envelope." */
export function envelopeToControlString(envelope: TruthEnvelope, topic: string, question: string): string {
  const fields: ReadonlyArray<readonly [string, string]> = [
    ["TASK", "D"],
    ["KNOWS", envelope.knows.length ? envelope.knows.join("+") : "none"],
    ["DOESNT_KNOW", envelope.doesNotKnow.length ? envelope.doesNotKnow.join("+") : "none"],
    ["TOPIC", topic],
    ["QUESTION", question],
  ];
  return fields.map(([k, v]) => `${k}:${v}`).join(" ");
}

/* ── stub renderer (twin is infra-blocked; VISION law 10) ─────────────
 * A small authored line-bank, keyed ONLY by envelope.knows tokens —
 * never envelope.doesNotKnow — so no template can leak a fact outside
 * the envelope by construction, independent of any test. Matches
 * main.js's proseFor/roomBeat idiom: deterministic per-call selection
 * via @golem-engine/random's channel(), no Math.random/Date.now. */
const KNOWN_LINES: ReadonlyArray<(knows: readonly string[], topic: string) => string> = [
  (knows, topic) => `On the matter of ${topic}, I can tell you this: ${knows.join(", ")}.`,
  (knows, topic) => `What I know of ${topic}: ${knows.join(", ")}. That's the whole of it.`,
  (knows) => `I've seen ${knows.join(" and ")}, and no more than that.`,
];

const UNKNOWN_LINES: ReadonlyArray<(topic: string) => string> = [
  (topic) => `I couldn't say. Nothing about ${topic} has reached me.`,
  () => "That's beyond what I know.",
  (topic) => `I have no answer for you about ${topic}.`,
];

/** renderStubReply: deterministic template selection, seeded via
 *  channel(seed, "npc", npcId, topic, ...envelope.knows) — the channel
 *  key is drawn only from the envelope's knows tokens (plus the fixed
 *  seed/npcId/topic identifiers), never from doesNotKnow or the free-
 *  form `question` text, so selection is stable per (seed, npc, topic,
 *  what-the-npc-knows) and never a function of anything outside the
 *  envelope. */
export function renderStubReply(
  envelope: TruthEnvelope,
  topic: string,
  question: string,
  seed: string,
  npcId: string,
): string {
  void question; // accepted for signature parity / future use; never fed into selection or text
  const g = channel(seed, "npc", npcId, topic, ...envelope.knows);
  if (envelope.knows.length === 0) {
    return pick(g, UNKNOWN_LINES)(topic);
  }
  return pick(g, KNOWN_LINES)(envelope.knows, topic);
}
