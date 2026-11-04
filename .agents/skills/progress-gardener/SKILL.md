---
name: progress-gardener
description: Review and condense .ai/memory/progress.md when current status is buried in completed history, duplicate updates or canonical-source detail. Propose an evidence-linked rewrite and destinations; remain read-only until the user approves the concrete changes. Routine task-status updates do not require this skill.
license: MIT
metadata:
  management: local
  provenance: original
---

# Progress Gardener

Keep `.ai/memory/progress.md` a useful current-state snapshot: current phase,
active work, blockers and next actions, with links to their canonical owners.
Preserve decisions, constraints, uncertainty and evidence while reducing history
that obscures what happens next.

## Scope and authority

Use this skill for a requested progress cleanup or when accumulated history
obscures current work. Size and age are review signals, never deletion rules.
For a hierarchy-wide documentation audit use `context-audit`; for lessons use
`lessons-gardener`. Neither workflow is required for this targeted pass.

Project paths below are relative to the consuming project's root. Establish
that root from applicable instructions and repository topology, including when
invoked from a subdirectory. If the tracker is absent or empty, report that
and stop; creating one is a separate task.

Respect the project's ownership rules and existing tracker conventions. Current
state belongs in progress; requirements and task detail in feature documents;
priorities in the designated roadmap; durable decisions in the established
decision records; implementation facts in code, tests and configuration.
Research and session narratives are evidence, not current authority. Inspect
the actual owner before treating a summary as redundant.

## 1. Inspect and account

Read applicable `AGENTS.md`, the whole tracker, and any project tracker template
or format rule. Inventory its entries with source line ranges or stable headings
and short identifying excerpts. Record the inspected revision or content hash
and working-tree changes so later approval refers to a known baseline.

Follow links and read canonical sections needed to classify candidates; inspect
code or read-only Git history only where needed to verify a claim. Avoid loading
all feature documents or session logs. Check both the destination's existence
and whether its content preserves the specific information being removed.

Classify every entry, splitting mixed entries into distinct facts as needed:

| Action | Required basis |
|---|---|
| KEEP | Current state, active blocker, actionable next step, or unresolved information with no safe destination |
| CONDENSE | Same useful facts in shorter text, preserving qualifications and links |
| MERGE | Identified duplicate facts; retain unique details and the latest verified state |
| MOVE | Useful detail outside the tracker's role; identify an exact existing destination section or propose its complete new content |
| REMOVE | Verified superseded claim or redundant history with a resolving source preserving its useful information; explain why no unique fact is lost |

Age, a Done heading, a missing link, or a completion claim alone does not prove
obsolescence. A broken reference is an unresolved preservation problem. Keep
the information until its source is recovered or its disposition is explicitly
approved. Distinguish verified contradictions from suspected staleness; retain
uncertain facts with their uncertainty rather than guessing the current state.

Preserve open dependencies, task IDs, owners, approval boundaries, deferred
scope, decisions, residual limits and unverified acceptance criteria. Completed
implementation does not establish live validation, rollout, approval or efficacy.
Keep a concise current caveat and pointer when detailed evidence moves elsewhere.
Never promote an inference to a decision or close work as a side effect of pruning.

## 2. Present a concrete proposal

Report in chat; remain read-only across the project, including destinations and
archives. Do not create a proposal file unless explicitly requested; permission
to save a proposal authorizes only that artifact, not the cleanup.

Present:

- **Scope and limits:** inspected sources and baseline, missing or unverified
  evidence, and a concise assessment of what obscures current state.
- **Disposition ledger:** stable `PG-n` IDs covering every original entry,
  action, source path/lines and excerpt, evidence, reason, exact destination
  path/section or surviving entry, and certainty. For removal show the removed
  text; a large entry may be identified by its complete deletion in the diff.
- **Proposed tracker:** the complete replacement text or a complete unified
  diff. Make current phase/active work, blockers and ordered next actions easy
  to locate. Use the project format; if none exists, use those headings. Mark
  unknown owners or state explicitly rather than inventing them. Keep deferred
  work visible through concise pointers. Preserve dates and task identifiers;
  use today's date only for the actual update, not as a new completion date.
- **Destination changes:** exact patches or complete new file contents for
  every proposed move. Prefer existing owners over a new archive; propose a
  project-appropriate archive only for unique history worth retaining. Rebase
  moved relative links for the destination. Do not dump the whole tracker into
  another auto-loaded file or move routine narrative into lessons.
- **Preservation check and approval scope:** map each decision, constraint,
  limit and unique fact affected by pruning to its surviving text or inspected
  destination section. Summarize action counts, unresolved items and the exact
  files/PG IDs requiring approval. State that no files changed.

Every original entry must be accounted for. A MOVE is pending until its
destination content is included in the proposal; if it cannot be specified,
keep the fact in progress. Git history alone is not an adequate destination for
operationally relevant information. Request explicit approval of this concrete
rewrite and its destination edits, then stop. A request to audit or clean up
does not itself approve a rewrite that has not yet been shown.

## 3. Apply only after approval

Approval may cover all or selected PG IDs and destination edits. Re-read the
tracker and affected sources; if changes invalidate the proposal, revise the
affected portion and obtain approval for that revision before applying it.
Preserve unrelated user changes. For a partial approval, keep every unapproved
fact and apply a removal only when its approved destination is also included.

Write approved destination content before removing its source. Verify the
resulting diff against the ledger: every original fact has its approved
disposition, current state/blockers/next actions remain explicit, and all
retained or moved operational links and anchors resolve from their new paths.
Run the project's proportionate documentation checks and `git diff --check`.
Report changed files, preserved limits, checks and anything still unresolved.
Commit, push, consumer migrations and unrelated documentation repairs remain
outside this skill's authorization.
