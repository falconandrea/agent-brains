# Progress

**Last Updated:** 2026-11-08
**Current Phase:** Global workflow validation and per-repository migration.
**Active Task:** None selected; RV1 is resolved, next priorities are the T7/AC8/M3
and AC5 evidence work and per-repository M4 rollout.

## Current state

- Global workflows: T1–T6 delivered for the CLI scope; T7/AC8/M3 remain open.
  AC5 live cancel/resume is unverified; unit coverage does not close it.
  [Tasks](../features/global-workflows/tasks.md) ·
  [T7 evidence and limits](../../docs/evals/global-workflows/T7-2026-11-03.md).
- M1 (`6567873`) and M2 (`06039e9`) are committed. M3 global installation
  and CLI discovery/invocation are verified; full interactive coverage is pending.
- M4 first wave is reviewed and committed; rollout remains incomplete.
  The migration log also records ga-analytics work and recovery corrections
  through 2026-11-04 as uncommitted and awaiting review. Do not infer rollout
  completion from the first wave or CLI evidence.
  [Migration status and log](../../docs/plans/cross-harness-workflow-migration.md).
- progress-gardener is locally implemented in common (inherited by full), with
  operational routing and README guidance; user reviewed and authorized commit.
  Creation checks passed 476/476 tests, typecheck and diff check; skill-creator's
  Python validator was unavailable because PyYAML was missing.
- RV1 is resolved: `snapshotTree` builds the scratch index in steps that
  keep git's untracked-files machinery away from a bulk add — `git add -u`
  for tracked updates, `git ls-files --others --exclude-standard` (runtime
  paths excluded) to enumerate untracked files, `git update-index --stdin`
  to add those exact paths — so the exact historical excludes
  (`.pi/pi-brain.lock*`, `.pi/pi-brain/`) no longer trip git's ignored-path
  complaint for any ignore-rule shape, and .gitattributes clean filters run
  only on applicative content (rounds P2: post-add removal was too late for
  failing filters; wildcard-broken pathspecs swallowed lookalike
  applicative files and still collected an ignored `.pi`). Real-Git
  regressions cover ignored runtime, failing filters on runtime and
  applicative files, lookalike-path precision, the whole-`.pi` ignore case,
  user-index preservation, and a subprocess test proving a mid-stream stdin
  failure (EPIPE when git dies on bulk input) rejects catchably with the
  command's real cause instead of crashing the Node process; non-ignored and
  tracked-runtime cases reuse existing coverage. `npm test` 484/484,
  typecheck and diff check pass.
  Review accepted and commit authorized on 2026-11-08.
  Limits: verified on local Git 2.54 only; no repeated live `/feature` run.
  [RV1 record](../../docs/plans/pi-plugin-adoption-roadmap.md).

## Blockers and validation gaps

- T7 lacks interactive invocation coverage beyond the recorded samples.
  The user requested that repetitive manual testing stop; agree the remaining
  validation approach or scope before resuming those probes.
- OpenCode marker removal was not reliably visible in the existing conversation;
  a fresh conversation in the same process returned ABSENT. Cache versus model
  context reuse remains undetermined. Codex/Pi observed removal in conversation.
- AC5 live cancel/resume remains unobserved. Pi `-p` stale-context behavior
  prevented the intended interactive cancellation probe.
- T9 compatibility remains open: skill-loading evidence does not establish full
  Pi engine compatibility. Specific owners are not assigned in this tracker.

## Next actions

1. Keep RV2 planner reliability and RV3 routing guards in their existing
   backlog; RV1's snapshot fix does not implement them.
2. Agree the remaining T7/AC8/M3 and AC5 evidence work without inferring completion
   or restarting repetitive manual probes.
3. Review ga-analytics migration/recovery evidence, then continue M4 only through
   separately authorized per-repository work with live discovery before link removal.
4. Retain existing source-plan tasks: code-review-follow-ups T7/T9/T10 and
   main-review-hardening U12/U13/U14. T8 is covered by U6/U8; no duplicate task.
   [Review follow-ups](../features/code-review-follow-ups/tasks-code-review-follow-ups.md) ·
   [Hardening tasks](../features/main-review-hardening/tasks-main-review-hardening.md).
5. RV4: on the next suitable real task capture observed failing/passing checks.
   The local verification pilot has no selected target; explicit verification
   outcomes remain pending. C3-V awaits the next explicitly requested real
   security review; no efficacy gain is established.
   [Follow-ups and priorities](../../docs/plans/pi-plugin-adoption-roadmap.md).
6. Reconcile RV5's source-roadmap checkbox with the approved and verified progress
   cleanup; the roadmap was left unchanged in this task.

## Retained decisions and deferred work

- C1/C2/C3 instruction work is complete. C4 is closed as a bounded assessment:
  corrected S1 A/B showed no detectable benefit, the full-workflow comparison
  is inconclusive, and its unmet criterion was explicitly retired. C5 is a
  bounded closure; no broad skill-efficacy or causal savings claim.
  [Decisions and evidence](../../docs/plans/pi-plugin-adoption-roadmap.md).
- W1/W4 are complete; W2/W3/R2/S3, automatic hooks, code-writing workers and Jev
  retain their deferrals/conditions. Property/mutation work is deferred.
  R1 trials need an explicit request; no Portal, full Cloudflare installation,
  OS sandbox or extra mandatory reviewer is selected. Analytics remains excluded.
- test-review stays an explicit experimental extra; useful checks were folded
  into C2. Two unlink preservation probes were verified only in a temporary
  fixture; shipping tests were not changed by that experiment.
  [Pilot evidence](../../docs/evals/test-review/README.md).
- Curated consumer refreshes and independent manual copies remain per-consumer
  work; humanizer copies need the whole folder.
  [Adaptation note](../../docs/research/alfonso-skills-adaptation.md).
- Preserve C1/C2/C3 behavior, Pi commands and resume artifacts. Migration is
  per repository; remove only destination-proven managed links. Keep private
  backup/recovery details in the relevant ignored local notes.

## History

The [historical snapshot](../../docs/history/progress-2026-11-04.md) preserves
all 64 original entries, including superseded status, decisions, limits and
verification history. Read it only for historical evidence; current task detail
and priorities remain owned by the linked feature documents and plans.
