# Progress

**Last Updated:** 2026-11-13
**Current Phase:** Global workflow validation complete; M4 rollout and
existing technical follow-ups remain open.
**Active Task:** RV3 catalog routing guards resolved (2026-11-13,
preventive scope; review P2 corrected the same day): the routing table is
now pinned by structural and routing tests, and `resolving-merge-conflicts`
and `solution-capture` are classified `operational` after their
instructions proved incompatible with pipeline roles. Next: observe the
RV2 reviewer-side behavior on the next real `/feature` run; M4 remains open.

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
  full-workflow fullscreen-TUI runs were initially unverified on 1.5.2. Global CLI
  1.5.2 was independently confirmed on 2026-11-13; the user reported a working
  `/stack` response (nodejs, 70%). This establishes command dispatch only,
  not real-provider workflow completion.
  A subsequent real-provider/fullscreen-TUI pilot exercised planner, native gate,
  developer, passing verification and reviewer; outcome `needs_human` because the
  reviewer treated required planning artifacts as violating the generated
  only-hello.txt criterion. HEAD unchanged, lock released; no consumer changes.
  [Pilot evidence, limits and RV2 scope](../../docs/evals/pi-compatibility/REAL-TUI-2026-11-13.md).
  RV2 is now resolved (2026-11-13, bounded scope): planner/revision/reviewer
  prompts carry the literal TITLE/PRD/TASKS contract with precedence over skill
  templates, a final self-check, and the implementation-vs-workflow-artifact
  scope distinction; validators, rejection persistence, approval, documents and
  resume are unchanged. A pre-declared paired real-provider comparison found
  the candidate 6/6 contract-valid versus 5/6 current, with the single current
  failure reproducing the historical missing-title class; unqualified
  file-scope criteria appeared only under current prompts. Limits: six pairs,
  one attempt each, no routed skills injected, reviewer side unexercised live,
  no reliability rate inferred; the next real `/feature` run is the observation
  point. Evidence and protocol:
  [RV2 report](../../docs/evals/pi-compatibility/RV2-2026-11-13.md).
  [Migration evidence and limits](../../docs/evals/pi-compatibility/PI-1.5.2-2026-11-12.md).
- RV3 is resolved (2026-11-13, preventive scope; review P2 corrected): the
  catalog, classification, profile and role routing path is pinned by new
  routing guards in `tests/unit.test.ts` (literal role-category policy,
  table-derived operational exclusion, name-level workflow-driver pins,
  anti-impoverishment inclusion pins), and `resolving-merge-conflicts` and
  `solution-capture` are classified `operational` after their shell/git and
  approval-gated memory-write instructions proved incompatible with
  pipeline roles; the W1 textual router-mention check became a behavioral
  exclusion test across every profile × role. Limits: the guards cover the
  routing table only — effective tool allowlists and the write guard are
  separate tested layers, unchanged; no live injection observed. Evidence:
  [RV3 roadmap entry](../../docs/plans/pi-plugin-adoption-roadmap.md).

## Blockers and validation gaps

- Pi 1.5.2 now has one real-provider/fullscreen-TUI pipeline observation,
  ending `needs_human`; successful real-provider feature completion, live
  cancel/resume, revision/fix loops and other platforms remain unverified.
  The planner/reviewer artifact-scope conflict is addressed at the prompt
  level by RV2 (2026-11-13); the reviewer-side effect is unexercised live
  and rides on the next real run.
  Historical skill loading on Pi CLI 0.85.1 does not establish engine
  compatibility with SDK 0.85.1.
- RV2's paired sample is six pairs, one attempt per cell, without routed
  skills: it does not establish a general reliability rate for either
  prompt, and skill-template precedence under conflict was not measured.
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

1. Observe RV2's reviewer-side artifact-scope behavior on the next suitable
   real `/feature` run and record it against the
   [RV2 report](../../docs/evals/pi-compatibility/RV2-2026-11-13.md);
   no new evaluation project is opened for it. Preserve deterministic
   rejection and document/resume contracts; T7 parser extraction remains
   separate. T9 is complete and superseded by 1.5.2.
2. Review ga-analytics migration/recovery evidence before further M4 work.
   Continue only with separate per-repository authorization and live discovery
   before removing destination-proven managed links.
3. RV1, RV2 and RV3 are resolved. Keep optional parser extraction T7
   separate. U12/U13/U14 remain open; T8 is covered by U6/U8. Apply T10
   verification to implementation work.
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
