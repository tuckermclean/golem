#!/usr/bin/env node
/* ── tools/stub_teacher.js — PR1's deterministic STUB teacher (L3
 * design "Decomposition" §PR1 + orchestrator decision #2). Turns
 * harvest.js's control rows into (in, out) training pairs WITHOUT any
 * agent or external API — this is what makes the whole harvest ->
 * teacher -> validate -> stats pipeline runnable end-to-end in CI.
 *
 * Task A reuses golem-grid's own ▶GOLEM-PLUG◀ template shape
 * (THEMES/TONE_LINE from games/golem-grid/shared/themes.js — the same
 * tables src/main.js's roomBeat/proseFor draw from) since it's already
 * pure and channel-seeded. Tasks B-F use simple, deterministic template
 * fillers that mechanically reverse the ground-truth answer into a
 * natural-enough phrase — clearly smoke data, not training data (PR1's
 * own scope note): a real teacher (agent or external API) is PR2's job.
 *
 * No Math.random/Date.now — every choice is channel(seed, "stub", ...)
 * seeded (tools/check-bans.mjs scans this file).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { channel, pick } from "@golem-engine/random";
import { THEMES, TONE_LINE } from "../games/golem-grid/shared/themes.js";

function parseArgs(argv) {
  const a = { in: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--in") a.in = argv[++i];
    else if (argv[i] === "--out") a.out = argv[++i];
  }
  if (!a.in || !a.out) {
    console.error("usage: stub_teacher.js --in controls.jsonl --out raw.jsonl");
    process.exit(1);
  }
  return a;
}

function unslug(s) {
  return s.replace(/_/g, " ");
}

/** Generalized control-string field parser (L3 design decision #4's
 * counterpart on the JS side): a value runs from immediately after
 * "KEY:" up to the next recognized "KEY:" token or end of string. This
 * (unlike tools/validate.py's original task-A-only `parse_control`,
 * which is a naive space-split and stays untouched for backward
 * compatibility) supports free-text fields with embedded spaces
 * (QUESTION/ANTECEDENT_TEXT) — needed by tasks B-F's control strings. */
export function parseFields(control) {
  const re = /([A-Z][A-Z0-9_]*):/g;
  const matches = [...control.matchAll(re)];
  const fields = {};
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1];
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : control.length;
    fields[key] = control.slice(start, end).trim();
  }
  return fields;
}

// ── Task A: facts -> prose (reuses THEMES/TONE_LINE verbatim) ─────────
function stubProseA(row) {
  const f = parseFields(row.control);
  const g = channel(row.seed, "stub", row.task, row.id);
  const T = THEMES[f.THEME] || Object.values(THEMES)[0];
  const items = f.ITEMS && f.ITEMS !== "none" ? f.ITEMS.split("+").map(unslug) : [];
  const mob = f.MOB && f.MOB !== "none" ? unslug(f.MOB) : null;
  const bits = [];
  switch (f.EVENT) {
    case "look":
    case "move":
    case "join":
      bits.push(`A ${pick(g, T.adjs)} ${f.ROOM || "room"}.`);
      if (f.TONE && TONE_LINE[f.TONE]) bits.push(pick(g, TONE_LINE[f.TONE]));
      for (const it of items) bits.push(`A ${it} rests nearby.`);
      if (mob) bits.push(`A ${mob} watches from the edge of the light.`);
      break;
    case "take":
      bits.push(`You take the ${items[0] || "thing"}.`);
      break;
    case "take_prize":
      bits.push(`You lift ${T.prize}. It is heavier than it looks.`);
      break;
    case "read":
      bits.push("You read the old words. They are hard to place.");
      break;
    case "win":
      bits.push("Up the last stair and out, into daylight.");
      break;
    case "lose":
      bits.push("The last light goes out. It is very dark now.");
      break;
    case "light_warn":
      bits.push("The light is thinner than it was a moment ago.");
      break;
    default:
      bits.push("Something happens, quietly.");
  }
  let text = bits.join(" ");
  if (["move", "look", "join"].includes(f.EVENT)) {
    const exits = f.EXITS ? f.EXITS.split(",") : [];
    text += ` Ways out: ${exits.join(", ")}.`;
  }
  return text;
}

