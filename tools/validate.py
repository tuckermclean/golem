#!/usr/bin/env python3
"""Grounding validator: the iron rule, enforced mechanically.

Originally task A only ("facts -> prose"): rejects any (control string ->
prose) pair where the prose implies an exit not in EXITS, names an item
noun not in ITEMS, mentions a creature when MOB:none, omits a listed
item/mob, breaks the exits-line contract, or uses banned register /
exceeds the sentence budget.

L3 PR1 (see docs/superpowers/specs/2026-07-06-l3-data-tools-design.md)
extends this to all six trained tasks. Every extension is "the task-A
grounding check, generalized to a different fact-set and a different
surface form" (the design doc's own framing) — never a new kind of
check, just the iron rule applied to a wider set of facts:

  A: facts -> prose             (original; unchanged)
  B: NL -> command               (must parse+ground to the SAME command)
  C: denial -> explanation       (must not invent/contradict the REASON)
  D: bounded NPC reply           (must not assert DOESNT_KNOW facts)
  E: command decomposition       (each segment must parse+ground in order)
  F: reference resolution        (pronoun must ground to REFERENT)

`task` defaults to "A" for full backward compatibility with existing
raw.jsonl files and with test_validate.py's direct `violations(control,
prose)` calls (still valid, unchanged, as the task-A path).

B/E/F need @golem-engine/language's REAL route()/parse() for grounding —
never reimplemented in Python. tools/lang/parse-cli.mjs is the batching
Python<->Node bridge (L3 design decision #4): one node process handles
every B/E/F row in a validation run, not one process per pair.

Rejected pairs go to quarantine, never to /dev/null: today's rejects are
next week's targeted training batch. At 15M parameters the dataset IS the
model, so this file is, in a real sense, the golem's conscience.
"""
import argparse, json, os, re, subprocess, sys

DIRWORDS = {
    "n": ["north"], "s": ["south"], "e": ["east"], "w": ["west"],
}
CREATURE_HINTS = re.compile(
    r"\b(ghoul|rat|eel|wisp|creature|beast|thing that|something alive)\b", re.I)
BANNED = re.compile(r"\b(eldritch|stygian|cyclopean|miasma|ichor)\b", re.I)
EXITS_LINE = re.compile(r"Ways out: ([nsew](?:, [nsew])*)\.\s*$")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE_SCRIPT = os.path.join(REPO_ROOT, "tools", "lang", "parse-cli.mjs")


def parse_control(c):
    """Task A's original control-string parser: naive space-split
    KEY:VALUE (every task-A field is a single token, so this is exact
    and untouched — the underscore-encoding fix below lives in
    `violations_a`'s matching regex, NOT here, so this function and its
    pinned test_validate.py behavior stay byte-identical)."""
    fields = dict(kv.split(":", 1) for kv in c.split(" ") if ":" in kv)
    items = [] if fields.get("ITEMS", "none") == "none" \
        else fields["ITEMS"].split("+")
    exits = fields.get("EXITS", "").split(",") if fields.get("EXITS") else []
    return fields, items, exits


FIELD_RE = re.compile(r"([A-Z][A-Z0-9_]*):")


def parse_fields(control):
    """Generalized control-string parser for tasks B-F: a value runs
    from immediately after "KEY:" up to the next recognized "KEY:"
    token or end of string. Unlike `parse_control` (task A, naive space
    split), this supports free-text fields with embedded spaces
    (QUESTION/ANTECEDENT_TEXT, natural-language UTTERANCE) — needed
    because tasks B/C/D/E/F's control strings carry those. Single-token
    fields parse identically either way."""
    matches = list(FIELD_RE.finditer(control))
    fields = {}
    for i, m in enumerate(matches):
        key = m.group(1)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(control)
        fields[key] = control[start:end].strip()
    return fields


def parse_afford(afford):
    """AFFORD:<verb:target:name(+alias,alias)*>(;...)* -> Affordance[]
    JSON the bridge/packages/language understands. `target` ids are
    authored by tools/harvest.js as "<kind>/<slug>@<x>,<y>" (no colons
    inside), so a maxsplit=2 on ":" cleanly separates verb/target/rest."""
    if not afford or afford == "none":
        return []
    out = []
    for entry in afford.split(";"):
        verb, target, rest = entry.split(":", 2)
        if "+" in rest:
            name, aliases = rest.split("+", 1)
            aliases = aliases.split(",")
        else:
            name, aliases = rest, []
        out.append({"verb": verb, "target": target, "name": name, "aliases": aliases})
    return out


def call_bridge(requests):
    """Shell out to tools/lang/parse-cli.mjs ONCE for the given request
    batch (L3 design decision #4: "shells out to it once per validation
    run, not once per pair, for throughput"). Returns {id: response}."""
    if not requests:
        return {}
    payload = "\n".join(json.dumps(r) for r in requests)
    proc = subprocess.run(
        ["node", BRIDGE_SCRIPT], input=payload, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"parse-cli.mjs bridge failed: {proc.stderr}")
    out = {}
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        out[r["id"]] = r
    return out


