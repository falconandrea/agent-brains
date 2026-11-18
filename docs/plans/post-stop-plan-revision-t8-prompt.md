# Post-stop plan revision — T8 developer prompt

Prepared 2026-11-17. Scope: T8 implementation, followed by orchestrator
review before T9. T7 is implemented, verified and approved in commit
`94cc164`. Its recorded 635/635 tests, typecheck and scripted smoke results
are historical evidence, not a fresh run for this handoff.
The [task list](../../.ai/features/post-stop-plan-revision/tasks.md#t8--extension-command-flow-revise-and-revision-session-runner)
owns the deliverable; the [spec](../../.ai/features/post-stop-plan-revision/spec.md)
owns behavior.

## Developer — ready to send

```text
Work in /Users/andreafalcon/dev/agent-brains. Implement ONLY T8 from
.ai/features/post-stop-plan-revision/tasks.md, then stop for orchestrator
review. Read AGENTS.md, .ai/memory/progress.md, the feature spec and tasks
before editing; focus on spec §§5–7, §9–11, §13–16 and §18 assumption 2.
T1–T7 are implemented and approved; T7 is commit 94cc164.

Inspect git status and the existing diff first. Preserve all unrelated local
edits, especially docs/research/oxlint-anti-slop-takeaways.md and the oxlint
entry in progress.md. Preserve model settings and every consumer repository.
Use repository command conventions. No commit, push or additional agents.

Inspect the actual integration seams before choosing a minimal design:
- extensions/pi-brain.ts: flow dispatch/completions, ActiveRun, feature start,
  handleResume, deterministic already_decided healing and runtime creation.
- src/workflows/revise.ts: eligibility/lifecycle, launchIncomplete,
  runRevisionSessionCore, repairRevisionLaunch, launchSuccessorRun and their
  lock ownership contracts. Reuse these implemented paths.
- src/run-launcher.ts, src/pi/flow-stop.ts and src/ui-safe.ts: detached
  execution, running/cancelling blocking, cancellation and safe UI effects.
- src/pi/human-input.ts and src/ports.ts: existing human-input ports and
  dialogs; tests/run-start.test.ts, tests/revise.test.ts and launcher tests.

Add /flow revise <runId>, command usage and argument completions. Dispatch
must work without an active run. Missing id prints usage without starting
work. Enforce spec §6 ordering: active-run/blocksFeatureStart check → read
log → eligibility/lifecycle and incomplete-launch routing → preconditions
→ lock. Reject running AND cancelling sessions before setup or mutation.
Reuse lock-held/stale-lock refusals; do not override them. Reuse the existing
already_decided heal, then re-evaluate its actual healed status. Fail closed
on corrupt evidence. Guard artifact hashes, original baseline, verify freeze
and repo-state digest per §13, preserving legacy absent-field notices.

Route existing open/candidate-pending sessions to the resume-revision dialog,
approved-pending-launch to repair, and launched-but-incomplete to that SAME
repair path. A launched successor with phase.started redirects to the
successor; never open a competing revision or rerun a started successor.
Read persisted evidence rather than trusting session.json or process memory.

Implement the correction/candidate dialogs through the existing session core
and human-input ports. Offer continue (optionally edited correction), explicit
abandon, and candidate approve/reject when applicable. Before confirming
abandon, disclose this predecessor's actual outcome: interrupted/failed can
resume under the old contract; cancelled/needs_human still refuse ordinary
resume as terminal_outcome and require a new revision or feature. Empty
notes, dialog dismissal and stop are not implicit abandonment. Preserve
event-derived planner budgets, invalid-output recovery and verbatim notes.
At the budget limit do not offer another planner round. Honor §10's changed
partial-work approval choices and the existing launch-time confirmation.
After persisted approval do not offer ordinary abandonment: use launch repair;
only the existing B8 explicit forced-abandon path may report unrecoverable
approval contents and the actual artifact state.

Create a detached revision session runner mirroring launchRun's lifecycle
disciplines, but NEVER launchRun around the revision session itself: it would
append workflow.outcome/failed into the predecessor. Occupy the extension's
active slot with workflow: "revision" so status/stop work during the planner.
Wire cancellation to the session signal; cancellation/provider failure must
settle the session, preserve recoverable revision state and release its lock.
Keep session status in the active slot/session cache and protect UI effects
with safeUi. Predecessor execution history remains unchanged: the revision
session appends only revision.* events via appendCritical (apart from the
explicit pre-session already_decided heal). Never synthesize predecessor
loop, workflow.outcome, workflow.failed or workflow.completed events on session
settlement. Never reset, stash, clean or commit partial work.

Connect approved sessions and repair to T7's REAL launchSuccessorRun. Make
lock and active-slot ownership explicit across the detached handoff: the
session releases exactly once on refusal/failure before handoff; after
handoff, the successor launcher owns release until successor settlement.
The revision runner's finally must neither release the successor's lock nor
clear its active status. Preserve T7's preflight both before and AFTER the
async changed-diff confirmation, zero developer calls on refusal, original
baseline, seed integrity and B7c resumedPhase omission. Avoid rebuilding or
bypassing the approved promotion/replay machinery.

Keep new testable orchestration Pi-free under src/ with fakes in tests/;
keep Pi-specific adaptation in the extension. Add behavioral tests exercising
the command wiring or the same injected orchestration used by the handler,
plus dispatch/completion coverage; source-position assertions alone are not
enough. Cover ordered early refusals (running, cancelling, unknown/ineligible,
corrupt evidence, failed preconditions, held lock); already_decided healing;
existing lifecycle dialogs and BOTH incomplete-launch repair entry states;
per-status abandonment disclosure, approval/rejection and dismissal; status
and stop while detached; provider failure/cancellation and throwing UI effects;
no execution-terminal events appended to P by the session; exactly-once lock
release before handoff and at successor settlement, including handoff failure
and active-slot preservation. Demonstrate the real extension-to-T7 path with
injected dependencies. Keep existing T1–T7 recovery tests green. These are T8
integration regressions; the full AC-1…AC-13 end-to-end matrix stays T9.

Run focused tests including tests/run-start.test.ts and tests/revise.test.ts,
and any new command/session tests, then npm test, npm run typecheck,
npm run smoke:pi and git diff --check. Inspect final status/diff for unintended
changes. Report exact observed results and environment restrictions; scripted
smoke and fakes do not establish a live-provider command/session observation.
No real-provider or consumer run is authorized by this task.

Update progress.md and the T8 task status in place with implementation,
verification and limits, preserving the local oxlint material. Mark T8 as
awaiting review, not approved. T9 acceptance coverage, T10 log pointer
rendering/README documentation and T11 final evidence closure remain pending.
Do not refactor revise.ts merely for size, expand usage accounting, change
models, redesign recovery or introduce another workflow. Report changed
files, ordering/handoff decisions, checks and unresolved findings. Stop after
T8 for review; no commit or push.
```

## Review — after developer delivery

Review only the T8 diff against the task and spec; distinguish pre-existing
oxlint edits from the delivery. Inspect the actual extension dispatch and
adapters as well as the Pi-free orchestration. Verify ordering with behavioral
evidence, all lifecycle routes, per-status disclosure and explicit user
choices. Trace cancellation/failure and the revision-to-successor handoff:
no predecessor terminal-event pollution, no early/double lock release, no
successor active-slot cleanup by the old session. Preserve both T7 preflights
and the approval/archive/seed recovery guarantees.

Reproduce concrete findings with focused tests and report severity, file/line,
trigger and consequence. Re-run proportionate verification against the final
diff, distinguishing fresh results from developer-supplied evidence and
fixture coverage from live observations. Request fixes for confirmed defects
and review them before approval. Do not implement T9–T11, commit or push as
part of review. Record the verdict and remaining limits before proceeding.
