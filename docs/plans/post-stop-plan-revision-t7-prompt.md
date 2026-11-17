# Post-stop plan revision — T7 developer prompt

Prepared 2026-11-17. Scope: T7 implementation, followed by orchestrator
review before T8. T7 was implemented and final review approved on
2026-11-17; this prompt is retained as the implementation brief. Next: T8.
The [task list](../../.ai/features/post-stop-plan-revision/tasks.md#t7--successor-construction-launch-and-replay-changes)
owns the deliverable; the [spec](../../.ai/features/post-stop-plan-revision/spec.md)
owns the behavior. T6's final recorded evidence is 617/617 tests (2026-11-15),
not a fresh verification of this handoff.

## Developer — ready to send

```text
Work in /Users/andreafalcon/dev/agent-brains. Implement ONLY T7 from
.ai/features/post-stop-plan-revision/tasks.md. Read AGENTS.md, current
progress, and spec.md §§7–11, §13, §15–16 before editing. Preserve unrelated
local edits, model settings and all consumer repositories. No commit or push.

Inspect the existing integration seams:
- src/workflows/revise.ts: SuccessorLauncher, canonical successor seed,
  repairRevisionLaunch and B7a–B7c launch decisions.
- extensions/pi-brain.ts: handleResume's original-baseline reconstruction,
  preconditions, changed-diff confirmation and launchRun call.
- src/run-launcher.ts, src/workflows/feature.ts and
  src/workflows/resume.ts: detached lifecycle, ResumeState, resume-mode
  baseline guard and deterministic replay.
- tests/revise.test.ts, tests/resume.test.ts and tests/run-launcher.test.ts.

Wire the T6 promotion/repair output to the real launchRun in the workflow
layer through a testable integration seam. Keep new core logic Pi-free;
reuse the existing launcher/lifecycle disciplines. The /flow revise command,
revision-session UI and extension dispatch are T8 and remain outside this
task. The deliverable must exercise the real launcher with injected workflow
dependencies, rather than merely adding another fake launch callback.

Construct the initial successor ResumeState exactly as spec §7 step 7:
develop phase; fresh developer/review/verify counters; empty fixes and
blocking-id set; copied carried usage; rebuilt ORIGINAL baseline preserving
original digests and verification freeze; approved contract hashes; persisted
revision context. Carry no stale review, verification result or interrupted
patch hash. The successor must skip git.baseline entirely. Preserve legacy
absence of optional freeze/digests rather than synthesizing new originals.

Respect the launch request's resumedPhase omission in B7c. Verify the actual
launchRun behavior at B7a/B7b/B7c: no duplicate workflow.started and at most
one workflow.resumed, including repeated repair before phase.started.
Retain the persisted-approval and seed-verification authority from T6.

Make only the two planned semantic changes to replayRunLog: seed usage from
workflow.started.carriedUsage, then add successor-local usage once; reconstruct
ResumeState.revision from workflow.started.revision on EVERY resume. Thread
that context to the existing developer/reviewer prompt options as needed.
Ordinary logs keep revision undefined and their prompts unchanged. Keep
unrelated replay/parser refactoring outside this task.

Implement the approval-to-launch partial-diff confirmation from spec §10
using the askResumeWithChangedDiff pattern. A changed diff requires explicit
confirmation before execution; refusal must leave recoverable approved state.
Preserve frozen-input/precondition guards per §13 before developer execution.

Add meaningful tests proving: real launch integration with original baseline
(git.baseline throws if called); fresh initial state; changed-diff accept and
decline behavior; B7 marker omission and repeated-repair behavior; carried
usage plus successor-local events without double counting; revision context
on repeated replay/resume and developer/reviewer delivery; ordinary-log
compatibility. Two replays of identical successor events must yield identical
counters, usage and revision context. Keep existing T6 recovery tests green.

Run focused revision/resume/launcher tests, then npm test, npm run typecheck,
npm run smoke:pi and git diff --check. Use repository command conventions.
If an environment restriction blocks a check, report the exact limitation;
do not replace it with a passing claim. Fixture/scripted checks do not prove
live-provider completion. No real-provider or consumer run is part of T7.

Update progress and the task status in place with observed evidence and
remaining limits. Report files changed, integration choices, exact check
results and unresolved findings. Stop after T7 for orchestrator review;
T8–T11 remain pending. Do not spawn additional agents.
```

## Review boundary

Review the resulting diff against T7 and the spec, with particular attention
to original-baseline retention, usage accounting across a revision chain,
revision context after a second resume, changed-diff refusal and the real
launcher's synchronous marker behavior. Preserve T6's approval/archive/seed
recovery guarantees. Record findings and verification limits before T8 starts.
