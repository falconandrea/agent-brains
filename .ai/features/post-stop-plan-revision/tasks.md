# Tasks — post-stop plan revision (`/flow revise`)

Status: T1–T10 implemented and approved (T7 final review approved
2026-11-17, commit `94cc164`; T8 approved 2026-11-18, commit `8da6e87`;
T9 approved — 22 fake-driven acceptance tests cover the §17 scenario
matrix; T10 approved 2026-11-20, commit `56b00e5`, 711/711 tests and
typecheck). T11 evidence closure was delivered and approved on 2026-11-20.
Live Pi TUI and real-provider completion remain to be validated (T11
limits). The user authorized the first
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

Delivered (2026-11-17, awaiting orchestrator review): the real launch
integration lives in `src/workflows/revise.ts`. `initialSuccessorResumeState`
builds the §7 step 7 `ResumeState` from the successor's OWN seeded stub
(the persisted evidence, never caller memory): develop phase; fresh
developer/review/verify counters; empty fixes and blocking-id set; carried
usage copied defensively; the rebuilt ORIGINAL baseline with the exact
`handleResume` construction (so `runFeatureWorkflow` enters resume mode and
`git.baseline` is skipped entirely); the freeze replayed verbatim; the
contract hashes as the tamper guard; the revision context verbatim. Legacy
absence of freeze/digest is preserved, never synthesized; a corrupt freeze,
a missing baseline or a missing revision linkage refuse (§13 fail-closed).
`launchSuccessorRun` re-reads the stub from disk (complete seeded
`workflow.started` with revision linkage, `spec.approved`, exactly one seed
event), runs the §10 approval-to-launch changed-diff confirmation against
`revision.started.partialPatchSha` (the `askResumeWithChangedDiff` pattern,
abort as default; refusal throws before the handoff, leaving the pointer or
`approved-pending-launch` plus an incomplete launch recoverable via
`/flow revise`), then detaches through the REAL `launchRun` +
`runFeatureWorkflow` with injected workflow dependencies (config, agents,
human, verifier, git, UI effects) — not another fake launch callback. The
repository lock changes hands exactly once: the launcher marks the handoff
(`SuccessorLaunchContext.markHandedOff`) and `launchRun` releases the lock
when the successor settles; until then the repair keeps releasing in its
`finally`, so every T6 fake and refusal path keeps today's behavior. The
`resumedPhase` option follows the B7c omission rule (present only when the
stub lacks the marker). The ONLY two `replayRunLog` changes landed in
`src/workflows/resume.ts` (§8): usage seeds from
`workflow.started.carriedUsage` and folds successor-local events once, and
`ResumeState.revision` reconstructs from `workflow.started.revision` at
EVERY resume (defensive copy). `runFeatureWorkflow` threads the context into
the developer and reviewer prompts only when present, so ordinary prompts
stay byte-identical. `extensions/pi-brain.ts` is unchanged (T8 scope).
Tests: 9 new revision tests — initial state (fresh counters/inherited
originals/copied carried usage; legacy absence preserved; corrupt freeze,
missing baseline, missing linkage refuse); the real-launch integration with
a `git.baseline`-THROWING fake (no duplicate `workflow.started`, exactly one
`workflow.resumed`, develop entry, prompts carrying the correction with no
stale fix items, chain-cumulative usage on the outcome, the lock held
mid-run and released exactly once at settle); B7c repeated repair before
`phase.started` (marker never duplicated, `resumedPhase` omitted from the
second request on); B7b seeded-stub launch carrying `resumedPhase`; §10
decline (no launch, recoverable approved state) and accept (launches on the
current tree); an unresolvable baseline refusing before launch; the
launcher's integrity refusal on a non-seeded log. 3 new replay tests
(carried + successor-local usage folded once; two replays of identical
events yield identical state incl. an anti-aliasing check; ordinary logs
leave `revision` undefined and usage unseeded). 2 new workflow threading
tests (ordinary resume byte-identity without a revision section; successor
resume delivering the correction to both prompts). All existing T6 recovery
tests stay green. Observed: 631/631 tests
(`tests/revise.test.ts` 110, `tests/resume.test.ts` 49,
`tests/feature-workflow.test.ts` 90, `tests/run-launcher.test.ts` 25),
`npm run typecheck`, `npm run smoke:pi` (scripted loopback, head
unchanged), `git diff --check`. Limits: fixture/scripted verification only —
no real-provider successor run and no consumer-repo run is part of T7; the
real launcher is exercised through the repair port with injected
extensions, not from a live command (the `/flow revise` command, dialogs
and extension dispatch are T8); the successor's outcome/usage coverage and
the B7 windows are proven against fakes, and the §10 launch-time check runs
only when `revision.started.partialPatchSha` exists (the same
absent-evidence rule as ordinary resume).

