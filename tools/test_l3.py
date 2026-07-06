"""L3 PR1 tests — stdlib unittest (design doc open question #2 /
orchestrator decision #3: pytest is NOT installed locally, only CI
installs it; these tests must run via `python3 -m unittest tools.test_l3`
or `python3 tools/test_l3.py` with no third-party dependency).

Covers each of the six task validators (one passing example + one
quarantined example per task, per the PR brief) plus a fully
deterministic end-to-end run: harvest a few seeds -> stub teacher ->
validate -> stats, asserting the known-good stub pipeline's pass rate.

Requires `node` on PATH (tasks B/E/F shell out to tools/lang/
parse-cli.mjs) — same requirement CI's `validator` job already has for
tools/generate.py's Node dependency-free assumption... except this one,
which is new: flagged in the L3 design doc's Open Question 3.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate import violations, parse_fields, parse_afford  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARVEST = os.path.join(REPO_ROOT, "tools", "harvest.js")
STUB = os.path.join(REPO_ROOT, "tools", "stub_teacher.js")
PARSE_CLI = os.path.join(REPO_ROOT, "tools", "lang", "parse-cli.mjs")


# ── Task A (existing behavior; a light smoke check here — full coverage
# already lives in test_validate.py, run under CI's pytest) ────────────
class TestTaskA(unittest.TestCase):
    def test_pass(self):
        ctrl = "EVENT:take THEME:deep_mine ITEMS:green_coin MOB:none"
        self.assertEqual(violations(ctrl, "You take the green coin.", task="A"), [])

    def test_quarantine(self):
        ctrl = "EVENT:take THEME:deep_mine ITEMS:green_coin MOB:none"
        v = violations(ctrl, "You take nothing at all.", task="A")
        self.assertIn("missing-item:green_coin", v)


# ── Task B: NL -> command ───────────────────────────────────────────────
class TestTaskB(unittest.TestCase):
    def test_pass(self):
        in_ = (
            "TASK:B THEME:deep_mine ROOM:hall AFFORD:take:item/green_coin@1,2:green coin "
            "UTTERANCE:take the green coin"
        )
        self.assertEqual(violations(in_, "take green_coin", task="B"), [])

    def test_quarantine_mismatch(self):
        in_ = (
            "TASK:B THEME:deep_mine ROOM:hall AFFORD:take:item/green_coin@1,2:green coin "
            "UTTERANCE:take the green coin"
        )
        v = violations(in_, "move 0 -1", task="B")
        self.assertTrue(any(x.startswith("command-mismatch") for x in v))

    def test_quarantine_ungrounded(self):
        in_ = "TASK:B THEME:deep_mine ROOM:hall AFFORD:none UTTERANCE:asdkjfh qweoiuqwe"
        v = violations(in_, "move 0 -1", task="B")
        self.assertIn("ungrounded-command", v)


# ── Task C: denial -> explanation ───────────────────────────────────────
class TestTaskC(unittest.TestCase):
    def test_pass(self):
        ctrl = "TASK:C THEME:deep_mine EVENT:read REASON:NO_LORE"
        self.assertEqual(violations(ctrl, "There is nothing carved here for you to read.", task="C"), [])

    def test_quarantine_cross_reason_leak(self):
        ctrl = "TASK:C THEME:deep_mine EVENT:read REASON:NO_LORE"
        v = violations(ctrl, "Stone does not negotiate, and there is nothing to read.", task="C")
        self.assertIn("cross-reason-leak:WALL", v)

    def test_quarantine_missing_item(self):
        ctrl = "TASK:C THEME:deep_mine EVENT:take ITEMS:green_coin REASON:WRONG_ITEM"
        v = violations(ctrl, "That is not what you're looking for.", task="C")
        self.assertIn("missing-item:green_coin", v)

    def test_pass_wall_names_blocked_direction(self):
        # A WALL denial's explanation SHOULD name the blocked direction (DIR),
        # which is not an exit — this must NOT be flagged phantom-exit (the
        # false-positive found while eyeballing the L3 smoke batch).
        ctrl = "TASK:C THEME:deep_mine EVENT:move DIR:n EXITS:s,e REASON:WALL"
        self.assertEqual(violations(ctrl, "A solid wall blocks the way north.", task="C"), [])

    def test_quarantine_phantom_exit_still_caught(self):
        # A direction that is neither an exit nor the attempted DIR is still a
        # phantom exit — the WALL/DIR exemption is targeted, not a blanket off.
        ctrl = "TASK:C THEME:deep_mine EVENT:move DIR:n EXITS:s,e REASON:WALL"
        v = violations(ctrl, "The way west lies open past the wall.", task="C")
        self.assertIn("phantom-exit:w", v)


# ── Task D: bounded NPC reply ────────────────────────────────────────────
class TestTaskD(unittest.TestCase):
    def test_pass(self):
        ctrl = (
            "TASK:D THEME:deep_mine TOPIC:distant KNOWS:hall DOESNT_KNOW:vault "
            "QUESTION:What's in the deepest chamber?"
        )
        self.assertEqual(violations(ctrl, "I only know what's near me — this hall.", task="D"), [])

    def test_quarantine_envelope_violation(self):
        ctrl = (
            "TASK:D THEME:deep_mine TOPIC:distant KNOWS:hall DOESNT_KNOW:vault "
            "QUESTION:What's in the deepest chamber?"
        )
        v = violations(ctrl, "Oh, the vault deeper in has treasure.", task="D")
        self.assertIn("envelope-violation:vault", v)


# ── Task E: command decomposition ───────────────────────────────────────
class TestTaskE(unittest.TestCase):
    def test_pass(self):
        in_ = (
            "TASK:E THEME:deep_mine ROOM:hall AFFORD:take:item/green_coin@1,2:green coin "
            "UTTERANCE:take the green coin and then go north"
        )
        self.assertEqual(violations(in_, "take green_coin|move 0 -1", task="E"), [])

    def test_quarantine_mismatch(self):
        in_ = (
            "TASK:E THEME:deep_mine ROOM:hall AFFORD:take:item/green_coin@1,2:green coin "
            "UTTERANCE:take the green coin and then go north"
        )
        v = violations(in_, "take green_coin|move 1 0", task="E")
        self.assertIn("decomposition-mismatch", v)

    def test_quarantine_segment_ungrounded(self):
        in_ = "TASK:E THEME:deep_mine ROOM:hall AFFORD:none UTTERANCE:qwekjasd and then go north"
        v = violations(in_, "take green_coin|move 0 -1", task="E")
        self.assertIn("segment-ungrounded", v)


# ── Task F: reference resolution ────────────────────────────────────────
class TestTaskF(unittest.TestCase):
    def test_pass(self):
        in_ = (
            "TASK:F THEME:deep_mine ANTECEDENT_TEXT:A green coin rests here. "
            "AFFORD:take:item/green_coin@1,2:green coin+it,that,the thing UTTERANCE:take it"
        )
        self.assertEqual(violations(in_, "item/green_coin@1,2", task="F"), [])

    def test_quarantine_wrong_referent(self):
        in_ = (
            "TASK:F THEME:deep_mine ANTECEDENT_TEXT:A green coin rests here. "
            "AFFORD:take:item/green_coin@1,2:green coin+it,that,the thing UTTERANCE:take it"
        )
        v = violations(in_, "item/some_other_thing@9,9", task="F")
        self.assertTrue(any(x.startswith("unresolved-referent") for x in v))

    def test_quarantine_ungrounded(self):
        in_ = "TASK:F THEME:deep_mine ANTECEDENT_TEXT:A green coin rests here. AFFORD:none UTTERANCE:qweoiuasd"
        v = violations(in_, "item/green_coin@1,2", task="F")
        self.assertIn("unresolved-referent", v)


# ── Small parser unit checks (the new B-F field/affordance parsers) ────
class TestParsers(unittest.TestCase):
    def test_parse_fields_handles_embedded_spaces(self):
        f = parse_fields("TASK:D KNOWS:hall QUESTION:What is this place, exactly? THEME:deep_mine")
        self.assertEqual(f["QUESTION"], "What is this place, exactly?")
        self.assertEqual(f["THEME"], "deep_mine")

    def test_parse_afford_with_aliases(self):
        out = parse_afford("take:item/green_coin@1,2:green coin+it,that")
        self.assertEqual(out, [{"verb": "take", "target": "item/green_coin@1,2", "name": "green coin",
                                 "aliases": ["it", "that"]}])

    def test_parse_afford_none(self):
        self.assertEqual(parse_afford("none"), [])


# ── Bridge round-trip smoke (node must be on PATH) ──────────────────────
class TestBridge(unittest.TestCase):
    def test_route_round_trip(self):
        req = json.dumps({"id": "1", "mode": "route", "utterance": "go north", "affordances": []})
        proc = subprocess.run(["node", PARSE_CLI], input=req, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        resp = json.loads(proc.stdout.strip())
        self.assertTrue(resp["ok"])
        self.assertEqual(resp["cmd"], "move 0 -1")


# ── End-to-end: harvest -> stub -> validate -> stats, fully deterministic ─
class TestEndToEnd(unittest.TestCase):
    def test_pipeline_known_good_pass_rate(self):
        with tempfile.TemporaryDirectory() as tmp:
            controls = os.path.join(tmp, "controls.jsonl")
            raw = os.path.join(tmp, "raw.jsonl")
            clean = os.path.join(tmp, "clean.jsonl")
            quarantine = os.path.join(tmp, "quarantine.jsonl")

            subprocess.run(
                ["node", HARVEST, "--seeds", "5", "--out", controls], cwd=REPO_ROOT, check=True,
                capture_output=True, text=True,
            )
            self.assertTrue(os.path.getsize(controls) > 0)

            subprocess.run(
                ["node", STUB, "--in", controls, "--out", raw], cwd=REPO_ROOT, check=True,
                capture_output=True, text=True,
            )
            self.assertTrue(os.path.getsize(raw) > 0)

            proc = subprocess.run(
                [sys.executable, os.path.join(REPO_ROOT, "tools", "validate.py"),
                 "--in", raw, "--pass", clean, "--fail", quarantine],
                cwd=REPO_ROOT, capture_output=True, text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)

            with open(raw) as f:
                total = sum(1 for line in f if line.strip())
            with open(clean) as f:
                passed = sum(1 for line in f if line.strip())

            self.assertGreater(total, 0)
            # The deterministic stub is designed to always ground cleanly
            # (PR1's own DoD: the plumbing, not the corpus, is under test)
            # — a regression here means harvest.js/stub_teacher.js/
            # validate.py have drifted out of sync with each other.
            self.assertGreaterEqual(passed / total, 0.95)

            tasks_seen = set()
            with open(raw) as f:
                for line in f:
                    tasks_seen.add(json.loads(line)["task"])
            self.assertEqual(tasks_seen, {"A", "B", "C", "D", "E", "F"})

    def test_stats_reports_all_tasks(self):
        with tempfile.TemporaryDirectory() as tmp:
            controls = os.path.join(tmp, "controls.jsonl")
            raw = os.path.join(tmp, "raw.jsonl")
            clean = os.path.join(tmp, "clean.jsonl")
            quarantine = os.path.join(tmp, "quarantine.jsonl")
            stats_json = os.path.join(tmp, "stats.json")

            subprocess.run(["node", HARVEST, "--seeds", "5", "--out", controls],
                            cwd=REPO_ROOT, check=True, capture_output=True, text=True)
            subprocess.run(["node", STUB, "--in", controls, "--out", raw],
                            cwd=REPO_ROOT, check=True, capture_output=True, text=True)
            subprocess.run(
                [sys.executable, os.path.join(REPO_ROOT, "tools", "validate.py"),
                 "--in", raw, "--pass", clean, "--fail", quarantine],
                cwd=REPO_ROOT, capture_output=True, text=True,
            )
            proc = subprocess.run(
                [sys.executable, os.path.join(REPO_ROOT, "tools", "stats.py"),
                 "--pass", clean, "--fail", quarantine, "--in", raw, "--json", stats_json],
                cwd=REPO_ROOT, capture_output=True, text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            with open(stats_json) as f:
                report = json.load(f)
            self.assertEqual(set(report["tasks"].keys()) - {"A", "B", "C", "D", "E", "F"}, set())


if __name__ == "__main__":
    unittest.main()
