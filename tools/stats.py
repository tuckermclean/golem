#!/usr/bin/env python3
"""L3 corpus stats (design doc §"stats.py"). Reads clean/quarantine JSONL
(and optionally raw.jsonl for pre-validation counts) and reports, per
task: pass/quarantine rate, quarantine-reason histogram, output-length
distribution, and near-duplicate rate over a --in JSONL.

Emits a human-readable summary to stdout AND (--json) a machine-readable
blob, so CI or a DoD report can gate on --min-pass-rate-style thresholds
per task — matching validate.py's existing convention (stdlib only, no
new dependency).
"""
import argparse, json, re, sys
from collections import Counter, defaultdict


def normalize_dup_key(text):
    """Lowercased, whitespace-collapsed, punctuation-stripped — the
    generate.py design's own near-duplicate definition, reused here for
    reporting (not enforcement; --in is a plain corpus scan)."""
    t = text.lower()
    t = re.sub(r"[^\w\s]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def load_jsonl(path):
    rows = []
    if not path:
        return rows
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def percentile(sorted_vals, p):
    if not sorted_vals:
        return 0
    k = (len(sorted_vals) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return sorted_vals[f]
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def length_stats(lengths):
    if not lengths:
        return {"mean": 0, "p50": 0, "p90": 0, "p99": 0}
    s = sorted(lengths)
    return {
        "mean": sum(s) / len(s),
        "p50": percentile(s, 0.50),
        "p90": percentile(s, 0.90),
        "p99": percentile(s, 0.99),
    }


def build_stats(clean_rows, quarantine_rows, raw_rows):
    by_task = defaultdict(lambda: {"clean": 0, "quarantine": 0, "reasons": Counter(), "lengths": []})

    for row in clean_rows:
        t = row.get("task", "A")
        by_task[t]["clean"] += 1
        by_task[t]["lengths"].append(len(row.get("out", "")))

    for row in quarantine_rows:
        t = row.get("task", "A")
        by_task[t]["quarantine"] += 1
        for v in row.get("violations", []):
            reason = v.split(":", 1)[0]
            by_task[t]["reasons"][reason] += 1

    report = {"tasks": {}, "near_duplicates": {}}
    for t, d in sorted(by_task.items()):
        total = d["clean"] + d["quarantine"]
        rate = d["clean"] / total if total else 0.0
        report["tasks"][t] = {
            "total": total,
            "clean": d["clean"],
            "quarantine": d["quarantine"],
            "pass_rate": rate,
            "top_violations": d["reasons"].most_common(5),
            "length": length_stats(d["lengths"]),
        }

    if raw_rows:
        seen = defaultdict(list)
        for row in raw_rows:
            key = normalize_dup_key(row.get("out", ""))
            seen[key].append(row.get("id", "?"))
        dup_groups = {k: ids for k, ids in seen.items() if len(ids) > 1}
        n_dup_rows = sum(len(ids) - 1 for ids in dup_groups.values())
        report["near_duplicates"] = {
            "duplicate_groups": len(dup_groups),
            "duplicate_rows": n_dup_rows,
            "rate": n_dup_rows / len(raw_rows) if raw_rows else 0.0,
        }

    return report


def print_report(report):
    print("=== L3 corpus stats ===")
    for t, d in report["tasks"].items():
        print(f"\nTask {t}: {d['clean']}/{d['total']} passed ({d['pass_rate']:.1%})")
        if d["top_violations"]:
            print("  top violations:", ", ".join(f"{r}={n}" for r, n in d["top_violations"]))
        ln = d["length"]
        print(f"  output length: mean={ln['mean']:.1f} p50={ln['p50']:.0f} p90={ln['p90']:.0f} p99={ln['p99']:.0f}")
    if report["near_duplicates"]:
        nd = report["near_duplicates"]
        print(f"\nnear-duplicates: {nd['duplicate_rows']} rows in {nd['duplicate_groups']} groups "
              f"({nd['rate']:.1%} of raw)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pass", dest="clean", help="clean.jsonl (validate.py --pass output)")
    ap.add_argument("--fail", dest="quarantine", help="quarantine.jsonl (validate.py --fail output)")
    ap.add_argument("--in", dest="raw", help="raw.jsonl, for pre-validation near-duplicate stats")
    ap.add_argument("--json", dest="json_out", help="also write the machine-readable blob here")
    ap.add_argument("--min-pass-rate", type=float, default=0.0, help="per-task gate, like validate.py's")
    a = ap.parse_args()

    clean_rows = load_jsonl(a.clean)
    quarantine_rows = load_jsonl(a.quarantine)
    raw_rows = load_jsonl(a.raw)

    if not clean_rows and not quarantine_rows:
        print("stats: nothing to report (pass --pass/--fail from validate.py's output)", file=sys.stderr)
        sys.exit(1)

    report = build_stats(clean_rows, quarantine_rows, raw_rows)
    print_report(report)

    if a.json_out:
        with open(a.json_out, "w") as f:
            json.dump(report, f, indent=2)

    below = [t for t, d in report["tasks"].items() if d["pass_rate"] < a.min_pass_rate]
    if below:
        print(f"\nbelow --min-pass-rate {a.min_pass_rate:.0%}: {', '.join(below)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
