# Plan: Pi plugin and context-system adoption

**Created:** 2026-09-08

**Status (2026-10-31):** R0 and C1–C5 closed; C4 retains an inconclusive full-workflow comparison and C5 is a bounded assessment, not full-collection efficacy validation. M1 is committed as `6567873`; M2 is committed as `06039e9`; M3 installed the global catalog and verified live CLI discovery/invocation in Codex, OpenCode, and Pi. M3 remains open pending the refresh check in an already-running GUI/TUI. Evidence and limits are in the [migration plan](cross-harness-workflow-migration.md#5-machine-configuration-m3). M4 has started: agent-brains self-alignment, both `_tests` boilerplates, and the `linkedin-analytics` pilot are migrated and reviewed (first-wave commits recorded 2026-11-01 in the migration plan); the remaining consumers are untouched — the pilot's validation pattern is recorded in the migration plan §7/§10, and M4 is not complete. External extension trials still require an explicit request.

**Source of truth for execution status:** this document

**Assessment and rationale:**
[Pi plugins and context structure assessment](../research/pi-plugins-and-context-structure-assessment.md)

**Additional local optimization backlog:** S1–S3 below, recorded 2026-10-11
after the [Spotify shunt assessment](../research/spotify-shunt-assessment.md).
These items are independent of R1 external extension trials; recording them
does not start implementation or change the R1 sequence.

## Behavioral verification follow-ups (recorded 2026-10-30)

Discussion of the user-supplied analysis of Matt Pocock's interview with Lauren
Tan identified the following candidate work. Recording it does not start
implementation or reorder the migration sequence; M1 and M2 are committed,
and the M3 CLI pilot is in progress, as recorded in the status above.

- **Project-local verification pilot — pending, target not selected.** Reuse
  an existing test environment and `config.verify` with a small deterministic
  helper and one or two UI/API/CLI journeys. Document launch, usable readiness,
  instance/data isolation, drive, observable assertions, evidence and cleanup.
  Check action and resulting effects (including persistence where relevant),
  rather than treating screenshots alone as proof. Evidence must survive
  cleanup. Acceptance: the same check passes on correct behavior and detects
  a deliberately introduced regression for the expected reason in an isolated
  copy. M1 is the scheduling priority, not a technical prerequisite for this
  bounded pilot; no new runtime artifact contract is required to try it.
- **Explicit verification outcomes — pending, independently justified.** Build
  on the existing proposal in [C2](../evals/tdd-review/C2-2026-10-22.md), rather
  than creating a competing status model. Distinguish execution availability,
  command outcome and blocking policy; an empty command list or absence of
  blocking failures is not proof that all checks executed and passed.
  Preserve historical event semantics, frozen verification inputs, bounded
  retries and resume compatibility. If the pilot warrants artifact integration,
  associate evidence with its source run and verified code state, including
  freshness on reuse. This status clarification need not depend on pilot
  promotion.
- **Targeted property/mutation experiment — deferred.** Choose one concrete
  invariant in transitions, resume or locking; compare added defect detection
  against current tests before adopting dependencies or a general gate.
- **Recurring mistakes and review — candidate guidance, not new skills.**
  Prefer removing structural causes, then types/lint/tests, with instructions
  for judgment that cannot be enforced mechanically. Prove a new guard catches
  a known bad case. Trial the review question "which fact makes this change
  safe, and what execution supports it?" before adding a separate blast-radius
  skill. Reuse existing review and memory responsibilities.

Preserve orchestrator-owned command execution, the Pi developer's no-shell
boundary, independent review and single-writer ownership. No pstack/Noodle
installation, second orchestrator, automatic merge, mandatory extra reviewer
or full-repository Stryker rollout is selected.

Sources inspected: upstream pstack
[create-verification-skill](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/SKILL.md),
[correct](https://github.com/cursor/plugins/blob/main/pstack/skills/correct/SKILL.md)
and [blast-radius](https://github.com/cursor/plugins/blob/main/pstack/skills/blast-radius/SKILL.md),
plus local `src/verify.ts`, `src/review.ts`, `src/workflows/feature.ts` and C2.
The full [video](https://www.youtube.com/watch?v=MN9dGgmLyso) and its quantitative
claims were not independently verified. Upstream links are mutable references,
not pinned vendored sources. No efficacy improvement is claimed.

## Retained harness improvement candidates (recorded 2026-10-31)

The user approved retaining the following ideas from a supplied five-video
analysis. These are pending candidates, not implementation approval or a new
execution queue. Preserve the current M2–M4 migration priorities. The video
contents and external project capabilities were not independently verified in
this discussion; the proposals below are local design choices, not claims of
upstream efficacy.

- **Acceptance criteria linked to evidence — extend the existing verification
  pilot and C2 outcome follow-up above.** On a small sample of feature runs,
  map important approved criteria to an executed check, reviewer judgment or
  an explicit unverified status. Record the evidence reference, source run,
  verified code state and limits; distinguish test execution from semantic
  review and check evidence freshness when reused. Start with a manual report,
  not a new ISA document, competing specification or runtime schema. Acceptance:
  identify concrete verification gaps and whether the mapping helps resolve
  them without unnecessary tests or ceremony. A green suite does not establish
  every criterion, and a coverage percentage would not establish correctness.
- **Offline analysis of runs and human corrections — extend recurring-mistake
  guidance above.** Inspect a small sample of failed, blocked or corrected
  runs. Record observable behavior with trace references, distinguish confirmed
  causes from hypotheses, and retain unknown causes explicitly. Propose at
  least one improvement with a case that can check its effect. Prefer fixing
  tools, parsing, context delivery or deterministic checks before adding prompt
  instructions. Do not turn incidents into global rules automatically.
- **More actionable `needs_human` outcomes — pending UX candidate.** Present
  the blocking reason, supporting evidence and next permitted step; include
  alternatives and consequences only when supported. Distinguish a decision
  needed from the user from format failures and operational failures. Preserve
  authorization, bounded retries and resume semantics; presenting a proposal
  does not authorize restarting or mutating a repository. Evaluate usefulness
  on the sampled blocked runs before adopting a new result contract.
- **Explicit scope for retained corrections — reuse existing memory and
  solution-capture responsibilities.** Distinguish run-specific instructions,
  project conventions and general preferences before retaining a correction.
  Keep its source and scope explicit; promotion to broader guidance requires
  a deliberate decision rather than automatic learning. Do not add a parallel
  memory system or a new skill for this candidate.

Jev remains a conditional shadow experiment under the existing
[routing assessment](../research/jev-model-router-and-pi-bifrost.md): first
identify a routing problem and expected decisions, then compare classification
quality against rules and a conventional model. Shadow agreement alone does
not prove workflow savings; account for fallback and rework before claiming
cost or latency benefits. Preserve explicitly assigned reviewer models.

DeepSec remains a possible external experiment, not an installation or automatic
security phase. First use the existing C3-V behavioral validation to establish
what the current security review misses; any later comparison should use known
security cases and measure detection, false positives and cost in a disposable
environment with a bounded budget. Director is a reference for scoped proposals
and corrections, not a selected supervisor dependency. No second orchestrator,
always-on agent system or additional mandatory reviewer is selected.

## Agreed consolidation sequence (2026-10-22)

This section owns ordering for the following cross-plan work. Existing feature
plans retain their task IDs and acceptance criteria. The three research reports
are supporting evidence, not additional implementation queues. This update
records decisions and pending work; it does not implement skills or runtime changes.
Analytics (`extra/skills/ga4-analytics/`) is excluded pending the user's decision.

1. **C1 — Reconcile existing work and completion policy.** U9–U11 are complete
   in `af37cf6`; do not repeat them. Code-review follow-up T8's shared lifecycle
   extraction is covered by U6 (`0815222`) and U8 (`f065e5a`); close that task
   with this mapping, reopening only for a concrete remaining duplication.
   Implement U15/F13 option B: `changes_requested` without blocking issues
   yields `needs_human` with an explicit inconsistency reason; approved reviews
   with only warnings still complete. Do not manufacture a blocking finding or
   spend a fix round on the contradiction. Implemented 2026-10-22: unit regressions and a fake-runtime workflow test
   cover the inconsistency and preserve approved-with-warnings completion. Preserve other open tasks (T7/T9/T10,
   U12–U14) in their source plans.
2. **C2 — Align TDD and consolidate test-quality review.** Completed 2026-10-22
   (instruction changes and bounded independent evaluation). Adapt `tdd`,
   `test-master`'s TDD reference, `verification-before-completion` and relevant
   feature instructions together: Pi developers author tests, deterministic
   verification executes them, and reviewers assess their protection. Preserve
   observable test-first work in shell-capable sessions and explicit user TDD
   requests; never claim unobserved red/green. Reuse the existing PRD gate for
   risk-based observable scenarios. Integrate the contract / expected-value
   source / plausible regression questions from `test-review` into the existing
   review, plus selective QA quality-gate enforcement checks when relevant.
   No extra mandatory reviewer, blanket E2E preference, coverage quota or new
   QA suite. `test-review` remains an explicit extra while overlap is evaluated;
   do not delete it before confirming its unique value has been preserved.
   Resolve local ownership/provenance before editing upstream-managed skills.
   Evaluate on a known regression and a healthy case, including unnecessary-test
   requests and overhead. Separately design verification-result distinctions
   (executed, unconfigured, skipped/reused/unavailable, non-blocking failures)
   without breaking retry accounting or historical resume logs.
   Evidence and the separate result-contract design:
   [C2 evaluation](../evals/tdd-review/C2-2026-10-22.md). Three evaluator calls
   covered baseline/candidate review of a regression and a healthy edit, plus
   tool ownership. No real-task recall or monetary savings claim. Runtime
   implementation of result metadata is a separate follow-up, not part of C2;
   retry/replay semantics and the existing boolean are unchanged.
3. **C3 — Selectively improve existing security guidance.** Completed 2026-10-23
   (instruction changes inside `security-reviewer` only). Import feasible
   boundary/result evidence, confirmed versus unresolved findings, impact-based
   severity and separate hardening notes into `security-reviewer`. Keep source
   claims distinct from reproduced results. Use independent verification only
   for explicitly requested deeper work. Retain required provenance and license
   notices. No Cloudflare installation, separate extra, full six-phase audit,
   OS sandbox, coverage ledger, validator bundle or automatic security phase.
   Drop any portion that requires new infrastructure; full adoption is not a
   queued follow-up. Evidence: [Cloudflare assessment](../research/cloudflare-security-audit-assessment.md).
   Implemented: `SKILL.md` gained an Evidence Rules section (trust boundary,
   expected control, observed behavior, verification performed; source-claim /
   inference / reproduced labels), Confirmed / Needs validation (no severity) /
   Hardening statuses, impact-supported severity, independent re-verification
   reserved for explicitly requested deep audits; the report template gained
   the matching status/evidence fields, a needs-validation example and a
   separate Hardening Notes section. The skill is now declared
   `management: local`, `provenance: adopted` (Jeffallan base attribution and
   MIT notice retained; Cloudflare method origin recorded with upstream commit;
   the installed base's own upstream commit remains unknown). Not imported:
   everything requiring new infrastructure, the JSON schema and any automatic
   security phase; no runtime code changed. Verification: `npm test` 397/397,
   `npm run typecheck`, `git diff --check` clean, plus a frontmatter/structure
   check of the edited skill. No efficacy improvement is claimed — no audit
   was executed with the updated skill.
   **Pending behavioral validation (C3-V):** on the next explicitly requested
   real security review, record whether findings include all four evidence
   facts, distinguish source claims/inference/reproduction, reserve severity
   for confirmed vulnerabilities and keep hardening separate. Check for
   unsupported impact claims, false positives, missed known issues and human
   corrections; record elapsed time and available usage data. If feasible,
   compare the same fixed scope with the pre-C3 guidance in separate contexts;
   without a comparison, report usability observations rather than efficacy
   gains. Persist scope/revision, outcomes and limitations in `docs/evals/`
   and link the evidence here. This follow-up does not block C4 or authorize
   an audit, active testing or an additional automatic reviewer.
4. **C4 — Measure context before optimization.** Combine U16's parent skill
   count/description-size measurement with S2 usage instrumentation and a
   pre-change context baseline. Parent skill discovery and child context-file
   duplication are separate measurements. Then implement S1 deduplication and
   compare against the baseline. Only then consider S3, using total quality,
   latency and available cost, never parent-token reduction alone.
   **Closed after reconciliation (2026-10-27):** parent measurement, usage
   instrumentation, S1 correctness, corrected benefit A/B and the current
   runtime's full-workflow smoke are complete. The original full old/new
   workflow comparison is **unmet and explicitly retired** after two bounded
   old-runtime planner-format failures; it is not marked passed. No savings
   or skill-efficacy gain is established, and S3/profile filtering remain
   deferred. Decision and criterion-by-criterion disposition:
   [C4 reconciliation](../evals/pi-usage/FEATURE-E2E-2026-10-27.md#c4-reconciliation-decision).
   **U16 complete (2026-10-24):** in an isolated Pi 0.84.2 install, a parent
   session discovered 64 skills and rendered 59 (five
   `disable-model-invocation` exclusions), with 17,706 bytes of visible
   descriptions and a 29,525-byte skills block. All came from the installed
   package; no name collisions or identical descriptions. Profile filtering
   would cut the block by 62.6% for `nodejs` but only 4.6% for `full`, and it
   removes capabilities without measured quality or cost benefit. Child skill
   injection was measured separately. Evidence:
   [U16 report](../evals/pi-skill-load/U16-2026-10-24.md).
   **S2 complete and closed (2026-10-25):** usage instrumentation (provider/
   model, tokens, cache-read/write, SDK-exposed cost, elapsed) persists per call
   and per run through run logs and resume, with absent ≠ zero, coverage for
   partial totals (per role and across roles) and SDK cost ≠ billing. The
   deterministic loader audit measures the duplicated child context
   (`context-overlap`: one `AGENTS.md` discovered and injected, 2 entries /
   220 duplicated bytes). The definitive 4-task `zai/glm-5.2` baseline is
   recorded on the current tree: 78,420 input / 11,197 output / 242,880
   cacheRead / $0.222204 SDK cost / 179.9 s, 20 reads (18 task/file pairs,
   14 distinct files), 2 intra-task rereads; all four answers grade correct
   against the keys, including the `context-overlap` marker. The earlier 3-task
   zai run and OpenRouter runs are supporting evidence only. Evidence:
   [S2 report](../evals/pi-usage/S2-2026-10-24.md).
   **S1 implementation snapshot (2026-10-25, before commit `cf5af8f`):** discovered and
   injected context files now merge by canonical absolute path in a Pi-free
   module, with explicit-injection-over-discovery precedence and a visible
   stderr warning on same-path content conflicts. The deterministic audit goes
   from 2 entries / 220 duplicate bytes to 1 entry / 0 duplicate bytes; the
   same 4-task `zai/glm-5.2` protocol rerun succeeded 4/4 with no quality
   regression (63,551 input / 11,038 output / 256,192 cacheRead / $0.204149
   SDK cost / 175.3 s). Tasks 1–3 load no agents-files, so their deltas are
   exploration-path variance and **no cost or latency benefit is attributed to
   S1** from this single run; benefit measurement needs repetitions or a
   same-tree A/B. Evidence: same report, post-S1 artifacts under
   `docs/evals/pi-usage/runs/`.
   **S1 committed (2026-10-26, `cf5af8f`); benefit measurement (same day,
   twice):** the first same-tree A/B was **invalidated by review P1** — the
   harness gated a reloaded loader but passed an unloaded instance to
   `createAgentSession()`, and the production runner did the same, so both
   arms (and, retroactively understood, every pre-fix child session including
   all `/feature` runs) received **zero injected context and zero skills**;
   that run's "no benefit detectable" conclusion is withdrawn (artifacts kept
   as `2026-10-26-ab-dedup-invalid-*`). **The P1 fix is committed as
   `5ae95a8` (2026-10-26):** `buildResourceLoader()` gains `noExtensions:
   true` (child constraint — a loaded loader without it would activate the
   agent-dir-registered pi-brain extension inside children), and the new
   exported `buildLoadedResourceLoader()` reloads the loader before the
   session is created from it; `run()` uses it. Offline integration test
   `tests/pi-session-injection.test.ts` pins the contract (context present
   exactly once — S1 end-to-end —, selected skill present, unselected
   excluded, zero extensions); its pre-fix failing output is saved. **The
   corrected A/B (4 pairs, alternating AB/BA, gates on the same loaded
   instance passed to the session AND on the actual system prompt: A 2 copies
   of the AGENTS.md content, B 1, everything else byte-identical) is valid
   and still finds no detectable benefit**: paired cost deltas −$0.0006 to
   +$0.0008 (mixed signs, p=0.625 at n=4), input-side means within
   within-branch spreads). No benefit was detected in these four pairs;
   the sample does not rule out a small effect. S1 stands on correctness and
   deterministic precedence, not
   measured savings; **S3 gains no cost justification from S1**. Evidence:
   [S2 report, A/B section](../evals/pi-usage/S2-2026-10-24.md#s1-benefit-ab-experiment-2026-10-26-same-tree).
5. **C5 — Review the usefulness of the skill collection.** Run a bounded manual
   audit of triggers, permissions, overlap, distribution and actual incremental
   value with current models. Compare representative cases with and without
   skill guidance; use findings to keep, simplify, merge or propose removal.
   Preserve useful specialist coverage and license/provenance. Model advances
   motivate evaluation, not automatic deletion. This is not an upstream-update
   bot or authorization to delete skills. The QA portfolio/documentation pilots
   remain conditional material for this review or a real project need, not
   separate immediate projects. Analytics remains excluded.

**C4 closure evidence:** U16 and S2 are complete (**S2 closed
2026-10-25**); **S1 is committed as `cf5af8f` (2026-10-26)** and its benefit
is measured (2026-10-26): the first A/B was invalidated by review **P1**
(loader never loaded → both arms and every pre-fix child session received
zero injected context/skills; conclusion withdrawn), the P1 fix
(`buildLoadedResourceLoader` + `noExtensions` + integration test) is
**committed as `5ae95a8` (2026-10-26)**, and the **corrected** same-tree
A/B — 4 pairs, alternating order, per-call gates on the same loaded loader
passed to the session and on the actual system prompt — found **no
detectable cost or latency benefit in these four pairs** (no benefit claimed;
experiment deliberately not expanded, without ruling out a small effect).
The `/feature` end-to-end follow-up ran **2026-10-27** on
identical disposable fixtures. It spans S1 and P1 (children now actually
receive routed context and router-selected skills), so it cannot isolate
deduplication savings. Two baseline attempts failed closed on planner format;
the current runtime's second attempt **completed after explicit user approval**:
developer, deterministic verification and independent review passed in one
round, zero review issues, independent tests 6/6. All three roles received
one context copy and only selected skills. SDK cost $0.06930588; agent time
183.244 s (workflow wall time includes approval waiting). The full before/after
criterion is unmet and explicitly retired from this bounded assessment after
the two baseline failures. **C4 is closed with an inconclusive full-workflow
comparison**, not a passed comparison. No further provider runs planned;
no savings or skill-efficacy claim. Evidence and reconciliation:
[feature E2E report](../evals/pi-usage/FEATURE-E2E-2026-10-27.md).
S3 may only be considered on its own measured
total-cost/latency/quality evidence, never on dedup savings. C1 and C2 are
complete (2026-10-22); C3 is complete (2026-10-23).
**C5 closed (2026-10-28)** as a user-approved bounded assessment.
Inventory, local corrections (`27b9be7`), four Node calls, four U1 calls and two
real-project UI proposals are reconciled in the
[closure decision](../evals/skill-usefulness/C5-CLOSURE-2026-10-28.md).
Keep the collection and specialist design coverage; no skill deletion/merger,
blanket profile reduction, causal savings or broad efficacy claim. User feedback
was a tentative preference for expanded-guidance Version 1 on the real UI task.
Unexecuted interview/tooling/reference/trigger cases remain explicitly unmeasured.
C3-V remains pending the next requested real security review.

**Current status: M3 global install and CLI pilot are applied; the live
interactive-session refresh check remains open.** M1 (portable skill references
and explicit planning/implementation/review boundaries) is committed as
`6567873`; M2 global distribution is committed as `06039e9`. M3's current
machine setup and pilot evidence are in the [migration plan](cross-harness-workflow-migration.md#5-machine-configuration-m3).
Consumer migration has not started. Preserved: C1/C2/C3 behavior, Pi
`/feature`, `/flow`, resume compatibility and historical artifacts. R1 trials
remain available only on explicit request; W2/W3/R2/S3 retain their existing
deferral. Appunti prototype adoption is a separate project handoff.

Supporting evidence: [TDD assessment](../research/tdd-agent-loop-assessment.md),
[QA suite assessment](../research/claude-code-skills-assessment.md).

## Cross-harness workflow migration (M)

**Original status (2026-10-22):** planned, implementation not started.
At recording time the next action was C3; C3 completed 2026-10-23, U16 completed
2026-10-24, and S2 instrumentation/protocol completed 2026-10-24 with the
definitive baseline recorded 2026-10-25. C4 and C5 are now closed. The original
recording predated M1–M3; current status is summarized above. Recording M does not itself start a migration,
reorder C1–C5 or activate extension trials. This roadmap owns coordination and
priority; the [migration plan](cross-harness-workflow-migration.md) owns detailed
checklists, acceptance criteria and consumer-project status. It was moved from
the parent `dev` directory so the agreed work is versioned with agent-brains.

The goal is to keep agent-brains as the canonical store across Pi, Codex and
OpenCode, expose skills globally once per machine, and retain project-owned
`.ai/` context without per-project skill symlink maintenance.

- **M1 — Portable skills and role boundaries:** replace project-local skill
  path assumptions; turn the instruction skill `feature` into planning-only
  `spec-and-tasks`; define spec/task handoff to implementation and independent
  review. Keep Pi `/feature` as the existing runtime workflow and preserve
  historical artifacts and resume compatibility.
  **Implemented and approved in agent-brains (2026-10-30, `6567873`):**
  skill rename with planning-only contract and handoff, portable skill
  references (name + skill-relative resolution), `spec.md`/`tasks.md`
  document contracts, planning-procedure harmonization
  (`grilling`/`grill-with-docs`/`to-spec`/`to-tickets` documented, none
  merged or deleted), implementation skills consume approved documents,
  `code-review` adopted locally with the shared review contract, structural
  tests extended. Pi runtime untouched. **Review round 1 (2026-10-30): four
  P2 findings, all corrected** — setup skill had reverted to the removed
  `feature` reference (accidental revert during checks; re-applied with the
  Pi `/feature` distinction), `to-spec` adopted locally with an
  existing-spec guard (no silent overwrite of an approved spec), sibling
  paths now prescribe symlink resolution to the real skill directory (plus a
  test pinning resolution through the workflow links), and the subfolder
  item was split into documented convention vs unexecuted verification.
  Limits: no live-harness discovery or
  invocation check (M3/M4), consumer projects not migrated, Laravel Boost
  separation not addressed. Details and per-item status live in the
  [migration plan](cross-harness-workflow-migration.md).
- **M2 — Global distribution:** prepare a conservative installer, conflict
  inventory, diagnostics and rollback; preserve personal skills and local
  ownership/provenance. **Committed (2026-10-31, `06039e9`):**
  read-only harness/config inventory; default-preview installer with per-skill
  links, conflict preservation, manifest and rollback; standalone OpenCode
  `/spec-and-tasks` command adapter (no whole `.opencode` link);
  `setup.sh`/`unlink.sh` project-local compatibility clarified; former upstream
  downloader renamed with an explicit compatibility route; Laravel Boost
  output documented as project-local; README/Pi guide and diagnostics updated.
  No machine configuration or consumer project was modified. Eleven isolated
  fixture tests, including four recovery regressions and invalid-manifest
  doctor reporting, full test suite (461/461), typecheck, shell syntax and diff
  checks passed. The pre-install real-home read-only diagnostic reported the existing
  OpenCode duplicate and two non-canonical Pi-router skill references; details
  are in the migration plan.
- **M3 — Machine setup and pilot:** configure the shared global catalog and
  verify discovery/invocation in all three installed harnesses without local
  skill links. **Applied on 2026-10-31:** adopted licensed `find-skills` and
  `i-have-adhd`; kept the personal `diagnose` and old OpenCode `react-doctor`
  copies recoverable in a private backup; installed 66 catalog skills plus the
  standalone OpenCode command; kept Pi's existing package registration
  unchanged. Pre-install Codex reported `spec-and-tasks` not discovered. In
  real sessions from `src/nested` without project-local `.agents`, Codex
  `$spec-and-tasks`, OpenCode `/spec-and-tasks`, and Pi
  `/skill:spec-and-tasks` wrote planning documents at each temporary project
  root. New and resumed persistent sessions in all three harnesses read a
  temporary skill-content update after explicit reinvocation; no installer
  rerun was needed. The same logical sessions were resumed in new CLI process
  invocations. Post-install `--doctor` reported 66 valid entries and no
  structural issues. The three outputs interpreted the minimal `OK` contract
  differently; Pi also asserted prior files existed in an empty fixture.
  GUI/TUI refresh and existing `/feature`, `/flow`, `/stack` behavior were not
  retested; the need to reload an already-running interactive TUI remains open.
  C4 efficacy/cost experiments were not reopened. M4 remains
  unstarted. Detailed results and limits are in the migration plan.
- **M4 — Consumer rollout:** migrate boilerplates and individual repositories
  using the plan's inventory; align `.ai` where useful, preserve project-specific
  knowledge and remove only confirmed managed links after successful checks.

M preserves completed C1/C2 behavior: observable acceptance criteria,
proportionate tests, truthful execution ownership and inconsistent-verdict
escalation. Do not repeat those tasks. Coordinate pre/post global-discovery
measurements with C4 before M3; C5 owns usefulness/overlap decisions, so M does
not authorize automatic skill deletion. Other runtime follow-ups and external
trials retain their existing status and approval requirements.

## Goal

Adopt only the external capabilities that measurably improve `agent-brains`
without creating a second workflow owner, a duplicate memory hierarchy, or
weaker safety boundaries.

## Working rules

- Keep `runFeatureWorkflow` as the only owner of `/feature` phase transitions.
- Keep the existing `.ai/` topology as the only project knowledge hierarchy.
- Trial third-party extensions in disposable projects before installing them
  in the normal Pi profile.
- Start every extension trial read-only or with mutation paths disabled.
- Promote one capability only after its acceptance criteria pass; otherwise
  remove or defer it.
- Do not run two delegation runtimes or two compaction implementations at the
  same time.
- Do not copy code from `pi-config` unless upstream adds a clear license.
- Keep only one item marked `IN PROGRESS` at a time.

## Sequence

```text
F0 /feature interaction correction (independent)
 └─ F0.1 Restore batched discovery

R0 Local hygiene
 ├─ R0.1 Repair grilling
 ├─ R0.2 Tighten context templates
 ├─ R0.3 Add context audit
 └─ R0.4 Pilot complexity review
          │
          v
R1 Isolated extension trials
 ├─ R1.1 pi-vcc
 ├─ R1.2 pi-lens
 └─ R1.3 pi-grill-me comparison
          │
          v
R2 Conditional runtime decision
 └─ R2.1 pi-subagents only when a revisit trigger fires
```

F0 is an adjacent `pi-brain` interaction fix, not part of the grilling repair.
It is tracked here so the two question models remain explicit and cannot drift
back into each other.

## F0 — `/feature` interaction correction

### F0.1 Restore batched feature discovery

**Status:** completed 2026-09-13 — npm test 171/171, `tsc --noEmit` clean,
`git diff --check` clean. Evidence: `src/pi/ask-user-batch.ts` (Pi-free
schema/routing/rendering/validation), `#buildAskUserBatchTool` in
`src/pi/pi-agent-runner.ts`, planner prompt in
`src/workflows/feature-prompts.ts`, tests in `tests/ask-user-batch.test.ts`
and `tests/unit.test.ts`.

`/feature` and explicit grilling have different interaction contracts:

- `/feature` collects the open product/design decisions in one numbered batch
  so the user can answer in one message;
- `grilling` and `grill-with-docs` remain adaptive, one decision at a time,
  only when explicitly invoked.

- [x] Add a planner-only `ask_user_batch` tool. Its schema must contain a
  `questions` array with `minItems: 1` and `maxItems: 6`; each question has
  2–3 options plus a `recommendedOption` letter (`A`, `B` or `C`) and a
  non-empty `recommendationReason`.
- [x] Keep the existing single-decision `ask_user` contract for non-planner
  roles. The `/feature` planner receives `ask_user_batch`, not `ask_user`.
- [x] Render the structured batch as one numbered string and pass it to the
  existing child-question callback as `question` without `options`. This must
  reuse `PiHumanInput.askFromChild`'s current freeform `input()` path; do not
  add a second UI bridge.
- [x] Always use the freeform path, including when the batch contains exactly
  one question. Do not special-case a one-question batch back to `select`:
  `/feature` has one stable response pattern.
- [x] Permit one normal batch and, at prompt level, at most one exceptional
  second batch when the first answer creates a genuinely blocking ambiguity.
  Do not turn unclear or partial answers into sequential follow-up questions;
  record the unresolved decisions as explicit PRD assumptions for the approval
  gate.
- [x] Reclassify `feature`, `grilling` and `grill-with-docs` from `planning` to
  `operational` so they remain available to the main session but are not
  injected into pipeline children. Keep `product-thinking`, `to-spec` and
  `prototype` available to the planner in this task.
- [x] Add tests for the hard six-question schema limit, planner-only tool
  selection, one-question freeform behavior, one-dialog live rendering,
  one-entry deferred queuing, and workflow-skill exclusion from child roles.

**Acceptance:** the `/feature` planner can ask 1–6 structured decisions in one
freeform dialog; a single-question batch behaves identically; non-planner roles
retain the single-decision tool; ambiguous answers become PRD assumptions
instead of a question-by-question loop; and interactive workflow skills no
longer reach pipeline children.

**Out of scope follow-up:** review `to-spec` separately. Its conversational
contract suggests it may also belong in `operational`, but changing it is not
required to restore `/feature` batching and must not expand F0.1.

## R0 — Local hygiene

### R0.1 Repair the grilling path

**Status:** completed 2026-09-18 — official skill validation, policy parsing,
structural acceptance checks and `git diff --check` pass. The behavioral evals
are defined as manual protocols; no transcript is claimed until they are run.

- [x] Remove the unresolved `domain-modeling` dependency from
  `grill-with-docs`, or add an intentionally designed replacement.
- [x] Add a persistent shared-understanding checkpoint containing known facts,
  open decisions, assumptions, coverage and decision branches.
- [x] Add an explicit `interview → output selection → output` phase boundary.
- [x] Keep the existing one-question-at-a-time behavior.
- [x] Add representative skill evals before replacing the current version.

**Acceptance:** invoking `grill-with-docs` uses only available skills, preserves
one current checkpoint and cannot enter an output-producing phase without
explicit user approval. The repaired skill and its three behavioral eval cases
are in `.agents/skills/grill-with-docs/`.

### R0.2 Tighten the context templates

**Status:** completed 2026-09-18 — `templates/AGENTS.md` reduced to
ownership/precedence plus routing pointers (no skill catalog, no workflow
tutorials), `templates/.ai/memory/progress.md` reduced to a current-state
snapshot, the stale per-blocker file reference and the malformed heading
character removed, `git diff --check` clean. No R0.3 code introduced.

- [x] Reduce `templates/AGENTS.md` to stable directives, authority order and
  routing pointers; remove duplicated skill catalogs and workflow tutorials.
- [x] Simplify `templates/.ai/memory/progress.md` to current phase, active task,
  blockers and next actions.
- [x] Remove the reference to the missing per-blocker file (blockers live in
  `progress.md`; no separate file added to the scaffold).
- [x] Fix the malformed heading character in `progress.md`.
- [x] Document one owner per fact type: instructions, context, feature specs,
  lessons, progress and session history.

**Acceptance:** the templates have no broken references or duplicated sources
of truth, and a fresh agent can locate the relevant context without preloading
the whole `.ai/` tree.

### R0.3 Add a read-only context audit

**Status:** completed 2026-09-20 — implemented as a sibling skill in
`.agents/skills/context-audit/` (SKILL.md with the read-only contract,
authority model, reference classification, staleness/contradiction evidence
rules, duplicate-authority and growth heuristics; implicit invocation left
enabled so natural-language audit requests load the skill; a strictly
read-only mechanical helper `scripts/context-audit.mjs` plus
`context-audit.d.mts`, with a path-deduplicated inventory so ADRs stored under
`.ai/context/adr(s)` are counted once). Verified: official
skill validator passes; `npm test` 203/203 including new tests
(`tests/context-audit.test.ts`: inventory roles, ADR detection and
`.ai/context/adrs` deduplication, lesson/completed
counting, unresolved-link candidates, byte+mtime read-only proof on fixtures;
`tests/unit.test.ts`: `context-audit` resolves through `common`, is classified
`operational` in `src/skill-router.ts`, and never reaches planner, developer,
reviewer, tester or security-reviewer children); `tsc --noEmit` clean;
`git diff --check` clean. The four behavioral evals (CA-1–CA-4) are defined as
manual protocols in `.agents/skills/context-audit/evals/README.md`; they have
not been executed and no transcript is claimed.

- [x] Extend `lessons-gardener` or add a sibling `context-audit` skill.
- [x] Detect stale implementation claims, contradictions with code/ADRs,
  duplicate authority, broken references and abnormal file growth.
- [x] Classify references by role and authority: validate operational paths,
  distinguish historical or descriptive mentions, and treat non-canonical
  research as evidence rather than current project truth.
- [x] Keep diagnosis read-only until the user approves a proposed rewrite.
- [x] Preserve the current lessons admission rule: retain only non-obvious,
  project-specific knowledge an agent would otherwise lose.

**Acceptance:** the audit reports actionable findings with source paths and
does not mutate any context file before approval.

### R0.4 Pilot an explicit complexity review

**Status:** completed 2026-09-21 — `ponytail-review` added under `extra/skills/`
(adapted from upstream ponytail at `356918e` with attribution and MIT `LICENSE`
retained; `agents/openai.yaml` sets `allow_implicit_invocation: false`). Verified:
official skill validator passes (`quick_validate.py` from the skill-creator
system skill, run with PyYAML installed in a throwaway venv); `npm test` 210/210 including new structural
invariants (`tests/extra-skills.test.ts`: location under `extra/skills`,
explicit-only policy, license and attribution, absence from profiles,
`src/skill-router.ts` and `setup.sh`); `tsc --noEmit` clean; `git diff --check`
clean. Ten read-only evaluator runs of record (3 single-lens skills x 2 real
diffs — `96c639b..763387a` implementation-heavy, `906c47e..ed43993`
skill/doc-heavy — plus `code-review` executed faithfully per its two-sub-agent
contract per diff; an initial single-context proxy run of `code-review` is
preserved superseded) with findings, overlap matrix and decision preserved in
[docs/evals/complexity-review/R0.4-ponytail-pilot.md](../evals/complexity-review/R0.4-ponytail-pilot.md);
the exact prompts, verbatim evaluator outputs and configuration snapshot are
preserved beside it in
[docs/evals/complexity-review/runs/](../evals/complexity-review/runs/README.md)
(classified as substantial evidence with documented limitation: per-run model
variant and tool-call transcripts not exported). Explicit invocation path
documented in the report from the official Codex/OpenCode docs: the skill is
verified absent from every auto-load surface and is dormant until manually
installed (Codex: symlink into `$HOME/.agents/skills/`; OpenCode: a skills
directory); explicit-only is enforced by the skill's own files — Codex:
`agents/openai.yaml` `allow_implicit_invocation: false`; OpenCode V2:
`metadata.opencode/autoinvoke: false` in the frontmatter (ignored by the
locally installed V1, where only approval-gated `ask` or disabling `deny` are
available); a live invocation check remains an open follow-up.
Decision: keep `ponytail-review` as an explicit standalone skill (promotion
criterion met via the actionable `--adr-dir` YAGNI deletion); do not merge into
`code-review` during R0.4. Use it as an optional complexity pass after the normal
Standards/Spec review for substantial diffs that introduce abstractions,
configuration, dependencies, refactors or significant code volume; do not run it
by default for every small or documentation-only review. `ponytail-audit`
deliberately omitted — no distinct whole-repo need emerged and
`improve-codebase-architecture` already covers repo-wide surveys. No pilot
findings were applied.

- [x] Add `ponytail-review` and optionally `ponytail-audit` under
  `extra/skills`, with attribution and license retained. (Review skill only;
  audit omitted with recorded evidence.)
- [x] Keep them explicit-only; do not add the Ponytail base persona to
  `profiles/common.list`.
- [x] Compare findings on two real diffs against `karpathy-guidelines`,
  `simplify` and `code-review`.
- [x] If useful, decide between keeping a standalone skill or adding a clearly
  separate Complexity axis to local review. (Keep standalone as an optional
  post-Standards/Spec complexity pass; revisit default integration after further
  real use.)

**Acceptance:** the pilot finds actionable deletions or native/stdlib
replacements without duplicating correctness, security or spec findings.

## R1 — Isolated extension trials

No item in this phase authorizes installation by itself. Start only after an
explicit user request.

### R1.1 Trial `pi-vcc`

**Status:** pending — recommended first external trial

- [ ] Run against the currently pinned Pi `0.84.2` in a disposable long
  session.
- [ ] Exercise manual compaction and automatic threshold compaction.
- [ ] Verify that continuation happens exactly once.
- [ ] Recall an early decision, an unresolved failure and a touched file.
- [ ] Confirm uninstall restores default behavior without changing project
  state.
- [ ] Clarify upstream licensing before vendoring any source.

**Promote when:** compaction preserves the working tail and recall reliably
finds earlier evidence with no duplicate or ghost turns.

**Reject when:** it loses active context, mis-scopes lineage, or causes an
extra turn on Pi `0.84.2`.

### R1.2 Trial `pi-lens` read-only

**Status:** pending — after R1.1 unless edit feedback becomes urgent

- [ ] Use a disposable repository.
- [ ] Disable formatting, autofix, LSP quick-fixes, automatic tests, security
  scanners, git guard and context injection.
- [ ] Measure diagnostic latency, false positives and tool/process overhead.
- [ ] Verify findings carry freshness information after subsequent edits.
- [ ] Separately prove whether lifecycle hooks work inside a programmatically
  created `PiAgentRunner` child session.
- [ ] Do not make Lens findings blocking until failure and freshness semantics
  are deterministic.

**Promote when:** read-only diagnostics shorten at least one real developer fix
loop with acceptable latency/noise and no unrequested mutation.

**Reject when:** child sessions do not receive reliable diagnostics, or the
operational surface costs more than the saved verification round.

### R1.3 Compare `pi-grill-me` with the repaired local skill

**Status:** pending — depends on R0.1

- [ ] Run the same broad planning prompt through both variants.
- [ ] Compare checkpoint quality, decision coverage, number of questions and
  enforcement of the output gate.
- [ ] Keep the trial outside `/feature` to avoid nested orchestration.
- [ ] Do not import the heuristic bash mutation blocker without dedicated
  tests.

**Promote when:** the extension produces materially better decision coverage
than the repaired skill without adding excessive ceremony.

**Otherwise:** keep only its checkpoint and phase-model ideas locally.

## R2 — Conditional runtime decision

### R2.1 Evaluate `pi-subagents` as an `AgentRunner` backend

**Status:** deferred — not queued for implementation

Start only if at least one trigger is observed:

- parallel read-only review/research lanes are repeatedly needed;
- work must continue after the parent session becomes idle;
- a user needs to inspect or steer a running child;
- concurrent mutating workers require isolated worktrees;
- maintaining the local child-session layer becomes more expensive than an
  adapter to `pi-subagents`.

If triggered:

- [ ] Upgrade and revalidate the Pi SDK deliberately.
- [ ] Spike only the `AgentRunner` adapter; keep `runFeatureWorkflow` as owner.
- [ ] Prove developer no-shell, reviewer read-only, structured result,
  cancellation, resume and one-writer invariants.
- [ ] Adopt worktrees before allowing parallel writers.
- [ ] Set run, tool, token, concurrency, depth and cumulative-spawn limits.
- [ ] Verify runtime extension acknowledgement and machine-readable lifecycle
  artifacts.

**Explicitly excluded:** installing `pi-async-fork` alongside `pi-subagents`,
or replacing `/feature` with the package's own orchestration workflow.

## S — Local context and read-cost optimization

**Status:** S2 instrumentation, protocol and the definitive baseline are
complete (2026-10-25, on top of `75ffea5` + the uncommitted S2 instrumentation;
tree fingerprint `06f2bbec…`), including a deterministic `context-overlap`
audit of the discovered-plus-injected duplication S1 removes. **S2 closed
2026-10-25.** The primary-model (`zai/glm-5.2`) 4-task run is the accepted
"before": 78,420 input / 11,197 output / 242,880 cacheRead / $0.222204 SDK
cost / 179.9 s, 20 reads (18 task/file pairs, 14 distinct files), 2 intra-task
rereads, 4/4 answers correct
against the keys (including the `context-overlap` marker). **S1 was implemented
on top of S2 commit `fb66860`, initially left uncommitted for review.** The same audit
now reports 1 entry / 0 duplicate bytes / 220 loaded bytes, and the same
4-task protocol reran on the post-S1 tree (`2a72af34…`): 63,551 input / 11,038
output / 256,192 cacheRead / $0.204149 SDK cost / 175.3 s, 22 reads (17
task/file pairs, 12 distinct files), 3 reread pairs, 4/4 correct. Tasks 1–3
LOAD NO agents-files on either tree, so those deltas are exploration-path
variance; only `context-overlap` is mechanically affected, and its one sample
moved within noise. **No benefit is attributed to S1**; correctness and
absence of regression are established, benefit is not. **S1 was committed
2026-10-26 as `cf5af8f`.** The benefit was then measured twice: the first
same-tree A/B was **invalidated by review P1** (the harness and
`PiAgentRunner.run()` alike passed an UNRELOADED loader to
`createAgentSession()` — Pi SDK 0.84.2 reloads only a loader it constructs
itself — so both arms received the same prompt with zero injected context;
conclusion withdrawn, artifacts kept as invalid). **The P1 fix is committed
as `5ae95a8` (2026-10-26)**: `buildResourceLoader()` gains `noExtensions:
true` (child constraint) and `buildLoadedResourceLoader()` reloads the loader
before session creation; offline integration test
`tests/pi-session-injection.test.ts` pins context-once (S1 end-to-end into
the real system prompt), selected-skill-in/unselected-out and
zero-extensions. Every pre-fix child session — including all `/feature` runs
— ran with empty child context and no skills; that is a behavior change the
fix introduces, recorded in the report. **The corrected A/B (4 pairs,
alternating AB/BA; per-call gates on the same loaded loader passed to the
session AND on the actual system prompt — A 2 copies of the AGENTS.md
content, B 1, everything else byte-identical) is valid: no detectable
benefit** (paired cost deltas mixed signs, input-side means inside
within-branch spreads; 8/8 calls succeeded, 8/8 answers correct). The bounded
experiment is closed as "no benefit detected in four pairs", without
expansion and without ruling out a small effect; S3 must win its
own comparison and gains no cost argument from S1. Evidence:
[U16 report](../evals/pi-skill-load/U16-2026-10-24.md) (parent load) and
[S2 report](../evals/pi-usage/S2-2026-10-24.md) (usage instrumentation,
protocol, audit, definitive baseline, the S1 rerun, the P1 correction and
both A/B runs; raw outputs under `docs/evals/pi-usage/runs/`). This roadmap
owns task status; the research reports own supporting evidence and rationale.

### S1 Deduplicate discovered and injected context

- [x] Deduplicate `DefaultResourceLoader` discovered files and
  `request.contextFiles` by canonical absolute path, accounting for relative
  paths and symlinks while preserving distinct scoped instruction files.
  Implemented 2026-10-25 in `src/context-dedup.ts` (Pi-free) and wired through
  `buildResourceLoader()`: relative aliases and symlinks collapse to one
  canonical key; first-seen order is preserved; an
  explicit injection wins over a discovery, first explicit among explicit and
  first discovery among discoveries; same-path content conflicts emit a stderr
  warning with the canonical path and both sha256 hashes. No skill filtering,
  S3 or plugin was added. **Review fixes 2026-10-26:** an identical injected
  duplicate now claims the slot so the first injection keeps precedence, and
  canonicalization uses `realpathSync.native` on the raw path (longest existing
  prefix) so a symlink followed by `..` keeps the file the OS actually reads.
- [x] Add a focused regression check for a project-root `AGENTS.md` being
  both discovered and routed, plus preservation of distinct context files.
  `tests/context-dedup.test.ts` has 11 cases: root discovered+injected once,
  relative/dot-segment/absolute aliases, symlinked project root, file symlink,
  symlink + `..` (relative and absolute), distinct/scoped/curated preservation,
  conflict precedence+warning, identical-first-injection precedence, pure-merge
  hashes. Full suite 440/440; typecheck and `git diff --check` clean.

**Acceptance:** the root file enters the child context once, and distinct
scoped instructions and curated documents remain present. Loader-level
duplication was reproduced and removed (2 entries / 220 duplicate bytes → 1
entry / 0); the real 4-task rerun is 4/4 correct with no abort. **Met for
correctness (2026-10-25; verified end-to-end into the real session prompt on
2026-10-26 by `tests/pi-session-injection.test.ts`, after review P1 showed
pre-fix sessions injected nothing); committed as `cf5af8f` (2026-10-26);
benefit measured by the corrected A/B (2026-10-26) and not detectable** — a
valid result, so no billed-session saving is claimed and the measurement was
not expanded indefinitely.

### S2 Complete usage accounting and establish a baseline

- [x] Capture provider/model, input/output, cache-read/cache-write usage,
  exposed cost and elapsed time; preserve them through run logs and resume.
  Implemented 2026-10-24 in `src/usage.ts` + runner/workflow/launcher/resume;
  per-call detail persists on `agent.completed`, totals on
  `workflow.outcome`, and resume seeds from the same fold (no double
  counting, pinned by tests).
- [x] Distinguish unavailable cost from zero cost. Label provider-reported
  cost separately from actual subscription billing or estimated savings.
  Absent fields mean "not reported" everywhere (JSONL keeps the distinction);
  cost is always labeled SDK-exposed pricing, never billing.
- [x] Record representative multi-file exploration tasks with direct reads,
  including quality, follow-up reads, verification and review outcomes.
  Protocol (3 repo tasks + `context-overlap`), deterministic loader audit and
  the definitive `zai/glm-5.2` 4-task run recorded 2026-10-25 on the current
  tree: all four calls succeeded with non-zero usage and all four answers
  graded correct. Earlier 3-task zai and OpenRouter runs are supporting
  evidence only. [S2 report](../evals/pi-usage/S2-2026-10-24.md).

**Acceptance:** the baseline supports a total-cost and latency comparison,
including future worker calls; reduced parent tokens alone are insufficient.
— **MET (2026-10-25).** The definitive "before" records per-task and total
tokens, cacheRead, SDK-exposed cost, elapsed, tools/reads/rereads and answer
quality on the primary model (78,420 / 11,197 / 242,880 / $0.222204 / 179.9 s;
4/4 correct), plus the deterministic duplication audit (2 entries / 220
duplicate bytes before S1). Limits (single model, one run per task, no
verify-phase timing, SDK-exposed cost only, 220 duplicated bytes not separately
billed, no `/feature` end-to-end run) are documented in the report. The S1
comparison must rerun the same protocol on the same tasks.

### S3 Trial an explicit optional bulk-reader

**Depends on:** S1 and S2. Experimental and disabled by default.

- [ ] Reuse the Pi/`AgentRunner` boundary with a configurable worker model
  and an explicit `bulk_read(question, paths)` capability.
- [ ] Define a minimal worker policy: read-only, bounded file count/payload,
  output and execution; validate repository paths and symlink boundaries;
  exclude secrets and binary files by default.
- [ ] Disable human-input tools, recursive delegation and extensions or
  custom tools that could grant writes. Keep reader context and skills minimal.
- [ ] Return concise evidence with paths and symbols or source ranges;
  require exact source rereads before edits. Allow fallback to direct reads.
- [ ] Include every worker call in total usage/cost and latency accounting.
- [ ] Compare direct reads and delegated reads on representative tasks; derive
  thresholds from results rather than copying Spotify's 350-line threshold.

**Promote when:** total cost improves with comparable task quality and
acceptable latency. Record omissions, fallback reads and verification/review
results. Otherwise retain direct reads and document the decision.

**Deferred:** automatic read-blocking hooks until explicit delegation proves
useful; code-writing workers until artifact handoff preserves writer ownership,
repository locks, verification and review. Portal and Jev are not required for
this trial.

## Parked ideas

- **`pi-config` session analytics:** revisit when cross-session cost or prompt
  mining becomes a concrete need; reimplement from behavior because the source
  currently has no clear license.
- **Temporary prompt snippets:** useful for interactive Pi, but not needed by
  the deterministic pipeline yet.
- **New `memory.md` / `todo.md` hierarchy:** rejected for now because it would
  duplicate `.ai/context`, `.ai/memory`, `.ai/features` and ADRs.
- **Full `prompt/shared` import:** rejected; selectively import certainty and
  completeness checks into the relevant role or skill instead.
- **Always-on Ponytail mode:** rejected while local minimalism skills and an
  explicit complexity review cover the need.
- **`pi-async-fork`:** rejected while it requires a second runtime, Pi `0.85+`
  and shares the working directory between writers.

## Resume instructions

A future session should:

1. Read this roadmap first.
2. Inspect only the assessment section relevant to the next item.
3. Confirm the item is still `NEXT`, `pending` or triggered before acting.
4. Change exactly one item to `IN PROGRESS`.
5. Record evidence and the promote/reject decision here when the item ends.

**Next action:** M2, following approval and commit of M1 (`6567873`), per the
[cross-harness migration plan](cross-harness-workflow-migration.md), whose
section 4 and progress log record per-item status. C1–C5 are
closed with their documented limits; no further evaluation run,
plugin trial, global installation or consumer rollout starts automatically.
