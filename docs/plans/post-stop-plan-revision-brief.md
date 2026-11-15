# Post-stop plan revision brief

Prepared 2026-11-14. Status: design handoff; no runtime change or final command
contract is approved by this document. The next deliverable is a reviewable
design and implementation task list.

## Problem and evidence

The [Carefinder observation](pi-plugin-adoption-roadmap.md#mid-development-plan-revision-gap-2026-11-13)
exposed a requirement correction after development had started. Ordinary resume
continues the approved contract; it cannot express that correction.

Code inspected for this brief:

- `src/workflows/resume.ts`: replay reconstructs execution phases and approved
  document hashes; terminal outcome events refuse ordinary resume.
- `src/workflows/feature.ts`: resumed execution retains its original Git baseline
  and verification freeze through `ResumeState`.
- `extensions/pi-brain.ts`: `handleResume` validates preconditions, obtains the
  repository lock and launches execution; crash healing handles an already
  decided review separately.
- `src/ports.ts`: persisted workflow events are the recovery contract.

## Required user outcome

After stopping a feature, the user submits an explicit requirement correction,
reviews a revised plan, and approves continuation. Useful partial work remains
available. The developer receives concrete keep/change/remove instructions;
verification and review assess the newly approved contract against the original
Git baseline.

## Constraints for the design

1. Keep ordinary `/flow resume` semantics. Define a separate explicit action;
   `/flow revise <runId>` is a candidate spelling, not an existing command.
2. Wait for cancellation and lock release before beginning revision. Check
   repository identity, baseline availability and existing integrity guards.
3. Preserve partial files and the original diff baseline. Never automatically
   reset, clean, commit, stash or edit consumer repositories during design.
4. Persist the correction, previous approved contract, candidate revision and
   approval identity. Approval must bind the exact candidate contents.
5. Keep the old approved artifacts intact until the replacement is recoverable.
   Define recovery across each artifact-write and event-append boundary; a
   crash must not produce an apparently approved mixture of versions.
6. Before approval, developer execution is blocked. Cancellation, empty notes,
   invalid planner output and provider failure must preserve recoverable state.
   Specify whether abandoning revision restores old-contract resume, and how
   the user explicitly chooses that outcome.
7. Pass the approved correction and keep/change/remove guidance to developer
   and reviewer. Old findings may remain historical evidence, but stale review
   verdicts and verification results cannot complete a new contract.
8. Preserve original frozen verification commands, manifest-script guards,
   repository-state digest and ignore-rule guards. Changes to those inputs are
   outside this first revision feature; explain refusal and recovery behavior.
9. Define review/fix budgets per revision and cumulative accounting explicitly,
   so recovery neither consumes a retry twice nor creates an unbounded loop.
10. Keep existing logs compatible. Specify fail-closed handling of incomplete,
    corrupt or unsupported revision events and the minimum evidence needed to
    revise a legacy run.

## Decisions the design must settle

- Same-run revision epochs versus a linked successor run: compare replay
  complexity, artifact ownership, baseline retention and old-run resumability;
  recommend one. A successor must not silently snapshot partial work as its
  new comparison baseline.
- Eligible states: cancelled, interrupted/failed, `needs_human`, completed,
  and pre-approval runs. Give a decision for each, including a review verdict
  persisted just before a crash. Prefer the smallest useful first release.
- Candidate storage and authoritative approval event; atomic promotion or
  deterministic repair when filesystem artifacts and the log disagree.
- Evidence capture and change detection between proposal, approval and launch:
  how a changed partial diff affects keep/change/remove instructions.
- Planner revision limits, developer/reviewer counters and resume entry point
  after approval. State which counters reset and which remain cumulative.
- Whether planning artifacts can evolve without breaking existing spec-tamper
  detection. Approval is the only authority for a changed contract.

## Acceptance scenarios

The design must map each scenario to observable outcomes and proposed tests:

- Stop during development, correct a requirement, approve and continue while
  retaining useful partial code and reviewing the complete original diff.
- Cancel revision, reject a candidate or receive malformed planner output;
  approved artifacts and partial code remain recoverable.
- Crash before candidate persistence, after persistence, during approval
  promotion and after approval but before developer launch; replay chooses
  one contract deterministically and never skips approval.
- Resume twice after a revised developer/verify/reviewer interruption;
  counters, findings and usage remain consistent.
- Another session holds the lock, cancellation is pending, candidate contents
  change, partial work changes, or frozen inputs change; refuse or revalidate
  according to an explicit policy before execution.
- Existing non-revision logs preserve ordinary resume and crash-healing behavior.

## Agent prompts

Run the design prompt first. The implementation prompt applies only after the
resulting design has been reviewed and explicitly approved by the user.

### Design agent — ready to send

```text
Work in /Users/andreafalcon/dev/agent-brains. Read AGENTS.md and
docs/plans/post-stop-plan-revision-brief.md. Design the explicit post-stop
requirement-revision workflow described there. Inspect the current event,
artifact, locking, freeze, approval and replay code before recommending changes.

Produce .ai/features/post-stop-plan-revision/spec.md and tasks.md in English.
For every decision listed in the brief, choose a bounded policy and justify it
with code references. Include a state-transition table, event/artifact schema,
crash-recovery matrix, compatibility rules and observable acceptance criteria.
Compare same-run epochs with a linked successor and recommend one. Identify
any unresolved decision that prevents implementation rather than hiding it in
a task. Order tasks so each has a concrete deliverable and verification.

Scope is design documents plus their roadmap/progress links. Preserve runtime
code, local model configuration, existing unrelated edits and all consumer
repositories. Verify local links and git diff --check. Do not commit or push.
Return the recommendation, tradeoffs, unresolved questions and files changed.
```

### Implementation agent — after design approval

```text
Work in /Users/andreafalcon/dev/agent-brains. Read AGENTS.md,
.ai/features/post-stop-plan-revision/spec.md and tasks.md. Implement the
user-approved design, preserving unrelated local changes. If the documents
still mark a blocking design choice unresolved, report it before dependent work.

Use the existing workflow ports, locks and deterministic replay patterns.
Cover the acceptance scenarios with meaningful regression tests, especially
approval/crash boundaries, original-baseline retention, frozen-input guards,
stale-result invalidation and repeated resume accounting. Keep ordinary resume
compatible. Update command documentation and progress with observed evidence.

Run npm test, npm run typecheck and git diff --check; add npm run smoke:pi
when workflow/SDK integration changes. Report exact outcomes and limits. Live
provider completion must be reported separately from fixture checks. Keep
consumer repositories untouched. Do not commit or push.
```

## Review of the pre-existing local changes

Keep these review units separate when preparing commits:

- Model selection: `.pi/pi-brain.json` plus the corresponding progress note.
  The new planner/reviewer combination has no recorded live validation.
- Revision follow-up: the roadmap observation, this brief and their progress
  pointers. They establish a design task, not a shipped capability.
- Methodology assessment: `docs/research/kostysh-methodology-assessment.md`
  plus its retained-decision pointer. Its external-source claims were not
  independently revalidated in this handoff.

Candidate commit subjects after review: `chore(pi): update planner and reviewer
model settings`, `docs: prepare post-stop plan revision design`, and
`docs: record Kostysh methodology assessment`. Split progress hunks accordingly.