// ── Task C: denial -> explanation (small canned per-REASON table) ────
const REASON_LINE = {
  WALL: "Stone does not yield here, whatever you ask of it.",
  NOTHING_HERE: "Your hands find only air and old dust.",
  NO_LORE: "There is nothing carved here for you to read.",
  NO_SUCH_PLAYER: "No one by that name walks with you.",
  UNKNOWN_VERB: "The world has no answer for that word.",
  GAME_OVER: "The delve has already closed its books.",
};
function stubExplanationC(row) {
  const f = parseFields(row.control);
  if (f.REASON === "WRONG_ITEM" && f.ITEMS && f.ITEMS !== "none") {
    return `That is not the ${unslug(f.ITEMS)} you're thinking of, and nothing else waits here.`;
  }
  return REASON_LINE[f.REASON] || "Nothing answers.";
}

// ── Task D: bounded NPC reply (never reads DOESNT_KNOW, by construction) ─
function stubReplyD(row) {
  const f = parseFields(row.control);
  const knows = f.KNOWS && f.KNOWS !== "none" ? f.KNOWS.split("+").map(unslug) : [];
  if (f.TOPIC === "distant") {
    return `I only know what's near me — ${knows[0] || "this place"} is all I can speak to.`;
  }
  return `This is a ${knows[0] || "quiet place"}, so far as I've seen.`;
}

// ── Tasks B/E/F: mechanical utterance-from-answer templates ───────────
const DIR_WORD = { "0,-1": "north", "0,1": "south", "1,0": "east", "-1,0": "west" };

function utteranceForCmd(cmd) {
  const [verb, ...rest] = cmd.split(" ");
  switch (verb) {
    case "move": {
      const [dx, dy] = rest;
      return `go ${DIR_WORD[`${dx},${dy}`] || "on"}`;
    }
    case "take":
      return rest.length ? `take the ${unslug(rest[0])}` : "take whatever is here";
    case "read":
      return "read";
    case "whisper":
      return cmd; // "whisper <to> <text>" is already a valid literal utterance
    default:
      return cmd;
  }
}

function stubUtteranceB(row) {
  return utteranceForCmd(row.groundTruth.cmd);
}
function stubUtteranceE(row) {
  return row.groundTruth.cmds.map(utteranceForCmd).join(" and then ");
}
function stubUtteranceF() {
  return "take it";
}

// ── Assembly: control row -> {task, seed, id, in, out} ────────────────
function buildPair(row) {
  switch (row.task) {
    case "A":
      return { in: row.control, out: stubProseA(row) };
    case "C":
      return { in: row.control, out: stubExplanationC(row) };
    case "D":
      return { in: row.control, out: stubReplyD(row) };
    case "B":
      return { in: `${row.control} UTTERANCE:${stubUtteranceB(row)}`, out: row.groundTruth.cmd };
    case "E":
      return { in: `${row.control} UTTERANCE:${stubUtteranceE(row)}`, out: row.groundTruth.cmds.join("|") };
    case "F":
      return { in: `${row.control} UTTERANCE:${stubUtteranceF(row)}`, out: row.groundTruth.referent };
    default:
      throw new Error(`stub_teacher: unknown task ${row.task}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const lines = readFileSync(args.in, "utf8").split("\n").filter((l) => l.trim());
  const out = [];
  for (const line of lines) {
    const row = JSON.parse(line);
    const { in: pairIn, out: pairOut } = buildPair(row);
    out.push(JSON.stringify({ task: row.task, seed: row.seed, id: row.id, in: pairIn, out: pairOut }));
  }
  writeFileSync(args.out, out.join("\n") + (out.length ? "\n" : ""));
  console.log(`stub_teacher: wrote ${out.length} pairs -> ${args.out}`);
}

main();