Review fix (2026-11-17, first review round — one reproduced P1 closed):
the successor launch was missing the §13 frozen-input revalidation BEFORE
developer execution. The reproduced case: an approved revision whose git
repository digest changed before launch let the successor start, run one
developer pass, and only then escalate needs_human from the in-loop
`stopForRepoStateChange`; the script-freeze check fired equally late
(before verify, i.e. after the developer pass). Fix: `launchSuccessorRun`
gains a §13 preflight between the constructed ResumeState and the §10
check — `changedScriptKeys` against the inherited freeze and a live
`repoStateDigest` compared with the ORIGINAL persisted digest, both inside
the held lock and BEFORE the lock handoff and `launchRun` — with the
existing §13 recovery messages, legacy absence inherited as no-check, and
an unreadable read treated as changed (fail-closed). A refusal throws
before `markHandedOff`, so zero developer calls run, nothing is appended
(no marker, no phase event), and the pointer-plus-incomplete-launch state
stays recoverable via `/flow revise`. Three regressions added: changed
digest refuses with zero developer calls and completes after restoring;
changed frozen `package.json` script refuses with the offending key in the
message and completes after restoring; an unreadable repository state
refuses fail-closed with zero developer calls. The reviewer's temporary
reproduction now passes against the fixed source (developerCalls: 0,
refusal before execution); the copy's one remaining failure is the
pre-existing T5 structural test's repo-relative path (an artifact of
running the file outside the repository, recorded since the T6 rounds).
Observed: 634/634 tests (`tests/revise.test.ts` 113),
`npm run typecheck`, `npm run smoke:pi` (scripted loopback, head
unchanged), `git diff --check`.

