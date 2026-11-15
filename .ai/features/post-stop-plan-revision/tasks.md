# Tasks — post-stop plan revision (`/flow revise`)

Status: T1–T6 implemented and reviewed (T6 final review approved
2026-11-15; local commit authorized); T7–T11 remain. The user authorized the first
tranche and its local commit. Each task has one concrete deliverable, its
dependencies, and its verification; tasks are ordered so every step leaves
the tree green (`npm test`, `npm run typecheck`) and ordinary resume
compatible. The role prompts (T2) deliberately precede the revision session
core (T4), which consumes them.

Ground rules for every task: preserve unrelated local edits and all consumer
repositories; no commit, no push; English documentation; new Pi-free logic
lives under `src/` with fakes under `tests/` (no Pi imports), mirroring
`src/workflows/resume.ts` and its `tests/resume.test.ts`.

## T1 — Event schema and verified persistence primitive

Depends on: nothing.

Deliverable: `src/ports.ts` gains the six `revision.*` event types — each
carrying the stable content-derived `eventId` (sha256 of canonical content:
the event minus `eventId` and minus every timestamp field) — and the
optional `revision`/`carriedUsage` fields on `workflow.started`, exactly as
in [spec.md §8](spec.md#8-event-and-artifact-schema). `src/run-log.ts` gains
`RunLog.appendCritical(event)` per the §8 persistence contract: no
best-effort catch (throws `CriticalAppendError`), torn-final-line healing
before append, eventId reconciliation BEFORE appending under CANONICAL
equality (same id + identical canonical projection → idempotent no-op, the
persisted copy wins even when the retry carries a fresh timestamp;
same id + differing canonical projection → refuse; unreadable log → refuse
without retrying), post-append re-read with STRICT JSON-equality
verification (same object just serialized), and on verification failure one
reconcile-then-retry cycle (write landed → success without duplicating;
provably absent → retry once; still failing → throw). Refusal when the sink
is already broken. Ordinary `append` keeps its best-effort contract
unchanged. Tests: legacy logs ignore injected `revision.*` events and
unknown fields; the verification-failure-then-successful-reread case leaves
exactly ONE copy of the event; THE TIMESTAMP CASE — the same logical event
retried with a regenerated `at` reconciles to the persisted copy with
success and exactly one persisted line (canonical projection equal,
timestamps differ); same-id-different-canonical-projection refuses;
unreadable-log refuses without appending; torn-final-line healing;
broken-sink refusal; `append` behavior byte-identical to today; eventId
stability (same step retried → same id; timestamps excluded).

Verification: `npm test -- tests/resume.test.ts tests/run-log.test.ts`;
`npm run typecheck`.

## T2 — Role prompts for revision (planner, developer, reviewer)

Depends on: nothing (consumed by T4 and T7 — deliberately early).

Deliverable: `POST_STOP_REVISION_PROMPT` in
`src/workflows/feature-prompts.ts` plus the optional `revision` sections in
`DEVELOPER_PROMPT` and `REVIEWER_PROMPT`, per [spec.md §15](spec.md#15-developer-and-reviewer-plumbing).
Unit tests assert: planner output contract preserved (TITLE/PRD/TASKS,
accepted by the existing `validatePlannerOutput`), correction text passed
verbatim, keep/change/remove retention instructions present, reviewer told
to judge the full original-baseline diff against the revised contract, and
prompt output byte-identical to today when `revision` is absent.

Verification: `npm test -- tests/feature-workflow.test.ts tests/unit.test.ts`;
`npm run typecheck`.

## T3 — Eligibility, lifecycle, successor id, launch completeness

Depends on: T1.

Deliverable: new Pi-free module `src/workflows/revise.ts` with (a)
`revisionEligibility(events)` implementing the §5 verdict table (terminal
status reading, `already_decided` forwarding, legacy minimum evidence,
corrupt-freeze fail-closed), (b) `revisionLifecycle(events)` returning
`none|open|candidate-pending|approved-pending-launch|launched|abandoned`
from the `revision.*` events, (c) `launchIncomplete(P, successorId)` —
successor log absent, or present without any `phase.started` (the §9
reachability rule that keeps repair reachable after `revision.launched`),
(d) the successor id rule (`<chainRoot>-r<N+1>`). Unit tests cover every §5
row, every lifecycle ordering (out-of-order, duplicated, truncated events),
and the `launchIncomplete` matrix (absent log; seeded stub without
`workflow.resumed`; stub with `workflow.resumed` but no `phase.started`;
log with `phase.started` → complete).

Verification: `npm test -- tests/revise.test.ts`; `npm run typecheck`.

## T4 — Revision session core (correction → candidate), Pi-free

Depends on: T1 (events + `appendCritical`), T2 (planner prompt), T3
(eligibility/lifecycle).

Deliverable: `runRevisionSessionCore` in `src/workflows/revise.ts`: takes
the lock, captures evidence (`partialPatchSha`, file list, §10), verifies
`baseContract` hashes on disk, runs the planner via an injected agent runner
with `POST_STOP_REVISION_PROMPT`, validates with `validatePlannerOutput`,
writes sidecar candidate files, appends `revision.started` /
`revision.candidate` / `revision.candidate.rejected` through
`appendCritical`, enforces the §11 round budget recounted from events, and
implements the lifecycle rows T2–T5 (spec §6): empty notes and provider
aborts consume no round and preserve recoverable state, invalid output
persists the rejected artifact, and any `appendCritical` failure aborts the
session before an irreversible step (B2b). Fakes for agents/git/fs;
fault-injection around every append and file write.

Verification: `npm test -- tests/revise.test.ts` (budget double-count,
crash-mid-write, and append-failure cases included); `npm run typecheck`.

## T5 — Ordinary-resume interplay refusals

Depends on: T3.

Deliverable: new `Refusal` variants in `src/workflows/resume.ts` checked by
`handleResume` before lock acquisition: open/candidate-pending revision,
`approved-pending-launch`, `launched` while `launchIncomplete` holds (repair
guidance), `launched` with a running successor (pointer to the successor).
Messages per [spec.md §16 rule 3](spec.md#16-compatibility-rules). Tests
assert each refusal fires with its guidance and that abandonment restores
the honest pre-revision behavior: interrupted/failed predecessors become
ordinarily resumable again; cancelled/needs_human predecessors still refuse
`terminal_outcome` exactly as before (the assertion is the refusal, not a
promise of resume).

Verification: `npm test -- tests/resume.test.ts`; `npm run typecheck`.

## T6 — Approval binding, promotion, and repair

Depends on: T1, T3, T4.

Deliverable: the §7 promotion sequence as a Pi-free function: `revision.approved`
append via `appendCritical` (hash-bound candidate + contract + correction +
approval identity + stable `eventId`); step 0 as a hard precondition —
re-read P's log FILE and refuse unless the approval is present and
well-formed on disk (no promotion without persisted approval);
candidate-vs-`contract` verification that falls back to already-promoted
artifacts before refusing (B8 only when NEITHER verifies); the §7 step 2
archive decision tree — archive written ONCE and hash-verified against
`baseContract`: a verified existing archive is skipped and never rewritten,
a damaged one fail-closed refuses repair, a lost one (promoted artifacts,
no archive) is reported explicitly and does not block the approved launch;
the step-1→5 skip runs the SAME tree in verify-only mode, so a damaged
archive refuses and an absent one reports even when the artifacts are
already promoted;
archive-then-overwrite promotion with the description marker rule;
post-write hash verification; deterministic successor seed with the B5a
recovery — re-derive the canonical `workflow.started` from the approval
event + predecessor `workflow.started`, verify an existing prefix
field-by-field, append ONLY the missing `spec.approved`, refuse ANY
divergence and the impossible `spec.approved`-first order; idempotent
`revision.launched` via `appendCritical`; and the §9 repair procedure for
B2b–B8: reachable from lifecycle `approved-pending-launch` AND from
`launched` while `launchIncomplete` holds; B7b appends `workflow.resumed`
only when absent; B7c detects the existing marker and relaunches WITHOUT
the `resumedPhase` option (at most one `workflow.resumed` on disk); B8
fail-closed with the forced-abandon path that reports the actual on-disk
state (§14). Tests: fault injection at every boundary incl.
`appendCritical` verification-failure reconciliation (no duplicate
approval, including the fresh-timestamp retry of the same logical event);
repair run twice (idempotence); damaged `previous-*` refuses
repair and stays byte-identical (assert file hashes) on BOTH the normal
path and the step-1→5 skip path; verified archive
skipped (assert no rewrite, mtime/hash unchanged); skip path with absent
archive reports the loss and launches; promoted-without-archive
proceeds with the loss report; partial seed gains only `spec.approved`
(assert full event sequence); divergent seed refuses field-by-field;
`spec.approved`-without-`workflow.started` refuses; no `workflow.started`
duplication across B7a–B7c; exactly one `workflow.resumed` after B7c
repair; B8 refusing execution.

Verification: `npm test -- tests/revise.test.ts`; `npm run typecheck`.

Delivered (2026-11-15, awaiting review): the §7 sequence lives in
`src/workflows/revise.ts` as Pi-free functions — `persistedApproval`
(step 0 disk re-read), candidate verification with the already-promoted
fallback (B8 only when neither verifies), `ensureArchived` (the write-once
archive decision tree, also in verify-only mode on the step-1→5 skip
path), marker-rule promotion with post-write hash verification,
`canonicalSuccessorSeed`/`verifySuccessorSeed` (deterministic seed, B5a
prefix verification with field-by-field divergence refusals), the
idempotent `revision.launched` pointer, B7a/B7b/B7c coordination through an
injected `SuccessorLauncher` port (the request carries `resumedPhase:
"develop"` only when the successor stub lacks `workflow.resumed`), and the
B8 forced-abandonment exit reporting untouched/indeterminate artifact state
(§14). The approval append itself is unchanged from the session core (T4/T5)
— promotion re-reads and verifies that persisted event, it never builds a
second one. Fault injection covers B2b–B8 in `tests/revise.test.ts`
(31 new tests; the B0–B2 coverage is unchanged and green). Observed:
602/602 tests, `npm run typecheck`, `git diff --check`. Boundary: the
launch port is verified against a fake mirroring `launchRun`'s synchronous
`resumedPhase` behavior; the real `launchRun`, the constructed
`ResumeState`, the rebuilt baseline and the two `replayRunLog` changes are
T7 — no real launch was executed or claimed.

Review fixes (2026-11-15, second round — three reproduced defects closed,
T7 still on hold):
1. B4 slug recovery: the repair no longer depends on an intact PRD
   description marker. `locateRepairSlug` falls back, most verifiable
   first, to the tasks artifact's marker, then to the slug-shaped
   directory names `featureSlug` generates (base + collision suffixes)
   with both artifact files present by name; several candidates refuse as
   ambiguous instead of promoting into the wrong directory. A PRD
   truncated mid-marker (or empty) with valid candidate and archive now
   recovers and launches.
2. B5a/AC-13 internal corruption: the repair classifies the successor
   log's raw lines via `successorSeedCorruption` before and after the seed
   step. A malformed line is tolerated only as a torn append (a strict
   byte-prefix of a canonical seed line — the shape crash healing leaves)
   or after the canonical seed is complete (the successor's ordinary
   execution tail); any other malformed line refuses with its line number,
   byte-identical log. Internal garbage between `workflow.started` and
   `spec.approved` can no longer pass as an approved seed, and garbage-only
   logs refuse instead of receiving a seed.
3. B4a unreadable archive: `ensureArchived` distinguishes ENOENT (absent —
   loss report or archive write, as before) from an existing-but-unreadable
   archive (any other read error — fail-closed refusal in BOTH the normal
   and the verify-only skip path; never bypassed as absent, never reported
   lost).

Ten regression tests added (`tests/revise.test.ts`, incl. the three
reviewer reproductions and the torn-tail vs corruption distinction):
612/612 tests, typecheck and `git diff --check` pass; the reviewer's
reproduction file run against the fixed source shows all three repros
green (its one unrelated failure is the T5 structural test's
repo-relative path, an artifact of running the copy outside the
repository).

Review fixes (2026-11-15, third round — two more reproduced defects
closed, T7 still on hold):
4. Slug identity (P1): the name-shaped directory fallback introduced in
   the previous round is REMOVED — a directory name is not feature
   identity (the gate can name directories from the planner TITLE, and an
   unrelated feature's directory can share the description's slug shape),
   so promoting by name could overwrite another feature's artifacts.
   `locateRepairSlug` now accepts only marker-verifiable evidence: the
   PRD's description marker, then the tasks artifact's description
   marker; several matches refuse as ambiguous; no match refuses without
   ANY write. Every crash point of the promotion sequence leaves at least
   one artifact intact under our marker (before the PRD write both are
   original; between the writes exactly one is), so reachable B4 states
   still recover — a PRD truncated mid-marker with intact tasks launches;
   both-artifacts-markerless is unreachable from promotion and now refuses
   honestly.
5. Seed order (P2): `successorSeedCorruption` is order-aware — the seed is
   appended workflow.started → spec.approved, so a torn prefix is
   tolerated only inside its own append window: a torn started-prefix only
   before the complete started line, a torn spec-prefix only between the
   two. A torn spec-prefix BEFORE workflow.started (or a torn
   started-prefix after it) is an impossible seed order and refuses
   byte-identically, per B5a. Fourth fix in the same classifier: a SHORT
   prefix below the canonical lines' common head (`{"type":"`) is shared
   by both lines and names no event by itself — it is classified by the
   append window open at its position (before started → a torn started
   append; between the two → a torn spec append), so a reachable torn
   tail or healed shape with a shared prefix no longer false-refuses as
   an impossible order, while unambiguous prefixes outside their window
   keep refusing.
6. Slug ambiguity (P2): `locateRepairSlug` no longer returns the gate
   lookup's FIRST match — it counts description-marker matches across
   every directory, on the PRD and on the tasks artifact alike, and
   requires a UNIQUE directory with marker evidence: two same-marker PRDs
   (or any marker evidence spanning two directories) refuse as ambiguous,
   byte-identical, with no seed, pointer or launch; a single match still
   recovers every reachable B4 crash state.

Regression updates: the previous round's two name-shape tests were
rewritten to the corrected expectations (unverifiable identity refuses
with zero writes; a foreign same-shaped feature's directory stays
byte-identical — mirroring the reviewer's reproduction; marker-based
ambiguity refuses), plus a repair-level impossible-order regression and
two new classifier order assertions. Observed: 614/614 tests, typecheck,
`git diff --check`; both round-2 reviewer reproductions run green against
the fixed source (the repro copy's extra failures are its stale pre-fix
test expectations and the T5 structural test's repo-relative path — both
artifacts of running the copy outside the repository).

## T7 — Successor construction, launch, and replay changes

Depends on: T2 (prompt threading), T6 (promotion output).

Deliverable: wire promotion → successor launch in the workflow layer:
rebuilt original baseline object (same construction as `handleResume`),
constructed `ResumeState` per §7 step 7 (fresh counters, carried usage,
`revision` context), `launchRun` integration with the `resumedPhase`
omission rule for B7c, and the ONLY two `replayRunLog` changes (§8): seed
usage from `workflow.started.carriedUsage`, and reconstruct
`ResumeState.revision` from `workflow.started.revision` so the correction
context survives EVERY successor resume. Tests: the successor never calls
`git.baseline`; replay of a successor log yields `revision` and
`carriedUsage`-seeded usage; two sequential replays produce identical
`ResumeState` (counters, usage, revision context); approval-vs-launch
partial-diff change asks per §10 (`askResumeWithChangedDiff` pattern);
ordinary logs leave `revision` undefined and prompts unchanged.

Verification: `npm test -- tests/revise.test.ts tests/resume.test.ts
tests/run-launcher.test.ts`; `npm run typecheck`.

## T8 — Extension command `/flow revise` and revision session runner

Depends on: T4, T5, T6, T7.

Deliverable: `extensions/pi-brain.ts` gains the `revise` subcommand
(usage, argument completions), the §6 precondition ordering (active-run and
`blocksFeatureStart` check → read log → eligibility/lifecycle (incl.
`launchIncomplete` repair routing) → preconditions → lock), the
resume-revision dialog (continue/abandon with per-status restoration
disclosure, approve/reject), and a detached revision session runner that
mirrors `launchRun`'s disciplines (single lock release in `finally`,
`safeUi` UI effects, active-run slot with `workflow: "revision"`) while
appending ONLY `revision.*` events to the predecessor log (never
`workflow.outcome`/`workflow.failed`). Ordered-start tests with fakes cover
refusal paths (lock held, cancelling run, ineligible state, existing
lifecycle, incomplete launch) and the detached lock-release-on-failure path.

Verification: `npm test -- tests/run-start.test.ts tests/revise.test.ts`;
`npm run typecheck`.

## T9 — Acceptance-scenario end-to-end coverage

Depends on: T1–T8.

Deliverable: fake-driven end-to-end tests mapping each brief scenario to the
observable outcomes of [spec.md §17](spec.md#17-acceptance-scenarios--observable-outcomes-and-tests)
against AC-1…AC-13: the full stop→revise→approve→continue happy path;
abandon per predecessor status (interrupted/failed vs cancelled/needs_human)
plus reject/malformed planner paths; all crash boundaries B0–B8 including
B2b (eventId reconciliation under canonical equality, no duplicate approval,
fresh-timestamp retry), B4a (archive never overwritten on either path;
damaged refuses; lost reports), B5a (partial seed completed by
prefix verification, divergence refuses) and the three B7 windows with
repair reachability from both lifecycles; double resume of a revised run
with consistent counters, usage and revision context; the refusal matrix
(lock, cancellation pending, changed candidate inputs, changed partial
work, changed frozen inputs); legacy-log regression pass.

Verification: `npm test` (full suite green, including the existing resume,
workflow, launcher, run-start, run-lock, run-log suites).

## T10 — `/flow log-all` pointer rendering and command documentation

Depends on: T8.

Deliverable: `describe`/`log-all` render `revised-by`/`revises` pointers;
`docs/pi-brain/README.md` workflow section documents `/flow revise`
(usage, eligible states, approval, per-status abandonment behavior,
post-promotion policy, recovery) next to the existing `/flow resume`
description.

Verification: `npm test -- tests/unit.test.ts` (rendering cases); manual
link check of the README additions; `npm run typecheck`.

## T11 — Evidence records and handoff

Depends on: T1–T10.

Deliverable: `.ai/memory/progress.md` revision-gap next-action updated with
implementation status and observed evidence links; roadmap
[mid-development plan revision gap](../../../docs/plans/pi-plugin-adoption-roadmap.md#mid-development-plan-revision-gap-2026-11-13)
section's next step updated to point at the implemented, verified state.
Live provider completion (planner/developer/reviewer against real models)
reported separately from fixture coverage, per the design brief.

Verification: `npm test`, `npm run typecheck`, `npm run smoke:pi` (only if
workflow/SDK integration changed), `git diff --check`; link verification
across the touched documents; `git status` reviewed for unintended files.
No commit, no push — the user reviews first.