def _request_id(control, row):
    if row is not None and "id" in row:
        return f"{row.get('task', '?')}:{row.get('seed', '?')}:{row['id']}"
    return "adhoc:" + str(abs(hash(control)))


# ── Task A: facts -> prose (existing; unchanged behavior) ──────────────
def violations_a(control, prose):
    fields, items, exits = parse_control(control)
    v = []

    if fields.get("EVENT") in ("move", "look", "join"):
        m = EXITS_LINE.search(prose)
        if not m:
            v.append("exits-line-format")
        else:
            stated = m.group(1).split(", ")
            if sorted(stated) != sorted(exits):
                v.append("exits-line-mismatch")
        # directions implied in body text must be a subset of real exits
        body = EXITS_LINE.sub("", prose)
        for d, words in DIRWORDS.items():
            if d not in exits and any(re.search(rf"\b{w}\b", body, re.I) for w in words):
                v.append(f"phantom-exit:{d}")

    for it in items:
        # Multi-word names are underscore-encoded in the control string
        # (ITEMS:green_coin+brass_stylus — L3 design's documented,
        # backward-compatible fix: single-word names are a no-op here
        # since replace("_", " ") on a token with no underscore is
        # identity). Matching still only checks the LAST real word
        # ("coin" for "green coin"), same as before the fix.
        last_word = it.replace("_", " ").split()[-1]
        if not re.search(rf"\b{re.escape(last_word)}\b", prose, re.I):
            v.append(f"missing-item:{it}")

    mob = fields.get("MOB", "none")
    if mob == "none" and CREATURE_HINTS.search(prose):
        v.append("phantom-creature")
    if mob != "none":
        mob_word = mob.replace("_", " ").split()[-1]
        if not re.search(rf"\b{re.escape(mob_word)}\b", prose, re.I):
            v.append(f"missing-mob:{mob}")

    if BANNED.search(prose):
        v.append("banned-register")
    body = EXITS_LINE.sub("", prose)
    if len(re.findall(r"[.!?]", body)) > 4:
        v.append("too-long")
    return v


# ── Task C: denial -> explanation ───────────────────────────────────────
# Distinguishing snippets of module.js's own literal deny: strings — used
# to catch a REASON's explanation accidentally reading like a DIFFERENT
# reason's ("cross-reason leakage", the design doc's own term). WRONG_ITEM
# is deliberately not a telltale source here (its dynamic "{arg} here" text
# overlaps too much with ordinary language to be a useful fingerprint).
REASON_TELLTALES = {
    "WALL": ["does not negotiate"],
    "NOTHING_HERE": ["close on empty air", "empty air"],
    "NO_LORE": ["written for you"],
    "NO_SUCH_PLAYER": ["is down here"],
    "UNKNOWN_VERB": ["does not know the verb"],
    "GAME_OVER": ["delve is over", "host a new world"],
}


def violations_c(control, explanation):
    f = parse_fields(control)
    v = []
    reason = f.get("REASON", "")

    exits = f.get("EXITS", "")
    exits = exits.split(",") if exits and exits != "none" else []
    # The attempted direction (DIR), when the control carries one, is a
    # GROUNDED thing to name in a denial explanation — a WALL denial's whole
    # point is "you can't go <DIR>". It is by definition not an exit, so
    # exempt it from the phantom-exit check; previously this false-flagged
    # valid WALL explanations like "A wall blocks the way north" (DIR:n).
    blocked_dir = f.get("DIR", "")
    if exits or blocked_dir:
        for d, words in DIRWORDS.items():
            if d not in exits and d != blocked_dir and any(re.search(rf"\b{w}\b", explanation, re.I) for w in words):
                v.append(f"phantom-exit:{d}")

    items = f.get("ITEMS", "none")
    if items and items != "none":
        for it in items.split("+"):
            last_word = it.replace("_", " ").split()[-1]
            if not re.search(rf"\b{re.escape(last_word)}\b", explanation, re.I):
                v.append(f"missing-item:{it}")

    mob = f.get("MOB", "none")
    if mob == "none" and CREATURE_HINTS.search(explanation):
        v.append("phantom-creature")

    if BANNED.search(explanation):
        v.append("banned-register")
    if len(re.findall(r"[.!?]", explanation)) > 4:
        v.append("too-long")

    lowered = explanation.lower()
    for other_reason, phrases in REASON_TELLTALES.items():
        if other_reason == reason:
            continue
        for p in phrases:
            if p in lowered:
                v.append(f"cross-reason-leak:{other_reason}")
    return v


# ── Task D: bounded NPC reply ────────────────────────────────────────────
def violations_d(control, reply):
    f = parse_fields(control)
    v = []
    dk = f.get("DOESNT_KNOW", "none")
    if dk and dk != "none":
        for fact in dk.split("+"):
            last_word = fact.replace("_", " ").split()[-1]
            if re.search(rf"\b{re.escape(last_word)}\b", reply, re.I):
                v.append(f"envelope-violation:{fact}")
    if BANNED.search(reply):
        v.append("banned-register")
    if len(re.findall(r"[.!?]", reply)) > 4:
        v.append("too-long")
    return v