Review fix (2026-11-17, second review round — one reproduced P1 closed,
TOCTOU in the dialog window): the §13 preflight ran BEFORE the async §10
dialog, and a confirmed launch then went straight to the handoff — so a
git digest (or script) changed WHILE the dialog was open let the successor
start, run one developer pass, and only then escalate needs_human
(reproduced: preflight passed → digest moved during the dialog → confirm →
one developer call). Fix: the preflight is a closure and runs TWICE — once
before the §10 dialog (fail fast, unchanged) and once after the
confirmation, immediately before the lock handoff and `launchRun` (the
dialog window is unbounded user time, so the same frozen-input revalidation
applies there). The repeated refusal throws before `markHandedOff`:
zero developer calls, no marker or phase event appended, and the
pointer-plus-incomplete-launch state stays recoverable via `/flow revise`.
Regression added: a `DialogMutationHuman` moves the digest exactly when the
§10 dialog opens, the launch is confirmed, and the repeated preflight
refuses with zero developer calls and only the seed on disk; after
restoring the digest the next repair re-asks (the patch is still changed),
confirms, and completes. The reviewer's dialog-window reproduction now
passes against the fixed source (`confirmations: 1, developerCalls: 0`),
and the round-one reproduction still passes (the copy's one remaining
failure stays the pre-existing T5 structural test's repo-relative path).
Residual: a user-side edit in the tiny window between the repeated
preflight and the workflow's own start cannot be closed from here — the
successor's in-loop guards (§13 third column) remain the backstop, exactly
as for ordinary resume. Observed: 635/635 tests
(`tests/revise.test.ts` 114), `npm run typecheck`, `npm run smoke:pi`
(scripted loopback, head unchanged), `git diff --check`.

Final orchestrator review (2026-11-17): T7 approved with no confirmed
remaining finding. Both independent reviewer reproductions pass with zero
developer calls. Re-run evidence: 635/635 tests, typecheck, scripted
`smoke:pi` (HEAD unchanged), and `git diff --check` pass. The residual
external-edit window and fixture-only scope above remain explicit. Next: T8.

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

Delivered (2026-11-17, awaiting review): the command orchestration lives in
a new Pi-free module `src/revise-command.ts` — `runFlowRevise` performs the
§6 ordered refusal stage (in-session active run via `blocksFeatureStart`,
running AND cancelling, → persisted-log read → lifecycle routing →
eligibility) and routes: corrupt evidence fails closed; open/candidate-
pending → the detached session in `mode: "resume"`; approved-pending-launch
and launched-with-incomplete-launch → the SAME `repairRevisionLaunch`;
launched-with-`phase.started` → the successor pointer refusal (T12). The
shared `already_decided` heal moved to `resume.ts` as `healAlreadyDecided`
and is reused by BOTH `handleResume` and `runFlowRevise` — the command heals
first, then re-evaluates the ACTUAL healed status from the persisted log.
The session core (`runRevisionSessionCore`) gains `mode?: "open" | "resume"`:
resume continues the persisted open/candidate-pending revision through the
§6 T11 dialog (continue with optional edited correction, explicit abandon
with the per-status §14 disclosure; dismissal and stop are never implicit
abandonment), reusing the recorded revision number, recorded correction and
RECORDED `partialPatchSha` for the §10 approval check (a legacy open without
a recorded sha never false-flags a change — the absent-evidence rule; this
was a real defect the resume tests caught, since the old comparison treated
`undefined` as a changed patch), while the default mode keeps refusing an
existing lifecycle (the T4 refusal test stays green). Budget recount,
reject-with-notes round progression, invalid-output recovery and verbatim
notes are unchanged — the resume path recounts everything from events under
the lock, including a §13 frozen-input revalidation at entry. The detached
runner occupies the extension's active slot with `workflow: "revision"`
(status/stop answer during the planner), wires `/flow stop` to the session
signal, protects every notification with `safeUi`, and settles without ever
appending execution-terminal events to the predecessor; after a persisted
approval it goes straight to `repairRevisionLaunch` (no ordinary abandonment,
§14) and its settlement neither releases the successor's lock nor clears the
successor's active slot. The successor handoff wires the REAL
`launchSuccessorRun` through an adapter that builds the successor's
active-run record from the repair's own request id, passes it as the new
optional `SuccessorLaunchDeps.run` (so `launchRun` drives the extension's
slot object; a foreign run id refuses BEFORE `markHandedOff`), and swaps the
slot at the DETACHED launch (`onDetached`) so a refused preflight/dialog
leaves no ghost slot. The extension dispatches `revise` before the
no-active-run guard (works without an active run), prints usage without an
id, and the `/flow` argument completions offer `revise` plus persisted
run-id completions after `revise ` in Pi's whole-argument form. Tests: 12
new core resume tests in `tests/revise.test.ts` (continue/reject/edit/
abandon per status/dismissal/pending-candidate/recorded-sha/§13/budget/
default-refusal) and 17 command tests in the new
`tests/revise-command.test.ts`: ordered refusals (running, cancelling,
unknown, ineligible, corrupt raw-line evidence, held lock), heal-first for
both healed statuses, the happy path through the REAL launcher (slot
transfers to the successor, P keeps exactly one outcome and only
`revision.*` appends, successor completes from develop with the correction
in the developer prompt, lock released at settlement), both repair entry
states, the T12 redirect, stop-during-planner, provider abort, throwing UI
effects, a failed handoff (lock stays with the repair, no successor
started, pointer-plus-incomplete recoverable), and the structural dispatch
wiring. Observed: 664/664 tests (`tests/revise.test.ts` 126,
`tests/revise-command.test.ts` 17, `tests/run-start.test.ts` 5 unchanged,
`tests/resume.test.ts` 49, `tests/run-launcher.test.ts` 25),
`npm run typecheck`, `npm run smoke:pi` (scripted loopback, head
unchanged), `git diff --check`. Limits: fixture/scripted verification only —
no real-provider revision session or successor run and no consumer-repo run
is part of T8; the extension's Pi dispatch is covered structurally plus by
the injected orchestration, not by a live TUI session; fine-grained progress
rendering of the revision session stays deferred (§18 assumption 2). The
full AC-1…AC-13 end-to-end matrix stays T9.

Review fixes (2026-11-18, first review round — five findings closed, T8
still awaiting review; the reviewer's four reproductions in their
/private/tmp copy run green against the fixed source):

1. P1 — an edited correction was lost on reopen: it lived only in memory
   and the non-authoritative session cache, so a session that ended after a
   candidate was generated (edited correction → candidate → dismiss →
   reopen → approve) bound the STALE recorded correction while the
   candidate had been planned from the new one. Fix: the resume path now
   persists the edit BEFORE any planner generation as a
   `revision.candidate.rejected` carrying the replacement notes (reason
   "correction edited at resume") at the budget-permitted round — the state
   machine's own correction-replacement row, consuming no round; the
   lifecycle recounts it, so the reopened approval binds the correction
   that actually drove the plan. At an exhausted budget no candidate can
   ever use the edit, so the edit input is not offered at all (a notice
   says so).
2. P1 — a `/flow stop` arriving while the candidate decision dialog was
   open could still let the approval persist and the successor launch. Fix:
   a cancellation gate at the top of every planner-loop iteration (before
   further generation or mutation) and a second gate immediately before the
   approval append — both return the recoverable candidate-pending/open
   outcome — plus a runner-level gate in `src/revise-command.ts` between a
   persisted approval and the repair: a cancelled session reports that the
   launch was NOT started and the approved state stays recoverable via
   `/flow revise`.
3. P1 — the candidate was approved blind: the decide dialog named only the
   round and actions, so the plan and its keep/change/remove guidance were
   never shown (§12 leaves that check to the human at the approval dialog).
   Fix: the decide dialog message now embeds the candidate's PRD and tasks
   bodies read fresh from the sidecar (capped at 4,000 characters each with
   the sidecar path named for the full text); Pi's select renders the
   message, so the content is actually visible.
4. P2 — the §14 abandonment disclosure rode in select option descriptions,
   which `PiHumanInput` never passes to Pi (labels only) — honest in fakes,
   invisible live. Fix: every abandon choice in the session core (resume
   dialog, budget-exhausted, invalid-output retry, candidate decision,
   unverifiable-candidate salvage) now asks a modal confirm whose message
   and detail carry the per-status disclosure — both reach Pi positionally;
   a declined or dismissed confirm is never an abandonment.
5. P2 — informational `human.notify` calls inside the session core could
   throw on a stale ctx and abort the session before the planner (the
   existing UI-throw test covered `deps.notify`, not this path). Fix: the
   core wraps its human with `withBestEffortNotify` at entry — the same
   pattern `runFeatureWorkflow` applies (feature.ts) — so notifications are
   best-effort while select/input/confirm/editor errors stay control flow.

Test hardening in the same round: the command suite's `waitFor` waits for
the successor to SETTLE (outcome or workflow.failed — a failed successor
surfaces immediately instead of burning the timeout) with a 15s deadline,
addressing the reviewer's flaky process-timeout rerun. Reviewer-repro note:
their copy run from /private/tmp resolves the fixtures' `PROFILES_DIR`
outside the repository, so the successor in THEIR copy fails with
`workflow.failed` and pre-hardening `waitFor(outcome)` timed out — the same
run-outside-the-repo artifact recorded since the T6 rounds, not a product
defect; all four REPRO tests pass against the fixed source (from the repo
and from their copy). Observed after the fixes: 673/673 tests
(`tests/revise.test.ts` 131, `tests/revise-command.test.ts` 21),
`npm run typecheck`, `npm run smoke:pi` (scripted loopback, head
unchanged), `git diff --check`. T8 remains awaiting review.

Review fixes (2026-11-18, second review round — three findings closed, T8
still awaiting review; the reviewer's three ROUND2 reproductions run green
against the fixed source):

1. P1 — a `/flow stop` landing during the launcher's own dialogs (the §10
   launch confirmation) still let the successor start: the runner's
   cancellation gate ran before the repair, and the launch adapter built a
   FRESH successor controller the session signal never reached. Fix, two
   parts: the successor controller is CHAINED to the session's abort signal
   until the handoff (the adapter arms a once-listener when a session run is
   involved; after the slot swap the successor's own controller governs and
   the session signal never aborts), and `launchSuccessorRun` gains a final
   cancellation gate immediately before `markHandedOff` — a stop that
   arrived while the §10 dialog was open throws before the handoff, so the
   repair releases its lock, zero developer calls run, the approval and the
   pointer stay on disk with the successor seeded but never started
   (pointer-plus-incomplete, recoverable via `/flow revise`), and the
   settlement reports the cancellation as a warning, not a failure.
