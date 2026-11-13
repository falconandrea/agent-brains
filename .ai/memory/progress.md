# Progress

**Last Updated:** 2026-11-13
**Current Phase:** Global workflow validation complete; M4 rollout and
existing technical follow-ups remain open.
**Active Task:** Progress cleanup and the Pi 1.5.2 migration are implemented,
verified and reviewed; commit authorized on 2026-11-13, no push requested.
Next: a bounded real-provider/fullscreen-TUI fixture run on Pi 1.5.2.

## Current state

- Global workflows T1–T7 are delivered; T7/AC8/M3 validation completed
  on 2026-11-10 at the approved CLI/TUI pilot scope. All 50 route/CWD
  cells are accounted for; no repeated matrix, selector, refresh or
  AC5 check is pending. Documentation/evidence committed as `9ce1a8e`.
  [Acceptance and limits](../../docs/evals/global-workflows/T7-2026-11-08.md#final-residual-validation-and-acceptance-reconciliation--2026-11-10).
- M1 (`6567873`) and M2 (`06039e9`) are committed. M4's first wave is
  reviewed and committed; rollout remains incomplete. The migration log
  records ga-analytics/recovery work through 2026-11-04 as uncommitted
  and awaiting review; its current checkout has not been re-inspected.
  [Migration status and log](../../docs/plans/cross-harness-workflow-migration.md).
- RV1 is resolved and committed as `9c1647d`. Historical verification:
  484/484 tests, typecheck and diff check passed. Limits: local Git 2.54
  only; no repeated live `/feature` run.
  [Implementation, regressions and review](../../docs/plans/pi-plugin-adoption-roadmap.md#review-reconciliation-follow-ups-verified-2026-11-01).
- progress-gardener is committed as `5535705`, in common/inherited full,
  with routing and README guidance. Creation checks: 476/476 tests,
  typecheck and diff check passed; the Python skill validator was
  unavailable because PyYAML was missing.
- T9 completed on 2026-11-12: exact Pi SDK peers 0.84.2, direct TypeBox
  1.3.14 and Node `>=24.12.0 <25` (observed 24.12.0/macOS arm64).
  Scripted-loopback SDK/workflow smoke, 484/484 tests and typecheck passed.
  [Evidence and compatibility limits](../../docs/evals/pi-compatibility/T9-2026-11-12.md).
  Superseded the same day by the 1.5.2 migration: peers now pin
  `pi-coding-agent`/`pi-ai`/`pi-tui` 1.5.2 and direct TypeBox 1.3.27; no
  source change was required (all engine tool schemas are plain JSON Schema,
  so Pi 1.5's `pi-schema` validation applies unchanged). Verified on 1.5.2:
  typecheck, 484/484 tests, `smoke:pi`, plus isolated Pi CLI 1.5.2 RPC-mode
  fixture runs — gate approval, `/flow stop` cancellation and SIGKILL
  interruption resumed with `/flow resume` to `completed`. Real-provider and
  full-workflow fullscreen-TUI runs remain unverified on 1.5.2. Global CLI
  1.5.2 was independently confirmed on 2026-11-13; the user reported a working
  `/stack` response (nodejs, 70%). This establishes command dispatch only,
  not real-provider workflow completion.
  [Migration evidence and limits](../../docs/evals/pi-compatibility/PI-1.5.2-2026-11-12.md).

## Blockers and validation gaps

- The 1.5.2 baseline is verified at scripted-fixture scope only: real-provider
  execution and a full workflow in the fullscreen TUI on 1.5.2 remain
  unverified, as do other Node majors/platforms. Global CLI 1.5.2 is now
  installed; the user-reported `/stack` result is a bounded command check.
  Historical skill loading on Pi CLI 0.85.1 does not establish engine
  compatibility with SDK 0.85.1.
- T7 evidence is mixed-date/version-qualified; residual baselines were
  Codex 0.167.0, OpenCode 2.2.6 and Pi 0.85.1. November 3 selector/refresh
  evidence is user-observed, with no separate raw capture identified.
  OpenCode removal required a fresh conversation in the same process;
  cache versus context reuse is unresolved. Codex/Pi saw removal in conversation.
- AC5 cancel/resume passed at disposable-fixture scope in a real Pi TUI;
  resumed execution ended `needs_human`, not `completed`. Resume-to-completed
  is unobserved and is not required by AC5. The earlier Pi `-p` stale-context
  observation remains separate.
  [Scenario evidence](../../docs/evals/global-workflows/T7-2026-11-08.md#scenario-2--live-interrupted-run-resume-observed).
- The private archive preserves final/historical evidence and runner artifacts;
  it is evidence custody, not a durable test suite. Earlier failed verdicts
  and the November 9 stop-rule deviation remain in the report. Three live
  batch packages lack root manifests; available copies were verified.
  [Archive inventory and verification](../../docs/evals/global-workflows/T7-evidence-archive-index-2026-11-10.md).

## Next actions

1. Run one bounded real-provider/fullscreen-TUI `/feature` pilot in a disposable
   project on Pi 1.5.2; preserve evidence and qualify any unobserved behavior.
   Migration review is complete with both documentation P3s resolved. T7 parser
   extraction and final T10 closure remain open; T9 is complete and superseded
   by the 1.5.2 migration.
   [Task owner](../features/code-review-follow-ups/tasks-code-review-follow-ups.md) ·
   [Migration report](../../docs/evals/pi-compatibility/PI-1.5.2-2026-11-12.md).
2. Review ga-analytics migration/recovery evidence before further M4 work.
   Continue only with separate per-repository authorization and live discovery
   before removing destination-proven managed links.
3. Retain RV2 planner reliability and RV3 routing guards; RV1 implements neither.
   Keep optional parser extraction T7 separate. U12/U13/U14 remain open;
   T8 is covered by U6/U8. Apply T10 verification to implementation work.
   [Hardening tasks](../features/main-review-hardening/tasks-main-review-hardening.md).
4. RV4: capture observed failing/passing checks on the next suitable real task.
   The local verification pilot has no target; explicit verification outcomes
   remain pending. C3-V requires an explicitly requested real security review;
   no efficacy gain is established.
   [Priorities and criteria](../../docs/plans/pi-plugin-adoption-roadmap.md).

## Retained decisions and deferred work

- C1/C2/C3 instruction work is complete. C4 is closed with no detectable
  S1 A/B benefit and an inconclusive full-workflow comparison whose unmet
  criterion was explicitly retired. C5 is bounded; no broad efficacy or
  causal savings claim. W1/W4 are complete.
- W2/W3/R2/S3, automatic hooks, code-writing workers, Jev and property/mutation
  work retain their deferrals/conditions. R1 needs an explicit request.
  No Portal, full Cloudflare installation, OS sandbox or extra mandatory
  reviewer is selected. Analytics remains excluded.
  [Decisions and deferred scope](../../docs/plans/pi-plugin-adoption-roadmap.md).
- test-review remains an explicit experimental extra; useful checks entered
  C2. Its two unlink probes used temporary fixtures, not changed shipping tests.
  [Pilot evidence](../../docs/evals/test-review/README.md).
- Consumer refreshes/manual copies remain per-consumer; humanizer needs its
  whole folder. [Adaptation note](../../docs/research/alfonso-skills-adaptation.md).
- Preserve C1/C2/C3 behavior, Pi commands and resume artifacts. Keep private
  backup/recovery details in ignored local notes.

## History

[Historical snapshot](../../docs/history/progress-2026-11-04.md) preserves
all 64 original entries, including superseded status and verification history.
Read it only when historical evidence is needed; linked owners retain task detail.
