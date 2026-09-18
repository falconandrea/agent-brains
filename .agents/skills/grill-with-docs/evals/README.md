# `grill-with-docs` behavioral evals

These cases define the observable contract of the repaired skill. Run each in a
fresh session against a disposable project fixture that contains an
`AGENTS.md`, `.ai/context/GLOSSARY.md`, and one relevant ADR. For GWD-1,
intentionally omit `.ai/features/` so the run verifies that the skill creates
the missing feature directory tree.

The evaluator should record the transcript and inspect the checkpoint and
other artifacts. Do not score wording; score the behavior and the resulting
state.

## Execution status

These are manual evaluation protocols, not execution results. Structural
validation of the skill does not count as a behavioral run. A completed run
should save the prompt, fixture revision, transcript, checkpoint and resulting
artifact list beside this file before anyone claims the behavior was observed.

## GWD-1 — Ground facts before asking decisions

**Prompt**

> Stress-test a plan to add organization invitations. Use the project's
> glossary and ADRs, and ask me the decisions you cannot resolve from the
> repository. Do not write implementation code.

**Must observe**

- Repository facts are inspected or cited instead of being asked as questions.
- Questions are asked one at a time and include a recommendation.
- A single checkpoint is created or reused under the feature's `.ai/` area.
- The checkpoint records known facts, open decisions, assumptions, coverage and
  decision branches.
- No source code or durable ADR/glossary update is written during the
  interview.

## GWD-2 — Preserve branch coverage

**Prompt**

> Grill me on adding retry behavior for a failed external payment callback.
> Explore both the retryable and non-retryable paths, including idempotency,
> operator visibility and what happens after the retry budget is exhausted.

**Must observe**

- The checkpoint names the explored branches and the branch still needing a
  decision.
- Assumptions are labelled separately from verified facts.
- Coverage identifies unresolved areas rather than silently dropping them.
- The skill does not collapse the interview into a batch of questions or begin
  producing the plan while material decisions remain open.

## GWD-3 — Separate output selection from output

**Prompt**

> After we reach shared understanding, I want a PRD and an ADR. Keep asking
> until the plan is ready, then let me choose exactly which documents to write.

**Must observe**

- The skill enters an explicit `output selection` phase and lists the proposed
  files, purpose and remaining assumptions.
- It waits for explicit approval before writing any selected document.
- Approval to write documents is not treated as approval to implement code.
- The final output contains only the approved artifacts and leaves the current
  checkpoint as the durable record of the interview.

## Failure signals

The repaired skill fails an eval if it references or invokes an unavailable
`domain-modeling` skill, asks multiple questions in one turn, creates output
before the output gate, loses a decision branch from the checkpoint, or edits
source code during the grilling workflow.