2. P1 — the A → B → A correction sequence lost the last edit: the edit
   event's content-derived eventId excludes timestamps, so re-editing A at
   the same round reconciled as a retry of the FIRST A-edit and
   `appendCritical` idempotently skipped it — the log stayed at rejected(B)
   while the planner ran with A. Fix: the persisted edit names the
   SUPERSEDED correction (sha prefix) in its reason, making each edit
   instance a distinct logical event; an identical re-entry with nothing
   superseded is skipped as a no-op (the correction is unchanged), so true
   retry idempotence is preserved where it means something.
3. P2 — the resumed session routed no planner skills: only the fresh-open
   entry passed the persisted stack to `startSession`. Fix: the resume
   routing derives the stack from the same eligibility read and passes it,
   so skill routing no longer depends on which entry state reached the
   session (legacy logs without a stack still degrade to no skills via the
   existing profile-exists guard).

Regressions: three command tests (stop-during-launch-confirmation with zero
developer calls and a recoverable pointer-plus-incomplete state; the A →
B → A sequence asserting three distinct eventIds and lifecycle correction
A; resume-entry skill routing) and one core test (the A → B → A event
sequence against `appendCritical`'s reconciliation). Observed: 677/677
tests (`tests/revise.test.ts` 132, `tests/revise-command.test.ts` 24),
`npm run typecheck`, `npm run smoke:pi` (scripted loopback, head
unchanged), `git diff --check`. The reviewer's non-REPRO dispatch failure
in their /private/tmp copy is the recorded run-outside-the-repo path
artifact. T8 remains awaiting review.

Review fixes (2026-11-18, third review round — two findings and one
standards issue closed, T8 still awaiting review; both ROUND3 reproductions
run green against the fixed source):

1. P1 — the A → B → A → B transition still lost the last edit: the
   superseded-sha reason distinguishes A→B from B→A but not the SECOND
   occurrence of the same transition, whose event re-derived the identical
   eventId and reconciled away (lifecycle at A, planner running B). Fix:
   the persisted edit now carries an occurrence index — counted from the
   persisted rejected events of the active revision — alongside the
   superseded sha, so every edit instance is distinct while a TRUE retry
   re-derives the same index from unchanged history and stays an idempotent
   no-op. Four regressions assert the A → B → A → B sequence end to end
   (four distinct eventIds, lifecycle correction B, planner prompt B).
2. P2 — a failed diff read at the approval-time §10 check was swallowed
   into `undefined` and SKIPPED the change check even with
   `partialPatchSha` recorded, letting approval and pointer persist against
   an unreadable tree. Fix: legacy ABSENCE (no recorded sha) still skips
   the check, but a FAILED READ with evidence on record refuses the
   approval fail-closed (the §10/§13 unreadable rule) — the candidate stays
   pending, the read error is reported, and nothing is approved or launched.
   Regressions at both levels (core with an approval-time-only failing git;
   command end to end asserting zero approvals and a recoverable state).
3. Standards — the two test additions from the previous round had bypassed
   the final `tsc --noEmit` (TS2339 on `.correction` without narrowing the
   lifecycle union); both accesses now narrow explicitly, and typecheck is
   part of the recorded evidence again.

Observed after the round: 681/681 tests (`tests/revise.test.ts` 134,
`tests/revise-command.test.ts` 26), `npm run typecheck`,
`npm run smoke:pi` (scripted loopback, head unchanged), `git diff --check`.
The reviewer's non-REPRO dispatch failure in their /private/tmp copy stays
the recorded run-outside-the-repo path artifact. T8 remains awaiting
review.

Review fixes (2026-11-18, fourth review round — one P2 standards finding
closed, T8 still awaiting review; the ROUND4 reproduction runs green
against the fixed source): a failure in the session SETUP after the slot
activation could strand the session — the dependency wiring (profile
resolution: a profile that exists but `@include`s a missing one throws past
the top-level existsSync guard) was evaluated OUTSIDE the try/catch that
protected `createAgents()`, so the detached promise rejected unhandled, the
slot stayed revision/running and blocked every later start. Fix: one guard
now covers ALL post-activation effects — runtime construction, dependency
wiring, the session core and its settlement; any failure frees the slot
(only while the SESSION still owns it: the handoff marks the slot
reassigned via the adapter's detached-launch hook, so a successor's slot is
never cleared by a late failure) and reports best-effort; the detached
promise settles instead of rejecting. Regression: the reviewer's scenario
(fixture profile including a missing one) asserting a fulfilled detached
promise, the cleared slot, the reported failure and no new log events.
Observed: 682/682 tests (`tests/revise.test.ts` 134,
`tests/revise-command.test.ts` 27), `npm run typecheck`, `npm run
smoke:pi` (scripted loopback, head unchanged), `git diff --check`. T8
remains awaiting review.

Final review (2026-11-18): T8 approved after four fix rounds. The final
handoff reports 682/682 tests, 9/9 reviewer reproductions, typecheck,
scripted Pi smoke, and `git diff --check` passing. Live Pi TUI and
real-provider completion remain unvalidated.

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

Delivered and approved (canonical record added by the T11 evidence
closure, 2026-11-20): the fake-driven end-to-end acceptance suite
`tests/revise-acceptance.test.ts` (22 tests) maps every §17 scenario row
to observable outcomes against AC-1…AC-13 — the full
stop→revise→approve→continue journey through `runFlowRevise`, the
revision session, `repairRevisionLaunch`, `launchSuccessorRun` and
`runFeatureWorkflow`, and the real ordinary-resume pipeline
(`replayRunLog` → `validateResumePreconditions` → `launchRun`) for
post-abandon resumability (all four predecessor statuses) and the double
successor resume. A second orchestrator round closed three end-to-end
coverage gaps: the row-1 entry starts from a REAL fresh run stopped
during develop via `requestFlowStop` (the reviewer receives the previous
work's diff; `git.baseline` runs exactly once — the predecessor's own
snapshot); B7a (pointer, absent successor log) and B7b (pointer, seeded
stub without the resumed marker) complete directly through `/flow revise`
beside the B7c re-entry test; and the B2b landed-but-unverified case runs
end-to-end through `appendCritical`'s own reconciliation (ONE copy of the
approval, the regenerated-timestamp retry reconciling to the SAME copy,
the repair promoting and launching on it). One independent review round
closed three P2 assertion tightenings (exact refusal reasons pinned) and
four P3 hardening items; a follow-up round (2026-11-18) closed the last
two findings (the B2b test provokes the REAL condition via
`injectFaultAfterAppend`; the stop-during-develop entry awaits the real
`launchRun` promise). Observed: 704/704 tests, `npm run typecheck`,
`git diff --check`; the acceptance file green across three consecutive
runs. Reviewer verdict APPROVED, no remaining findings. Limits:
fixture/fake scope only (the §17 boundary) — no live TUI, no real
providers; live Pi TUI and real-provider completion remain unvalidated.

