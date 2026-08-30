# W1 — Solution capture design

**Status:** W1.1 design candidate, ready for the design approval gate

**Scope:** define the shape, capture gate, maintenance signal, and retrieval
contract for verified solution documents. This document does not add the
template to `templates/.ai/memory/`, change `scaffold.sh`, or alter the
workflow skills; those actions belong to the later W1 phases after the pilot.

## Goal

Keep `.ai/memory/lessons.md` as a cheap synthetic index while making a small
set of difficult, reusable solutions discoverable by future agents.

The canonical project artifact is:

```text
.ai/memory/
├── lessons.md
└── solutions/
    ├── _TEMPLATE.md
    └── <category>/<problem-slug>.md
```

There is no second memory root. A solution document is not a general
framework note, a task log, or a copy of the final diff.

## Capture gate

Capture is proposed only after the problem has a positive verification. A
user may also explicitly invoke the capture workflow, but that invocation
still produces a proposal and uses the same approval gate. The solution is
written only after the user approves that proposal. No background or
automatic capture is performed.

Create a solution document only when at least three of these five conditions
hold:

- the cause is not evident from the final diff;
- the problem plausibly recurs;
- the solution has been verified by an appropriate check;
- the knowledge is not already documented;
- the problem involved hidden coupling, failed attempts, or expensive
  diagnostics.

Positive verification is a separate hard precondition, not a substitute for
the three-condition threshold. If it is not met, do not create the document
even if three other conditions are present.

Fast-path tasks, obvious fixes, and generic framework knowledge produce no
solution artifact.

## Minimal frontmatter

Only fields used by retrieval or maintenance are included. The canonical
frontmatter appears once in the document template below.

Rules:

- `title` and `tags` provide retrieval terms;
- `category` mirrors the directory and supports scoped searches;
- `created` and `updated` support maintenance and stale-solution review;
- dates use ISO-8601 calendar format;
- `category` and the problem slug are single lowercase path segments using
  hyphens, so a reference always resolves below `solutions/`;
- `status`, author, confidence, and workflow metadata are intentionally
  omitted: a solution document is publishable only after verification, and
  adding unused metadata would increase maintenance cost.

For the pilot, `updated` is a maintenance signal, not a validity claim. A
document whose `updated` date is more than 180 days old is a review candidate
when it is retrieved or when maintenance runs. The reviewer checks its
references and re-runs the documented verification before changing it. Age
alone never invalidates, archives, or deletes a solution. W1.6 evidence must
confirm or revise the 180-day threshold before it becomes a promoted default.

## Capture proposal and approval

The agent prepares a proposal after the positive verification and before
writing anything. The proposal contains:

1. the proposed title, category, slug, and the one-line `lessons.md` index
   entry;
2. the verification command or observation and its relevant result;
3. a checklist showing which of the five capture conditions hold, with the
   separate positive-verification precondition recorded;
4. the references that support the root cause and applied solution; and
5. any claim that is still a hypothesis, which must be removed or kept only
   in `Failed attempts` in the document.

There is one gate: the user explicitly approves or rejects that proposal.
Approval authorizes writing the solution and its single index reference only;
it does not authorize unrelated workflow, product, or architecture changes.
Rejection leaves both the solution directory and `lessons.md` unchanged.

The workflow never edits `AGENTS.md` automatically to make a solution
visible. Visibility comes from the approved solution document and its single
index reference.

## Document template

The body must distinguish verified facts from hypotheses and attempts:

```markdown
---
title: Short problem title
category: lowercase-category
tags: [symptom-term, subsystem-term]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Short problem title

## Symptoms (observed)

- What happened, including the exact error or visible behavior.
- Where and under which conditions it occurred.

## Root cause (verified)

Describe the causal chain supported by evidence.

## Failed attempts

Record only attempts that were actually made and why they did not solve the
problem. For each attempt, distinguish the observed result from an
`Hypothesis (not verified)` explanation. A failed attempt is not evidence for
the verified root cause unless a later check confirms that explanation.

## Applied solution

Describe the smallest change or procedure that resolved the problem.

## Verification

State the command, test, reproduction, or observation that proved the
solution worked, including the relevant result.

## Prevention

Record a concrete guard, check, convention, or diagnostic that can prevent or
shorten a recurrence.

## References

- `path/to/file`
- `path/to/test`
- issue, PR, or ADR reference when one exists
```

