# Progress

**Last Updated:** 2026-11-10
**Current Phase:** Global workflow validation complete; per-repository migration
and existing roadmap follow-ups remain separate.
**Active Task:** Review approved; documentation and evidence archive are being
committed. The last 34
invocation cells passed (OpenCode 7, Pi 13, Codex 14); no matrix cell remains.
T7 is complete, AC8 satisfied and M3's source tracker reconciled. AC5 remains
satisfied with its recorded limits. The external review found no further
findings. RV1 remains resolved.

## Current state

- Global workflows: T1–T6 delivered; T7 is complete, AC8 satisfied and M3
  validation complete as of 2026-11-10, using all 50 route/CWD cells plus
  previously accepted selector and qualified running-session refresh evidence.
  The final 34 invocations have green original results, native provenance,
  zero model tools, exit 0, absent owned groups and clean consumer Git.
  [Final validation/handoff](../../docs/evals/global-workflows/T7-2026-11-08.md#final-residual-validation-and-acceptance-reconciliation--2026-11-10).
  AC5 is satisfied against its literal criterion at fixture scope: gate cancel
  and interrupted-run resume each ran in a real Pi 0.85.1 TUI with persisted
  outcomes in the existing run schemas (resume ended needs_human via reviewer
  escalation, not completed).
  [Tasks](../features/global-workflows/tasks.md) ·
  [T7 evidence and limits](../../docs/evals/global-workflows/T7-2026-11-03.md) ·
  [Bounded continuation](../../docs/evals/global-workflows/T7-2026-11-08.md).
- M1 (`6567873`) and M2 (`06039e9`) are committed. M3 global installation,
  CLI and interactive validation are verified at the approved pilot scope;
  the source-plan refresh checkbox is reconciled. The review approved this
  documentation scope; no new installation or rollout occurred.
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

- No T7 invocation or AC8 refresh check remains pending. Evidence is mixed-date
  and version-qualified: new residual baselines Codex 0.167.0 / OpenCode 2.2.6,
  Pi 0.85.1; existing approved observations are reused. Earlier failed driver
  verdicts and the November 9 stop-rule deviation remain in the report. The
  last 34 invocations passed with no stop-rule exception. Private packages were
  preserved at `/Users/andreafalcon/.local/state/agent-brains/t7-final-validation-20261110/`;
  the final manifest and byte-for-byte package copies were verified. Three live
  batch packages have no root manifest. The historical AC5, OpenCode root and
  residual packages, earlier attempts, and available T7 runner artifacts were
  also archived and inventoried. The November 3 selector/refresh observations
  have no separate raw capture identified; their evidence remains the report's
  account of user-supplied observations. This private archive is evidence
  custody, not a durable test suite. [Archive index](../../docs/evals/global-workflows/T7-evidence-archive-index-2026-11-10.md).
  [Full evidence and limits](../../docs/evals/global-workflows/T7-2026-11-08.md#final-residual-validation-and-acceptance-reconciliation--2026-11-10).
- OpenCode marker removal was not reliably visible in the existing conversation;
  a fresh conversation in the same process returned ABSENT. Cache versus model
  context reuse remains undetermined. Codex/Pi observed removal in conversation.
- AC5 live cancel/resume is now observed at disposable-fixture scope: gate
  cancel (planner completed, plan present, no approval/developer, content
  unchanged, cancelled outcome persisted, lock released) and interrupted-run
  resume (authentic post-approval SIGKILL, `/flow resume` from the persisted
  log, resumed develop phase, no re-planning or re-baselining, original
  artifacts, terminal needs_human outcome persisted). The earlier Pi `-p`
  stale-context limit is a separate, already-recorded observation. Formal AC5
  reconciliation confirms compatibility; resume-to-completed is unobserved
  and not required by AC5.
  [Scenario evidence and limits](../../docs/evals/global-workflows/T7-2026-11-08.md#scenario-2--live-interrupted-run-resume-observed).
- T9 compatibility remains open: skill-loading evidence does not establish full
  Pi engine compatibility. Specific owners are not assigned in this tracker.

## Next actions

1. Keep RV2 planner reliability and RV3 routing guards in their existing
   backlog; RV1's snapshot fix does not implement them.
2. Review the final evidence/documents and confirm the historical evidence
   inventory in the [archive index](../../docs/evals/global-workflows/T7-evidence-archive-index-2026-11-10.md).
   Available AC5 and earlier OpenCode packages are preserved; no separate raw
   selector/refresh capture was identified, so retain the report's stated
   user-observation limit. No repeated manual matrix, selector, refresh, AC5 or
   RV1 test is pending. T7/AC8/M3 validation is complete at the approved CLI/TUI
   scope; M4 and T9 remain separate. User review approved the documentation
   changes for commit; no push was requested.
   [Final validation and handoff](../../docs/evals/global-workflows/T7-2026-11-08.md#final-residual-validation-and-acceptance-reconciliation--2026-11-10).

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