## T10 — `/flow log-all` pointer rendering and command documentation

Depends on: T8.

Deliverable: `describe`/`log-all` render `revised-by`/`revises` pointers;
`docs/pi-brain/README.md` workflow section documents `/flow revise`
(usage, eligible states, approval, per-status abandonment behavior,
post-promotion policy, recovery) next to the existing `/flow resume`
description.

Verification: `npm test -- tests/unit.test.ts` (rendering cases); manual
link check of the README additions; `npm run typecheck`.

Delivered and approved (2026-11-20, commit `56b00e5`): new Pi-free module
`src/revision-render.ts` (`revisionPointersOf`, `describeRevisionPointer`,
`formatRevisionPointers`); `describe`/`log-all` in `extensions/pi-brain.ts`
render `revised-by=<successorRunId>` and `revises=<predecessorRunId>` —
rendering only (§16 rule 6), derived tolerantly from the persisted events
so an unexpected log shape degrades the line instead of failing, ordinary
logs keep today's output verbatim, and the successor reference renders
from `revision.launched` alone (visible while the launch is still
incomplete, §9 B7a). `docs/pi-brain/README.md` documents `/flow revise`
(command list entry; eligible states, evidence capture, approval binding,
per-status abandonment behavior, post-promotion policy, repair re-entry,
the B8 reporting exception, and the pointer rendering) beside the existing
`/flow resume` description. Tests: 7 rendering cases in
`tests/unit.test.ts`. Observed: 711/711 tests (704 pre-existing + 7 new),
`npm run typecheck`, `git diff --check`. Limits: rendering verified
structurally and by unit fixtures; live TUI rendering and real-provider
runs remain unvalidated.

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

