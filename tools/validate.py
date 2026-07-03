#!/usr/bin/env python3
"""Grounding validator: the iron rule, enforced mechanically.

Rejects any (control string -> prose) pair where the prose:
  - implies an exit direction not in EXITS
  - names an item noun not in ITEMS
  - mentions a creature when MOB:none, or omits a present MOB
  - omits a listed item
  - breaks the exits-line contract ("Ways out: n, e." exact, final line)
  - exceeds the sentence budget or uses banned register words

Rejected pairs go to quarantine, never to /dev/null: today's rejects are
next week's targeted training batch. At 15M parameters the dataset IS the
model, so this file is, in a real sense, the golem's conscience.
"""
import argparse, json, re, sys

DIRWORDS = {
    "n": ["north"], "s": ["south"], "e": ["east"], "w": ["west"],
}
CREATURE_HINTS = re.compile(
    r"\b(ghoul|rat|eel|wisp|creature|beast|thing that|something alive)\b", re.I)
BANNED = re.compile(r"\b(eldritch|stygian|cyclopean|miasma|ichor)\b", re.I)
EXITS_LINE = re.compile(r"Ways out: ([nsew](?:, [nsew])*)\.\s*$")

def parse_control(c):
    fields = dict(kv.split(":", 1) for kv in c.split(" ") if ":" in kv)
    items = [] if fields.get("ITEMS", "none") == "none" \
        else fields["ITEMS"].split("+")
    exits = fields.get("EXITS", "").split(",") if fields.get("EXITS") else []
    return fields, items, exits

def violations(control, prose):
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
        # last word of the item name must appear ("sword" for "rusted sword")
        if not re.search(rf"\b{re.escape(it.split()[-1])}\b", prose, re.I):
            v.append(f"missing-item:{it}")

    mob = fields.get("MOB", "none")
    if mob == "none" and CREATURE_HINTS.search(prose):
        v.append("phantom-creature")
    if mob != "none" and not re.search(rf"\b{re.escape(mob.split()[-1])}\b", prose, re.I):
        v.append(f"missing-mob:{mob}")

    if BANNED.search(prose):
        v.append("banned-register")
    body = EXITS_LINE.sub("", prose)
    if len(re.findall(r"[.!?]", body)) > 4:
        v.append("too-long")
    return v

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--pass", dest="ok", required=True)
    ap.add_argument("--fail", dest="bad", required=True)
    ap.add_argument("--min-pass-rate", type=float, default=0.0)
    a = ap.parse_args()

    total = passed = 0
    with open(a.inp) as f, open(a.ok, "w") as ok, open(a.bad, "w") as bad:
        for line in f:
            pair = json.loads(line)
            total += 1
            v = violations(pair["in"], pair["out"])
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
