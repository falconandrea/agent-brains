# Agent workflow baseline

This directory contains the W0-lite evaluation protocol and its run sheets and
result artifacts. A run is accepted as reproducible only when its complete raw
session export and configuration snapshot are persisted beside the sheet.
The protocol measures the current workflow before any skill or workflow change
is made.

## Scope

Run each scenario in a fresh session against a disposable copy of the same
fixture repository and commit. Use the same client, provider and configuration
for the baseline. Do not modify skills, this protocol or the workflow-improvement
plan during a run. Do not commit, push or open a pull request.

The default fixture is this repository at the baseline commit recorded before
the first run. A different fixture is allowed only if it is recorded in the
run sheet and reused for every comparison involving that scenario.

For this baseline, freeze commit `e2670b7` (`docs: translate ui-ux-skills-comparison
research to English`) before starting W0.2. The evaluation protocol itself is
kept in the working checkout and must not be copied into the fixture under
test unless the run explicitly records that choice.

## Scenarios

### E1 — trivial change

**Purpose:** test the fast path and the absence of unnecessary ceremony.

**Fixed input:**

> In `README.md`, rename the heading `## Structure` to `## Repository structure`.
> Make only this one-line documentation change. Do not create a feature
> specification or modify source code.

**Expected result:** the agent makes the direct edit, performs only a minimal
relevant check, and reports the changed file. No PRD, task list, subagent,
framework workflow, broad test suite or unrelated edit is produced.

**Failure modes:**

- invokes `/feature` or creates planning artifacts;
- asks for clarification despite the request being complete;
- edits code or unrelated documentation;
- runs disproportionate checks;
- commits, pushes or opens a pull request;
- claims success without identifying the resulting diff.

### E3 — cross-cutting feature

**Purpose:** test repository grounding, risk and scope analysis, test
coverage, the approval gate and the complete feature workflow.

**Fixed input:**

> `/feature Add elapsed-time observability to pi-brain runs. Record the run
> start and terminal times in the persisted workflow state, preserve
> compatibility with existing logs, show the elapsed time in `/flow status`,
> and document the behavior. Reuse the existing run-log and event model; do
> not add a dependency or a second storage system. Add focused tests for new
> behavior and old logs. Keep the existing no-commit, single-writer and
> reviewer-read-only invariants. Do not commit or push.`

**Expected result:** discovery is grounded in the existing event/log/extension
implementation; the agent identifies affected files, risks and acceptance
criteria; PRD and tasks are created under `.ai/features/`; implementation does
not start before the single human approval gate; tests and deterministic checks
run before independent review; the final diff stays within scope and the
workflow reports evidence for its outcome.

**Failure modes:**

- starts implementation before approval;
- ignores existing run-log compatibility or invents parallel storage;
- changes unrelated commands, profiles or skills;
- omits tests for new behavior or old-log compatibility;
- spends reviewer work before deterministic checks pass;
- reviewer receives write access or the developer commits;
- review findings are dropped without an explicit outcome;
- completion is claimed without a reproducible verification result.

### E7 — external dependency assessment

**Purpose:** test primary-source research and a project-grounded adoption
verdict. The candidate must be selected at run time: it must be real, relevant
to this repository, absent from `package.json`, and not already evaluated in
the repository's research documents. Record the selected candidate before
running the fixed prompt.

**Fixed input** (replace only `<CANDIDATE>` and `<OFFICIAL_SOURCE>`):

> Evaluate whether this repository should adopt `<CANDIDATE>`. Start from
> `<OFFICIAL_SOURCE>` and other primary sources, then inspect this repository's
> `package.json`, README, architecture and relevant source files. Produce one
> Markdown report with: verified upstream facts and links; local evidence;
> clearly labelled inferences; comparison with the current implementation and
> realistic alternatives; and a final verdict of `adopt`, `trial`,
> `selectively import` or `reject`. Motivate the verdict using new value,
> overlap, cost, risk, compatibility and reversibility. Do not install the
> dependency, modify source files or commit anything.

**Expected result:** the report distinguishes facts from local evidence and
inferences, cites primary sources, evaluates the candidate against this
repository rather than popularity, and gives a reversible, explicit verdict.
Neutral fact collection alone is insufficient for this assessment scenario.

**Failure modes:**

- relies mainly on popularity, search snippets or secondary commentary;
- does not inspect the repository or compare with existing code;
- presents inferences as upstream facts;
- recommends adoption without discussing overlap, cost or reversibility;
- installs the dependency or changes repository files;
- produces no single report or no explicit verdict.

## Run sheet

Create one copy of this template per scenario. Keep the raw transcript or
session export beside the sheet; do not record only an agent-generated summary.
Keep a configuration snapshot with it as well, including client/runtime,
provider/model and relevant settings. A transcript supplied interactively or
left in a temporary directory does not satisfy the reproducibility requirement.

```markdown
# <ID> — <date>

- Fixture repository:
- Fixture commit:
- Client/runtime:
- Provider/model:
- Configuration:
- Candidate (E7 only):
- Raw session:

## Input

<!-- Paste the exact prompt used. -->

## Outcome

- Result:
- Turns:
- Tool calls:
- Artifacts produced:
- Constraint violations:

## Evidence

- Correctness and claim evidence:
- Expected behavior observed:
- Failure modes observed:
- Human spot-check:

## Notes

<!-- Keep observations factual; separate interpretation from evidence. -->
```

## W0.2 procedure

1. Freeze and record the fixture commit and runtime configuration.
2. Run E1, E3 and E7 in separate fresh sessions, using the exact inputs above.
3. Save the complete raw output, configuration snapshot and one run sheet per
   scenario in the repository.
4. Have a human review at least one result against the expected behavior. If a
   later candidate is compared, use a blind A/B comparison with the labels
   hidden until after the preference is recorded.
5. Do not begin W4 until all three run sheets and the human spot-check are
   saved.

W0.2 and W0.3 were completed on the frozen fixture; the linked run sheets,
raw exports and configuration snapshots are the acceptance evidence. This
protocol remains the source of truth for any later rerun.
