# Test review — second run

## Scope

This rerun corrects the initial scope omission; it is not an independent
replication. I reviewed the complete `906c47e40019792d3aef538009c1592e2d36ef11..ed4399305573bd3d7b86d44cc4f09658b9cfb2c8` diff at target revision
`ed43993`: the repaired `grill-with-docs` skill, its invocation policy, all
three eval protocols, the roadmap R0.1 status, and the `pi-brain` README
pointer. No tests, skill invocations, or behavioral evals were executed.

## Findings

### Medium — incomplete coverage: completion is recorded without behavioral evidence

`docs/plans/pi-plugin-adoption-roadmap.md:117-132` marks R0.1 complete using
official/structural checks and `git diff --check`, while
`.agents/skills/grill-with-docs/evals/README.md:13-18` explicitly says the
three evals are manual protocols with no execution result or transcript yet.
The acceptance claim covers runtime behavior: one checkpoint, a one-question
interview, and an approval-gated output phase. A plausible mutation that asks
two questions, creates a second checkpoint, or writes an unapproved document
could leave the listed structural checks green. This is an inspection
conclusion, not an executed mutation result. Run GWD-1 through GWD-3 in the
specified fixtures and retain their transcripts/checkpoints/artifact lists, or
keep R0.1 incomplete until that evidence exists.

### Low — incomplete coverage: final-state protocols do not prove per-turn persistence or ordering

The skill requires updating the checkpoint after every material discovery and
user answer (`.agents/skills/grill-with-docs/SKILL.md:71-73`) and persisting
`output selection` before proposing artifacts (`:94-101`). The evals inspect
the resulting checkpoint and artifacts (`evals/README.md:28-36,46-53,62-69`),
but do not require snapshots after each answer/discovery, an interruption
probe, or transcript evidence that the phase persisted before the proposal.
A mutation that defers writes until the end, or proposes files before the
phase write, could still pass final-state checks. Add those intermediate
assertions or a controlled interruption/ordering probe; this conclusion is
inspection-only.

## Useful protection and limits

The skill states concrete invariants, and GWD-1/2/3 cover facts, branch
coverage, and output approval with focused failure signals. The README pointer
change needs no new test. No runtime, policy-invocation, or transcript behavior
was verified; no repository tests were run and no repository files were
modified.

Review record: roughly under two minutes; three tool calls, with one batched
read-only inspection.