Do not add an unverified `open questions` section. A hypothesis may appear
only inside a failed attempt and must not be presented as the root cause or
solution.

## Index and retrieval path

`lessons.md` remains one line per lesson. When a lesson has an extended
solution, its line contains a retrieval cue and exactly one reference, for
example:

```text
- [2026-08-30] [[Deployment]] Cache invalidation can be skipped when the deploy fingerprint is unchanged. Refs: [cache-invalidation.md](solutions/deployment/cache-invalidation.md)
```

The extended document is never copied into `lessons.md`.

The index line is written only after the document is approved and must retain
the existing `lessons.md` entry format: ISO date, category marker, one-line
summary, and a Markdown link after `Refs:`. It contains exactly one `Refs:`
link relative to `.ai/memory/lessons.md`. This one-reference rule is specific
to solution-backed lessons; it does not rewrite the general entry format used
by other lessons. If the solution is later updated, edit the existing line
rather than adding a second lesson for the same problem.

Retrieval is progressive:

1. Derive a small set of exact terms from the current symptom: error text,
   subsystem, relevant command, and one or two likely tags.
2. Search only the solution directory and the index with targeted `rg`
   queries, for example:

   ```bash
   rg -n -i --glob '*.md' 'cache|fingerprint|invalidat' .ai/memory/solutions/ .ai/memory/lessons.md
   ```

3. Read the full candidate document only when its symptom and context match
   the current problem.
4. Treat the document as relevant evidence, not as an instruction to skip
   reproduction or verification.
5. If there is no relevant match, continue through the normal workflow
   without creating an empty or speculative artifact.

The retrieval path is intentionally query-based; agents do not preload the
whole `solutions/` directory.

Retrieval failure is a normal outcome. A near match is not sufficient reason
to apply a documented solution: reproduce the current symptom, compare the
context, and run the candidate's verification after any change.

## Acceptance checks for the pilot

The W1 trial must demonstrate all of the following:

- **Fast path:** an obvious or one-line task produces no solution artifact and
  no unnecessary capture ceremony.
- **Correctness:** a candidate containing an unsupported claim is corrected or
  rejected before the approval gate.
- **Neutrality:** the workflow does not silently introduce a product or
  architecture decision; decisions remain explicit and user-approved.
- **Approval:** capture has one clear gate between proposal and writing.
- **Retrieval:** from a known symptom, a fresh agent finds the pertinent
  solution using targeted terms without reading every solution.
- **No duplication:** `lessons.md` stays in single-line format and the
  extended document contains the detail.
- **Fact boundaries:** the template makes observed symptoms, verified causes,
  failed attempts, applied solution, and verification distinguishable.

The two-problem trial records evidence for each check in a run sheet. One
problem must be an obvious fast-path task, and the other must be a difficult,
verified problem that qualifies for capture. A subsequent fresh session uses
only the symptom terms and the index to retrieve the captured solution. The
trial is successful only if that solution is found and used correctly; no
solution is captured for the fast-path task. The trial is capped at two
sessions and two real problems; it is not extended to compensate for a
negative or neutral result.

## Deferred work

The following are outside W1.1 and must not be performed as part of this
design change:

- W1.2/W1.6: prototype the `solution-capture` skill and run the two-problem
  trial in `extra/skills/` and disposable project artifacts;
- W1.3: copy the template into `templates/.ai/memory/` and add idempotent
  creation to `scaffold.sh`;
- W1.4: add targeted retrieval instructions to `feature` and
  `diagnosing-bugs`;
- W1.5: extend `lessons-gardener` with broken-reference, duplicate, and
  obsolete-solution checks.
