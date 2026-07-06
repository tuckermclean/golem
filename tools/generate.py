#!/usr/bin/env python3
"""L3 generate.py — the teacher-injection seam (design doc §"generate.py").

PR1 SCOPE NOTE: this file is a documented SKELETON only. No real teacher
batch is run or gated here — that is PR2's job (the design doc's own
"Decomposition" split). PR1's fully machine-checkable pipeline is
harvest.js -> tools/stub_teacher.js -> validate.py -> stats.py, which
needs no network, no agents, and none of the classes below.

Teacher is an abstract "given a control string (+ task-specific hints),
produce the one surface-form string the task needs" interface, with two
implementations:

  ExternalAPITeacher   — documented, NOT runnable in this sandbox: a real
                          hosted-model call (model id, batching, retry/
                          backoff). The DELTA-assumed production path.
  AgentAuthoredTeacher  — reads a file of {"id", "output"} lines the
                          orchestrator's Sonnet subagents already wrote,
                          out of band (fanned out via Agent/Task calls,
                          collected, written BEFORE this script runs).
                          The ONLY implementation PR2 exercises.

Every control row is designed (see tools/harvest.js + validate.py) so
that (b) is sufficient to produce a real, validatable batch, and so that
swapping in (a) later requires no change to harvest.js/validate.py/
stats.py — only a different --teacher flag here.
"""
import argparse, json, sys
from abc import ABC, abstractmethod


class Teacher(ABC):
    @abstractmethod
    def generate(self, task, control, teacher_slot, ground_truth, register):
        """Return the ONE surface-form string the task's teacherSlot
        needs (e.g. "prose" for task A, "utterance" for B/E/F,
        "explanation" for C, "reply" for D). Must never originate a
        fact not already present in `control`/`ground_truth` — VISION
        law 5, applied to the teacher that trains the twin."""
        raise NotImplementedError


class ExternalAPITeacher(Teacher):
    """Documented, NOT runnable in this sandbox: a real hosted-model
    call. Left unimplemented on purpose — wiring a live API key/client
    here is an infrastructure decision out of L3's scope; PR2 only
    exercises AgentAuthoredTeacher."""

    def __init__(self, model_id):
        self.model_id = model_id

    def generate(self, task, control, teacher_slot, ground_truth, register):
        raise NotImplementedError(
            "ExternalAPITeacher is a documented production seam, not runnable in this "
            "sandbox — no real teacher API is reachable here. Use --teacher file."
        )


class AgentAuthoredTeacher(Teacher):
    """Joins harvested control rows against a file of agent-authored
    outputs (the orchestrator's Sonnet subagents, fanned out and
    collected out of band). Errors loudly — never skips silently — on
    any control id with no matching output line, per the design doc's
    own instruction for this class."""

    def __init__(self, outputs_path):
        self.outputs = {}
        with open(outputs_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                self.outputs[row["id"]] = row["output"]

    def generate(self, task, control, teacher_slot, ground_truth, register, *, row_id=None):
        if row_id not in self.outputs:
            raise KeyError(
                f"AgentAuthoredTeacher: no agent output found for id={row_id!r} — "
                "every harvested control must have a matching {'id','output'} line; "
                "silently skipping would poison the corpus with a hole, not a gap."
            )
        return self.outputs[row_id]


TEACHERS = {"external": ExternalAPITeacher, "file": AgentAuthoredTeacher}

# DELTA's own "register rotation" phrase, applied literally as a small,
# authored, ROUND-ROBIN vocabulary (design doc open question #6 / decision
# #8: the real register TAXONOMY is authored content, a follow-up, not
# invented wholesale here).
REGISTERS = ["plain", "terse", "lush"]


def build_pair(task, control, teacher_slot, teacher_text):
    """Mirrors tools/stub_teacher.js's assembly convention EXACTLY (see
    that file's `buildPair`): A/C/D are "in=control, out=teacher_text";
    B/E/F append "UTTERANCE:<teacher_text>" to control for `in`, and
    `out` is carried through from ground truth (the teacher never writes
    the answer) — the ground_truth plumbing for that half lives in the
    per-row loop in `main`, not here, since this helper only knows the
    free-form (A/C/D) shape."""
    if task in ("A", "C", "D"):
        return control, teacher_text
    return f"{control} UTTERANCE:{teacher_text}", None  # out filled by caller from ground_truth


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--controls", required=True, help="harvest.js's controls.jsonl")
    ap.add_argument("--teacher", choices=list(TEACHERS), default="file")
    ap.add_argument("--teacher-outputs", help="required for --teacher file")
    ap.add_argument("--model-id", help="required for --teacher external")
    ap.add_argument("--variants", type=int, default=1)
    ap.add_argument("--register-rotation", default=",".join(REGISTERS))
    ap.add_argument("--exclude", help="running near-duplicate hash file")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    if a.teacher == "file":
        if not a.teacher_outputs:
            print("generate.py --teacher file requires --teacher-outputs", file=sys.stderr)
            sys.exit(1)
        teacher = AgentAuthoredTeacher(a.teacher_outputs)
    else:
        if not a.model_id:
            print("generate.py --teacher external requires --model-id", file=sys.stderr)
            sys.exit(1)
        teacher = ExternalAPITeacher(a.model_id)

    registers = a.register_rotation.split(",")

    with open(a.controls) as f, open(a.out, "w") as out:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            for k in range(a.variants):
                register = registers[(i + k) % len(registers)]
                text = teacher.generate(
                    row["task"], row["control"], row["teacherSlot"], row["groundTruth"],
                    register, row_id=row["id"],
                )
                in_, out_from_text = build_pair(row["task"], row["control"], row["teacherSlot"], text)
                if out_from_text is None:
                    gt = row["groundTruth"]
                    out_value = gt.get("cmd") or ("|".join(gt["cmds"]) if "cmds" in gt else gt.get("referent"))
                else:
                    out_value = out_from_text
                out.write(json.dumps({
                    "task": row["task"], "seed": row["seed"], "id": row["id"],
                    "register": register, "in": in_, "out": out_value,
                }) + "\n")

    print(f"generate.py: wrote pairs for {a.controls} -> {a.out} (teacher={a.teacher})")


if __name__ == "__main__":
    main()
