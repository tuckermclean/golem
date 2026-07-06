#!/usr/bin/env node
/* ── tools/lang/parse-cli.mjs — the Python↔Node grounding bridge (L3
 * design decision #4). `validate.py` shells out to this ONE process per
 * validation run (batched: many requests in, many responses out) so
 * command-grounding for tasks B/E/F is checked by the REAL
 * @golem-engine/language `parse()`/`route()` — never reimplemented in
 * Python.
 *
 * Stateless, one JSON request object per input line, one JSON response
 * object per output line, same order, matched by "id". No
 * Math.random/Date.now — nothing here is randomized (tools/check-bans.mjs
 * scans this file, the L2 tools/lang obligation extended to all of
 * tools/ per L3 decision #10).
 *
 * Request shape:
 *   {"id": "...", "mode": "route"|"parse"|"decompose",
 *    "utterance": "...",              // route/parse
 *    "segments": ["...", "..."],      // OR let decompose split "utterance" itself
 *    "affordances": [{"verb","target","name","aliases":[...]}]}
 *
 * Response shape (route/parse):
 *   {"id", "ok", "reason", "cmd", "intent"}
 * Response shape (decompose):
 *   {"id", "ok", "reason", "cmds", "segments"}
 */
import { readFileSync } from "node:fs";
import { parse, route } from "../../packages/language/dist/index.js";

// Training-corpus wire-command convention (mirrored EXACTLY in
// tools/harvest.js's slug()/targetId() — see that file's header
// comment): item args are underscore-joined ("take green_coin"), NOT
// the live game's own space-joined arg convention. Affordance `target`
// ids are authored by harvest.js as "<kind>/<slug>@<x>,<y>".
function itemSlugFromTarget(target) {
  const afterSlash = target.includes("/") ? target.split("/")[1] : target;
  return afterSlash.split("@")[0];
}

function serializeWireCmd(intent) {
  switch (intent.type) {
    case "move":
      return `move ${intent.dx} ${intent.dy}`;
    case "take":
      return intent.item ? `take ${itemSlugFromTarget(intent.item)}` : "take";
    case "look":
      return intent.target ? `look ${itemSlugFromTarget(intent.target)}` : "look";
    case "read":
      return "read";
    case "say":
      return `say ${intent.text}`.trimEnd();
    case "party":
      return `party ${intent.text}`.trimEnd();
    case "whisper":
      return `whisper ${intent.to} ${intent.text}`.trimEnd();
    case "emote":
      return `emote ${intent.text}`.trimEnd();
    default:
      return null;
  }
}

// Conservative compound-utterance splitter (L3 design decision #6): a
// small authored connective set, longest-first so "and then" isn't cut
// by a bare "and" match first. Deterministic, no NLP.
const CONNECTIVES = [" and then ", " then ", " and ", ", ", "; "];

function splitSegments(utterance) {
  for (const conn of CONNECTIVES) {
    if (utterance.includes(conn)) {
      return utterance
        .split(conn)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [utterance.trim()];
}

function handleRoute(req, fn) {
  const affordances = req.affordances || [];
  const result = fn(req.utterance, { affordances });
  if (!result.ok) {
    return { id: req.id, ok: false, reason: result.reason, cmd: null, intent: null };
  }
  return { id: req.id, ok: true, reason: null, cmd: serializeWireCmd(result.intent), intent: result.intent };
}

// "Thread a simulated affordance list forward between segments" (task E
// design): once an item is taken, drop its affordance before routing the
// next segment — mirroring what a real player experiences turn to turn.
function dropGroundedAffordance(affordances, intent) {
  if (intent.type !== "take" || !intent.item) return affordances;
  return affordances.filter((a) => a.target !== intent.item);
}

function handleDecompose(req) {
  const segments = req.segments && req.segments.length ? req.segments : splitSegments(req.utterance || "");
  let affordances = req.affordances || [];
  const cmds = [];
  for (let i = 0; i < segments.length; i++) {
    const result = route(segments[i], { affordances });
    if (!result.ok) {
      return { id: req.id, ok: false, reason: `segment-ungrounded:${i}:${result.reason}`, cmds: null, segments };
    }
    cmds.push(serializeWireCmd(result.intent));
    affordances = dropGroundedAffordance(affordances, result.intent);
  }
  return { id: req.id, ok: true, reason: null, cmds, segments };
}

function handleLine(line) {
  if (!line.trim()) return null;
  const req = JSON.parse(line);
  switch (req.mode) {
    case "parse":
      return handleRoute(req, parse);
    case "decompose":
      return handleDecompose(req);
    case "route":
    default:
      return handleRoute(req, route);
  }
}

function main() {
  const args = process.argv.slice(2);
  const inIdx = args.indexOf("--in");
  const text = inIdx !== -1 ? readFileSync(args[inIdx + 1], "utf8") : readFileSync(0, "utf8");
  const out = [];
  for (const line of text.split("\n")) {
    const res = handleLine(line);
    if (res) out.push(JSON.stringify(res));
  }
  process.stdout.write(out.join("\n") + (out.length ? "\n" : ""));
}

main();
