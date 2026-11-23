# Progress

**Last Updated:** 2026-11-23
**Current Phase:** Global workflow validation complete; M4 rollout and
existing technical follow-ups remain open. Post-stop plan revision:
T1–T10 implemented and approved — T7 committed (`94cc164`), T8
(`8da6e87`), T9 (`4e9a60c`; 22 fake-driven acceptance tests), T10
(`56b00e5`; 711/711 tests, typecheck); T11 evidence closure approved
on 2026-11-20. Live Pi TUI and real-provider validation closed on 2026-11-23.
**Active Task:** T11 evidence records and handoff approved on 2026-11-20 — the T1–T10 implementation tranche is complete. Verified evidence:
T9's fake-driven end-to-end acceptance suite
`tests/revise-acceptance.test.ts` (22 tests) maps every §17 scenario row
to AC-1…AC-13 through `runFlowRevise`, the revision session,
`repairRevisionLaunch`, `launchSuccessorRun` and `runFeatureWorkflow`
plus the real ordinary-resume pipeline — reviewer verdict APPROVED,
704/704 tests at its closure; the canonical T9 record now lives in
[tasks.md](../features/post-stop-plan-revision/tasks.md#t9--acceptance-scenario-end-to-end-coverage).
T10 (`56b00e5`) renders `revised-by`/`revises` pointers in
`describe`/`log-all` and documents `/flow revise` in the
[Pi README](../../docs/pi-brain/README.md), approved with 711/711 tests
and typecheck — re-run in this handoff (711/711, typecheck, `git diff
--check` all pass). T11 wrote the canonical T9/T10 delivery records into
tasks.md, updated the
[roadmap revision-gap section](../../docs/plans/pi-plugin-adoption-roadmap.md#mid-development-plan-revision-gap-2026-11-13)
to the implemented, verified state, and closed the handoff; `npm run
smoke:pi` was not run (documentation-only change, no workflow/SDK
integration change). The [live validation record](../features/post-stop-plan-revision/tasks.md#live-validation-2026-11-22-to-2026-11-23)
records the fullscreen Pi trials and their limits separately from fixture coverage.

T7 remains approved and committed as `94cc164` (its recorded 635/635
results are historical evidence, not a fresh run for this handoff).
Two reproduced
P1s are closed; both independent reviewer reproductions pass with zero
developer calls. Local commit authorized by the user; no push authorized.
T7 delivery: successor construction, real
launch integration and the replay changes (spec §7 step 7, §8, §10, §13,
§15). `src/workflows/revise.ts` gains `initialSuccessorResumeState` — the
§7 step 7 `ResumeState` built from the successor's OWN seeded stub (fresh
developer/review/verify counters, empty fixes and blocking-id set,
defensively copied carried usage, the rebuilt ORIGINAL baseline with the
exact `handleResume` construction so `runFeatureWorkflow` enters resume
mode and `git.baseline` is skipped entirely, the freeze replayed verbatim,
the contract hashes as tamper guard, the revision context verbatim; legacy
absence of freeze/digest preserved, never synthesized; corrupt freeze /
missing baseline / missing revision linkage refuse fail-closed) — and
`launchSuccessorRun`, which re-reads the stub from disk (complete seeded
`workflow.started` with revision linkage, `spec.approved`, exactly one
seed event), runs the §10 approval-to-launch changed-diff confirmation
against `revision.started.partialPatchSha` (the `askResumeWithChangedDiff`
pattern, abort default; a refusal throws before the lock handoff and leaves
the pointer or `approved-pending-launch` plus an incomplete launch
recoverable via /flow revise), then detaches through the REAL `launchRun` +
`runFeatureWorkflow` with injected workflow dependencies (config, agents,
human, verifier, git, UI effects) — not another fake launch callback. The
repository lock changes hands exactly once: the launcher marks the handoff
(`SuccessorLaunchContext.markHandedOff`) and `launchRun` releases the lock
when the successor settles; until marked, the repair keeps releasing in its
`finally`, so every refusal and T6 fake keeps today's behavior. The
`resumedPhase` option follows the B7c omission rule (present only when the
stub lacks `workflow.resumed`; at most one marker ever). The ONLY two
`replayRunLog` changes (§8) landed in `src/workflows/resume.ts`: usage
seeds from `workflow.started.carriedUsage` and folds successor-local
events once (two replays of identical events yield identical state), and
`ResumeState.revision` reconstructs from `workflow.started.revision` at
EVERY resume (defensive copy). `runFeatureWorkflow` threads the context
into the developer/reviewer prompts only when present, so ordinary prompts
stay byte-identical. `extensions/pi-brain.ts` is unchanged (T8 scope).
T6 recovery guarantees preserved: all pre-existing B0–B8 repair tests stay
green. Review fix (2026-11-17, first review round, one reproduced P1
closed): the launch path now runs a §13 preflight BEFORE developer
execution — `changedScriptKeys` against the inherited freeze and a live
`repoStateDigest` compared with the ORIGINAL persisted digest, inside the
held lock and before the handoff and `launchRun`, with the existing §13
recovery messages, legacy absence inherited, unreadable reads refusing
fail-closed — because the successor's in-loop checks alone fire too late
(digest after one developer pass, scripts before verify), letting a
violated input consume a developer call first (the reproduced defect:
digest changed pre-launch → one developer pass → needs_human). A preflight
refusal throws before `markHandedOff`: zero developer calls, no marker or
phase event appended, pointer-plus-incomplete-launch recoverable via
/flow revise. Three regressions added (changed digest; changed frozen
package.json script with the offending key in the message; unreadable
repository state — each zero developer calls, each completing/recoverable
after restore); the reviewer's temporary reproduction passes against the
fixed source (developerCalls: 0). Second review round (same day, one more
reproduced P1 closed, TOCTOU): the §13 preflight ran before the async §10
dialog and a confirmed launch went straight to the handoff, so a digest or
script violated WHILE the dialog was open still consumed a developer pass
(reproduced: preflight passed → digest moved during the dialog → confirm →
one developer call → needs_human). The preflight is now a closure run
TWICE — before the dialog (fail fast) and again after the confirmation,
immediately before the handoff — with the same fail-closed refusals; the
repeated refusal throws before `markHandedOff` (zero developer calls, no
marker or phase event, pointer-plus-incomplete-launch recoverable).
Regression added (`DialogMutationHuman` moves the digest exactly when the
§10 dialog opens; the confirmed launch refuses with zero developer calls
and only the seed on disk; after restoring, the next repair re-asks,
confirms and completes). Both reviewer reproductions pass against the
fixed source (round one: developerCalls 0; round two: confirmations 1,
developerCalls 0); the copies' one remaining failure stays the pre-existing
T5 structural test's repo-relative path. Residual: a user-side edit in the
tiny window between the repeated preflight and the workflow's own start
cannot be closed from the launcher — the successor's in-loop §13 guards
remain the backstop, exactly as for ordinary resume. Observed after both
fixes: 635/635 tests (`tests/revise.test.ts` 114 — 9 new T7
tests: real-launch integration with a `git.baseline`-THROWING fake
proving no duplicate `workflow.started`, exactly one `workflow.resumed`,
develop entry, correction in both prompts with no stale fix items,
chain-cumulative usage on the outcome, the lock held mid-run and released
exactly once at settle; B7c repeated repair before `phase.started` with the
marker never duplicated and `resumedPhase` omitted from the second request
on; B7b seeded-stub launch carrying `resumedPhase`; §10 decline leaving the
approved state recoverable and accept launching on the current tree; §13
preflight (changed digest, changed frozen script, unreadable state — each
refusing with zero developer calls and a recoverable approved state); an
unresolvable baseline refusing before launch; the launcher's integrity
refusal on a non-seeded log — plus 3 new replay tests and 2 prompt-threading
tests in `tests/resume.test.ts` 49 and `tests/feature-workflow.test.ts` 90;
`tests/run-launcher.test.ts` 25 unchanged), `npm run typecheck`,
`npm run smoke:pi` (scripted loopback, head unchanged), `git diff --check`.
Limits: fixture/scripted verification only — no real-provider successor run
and no consumer-repo run is part of T7; the real launcher is exercised
through the repair port with injected extensions, not from a live command;
the §10 launch-time check runs only when `revision.started.partialPatchSha`
exists (the same absent-evidence rule as ordinary resume). Next:
T8 implementation and review. Final T7 orchestrator review found no
confirmed remaining defect; independently re-ran 635/635 tests, typecheck,
scripted smoke and both reviewer reproductions (zero developer calls).
Prior state: T6 approved (2026-11-15, all review fixes verified, local
commit authorized) — approval binding, promotion and crash repair in
`src/workflows/revise.ts` (spec §§7–9/§14; AC-9/12/13; boundary tests
B2b–B8; 617/617 at its final review), five review-fix rounds recorded in
the [task record](../features/post-stop-plan-revision/tasks.md): B4 slug
recovery via marker-verifiable unique identity, B5a order-aware seed
corruption classification, B4a absent-vs-unreadable archive distinction,
the `appendCritical` eventId binding, and the duplicate-scan/coherence
fixes. T1–T5 delivered 2026-11-14 (`/flow revise` foundations: event
schema with content-derived `eventId`, verified idempotent
`appendCritical`, revision planner/developer/reviewer prompts,
eligibility/lifecycle/successor-id module plus the session core, and
ordinary-resume revision refusals checked before lock acquisition).
Known carried limits: revision-session planner usage is still not persisted
(neither log nor sidecar cache — chain accounting loses it); the planner
TITLE is recovered from the feature slug; the resume-path enforcement gate
is verified structurally (T8 owns extension behavior tests). RV2
observation remains queued.

## Current state

- Local model configuration updated on 2026-11-13: global Pi Brain and
  this checkout use `openai-codex/gpt-6.1-sol` with `low` thinking for
  planner and reviewer. Developer settings and the interactive Pi default
  are unchanged. Configuration checked on disk; no live workflow has
  validated the new model/reasoning combination yet.
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

- [x] Implement the post-stop plan revision path (design context: the
  user-run Carefinder pilot exposed that ordinary resume does not ingest
  requirement corrections). Complete (2026-11-20): T1–T10 implemented and
  approved (T9: 22 fake-driven acceptance tests; T10: 711/711 tests
  and typecheck) and T11's evidence closure is approved; live Pi TUI and real-provider completion remain to be
  validated (open action below).
  [Observation, attribution and proposed direction](../../docs/plans/pi-plugin-adoption-roadmap.md#mid-development-plan-revision-gap-2026-11-13).
  A [design brief and agent prompts](../../docs/plans/post-stop-plan-revision-brief.md)
  are prepared (2026-11-14); the design is produced in
  [spec](../features/post-stop-plan-revision/spec.md) and
  [tasks](../features/post-stop-plan-revision/tasks.md) (2026-11-14,
  design-only session): linked successor run recommended, `/flow revise`
  command, event/artifact schemas, crash-recovery matrix and acceptance
  criteria specified, no blocking unresolved decision recorded. Revised
  after user review (2026-11-14): verified persistence for revision events
  (`appendCritical`, no promotion without a persisted approval),
  pre/post-promotion abandonment separation with per-status honesty for
  interrupted/cancelled/needs_human predecessors, B7 crash repair split into
  three reachable windows (incl. after `revision.launched`), revision
  context reconstructed from the successor log at every resume, and task
  dependencies reordered (prompts before the session core). Second review
  round (2026-11-14): `appendCritical` idempotent via stable content-derived
  `eventId` with reconcile-before-retry, `previous-*` archive written once
  and verified (repair never overwrites it with promoted artifacts), and
  partial successor-seed recovery by prefix verification (B4a/B5a added to
  the crash matrix; AC-12/AC-13 added). Follow-up alignment (2026-11-14):
  reconciliation equality defined as the eventId canonical projection
  (same logical event with fresh timestamp reconciles to one persisted
  copy), and the step-1→5 skip verifies the archive in verify-only mode
  (damaged refuses, absent reports) per AC-12.
  **T1–T5 are now implemented and verified (2026-11-14, first tranche):**
  T1 `revision.*` events with content-derived `eventId` plus
  `RunLog.appendCritical` (torn-line healing, reconcile-before-append under
  canonical equality, strict post-append verification, one clean retry,
  fail-closed on unreadable logs and same-id-different-projection; ordinary
  `append` unchanged); T2 `POST_STOP_REVISION_PROMPT` plus optional
  `revision` sections in developer/reviewer prompts (byte-identical when
  absent); T3 `src/workflows/revise.ts` eligibility (§5 rows),
  `revisionLifecycle` (dedup under canonical equality, out-of-order
  fail-closed), `launchIncomplete`, successor id rule; T4
  `runRevisionSessionCore` (lock → evidence → open → planner rounds with
  event-recounted budget → approve/reject/regenerate/abandon, everything
  through `appendCritical`); T5 resume refusals (`resumeRevisionRefusal`
  plus five new `Refusal` variants incl. corrupt-evidence, checked before
  lock acquisition). Observed: 550/550 tests
  (`tests/revise.test.ts` 39, `tests/run-log.test.ts` +12, prompt and
  resume-regression additions), `npm run typecheck` and
  `git diff --check` clean; the timestamp-retry, persistence-failure,
  budget-recount and per-status abandonment cases are covered by tests.
  Limits: promotion/launch and the replay `carriedUsage`/`revision` changes
  are T6/T7 (not started); the `/flow revise` command and resume-revision
  dialog are T8; the session stops at the persisted approval by design.
  Implementation decisions recorded: eligible predecessors require a
  replayed `spec.approved` (no baseContract, no revision — fail-closed);
  the planner TITLE is recovered from the feature slug (approved artifacts
  carry only section bodies); the §10 regenerate path records the
  superseded candidate as `revision.candidate.rejected` so the lifecycle
  state machine stays total; unknown future `revision.*` types are skipped
  before common-field validation (§16 rule 1). Review follow-up (2026-11-14,
  same tranche): the five findings above are fixed with observing
  regressions — structural wiring test for the resume gate, duplicate-scan
  and equal-copy-then-conflict cases in `tests/run-log.test.ts`, lifecycle
  coherence tests (approval binding, contiguous numbering, full duplicate
  scan), fresh-evidence prompt test, and the two `capPartialPatch` edge
  cases. Lifecycle coherence completion (2026-11-15, still T1–T5): every
  known revision event must name the ACTIVE run and revision (reference:
  `workflow.started.runId` when present, else the first known revision
  event), and candidate/rejected rounds progress exactly — the
  budget-permitted next round, gaps/repeats refuse, rounds beyond
  `MAX_PLAN_REVISIONS` refuse — with separate regressions per event type
  (candidate, rejected, approved, abandoned, launched: incoherent runId and
  incoherent revision each refuse with the offending values in the reason).
  Corrections to the record: revision-session planner usage is NOT persisted
  today (neither log nor cache); the resume-path enforcement is verified by
  a STRUCTURAL test (source positions inside `handleResume`), not by
  executing the command handler — extension behavior tests are T8 scope.
  eventId binding (2026-11-15, still T1–T5, bounded pre-T6 fix): the
  `eventId === deriveEventId(event)` verification lives in both required
  places — `parseRevisionEvent` (after common-field checks, before
  type-specific validation; unknown future types skip it) and
  `appendCritical` entry (before any file access) — with regressions for
  arbitrary ids, formally valid but mismatched sha256 ids, the
  regenerated-timestamp retry staying valid, and the binding check applied
  to every known event type.
  T1–T5 review complete; local commit authorized (2026-11-15).
  No push; consumer repositories untouched.
  **T6 approved (2026-11-15, all review fixes verified,
  local commit authorized):** approval binding, promotion and crash repair
  implemented and verified as recorded in the Active Task (spec §§7–9/§14;
  AC-9/12/13; boundary tests B2b–B8; 617/617 tests, typecheck, diff
  check). Review rounds two, three, the shared-prefix classifier fix and
  the slug-ambiguity fix addressed seven reproduced findings (B4
  truncated-PRD refusal, B5a silently-tolerated seed corruption, B4a
  unreadable-archive bypass, slug-name fallback able to overwrite a
  foreign feature, torn-seed impossible order accepted, shared short
  prefixes false-refused as impossible orders, same-marker PRD
  ambiguity promoted into the first match) — each with regressions
  mirroring the reproductions.
  Final review observed: 617/617 full-suite tests, 101/101 revision tests,
  typecheck and diff check pass; all seven defect reproductions and the
  exhaustive seed-prefix check pass. No remaining confirmed finding.
  The T7-only developer prompt
  ([post-stop-plan-revision-t7-prompt.md](../../docs/plans/post-stop-plan-revision-t7-prompt.md))
  was prepared (2026-11-17) and T7 was implemented the same day — see the
  Active Task above for the delivery record and limits; no real successor
  launch was executed (fixture/scripted verification only). No push
  authorized; consumer repositories untouched.

Follow-ups confirmed by the recent-commit analysis review (2026-11-16;
read-only inspection at `468f014`, no suite or live workflow rerun):

- [x] Reconciled stale status claims (2026-11-17): the
  [revision spec](../features/post-stop-plan-revision/spec.md) records T6
  as implemented/reviewed; the [Pi README](../../docs/pi-brain/README.md)
  records the [real-provider/fullscreen pilot](../../docs/evals/pi-compatibility/REAL-TUI-2026-11-13.md)
  with its `needs_human` outcome and validation limits. Prepared the
  [T7-only developer prompt](../../docs/plans/post-stop-plan-revision-t7-prompt.md)
  for T7 implementation, now delivered and approved as recorded above.
  The initial documentation-only checks covered local link targets and
  `git diff --check`; later runtime verification is recorded in the Active Task.
- [x] Continue the existing
  [revision tasks](../features/post-stop-plan-revision/tasks.md#t11--evidence-records-and-handoff):
  T7 and T8 are approved and committed; T9's acceptance suite (22
  fake-driven acceptance tests) is delivered and approved; T10 rendering
  and command documentation is approved and committed (`56b00e5`, 711/711
  tests and typecheck); T11 evidence closure was approved on 2026-11-20. The T1–T10 implementation tranche is
  complete.
- [x] Validate post-stop plan revision in fullscreen Pi with real providers.
  The successor resumed on the same ID and completed on 2026-11-23.
  See the [live validation record](../features/post-stop-plan-revision/tasks.md#live-validation-2026-11-22-to-2026-11-23)
  for observed behavior, evidence limits and UI findings.
- Treat `revise.ts` size as a maintenance signal, not an automatic refactoring
  task. Revisit decomposition only against concrete coupling, duplication or
  change difficulty; no additional recovery framework or workstream selected.
- The analysis quoted the intermediate 614-test result; the final recorded
  T6 evidence is 617/617 (see the existing T6 record above), not a fresh run.

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

- oxlint-anti-slop ideas retained: preserve type information, explicit validation
  boundaries and actionable deterministic diagnostics. No adoption or new
  workstream; revisit against an observed need. [Takeaways and limits](../../docs/research/oxlint-anti-slop-takeaways.md).
- Kostysh methodology assessed: no adoption or new workstream. Revisit test
  scheduling only after observed redundant verification cost; retain existing
  plan-revision priority. [Assessment and conditions](../../docs/research/kostysh-methodology-assessment.md).
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
