# Evaluator records

All outputs were generated on 2026-10-11 by separate Codex subagents without
parent conversation inheritance. A/B/C/D initial reviews used
[skill-v1.md](skill-v1.md); C3 used the revised current skill. Model and token
telemetry are unavailable. These are returned reports, not complete transcripts.

## Invocation protocol

Each test-review evaluator received this brief, with the case-specific scope:

```text
Use extra/skills/test-review/SKILL.md to review the supplied historical
two-endpoint diff. Prefix shell commands with rtk. Read files at the target
revision with git show, not the current tree. Stay read-only: no test execution
or mutation; the sole allowed write is the final temporary report. Do not read
the parent conversation, prior review/eval outputs or later follow-up documents.
Include scope, severity/evidence labels, target file:line, concrete mutations as
hypotheses, verification limits and useful existing protection. Do not invent
time, token or tool counters. Return the artifact path and summary.
```

This protocol is a normalized reconstruction of the task messages, not a claim
that complete tool-call transcripts were exported.

| Case | Scope and supplied requirements | Output budget |
|---|---|---|
| A | `96c639b..763387a`; target roadmap R0.3 | 650 words |
| B | `e5f8e56..73acb85`; target PRD F1/F2/F5, T1–T3 only, README setup contract | 650 words |
| C | `906c47e..ed43993`; entire R0.1 implementation, target roadmap requirements | 500 words |
| D | `168532a..a71bbb6`; W1 documentation-only contract update | 400 words |

C initially narrowed to the roadmap, contrary to the supplied complete diff.
C2 was explicitly instructed to review all changed skill, policy, eval and doc
files. C3 repeated the complete review after a skill wording refinement. They
are corrective iterations in the same agent, not additional independent samples.

E (2026-10-11, same day as A–D) reviewed a live working-tree change (follow-ups
T4) rather than a historical range, with the current skill, and was allowed the
skill's own read-only execution rules. It compared against a fresh two-axis
code review of the same diff that it never saw; see
[E-test-review.md](E-test-review.md).

## Baseline comparison

A and C compare against the previously persisted faithful two-axis reviews in
`docs/evals/complexity-review/runs/`. Those are historical runs on a different
runtime/settings, not contemporaneous controlled measurements.

B compares against a fresh two-axis code review on the same endpoints and specs.
The parent launched independent Standards and Spec evaluators directly, each
with `fork_turns: none`, inspection-only permissions and a 400-word output budget.
They read the current `code-review` skill for their respective brief; Standards
applied the full smell baseline, Spec checked only F1/F2/F5 and T1–T3. Both were
forbidden from reading test-review or any other pilot reports. The initial
same-context proxy is retained but excluded from comparison.

## Executed evidence

Reviewers proposed defects without executing them. Only the parent ran the
isolated B mutation experiment. The exact mutations, added probes, Git target
and commands are in [run-mutation-experiment.py](../run-mutation-experiment.py);
the four completed run outputs and JSON summary are in `../mutation-results/`.
