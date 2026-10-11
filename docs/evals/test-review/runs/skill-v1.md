---
name: test-review
description: >-
  Review whether tests meaningfully protect the contracts affected by a supplied
  diff. Reports missing regression protection, false protection and excessive or
  brittle tests. Explicit experimental review; does not write tests or fix code.
metadata:
  management: local
  provenance: original
  opencode/autoinvoke: false
---

# Test review

Evaluate whether automated evidence is necessary, effective, independently
grounded and proportionate. Report only. Remain within the supplied diff; read
surrounding contracts and existing tests when needed to judge its protection.
Do not redesign the feature or turn this into a general implementation review.

This experimental extra is invoked explicitly. It does not add a mandatory
review stage, install tools or authorize changes to a repository.

## Establish the review boundary

Accept a commit range, working-tree diff, correction delta or pasted diff. Resolve
Git references to commit IDs and record the exact comparison. Include untracked
files only when they belong to the supplied working change. Ask for the scope
only when it cannot be inferred from the request. For a historical range, read
files at the reviewed revision rather than silently mixing in later fixes.

Read applicable project instructions and the supplied requirements. Locate
existing protection before requesting additional tests. If a behavior has no
authoritative contract, name the uncertainty rather than inventing one.

## Judge the evidence

First identify the artifact's purpose. Documentation and non-behavioral edits
normally need no new automated tests. Visual choices may be verified through
rendering and inspection. Exploration needs a focused probe that answers its
question. Maintained software needs protection for material observable contracts.

For each material behavior or contract affected by the change:

- Identify its source: approved requirement, documented interface, reproduced
  bug, verified external schema or independently worked example. Product behavior,
  public module interfaces, persistence, permissions, resource cleanup,
  compatibility and preservation of user files all count.
- Locate the assertion that protects it at a stable boundary. Describe a concrete
  plausible defect and explain whether that assertion would detect it. A proposed
  mutation is reasoning, not an executed result. Existing coverage can suffice.
- Challenge circular expectations, invented provider fixtures, mocks that replace
  the behavior under test, swallowed command failures, and assertions that remain
  green despite the claimed regression. Internal interaction assertions are valid
  when the interaction itself is a contract, such as avoiding a provider call.
- Challenge redundancy and brittleness. Recommend deletion only when remaining
  evidence protects the relevant failure modes. Static types do not automatically
  protect runtime JSON, persisted state or remote input. Exact text, structural
  checks and snapshots can be legitimate when their contents are contractual.

Prefer the smallest useful correction: strengthen an assertion or fixture before
requesting a new suite. Use integration tests at stable boundaries, focused unit
tests for pure or tricky logic, and limited end-to-end checks when appropriate.
Neither test count, coverage percentage nor a green suite proves protection.

## Read-only execution

Do not modify implementation, tests, snapshots, fixtures, tasks or configuration.
Default to inspection. Run checks only when their side effects are understood
and isolated; never assume a test command is read-only. Do not run installers,
snapshot updates, live provider calls, or mutations in the supplied checkout.
An explicitly authorized mutation experiment may use a disposable copy only.
Respect local verification policy and state what was actually executed.

## Findings

Report must-fix findings first, then minor improvements or excess. Severity and
evidence status are separate: label each as **demonstrated defect**, **plausible
risk**, or **incomplete coverage**. Reserve must-fix for material gaps with a
concrete consequence; absence of a newly added test alone is insufficient.

Each finding includes:

- `file:line` at the reviewed revision and the affected contract;
- the defect current evidence would miss, or why a test is disproportionate;
- the smallest correction, or the deletion and protection that remains;
- whether the conclusion comes from inspection or an executed check.

Bound the report to consequential findings; do not fill a quota or request tests
for hypothetical combinations without a credible failure path. End with a brief
note on useful existing protection and verification limits. A clean review or a
purpose needing no new tests earns a plain statement.