Delivered and approved on 2026-11-20: `.ai/memory/progress.md`
current state, active task and next actions updated in place with the
implementation status and verified evidence links — T9 covered by 22
fake-driven acceptance tests (`tests/revise-acceptance.test.ts`,
reviewer APPROVED), T10 approved with 711/711 tests and typecheck
(commit `56b00e5`, re-run in this handoff) — and the canonical T9/T10
delivery records above were written into this file as part of the
closure. The roadmap
[mid-development plan revision gap](../../../docs/plans/pi-plugin-adoption-roadmap.md#mid-development-plan-revision-gap-2026-11-13)
section's status and next step now point at the implemented, verified
state, and its proposed-direction paragraph reads as historical context
instead of claiming the command is missing. Live provider completion
(planner/developer/reviewer against real
models) and live Pi TUI rendering/dispatch are reported SEPARATELY from
the fixture coverage in both documents: they remain unvalidated, owned by
the pending bounded live observation. Observed: 711/711 tests,
`npm run typecheck`, `git diff --check`; link verification across the
touched documents (targets and anchors resolve); `git status` reviewed —
only the four documentation files changed (this file, `spec.md`,
`progress.md` and the roadmap), no unexpected files.
`npm run smoke:pi` not run: documentation-only change, no workflow/SDK
integration change.

Review fixes (2026-11-20, first review round — five findings closed): the roadmap's proposed-direction sentence
now reads as historical context with a pointer to the delivered state;
T11 is registered as delivered-awaiting-approval while T1–T10 stay
approved (spec status, progress Current Phase/next actions, this file's
status header); the closure record's file count says FOUR documents
(spec, tasks, progress, roadmap); the T9 counts read "22 fake-driven
acceptance tests" wherever they said "22 scenarios" (spec status, this
file's header and T11 record, progress Current Phase and next actions,
roadmap status); and the roadmap status header attributes "implemented
and approved" to T1–T10 explicitly, with T11's review tracked
separately. Re-verified after the fixes: 711/711 tests,
typecheck, `git diff --check`, link check across the touched documents,
`git status` clean of unexpected files.
