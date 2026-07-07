#!/usr/bin/env node
/* ── bin/play.mjs — the ONE TTY surface for the adventure GameModule
   (DELTA A3 PR2). Deliberately thin and UNTESTED (design spec: "a thin
   imported-content/adventure/bin/play.mjs (node:readline) is the only
   TTY surface"): every real decision (tokenizing, grounding, calling
   validate/reduce, narrating the twin) lives in @golem-engine/clients'
   createTerminalSession (packages/clients/src/terminal.js), which
   headless tests already exercise directly. This file only wires
   stdin/stdout to that pure session.

   Usage: node imported-content/adventure/bin/play.mjs [seed] */
import readline from "node:readline";
import { createTerminalSession } from "@golem-engine/clients";
import { compileContentPack } from "../content/build-pack.mjs";
import { deriveWorld, createState, module } from "../module/module.js";

const result = compileContentPack();
if (!result.ok) {
  console.error("adventure content pack failed to compile:");
  console.error(JSON.stringify(result.errors, null, 2));
  process.exit(1);
}

const seed = process.argv[2] || "adventure-terminal";
const world = deriveWorld({}, result.pack);
const state = createState(world);
const session = createTerminalSession({ module, world, state, seed });

for (const line of session.render()) console.log(line);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "\n> " });
rl.prompt();
rl.on("line", (line) => {
  for (const out of session.submit(line)) console.log(out);
  rl.prompt();
});
rl.on("close", () => {
  console.log("\nGoodbye.");
  process.exit(0);
});