# ── Task B: NL -> command ────────────────────────────────────────────────
def violations_b(in_, out, row=None, bridge=None):
    f = parse_fields(in_)
    afford = parse_afford(f.get("AFFORD", "none"))
    utterance = f.get("UTTERANCE", "")
    req_id = _request_id(in_, row)
    resp_map = bridge if (bridge is not None and req_id in bridge) else call_bridge(
        [{"id": req_id, "mode": "route", "utterance": utterance, "affordances": afford}])
    resp = resp_map.get(req_id)
    if not resp or not resp.get("ok"):
        return ["ungrounded-command"]
    if resp.get("cmd") != out:
        return [f"command-mismatch:{resp.get('cmd')}!={out}"]
    return []


# ── Task E: command decomposition ────────────────────────────────────────
def violations_e(in_, out, row=None, bridge=None):
    f = parse_fields(in_)
    afford = parse_afford(f.get("AFFORD", "none"))
    utterance = f.get("UTTERANCE", "")
    req_id = _request_id(in_, row)
    resp_map = bridge if (bridge is not None and req_id in bridge) else call_bridge(
        [{"id": req_id, "mode": "decompose", "utterance": utterance, "affordances": afford}])
    resp = resp_map.get(req_id)
    if not resp or not resp.get("ok"):
        return ["segment-ungrounded"]
    if "|".join(resp.get("cmds") or []) != out:
        return ["decomposition-mismatch"]
    return []


# ── Task F: reference resolution ─────────────────────────────────────────
def violations_f(in_, out, row=None, bridge=None):
    f = parse_fields(in_)
    afford = parse_afford(f.get("AFFORD", "none"))
    utterance = f.get("UTTERANCE", "")
    req_id = _request_id(in_, row)
    resp_map = bridge if (bridge is not None and req_id in bridge) else call_bridge(
        [{"id": req_id, "mode": "route", "utterance": utterance, "affordances": afford}])
    resp = resp_map.get(req_id)
    if not resp or not resp.get("ok"):
        return ["unresolved-referent"]
    intent = resp.get("intent") or {}
    target = intent.get("item") or intent.get("target")
    if target != out:
        return [f"unresolved-referent:{target}!={out}"]
    return []


DISPATCH = {
    "A": lambda control, prose, **kw: violations_a(control, prose),
    "B": lambda control, prose, **kw: violations_b(control, prose, **kw),
    "C": lambda control, prose, **kw: violations_c(control, prose),
    "D": lambda control, prose, **kw: violations_d(control, prose),
    "E": lambda control, prose, **kw: violations_e(control, prose, **kw),
    "F": lambda control, prose, **kw: violations_f(control, prose, **kw),
}


def violations(control, prose, task="A", **kw):
    """violations(control, prose, task="A") -> list of violation strings.
    `task` defaults to "A" so every existing call site (test_validate.py's
    direct `violations(control, prose)` calls, any historical raw.jsonl
    with no "task" field) is untouched. `row`/`bridge` kwargs are only
    consumed by B/E/F (the bridge-backed tasks); harmless no-ops for
    A/C/D."""
    fn = DISPATCH.get(task)
    if fn is None:
        raise ValueError(f"validate: unknown task {task!r}")
    return fn(control, prose, **kw)


def build_bridge_requests(pairs):
    """One request per B/E/F pair, so main() can call the bridge exactly
    once for the whole validation run (L3 design decision #4)."""
    reqs = []
    for pair in pairs:
        task = pair.get("task", "A")
        if task not in ("B", "E", "F"):
            continue
        f = parse_fields(pair["in"])
        afford = parse_afford(f.get("AFFORD", "none"))
        utterance = f.get("UTTERANCE", "")
        req_id = _request_id(pair["in"], pair)
        mode = "decompose" if task == "E" else "route"
        reqs.append({"id": req_id, "mode": mode, "utterance": utterance, "affordances": afford})
    return reqs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--pass", dest="ok", required=True)
    ap.add_argument("--fail", dest="bad", required=True)
    ap.add_argument("--min-pass-rate", type=float, default=0.0)
    a = ap.parse_args()

    with open(a.inp) as f:
        pairs = [json.loads(line) for line in f if line.strip()]

    bridge_map = call_bridge(build_bridge_requests(pairs))

    total = passed = 0
    with open(a.ok, "w") as ok, open(a.bad, "w") as bad:
        for pair in pairs:
            total += 1
            task = pair.get("task", "A")
            v = violations(pair["in"], pair["out"], task=task, row=pair, bridge=bridge_map)
            if v:
                pair["violations"] = v
                bad.write(json.dumps(pair) + "\n")
            else:
                passed += 1
                ok.write(json.dumps(pair) + "\n")

    rate = passed / total if total else 0.0
    print(f"validated {total} pairs: {passed} passed ({rate:.1%})")
    if rate < a.min_pass_rate:
        print(f"pass rate below {a.min_pass_rate:.0%} — the PROMPT is broken, "
              "fix generation before flooding the corpus", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
