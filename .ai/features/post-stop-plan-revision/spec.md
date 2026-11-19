# Post-stop plan revision (`/flow revise`)

Status: T1–T8 implemented and approved. T7 is recorded in commit
`94cc164`. T8 received final approval on 2026-11-18 after four review fix
rounds and is recorded in commit `8da6e87`. T9 is implemented and approved.
T10–T11 remain open.
See the [task record](tasks.md) for evidence and implementation limits.
The [design brief](../../../docs/plans/post-stop-plan-revision-brief.md)
records the original staged handoff; this document specifies the full target.
Date: 2026-11-14

## 1. Goal and final behavior

After a feature run has stopped (cancelled, interrupted, failed or escalated
to a human), the user can submit an explicit requirement correction through a
new command, `/flow revise <runId>`. The command:

1. Validates the stopped run is revisable and takes the repository run lock.
2. Captures the current partial work as evidence (diff against the ORIGINAL
   git baseline, never a fresh snapshot).
3. Takes the user's correction notes and produces a candidate revised plan
   with the planner, using the previously approved plan, the correction and
   the partial-work evidence.
4. Presents the candidate for approval. Approval binds the exact candidate
   contents by hash and is persisted as the authoritative approval event.
5. On approval, promotes the candidate to the feature artifacts (archiving
   the previous approved contract first), creates a linked successor run, and
   launches it at the develop phase with the correction and keep/change/remove
   guidance passed to developer and reviewer.
6. Verification and review of the successor judge the complete
   original-baseline diff against the NEWLY approved contract. Old review
   verdicts and verification results remain historical evidence in the
   predecessor log and can never complete the new contract.

Ordinary `/flow resume` keeps today's semantics for every log this feature
does not touch. Useful partial code is never reset, cleaned, committed,
stashed or rewritten by revision; only the two planning artifacts under
`.ai/features/<slug>/` are replaced, and only as the effect of an explicit
approval.

## 2. Scope and boundaries

In scope: the `/flow revise` command, the revision session (correction,
candidate, approval, abandonment), promotion and crash repair, successor-run
construction and launch, developer/reviewer prompt plumbing for revision
context, event and artifact schemas, compatibility and recovery behavior,
documentation and tests.

Out of scope (explicitly preserved): ordinary `/flow resume` behavior for
non-revision logs; the in-gate plan-revision loop (`spec.revision.*` events,
`MAX_PLAN_REVISIONS` handling in `runFeatureWorkflow`); frozen verification
inputs and their refusal semantics (this feature revalidates them, it does
not change them); all consumer repositories; existing unrelated local edits;
local model configuration (`.pi/pi-brain.json`); runtime code in this design
phase. No automatic reset/clean/commit/stash of consumer trees is authorized
by this spec, ever.

Revision of a revision is in scope only as chaining (revise the successor
run); there is no multi-revision transaction.

## 3. Current behavior and code evidence

Design inputs inspected on 2026-11-14 (all paths from repository root):

- `src/ports.ts` — the persisted `WorkflowEvent` union is the recovery
  contract. `workflow.started` carries `description`, `baseline` (snapshot
  commit), `ignoreRulesDigest`, `repoStateDigest` and the frozen `verify`
  inputs (`VerifyFreeze`); `spec.approved` carries `prdSha`/`tasksSha` and is
  the authority behind the post-approval tamper guard; the in-gate revision
  events `spec.revision.requested|completed|rejected` exist.
- `src/workflows/resume.ts` — `replayRunLog` refuses: empty/malformed logs,
  missing baseline, corrupt verify freeze (fail-closed), pre-gate runs
  (`gate_not_approved`), any `workflow.outcome`/`workflow.completed`
  (`terminal_outcome`), and reconstructs `already_decided` when a review
  verdict was persisted but the outcome events were lost. Counter rules:
  interrupted developer passes are not counted, interrupted reviews re-run as
  the same round, banked verify retries are not double-charged.
- `src/workflows/feature.ts` — resume mode keeps the ORIGINAL baseline
  (`resume?.baseline ?? await git.baseline(...)`), replays the verify freeze
  and repository-state digest, seeds counters/usage from `ResumeState`, and
  enforces `specWasModified()` (tamper guard against the replayed
  `spec.approved` hashes) at every loop boundary. `MAX_PLAN_REVISIONS = 2`
  bounds the in-gate revision loop; empty notes consume no round; invalid
  planner output persists rejected output and consumes no round.
- `extensions/pi-brain.ts` — `handleResume` replays, heals
  `already_decided`, validates preconditions (artifacts located by the
  description marker in `.ai/features/`, baseline resolvable via
  `git.diffSince`), takes the lock, asks `askResumeWithChangedDiff` when the
  patch changed under an interrupted review, and launches through
  `launchRun` with `resumedPhase`. `/flow stop` cancellation resolves to a
  persisted `workflow.outcome` with status `cancelled`.
- `src/run-launcher.ts` — `startRun` orders lock → runtime → run log;
  `launchRun` owns the event sink, the persisted `workflow.outcome`, status
  transitions and the single lock release. `workflow.failed` (not
  `workflow.outcome`) is persisted on throw, which is why provider-failed
  runs remain ordinarily resumable.
- `src/run-log.ts` — JSONL append with torn-final-line healing on open;
  unknown event types are skipped by readers (`readRunLog` parse) and by
  `replayRunLog`'s switch (no default case), so new event types are backward
  compatible for new readers; old binaries ignore them the same way.
  `RunLog.append` is deliberately best-effort: an append error is swallowed,
  reported once on stderr, and the sink degrades to a broken no-op. That is
  the right contract for ordinary audit events and the WRONG one for
  approval-critical events — a silently dropped `revision.approved` would let
  promotion proceed with no persisted approval. This feature therefore adds a
  verified append primitive for revision lifecycle events (§8) and makes a
  verified-persisted approval a precondition of promotion (§7).
- `src/run-lock.ts` — `acquireRunLock`: one writer per repository; takeover
  only of locks whose owning process is gone; `held`/`held_stale` refusals
  are user decisions, never overridden.
- `src/pi/flow-stop.ts` — `blocksFeatureStart` treats `running` and
  `cancelling` as blocking, so a revision cannot start while a cancellation
  is pending in the same session.
- `src/verify.ts` — `VerifyFreeze` (commands + manifest script sections +
  `scriptsDigest` + perimeter) and `changedScriptKeys` re-check before every
  verify; `src/write-guard.ts` refuses agent writes under `.git`/`.pi` at any
  depth.
- `.gitignore` (this repo) ignores `.pi/pi-brain/` — engine state, including
  the planned revision sidecars, stays out of the reviewer diff here. Consumer
  repos that run `/feature` already rely on the same property for
  `.pi/pi-brain/runs/<runId>.jsonl`; this feature introduces no new class of
  file outside `.pi/pi-brain/`.

Consequence that motivates this feature: a stopped run carries a terminal
`workflow.outcome`, so ordinary resume refuses it (`terminal_outcome`) and no
existing path can express a requirement correction. The Carefinder observation
([roadmap](../../../docs/plans/pi-plugin-adoption-roadmap.md#mid-development-plan-revision-gap-2026-11-13))
is the concrete instance.

## 4. Decision D1 — same-run revision epochs vs linked successor run

| Criterion | Same-run epochs (append `revision.*` + new-epoch loop events to `<runId>.jsonl`) | Linked successor run (`<runId>-r<N>.jsonl`) |
|---|---|---|
| Replay complexity | `replayRunLog` must become revision-aware: on `revision.approved` it must reset ~10 reconstructed variables (review round, verify retries, developer runs, fixes, blocking ids, last review, patch shas, free-verify flag, spec hashes) while keeping usage cumulative. Every reset point is a potential old/new mixture inside the recovery contract itself. | `replayRunLog` stays revision-agnostic. A successor log is a plain feature log seeded once at creation (`workflow.started` + `spec.approved` + loop events); replay consumes it unmodified. |
| Crash containment | All epochs share one file; a crash mid-revision can leave interleaved segments that replay must disambiguate ("apparently approved mixture" risk lives in the log). | Logs are isolated per epoch; no interleaving is possible. Pending-revision state lives in sidecars and predecessor audit events that replay ignores. |
| Old-run resumability | Ordinary resume of a partially revised log requires replay to know which epoch is current; pre-approval abandonment must restore the pre-revision reconstruction exactly. | From the moment a revision opens, P's log receives `revision.*` audit events (`revision.started`, `revision.candidate`, …) — append precedes approval, so "untouched until approval" is false. What IS true: the revision session never appends loop, outcome or failure events, replay ignores `revision.*` (P's replay verdict unchanged), and the successor's execution lives only in the successor's log. Ordinary resume changes only by an explicit lifecycle-based refusal while a revision is open or its launch is incomplete. |
| Baseline retention | Automatic (same `workflow.started`). | Must be copied explicitly into the successor's `workflow.started`; the spec forbids re-snapshotting and requires a test asserting the successor never takes a fresh baseline. |
| Artifact ownership | Identical in both: approved artifacts are slug-keyed under `.ai/features/<slug>/`; candidates live in `.pi/pi-brain/revision/` sidecars in both. | Same. |
| Audit trail | Single log reads linearly in `/flow log`. | Two logs; `/flow log-all` gains a `revised-by`/`revises` pointer rendering. The approval chain is explicit events rather than position in one file. |
| Usage accounting | Naturally cumulative in one log. | Successor's `workflow.started` carries `carriedUsage` (predecessor totals) so repeated resumes and outcome totals stay chain-cumulative; per-call detail remains in each log. |

**Recommendation: linked successor run.** It keeps the recovery contract
(`replayRunLog`) free of revision logic, contains crash mixtures per file, and
satisfies "keep ordinary `/flow resume` semantics" by construction instead of
by epoch-scoped replay rules. The costs — explicit baseline copying with a
dedicated test, cross-log linkage, and carried-usage seeding — are small,
local and testable. Same-run epochs concentrate exactly the mixture risk the
brief calls out inside the component (replay) whose bugs are crash-recovery
bugs.

## 5. Decision D2 — eligible predecessor states

Eligibility is decided by a pure function `revisionEligibility(events)` in a
new Pi-free module `src/workflows/revise.ts` (same discipline as
`replayRunLog`). Input: the predecessor's events. Output: an eligibility
verdict with the evidence revise needs (description, baseline, freeze,
digests, replayed usage, terminal status) or a refusal.

| Predecessor state (observable) | Verdict | Rationale |
|---|---|---|
| `workflow.outcome` status `cancelled` | **Eligible** (primary scenario) | Terminal by today's replay rules; revision is the only path forward that preserves the partial work. |
| `workflow.outcome` status `needs_human` | **Eligible**, with full guard revalidation (§13) | The user may resolve an escalation by correcting the requirement. No outcome-reason string parsing: every integrity/frozen-input guard runs again at revise entry and before developer launch, and a still-violated guard refuses revision with its existing recovery message. |
| No outcome; `replayRunLog` succeeds (interrupted mid-loop, or `workflow.failed` after provider death) | **Eligible** | Same evidence chain as ordinary resume. |
| No outcome; `replayRunLog` returns `already_decided` | **Heal first, then follow the healed status** | Reuse `handleResume`'s deterministic heal (append the reconstructed `workflow.outcome` + `workflow.completed`). `needs_human` → eligible; `completed` → refused below. An approved verdict is never silently discarded: revision requires explicit user initiation after the healed outcome is recorded. |
| `workflow.outcome` status `completed` | **Refuse** — "start a new `/feature`" | The full approval chain concluded; a new requirement on a completed feature is a new run, not a revision. Smallest first release. |
| Pre-gate run (`gate_not_approved`), including runs stopped during planning | **Refuse** | Nothing approved exists to revise; the in-gate dialog already offers Revise/Cancel. |
| Log missing `description` or `baseline` (legacy) | **Refuse** | Artifacts lookup and original-baseline diffing are impossible; same minimum evidence ordinary resume requires. |
| Legacy log without `verify` freeze or `repoStateDigest` | **Eligible with degraded guards** | Mirror ordinary-resume compatibility: absent → proceed with a one-line notice (script-change and repository-state checks are off for the successor, and the successor's `workflow.started` omits them, so its own behavior matches a legacy resume); present-but-corrupt freeze → refuse outright (fail-closed, same as `corrupt_verify_freeze`). |
| Run currently `running`/`cancelling` in this session, or lock held by another session | **Refuse until settled** | `blocksFeatureStart` covers in-session pending cancellation (constraint: wait for cancellation); `acquireRunLock` covers other sessions (`held`/`held_stale` messages unchanged). |
| Revision lifecycle already open or approved-incomplete on this run | **Redirect** | Offer resume-revision / abandon (open), or complete-the-launch repair (`approved-pending-launch`, and `launched` while `launchIncomplete` holds, §9); never open a second concurrent revision of the same predecessor. |
| Successor run (`<id>-r<N>`) | **Eligible under the same rules** | Chaining: revising a revised run produces `-r<N+1>` on the same chain root. |

## 6. Command contract and revision lifecycle

`/flow revise <runId>` (new `flow` subcommand, argument completions included;
`/flow revise` without an id prints usage). Distinct from `/flow resume` in
name, precondition set and effect — ordinary resume never re-opens a gate
(constraint 1).

Lifecycle states (revision `R` of predecessor `P`; stored as events in P's
log plus sidecars under `.pi/pi-brain/revision/<P>/`):

| # | From | Trigger | To | Observable outcome |
|---|---|---|---|---|
| T0 | none | `/flow revise P` refused: ineligible state, active/cancelling run, lock held, unknown run | none | Warning message, no log append, no sidecar, lock untouched |
| T1 | none (eligible) | Preconditions pass, lock taken, revision.open check clean, correction captured (non-empty) | `open` | `revision.started` appended to P; `session.json` written; P's ordinary resume now refuses with revision guidance |
| T2 | `open` | Empty notes submitted | `open` | No planner call, no round consumed, no event; user re-edits or abandons (mirrors in-gate behavior) |
| T3 | `open` | Planner returns valid candidate (round ≤ limit) | `candidate-pending` | Candidate written to sidecar; `revision.candidate` appended; approved artifacts untouched |
| T4 | `open`/`candidate-pending` | Planner output invalid | same state | `revision.candidate.rejected` appended; rejected output persisted beside the run log (same pattern as `persistRejectedPlannerOutput`); round not consumed; retry or abandon |
| T5 | `candidate-pending` | User approves | `approved-pending-launch` | `revision.approved` appended to P (authoritative, hash-bound); nothing else changed yet |
| T6 | `candidate-pending` | User rejects with new notes | `open` (round+1) | `revision.candidate.rejected` (reason `rejected by user`, notes preserved) appended; new candidate requires T3 |
| T7 | `open`/`candidate-pending` | User abandons (explicit choice; the dialog first states what abandon will actually restore for THIS predecessor's status, §14) | none | `revision.abandoned` appended; sidecar removed; interrupted/failed P ordinarily resumable again; cancelled/needs_human P stays terminal (resume still refuses `terminal_outcome`, as it always did); artifacts and partial code untouched |
| T8 | `approved-pending-launch` | Promotion sequence completes (§7) and successor launches | `launched` (terminal for P's revision once the successor is really running, T12) | `revision.launched` appended to P; successor `<chainRoot>-r<N+1>.jsonl` created and running; P refused for both resume and revise (`revises` pointer) |
| T9 | `approved-pending-launch`, or `launched` with an incomplete successor launch | Crash anywhere in T8's sequence — including after `revision.launched` but before the successor's first `phase.started` | state preserved | Deterministic repair reachable via `/flow revise P` in BOTH lifecycles (§9 reachability rule); P's resume and any execution stay blocked until the launch completes |
| T10 | revision session `running` | `/flow stop` (session abort) or provider failure | state preserved (`open` or `candidate-pending`) | Session settles cancelled/failed; revision stays recoverable; lock released by the session runner's `finally` |
| T11 | `open`/`candidate-pending` (new session) | `/flow revise P` again | resume-revision dialog | Continue (optionally with edited correction), abandon, or (if candidate exists) approve/reject |
| T12 | `launched` with the successor actually running (successor log contains a `phase.started`) | `/flow revise P` | refused | "revised by `<successorRunId>` — revise the successor run instead"; the revision is terminal for P |

Before approval, developer execution is impossible by construction: no
successor exists, and P's resume is refused by the lifecycle check
(`revisionLifecycle(events)` in `src/workflows/revise.ts` returns
`open`/`candidate-pending`/`approved-pending-launch`/`launched`/`abandoned`/`none`).
The revision session occupies the extension's active-run slot with
`workflow: "revision"` so `/flow status` and `/flow stop` answer while the
planner runs; it does NOT go through `launchRun`, because `launchRun`
persisting a `workflow.outcome`/`workflow.failed` into P's log would change
P's replay verdict (an interrupted P would become falsely terminal). The
revision session runner mirrors the launcher's disciplines instead: lock
released exactly once in `finally`, UI effects best-effort via `safeUi`,
only `revision.*` events appended to P's log, session status kept in the
active-run slot and `session.json`.

## 7. Decision D3 — candidate storage, approval authority, promotion and repair

**Storage.** All revision session state lives under
`.pi/pi-brain/revision/<predecessorRunId>/`:

- `candidate-prd.md`, `candidate-tasks.md` — the candidate body as returned
  by the planner (without the description marker; the marker is added at
  promotion, exactly like the in-gate flow writes `${marker}\n${prd}`).
- `previous-prd.md`, `previous-tasks.md` — archive of the currently approved
  artifacts, written at promotion time BEFORE any overwrite (constraint 5).
- `session.json` — cache of {correction, round, partialPatchSha,
  partialFiles, lastError, updatedAt}. Never authoritative: state is always
  reconstructed from events + files, never from session liveness (T9/B1–B8
  survive arbitrary process death).

`.pi/pi-brain/revision/` inherits the write-guard's protected `.pi` segment
(agents can never write candidates), and sits beside the already-ignored
`.pi/pi-brain/` state in repositories configured like this one (§3).

**Authoritative approval.** `revision.approved` in the predecessor log is the
only approval authority. It binds: `candidate` prd/tasks sha256 (exact
contents), `contract` prd/tasks sha256 (the promoted artifact contents,
marker included), the full `correction` text and `correctionSha`,
`revision`, `round`, the predecessor's terminal status at revision time, and
approval identity `{via: "/flow revise", pid, at}`. The successor's own
`spec.approved` re-records `contract` and is the replay authority for the
successor's tamper guard; launch cross-checks the two and refuses on
mismatch (fail-closed).

**Promotion sequence** (executed only after T5, inside the held lock; every
step re-derives its authority from a DISK re-read of the log and files,
never from the emitting call's memory):

0. Verify the approval is PERSISTED AND VERIFIED: re-read P's log file from
   disk, locate `revision.approved` for this revision, and confirm its
   `candidate`/`contract` shas are well-formed. The append that wrote it must
   have gone through the verified-append primitive (§8), so a failed or
   unverifiable append aborts the session BEFORE this step can run — no
   promotion without a persisted approval, ever.
1. Recompute the candidate file hashes. On mismatch with the event's
   `candidate` shas, check whether the approved artifacts on disk already
   hash to the event's `contract` (a previous repair may have promoted
   already): if they match, do NOT skip the archive — continue to step 2 in
   VERIFY-ONLY mode (no archiving write is possible on this path), then jump
   to step 5; if neither candidate nor promoted artifacts verify, refuse
   repair/launch (B8).
2. Archive the current `.ai/features/<slug>/prd-<slug>.md` and
   `tasks-<slug>.md` to the sidecar (`previous-*.md`) — WRITTEN ONCE,
   VERIFIED. Slug is the predecessor's `findExistingFeatureSlug(cwd,
   description)`. Decision tree (also the repair re-entry rule, see B4a):
   - archive files exist AND hash to `revision.started.baseContract` → skip
     (already archived; never rewritten);
   - archive files exist AND do NOT verify → fail-closed, refuse repair:
     the archive is engine state, a mismatch is damage or tampering, and an
     overwrite would destroy the only content copy of the old contract;
   - archive absent AND on-disk artifacts hash to `baseContract` → write the
     archive now (the normal path), verify the written copies by hash;
   - archive absent AND artifacts already hash to `contract` (promoted by a
     previous repair; the only absent-branch reachable from the step-1
     verify-only skip) → the old-contract content copy is unrecoverable;
     repair reports the loss explicitly and proceeds to steps 5–7 (the
     approved launch is not blocked by a lost convenience copy; the old
     contract survives in the log as hashes only).
3. Write the new artifacts as `${descriptionMarker(description)}\n${candidate body}`
   to both paths (marker rule identical to `runFeatureWorkflow`'s in-gate
   writes, so `validateResumePreconditions` and the successor's artifact
   lookup keep working).
4. Recompute artifact hashes; refuse and stop on mismatch with the event's
   `contract` (never launch an unverified contract).
5. Create the successor log `<chainRoot>-r<N+1>.jsonl` (id rule below) with
   exactly two seeded events: `workflow.started` (original description,
   original stack, ORIGINAL `baseline` commit, original
   `ignoreRulesDigest`/`repoStateDigest` if the predecessor had them,
   original `verify` freeze if present, `carriedUsage` = predecessor replayed
   totals, `revision` = {predecessorRunId, revision, correction}) and
   `spec.approved` (contract hashes). No baseline may be re-snapshotted: the
   successor enters `runFeatureWorkflow` in resume mode with
   `resume.baseline` set, which skips `git.baseline` entirely (the existing
   resume-mode guard against swallowing partial work). The seed is
   deterministic (no timestamps), so a partial seed recovers by PREFIX
   VERIFICATION (B5a): re-derive the canonical `workflow.started` from the
   approval event and the predecessor's `workflow.started`; if the log's
   first event differs in ANY field, fail-closed refuse; if it matches and
   `spec.approved` is missing, append ONLY the missing event; append both
   only when the log is empty. `spec.approved` without a preceding
   `workflow.started` is an impossible order and refuses.
6. Append `revision.launched {revision, successorRunId}` to P via the
   verified-append primitive (§8), idempotently: skipped when already
   present on disk.
7. Launch the successor detached through `launchRun` with
   `resumedPhase: "develop"` (omitted when the stub already carries
   `workflow.resumed`, see B7c) and a constructed `ResumeState`:
   `{phase: "develop", reviewRound: 0, verifyRetries: 0, developerRuns: 0,
   fixes: [], previousBlockingIds: ∅, usage: carriedUsage copy,
   baseline: rebuilt original baseline object, verify: predecessor freeze,
   spec: contract hashes, revision: {predecessorRunId, revision, correction}}`.
   No `interruptedPatchSha`, no `lastReview`, no `fixes` — stale verdicts and
   results cannot complete the new contract.

**Successor id rule.** Chain root = `<runId>` with any trailing `-r<N>`
stripped; successor = `<chainRoot>-r<N+1>` where `N` is the current run's own
suffix (0 for a root run). A collision with an existing unrelated log
refuses revise (fail-closed; the namespace is engine-owned so this should
not happen).

**Promotion is not atomic; it is deterministic and verified.** The
filesystem can observe transient mixtures between steps 3 and 4, but no
execution can start on them: the authority is the log event, launch verifies
hashes, and repair (§9) always rewrites both artifacts from the candidate
sidecar before anything runs. There is deliberately no automatic rollback:
rollback would mean rewriting approved artifacts without an approval event,
which the spec forbids — and there is no post-promotion abandonment either
(§14): after `revision.approved` is persisted, the only paths are the
launch repair and the B8 fail-closed exit.

## 8. Event and artifact schema

New `WorkflowEvent` members (append-only, predecessor log unless noted).
Every member carries a stable `eventId` — the sha256 of the event's
canonical content with `eventId` itself and all timestamp fields (`at`,
`approvedBy.at`) excluded. The id is content-derived, so a retry of the same
logical step reconstructs the SAME id from the same persisted evidence;
timestamps never participate (see the persistence contract below):

```ts
| {
    type: "revision.started";
    eventId: string;          // stable, content-derived
    runId: string;            // predecessor
    revision: number;         // chain-wide, 1-based; counts EVERY revision.started in the chain, abandoned included
    correction: string;       // verbatim user correction
    correctionSha: string;
    baseContract: { prdSha: string; tasksSha: string }; // hashes of the still-approved artifacts
    partialPatchSha?: string; // evidence captured at open (§10)
    partialFiles?: string[];
    at: string;               // ISO timestamp; excluded from eventId
  }
| {
    type: "revision.candidate";
    eventId: string;
    runId: string;
    revision: number;
    round: number;            // 1-based; budget accounting reads these events
    prdSha: string; tasksSha: string;
    at: string;               // excluded from eventId
  }
| {
    type: "revision.candidate.rejected";
    eventId: string;
    runId: string;
    revision: number;
    round: number;
    reason: string;           // validation failure or "rejected by user"
    artifactPath: string;     // rejected raw output, when persisted
    notes?: string;           // replacement notes when rejected by user
    at: string;               // excluded from eventId
  }
| {
    type: "revision.approved";       // AUTHORITATIVE approval
    eventId: string;
    runId: string;
    revision: number;
    round: number;
    correction: string;
    correctionSha: string;
    candidate: { prdSha: string; tasksSha: string };
    contract: { prdSha: string; tasksSha: string };
    predecessorStatus: string;       // cancelled | needs_human | failed | interrupted
    approvedBy: { via: string; pid: number; at: string }; // approvedBy.at excluded from eventId
  }
| {
    type: "revision.abandoned";
    eventId: string;
    runId: string;
    revision: number;
    reason: string;          // user choice | approval contents unrecoverable
    at: string;              // excluded from eventId
  }
| {
    type: "revision.launched";
    eventId: string;
    runId: string;
    revision: number;
    successorRunId: string;
    at: string;              // excluded from eventId
  }
```

Extensions to existing events (optional fields; old readers ignore them):

```ts
// workflow.started gains:
revision?: { predecessorRunId: string; revision: number; correction: string };
carriedUsage?: Partial<Record<string, UsageTotals>>; // successor only; replay folds it into usage
```

`replayRunLog` changes (the ONLY replay changes in this feature):

1. Seed usage reconstruction from `workflow.started.carriedUsage` when
   present (absent in every other log → no behavior change).
2. Reconstruct `ResumeState.revision` from `workflow.started.revision` when
   present. This is what keeps the correction/keep-change-remove context
   alive at EVERY resume of the successor (§15): the context lives in the
   log, never only in the launching process's memory. Ordinary logs never
   carry the field, so ordinary replays leave `revision` undefined and
   prompts stay byte-identical to today. Ordinary resume of a successor
   works because the successor log is a plain feature log.

**Persistence contract for revision lifecycle events.** `RunLog.append` is
best-effort by design: it swallows filesystem errors, reports once on
stderr, and degrades to a broken no-op sink. Correct for ordinary audit
events; unacceptable for approval-critical events. Revision lifecycle events
therefore go through a new verified, IDEMPOTENT primitive on `RunLog`,
`appendCritical(event)`:

- It appends via `appendFileSync` WITHOUT the best-effort catch: any
  filesystem error throws (`CriticalAppendError`).
- It first applies the same torn-line healing as `RunLog.open` (append the
  missing newline if the file does not end in one), so a previously torn
  final line cannot merge with the new event.
- **Reconciliation comes first, under CANONICAL equality.** Before
  appending, it re-reads the log and searches for an event with the same
  `eventId`. Two events are THE SAME logical event iff their `eventId`s
  match AND their canonical projections are identical — the canonical
  projection is the event minus `eventId` and minus every timestamp field
  (`at`, `approvedBy.at`), i.e. exactly the `eventId` input. This aligns
  reconciliation equality with id canonicalization: a retry re-derives the
  event from persisted evidence with a FRESH timestamp, and must still
  recognize its earlier copy.
  - found, same id, canonical projections equal (timestamps may differ) →
    return success WITHOUT appending (idempotent no-op; the persisted copy
    wins, a retry of the same step never duplicates);
  - found, same id, canonical projections differ → throw, fail-closed: same
    id must mean same canonical content, so a mismatch is corruption or a
    hash collision, never a retry to force through;
  - the log cannot be read → throw WITHOUT retrying (nothing may be appended
    that cannot subsequently be verified).
- After appending, it re-reads the file and verifies the last complete line
  parses back to EXACTLY the appended event — STRICT JSON equality is
  correct here, because the compared object is the very one just serialized
  (same timestamp). On verification failure it reconciles once more under
  canonical equality: if the event is now present and canonically equal,
  the write had landed and the failure was observational — return success;
  if it is provably absent (a successful read proves it), retry the append
  exactly once and re-verify; if verification fails again, throw.
- If the sink is already marked broken, it refuses instead of pretending to
  persist.

The consequence: the case "the write succeeded but the re-read failed" is
resolved by reconciliation against the stable `eventId`, not by a blind
retry — the event is either already on disk (success, no duplicate) or
provably absent (one clean retry), and an unreadable log refuses rather
than guessing.

All six `revision.*` events use `appendCritical`; ordinary workflow events
keep the existing best-effort `append` unchanged. On `appendCritical`
failure the revision session aborts immediately. This is safe at every point
where a critical append is the gate: approval precedes promotion and the
pointer precedes launch-completion, so nothing irreversible has happened.

`revisionLifecycle` parsing deduplicates defensively under the same
canonical equality: lines with the same `eventId` and equal canonical
projections are collapsed to one regardless of their timestamps; the same
`eventId` with differing canonical projections is a fail-closed refusal,
never resolved by picking one.

§7 step 0 makes verified persistence the promotion precondition: promotion
and every repair re-locate `revision.approved` by re-reading the log FILE,
and refuse when it is absent or malformed. An in-memory event that is not
verifiably on disk does not exist.

Sidecar artifacts: `candidate-prd.md`, `candidate-tasks.md`,
`previous-prd.md`, `previous-tasks.md`, `session.json` (§7).

## 9. Crash-recovery matrix

Every row is deterministic: repair consumes only persisted evidence (events +
files), never guesses, and never fabricates an approval.

**Repair reachability (B7 fix).** The repair entry point is
`/flow revise <predecessorRunId>` in BOTH of these cases:

- lifecycle `approved-pending-launch` (the approval is persisted, the launch
  has not verifiably completed);
- lifecycle `launched` where `launchIncomplete(P, successorId)` holds — the
  successor log is absent, or present without any `phase.started`. The
  pointer event alone proves intent, not a running successor, so `launched`
  is repairable until the successor's first `phase.started` exists. Once
  that phase event is on disk, `launched` is terminal (T12) and revise
  refuses, pointing at the successor.

| Boundary | Crash after | P log | Sidecar | S log | On next action | User-visible result |
|---|---|---|---|---|---|---|
| B0 | before `revision.started` persisted | unchanged | none | none | nothing to repair | revise restarts clean; no state |
| B1 | `revision.started`, no candidate yet | `revision.started` | session.json | none | resume-revision: continue (edit correction), or abandon | P resume refused with guidance until resolved |
| B2 | candidate persisted, before approval | + `revision.candidate` | candidate files | none | resume-revision: approve / reject with notes / abandon | approved artifacts untouched |
| B2b | `revision.approved` append fails, OR the write lands but the re-read verification fails (fs error, broken sink, torn line, unreadable log) | unchanged or contains the event (indeterminate until reconciliation) | candidate files | none | `appendCritical` throws after reconciliation: re-read the log and match by `eventId` under CANONICAL equality (timestamps excluded) — canonically equal event found → already persisted, continue (no duplicate, even when the retry re-emits a fresh timestamp); provably absent → one clean retry; unreadable log → throw without retry; same id with different canonical projection → fail-closed refuse | no promotion is possible: §7 step 0 requires the event verified on disk; the stable `eventId` makes the retry idempotent — the approval is either absent or complete, never half-recorded or duplicated |
| B3 | `revision.approved` verified on disk, before archive | + `revision.approved` | candidate files | none | repair: step 0 disk re-read → verify candidate shas → archive → promote → S → pointer → launch | approved-pending completes; no execution skipped approval |
| B4 | mid-promotion (0 or 1 artifact written) | + `revision.approved` | candidate + partial/complete archive | none | repair rewrites BOTH artifacts from candidate sidecar; refuses on sha mismatch | transient on-disk mixture never executes; deterministic rewrite |
| B4a | archive written, artifacts not yet overwritten (repair re-enters here) — and the same archive check runs on the step-1→5 skip path (verify-only) | + `revision.approved` | archive present | none | archive decision tree (§7 step 2), on BOTH the normal path and the skip path: verified archive → skip rewrite, continue; damaged archive (hash ≠ `baseContract`) → fail-closed refuse, NEVER overwritten; archive absent with already-promoted artifacts → report the loss, proceed to seeding | the repair never overwrites `previous-*` with promoted artifacts; the old-contract copy is preserved or explicitly reported lost, whichever path reached step 2 |
| B5 | artifacts promoted, before S log | + `revision.approved` | candidate + archive | none | repair creates S log (deterministic id; existing matching log reused) | same |
| B5a | seed partially written: `workflow.started` persisted, `spec.approved` not yet (or empty successor log) | + `revision.approved` | candidate + archive | partial (`started` only) or empty | repair re-derives the CANONICAL seed from the approval event + predecessor `workflow.started` (no timestamps → fully deterministic); prefix verified field-by-field → append ONLY the missing `spec.approved` (or both when the log is empty); ANY divergence → fail-closed refuse; `spec.approved` present without `workflow.started` → refuse (impossible order) | the successor log is completed, never rewritten; a divergent seed can never pass as approved |
| B6 | S log seeded, before `revision.launched` | + `revision.approved` | candidate + archive | seeded | repair appends pointer idempotently, then launches | same |
| B7a | `revision.launched` appended, successor log absent or not yet seeded | + pointer | archive | absent | repair reached from lifecycle `launched` via `launchIncomplete`; seeding is idempotent (existing matching log reused, never a second `workflow.started`), then launch | the pointer proves intent, not a run — repair completes it |
| B7b | successor seeded, before `workflow.resumed` | + pointer | archive | stub (`started` + `spec.approved`) | repair appends `workflow.resumed` (only because it is absent), then launches; `/flow resume <S>` refuses (`gate_not_approved`) until the first `phase.started` | append-only preserved; no second `workflow.started` |
| B7c | `workflow.resumed` persisted, before the successor's first `phase.started` | + pointer | archive | stub incl. `workflow.resumed` | repair detects the existing marker, does NOT append a second one, and relaunches WITHOUT the `resumedPhase` option (§7 step 7) | at most one `workflow.resumed` on disk; after the repair's first developer pass the stub is an ordinary resumable feature log |
| B8 | candidate AND promoted-artifact contents unverifiable against the persisted approval (damaged/truncated files, sha mismatch) | + `revision.approved` | damaged | — | fail-closed: refuse repair AND execution; only explicit `revision.abandoned` (reason `approval contents unrecoverable`) lifts the lifecycle block, and its message reports the actual on-disk state (§14) instead of promising a restore | an apparently approved mixture can never run |

Ordinary crash healing (`already_decided`) is unchanged and runs before
eligibility (§5). A crash inside the successor's normal loop is ordinary
resume of S — no revision machinery involved.

## 10. Decision D4 — evidence capture and change detection

- At T1, revise captures `partialPatchSha` (sha256 of
  `git.diffSince(originalBaseline).patch`) and the changed-file list into
  `revision.started`. This is evidence, not a baseline: nothing is committed
  or snapshotted.
- The revision planner receives: previous approved PRD/tasks (from disk,
  hash-checked against `baseContract` — mismatch refuses revise as a tamper
  guard), the correction, and the partial-work evidence as a file list plus
  the patch capped at 48,000 characters (oldest hunks truncated first, with
  an explicit `[truncated]` marker). Keep/change/remove guidance is produced
  by the planner inside the revised PRD (prompted to enumerate what the
  correction retains, changes and removes, informed by the partial-work
  evidence); its presence is human-checked at the approval dialog, not
  structurally enforced (the structural contract stays `validatePlannerOutput`).
- At the approval dialog, revise recomputes the partial patch sha. Changed
  since `revision.started` → the dialog says so and offers regenerate
  candidate (round permitting) / approve anyway / cancel. The approval binds
  candidate CONTENT, not partial-work state; the user decides with fresh
  evidence in view.
- At launch (post-approval), the sha is recomputed again. Changed since
  approval → ask, mirroring `askResumeWithChangedDiff`: launch with current
  tree (default abort) or abort. A changed tree cannot silently invalidate
  the just-approved keep/change/remove guidance.

## 11. Decision D5 — budgets and counters

| Counter | Scope | Reset at revision? | Accounting authority |
|---|---|---|---|
| Planner candidate rounds | per revision | Yes — fresh budget of `MAX_PLAN_REVISIONS` (2) per revision number | `revision.candidate` / `revision.candidate.rejected` events in P's log; recovery recounts from events, so a crash can neither consume a round twice nor loop unbounded. Invalid planner output and provider failures consume no round (mirrors `runFeatureWorkflow`'s in-gate rules). At the limit only Approve/Abandon remain. |
| Developer passes (`developerRuns`) | per successor contract | Yes — 0 | Successor log replay (unchanged rules) |
| Review rounds (`reviewRound`) | per successor contract | Yes — 0 | Successor log; `config.maxReviewRounds` applies fresh |
| Verify retries (`verifyRetries`) | per successor contract | Yes — 0 | Successor log; `config.maxVerifyRetries` applies fresh |
| Usage (tokens/cache/cost/elapsed per role) | cumulative across the chain | No | Successor `workflow.started.carriedUsage` seeds replay; outcome totals cover the whole chain; per-call detail stays per log; `elapsedMs` remains per-launch-segment (existing S2 semantics) |
| Revision number | cumulative across the chain | No | `-r<N+1>` id rule + `revision` field; the number counts every `revision.started` ever appended in the chain, abandoned ones included — so a re-opened revision always gets a fresh number, and with it a fresh content-derived `eventId` (§8) |

Resume entry point after approval is always `develop`: the loop restart is
expressed as revision guidance in the developer prompt (§15), not as a fix
counter, so `fix #N` numbering in the successor starts clean and no
pre-revision review finding can masquerade as a successor fix item.

## 12. Decision D6 — planning artifacts and spec-tamper detection

The approved PRD/tasks files are the approval contract, and the tamper guard
(`specWasModified`) compares live hashes to the replayed `spec.approved`.
Revision interacts with this in exactly one authorized way: promotion, as
the direct effect of `revision.approved`, replaces the two artifact files
between approval and successor launch, when no workflow loop is live.

- Before approval: candidate work happens only in sidecars; the approved
  artifacts still hash to `baseContract`, and revise verifies this at open
  and at approval (mismatch → refuse as tamper).
- After promotion: P is terminal and never re-enters a loop, so P's stale
  hashes are never evaluated again; S's guard is S's own `spec.approved`
  (the new contract).
- Approval is the only authority for a changed contract: no code path may
  write `.ai/features/<slug>/prd-*.md`/`tasks-*.md` outside (a) the original
  planner write at gate, (b) the in-gate revision write, (c) post-stop
  promotion. Old `spec.approved` events remain in P's log as historical
  evidence.

## 13. Decision D7 — frozen inputs and integrity guards

The successor inherits the ORIGINAL run's frozen inputs; revision never
re-resolves them (constraint 8):

| Input | Source | Revalidation at revise entry | Revalidation before successor verify | On change |
|---|---|---|---|---|
| Git baseline | P `workflow.started.baseline` | `diffSince` resolvable (same as `validateResumePreconditions`) | unchanged — S diffs the same baseCommit | unresolvable → refuse revise (`unresolvable_baseline` recovery message) |
| Verify freeze | P `workflow.started.verify` | present → replayed verbatim into S's `workflow.started`; `changedScriptKeys` checked | same check again (S is a normal resumed run) | refuse revise: "restore the scripts or start a new run" (existing wording); corrupt freeze → refuse outright |
| Repository-state digest | P `workflow.started.repoStateDigest` | recomputed and compared | `stopForRepoStateChange` inside S (existing) | mismatch → refuse revise: restore repository state or start a new run; unreadable → treated as changed (fail-closed, existing rule) |
| Ignore rules | P `ignoreRulesDigest` + `diffSince` | — | existing `ignoreRulesChanged` notify to reviewer | notify only (existing policy; concealment scrutiny, not refusal) |
| Config (`.pi/pi-brain.json`) | not an input | — | none — S replays the frozen commands | config edits cannot alter what successor verify runs (the freeze exists precisely for this) |
| Approved artifacts | disk vs `baseContract` | hash check | S's tamper guard | mismatch → refuse revise (tamper), never "adopt" the modified plan |

Legacy logs (absent freeze/digest): S inherits the absence, gets the same
one-line notices an ordinary legacy resume gets, and its `workflow.started`
omits the absent fields — behavior converges with today's legacy-resume
compatibility instead of inventing a new downgrade.

## 14. Decision D8 — abandonment, pre- and post-promotion

Abandoning a revision is always an explicit user choice. There is no
timeout, no automatic abandon, and no path where a persisted approval is
discarded without a user action.

**Pre-promotion abandonment (lifecycle `open` or `candidate-pending`).**
Offered in the resume-revision dialog: Continue revision / **Abandon
revision** / Approve or Reject candidate (when one exists). Effects:
`revision.abandoned` appended; sidecar directory removed; the lifecycle
block on P is lifted. What the user gets back depends on P's OWN status,
and the dialog states it BEFORE the user confirms:

| P's status | After abandon, `/flow resume P` | Remaining paths |
|---|---|---|
| interrupted / `workflow.failed` (replayable) | works again under the OLD contract — old artifacts, old `spec.approved` hashes, original baseline/freeze, all untouched because promotion never happened | ordinary resume, exactly as before the revision |
| `cancelled` (terminal outcome) | still refused (`terminal_outcome`) — precisely the pre-revision behavior; an abandoned revision cannot resurrect a stopped run | a NEW `/flow revise P` (eligible again, lifecycle `none`), or a fresh `/feature` |
| `needs_human` (terminal outcome) | still refused (`terminal_outcome`) — precisely the pre-revision behavior | resolve the escalation manually, a NEW `/flow revise P`, or a fresh `/feature` |

The spec does not promise resume where today's engine cannot resume: for
terminal predecessors, abandonment restores the pre-revision REFUSAL
behavior, nothing more.

**Post-promotion abandonment: does not exist.** Once `revision.approved`
is persisted, abandon is no longer offered: the only paths are the
deterministic launch repair (§9, reachable from both
`approved-pending-launch` and `launched` with an incomplete launch) and the
B8 fail-closed exit. Rationale: promotion rewrites the approved artifacts
as the direct effect of an approval (§12); a post-approval "abandon" would
either silently keep the revised artifacts (dishonest) or rewrite them
back outside an approval effect (forbidden rollback). A user who no longer
wants the change after approval gets the launched successor and revises IT
— a second explicit approval — instead of a silent restore.

**Forced abandonment (B8 only).** When neither the candidate nor the
promoted artifacts verify against the persisted approval, the explicit
abandon records `revision.abandoned` (reason `approval contents
unrecoverable`), lifts the lifecycle block, and REPORTS the on-disk state
instead of promising a restore: artifacts hash-matching P's old
`spec.approved` → untouched (the common case); anything else →
indeterminate, with both sha sets printed for manual inspection. In the
indeterminate case P's artifacts are NOT known-good and the message says so;
the user's options are a new revision or manual restoration from the
sidecar archive. Partial code is never touched by any abandonment (or by
anything else in this feature).

## 15. Developer and reviewer plumbing

- New `POST_STOP_REVISION_PROMPT` in `src/workflows/feature-prompts.ts`
  (planner, read-only, same TITLE/PRD/TASKS output contract and the same
  `validatePlannerOutput` gate): inputs {description, stack, title,
  currentPrd, currentTasks, correction, partialFiles, partialPatchCapped};
  instructed to apply only the correction, keep the TITLE stable, enumerate
  Keep/Change/Remove against the partial work, and preserve everything the
  correction does not mention.
- `DEVELOPER_PROMPT` gains an optional `revision` section (correction text +
  "the tree contains partial work from the superseded contract; apply the
  revised plan to the existing tree; remove only what the revised plan marks
  out of scope; do not revert unrelated partial work; the PRD/tasks remain
  untouchable").
- `REVIEWER_PROMPT` gains an optional `revision` note: judge the complete
  original-baseline diff against the REVISED PRD/TASKS; pre-revision partial
  work retained by the revised plan is not unrequested scope; stale
  verification results are never supplied — the successor's reviewer receives
  only results from its own verify phases (the existing empty-results rule:
  "do not treat an empty list as a successful run" already covers the first
  round if verify is skipped... it is not skipped: the successor always runs
  verify before review, like any loop pass).
- `ResumeState` gains optional `revision?: { predecessorRunId: string;
  revision: number; correction: string }`. The context is reconstructed FROM
  THE LOG at every entry into the successor: `replayRunLog` sets it whenever
  `workflow.started.revision` is present (§8 replay change 2), and the
  successor's first launch sets it when building the initial `ResumeState`
  (§7 step 7). Ordinary logs never carry the field, so ordinary resumes see
  it absent and prompts stay byte-identical to today. `runFeatureWorkflow`
  threads it into the two prompts. The correction text therefore survives
  EVERY resume of the successor — it is never held only in the launching
  process's memory.

## 16. Compatibility rules

1. **New events in old readers.** Old binaries skip unknown event types
   (`replayRunLog` switch has no default; `describe` renders a generic line;
   `readRunLog` parses unknown JSON shapes as opaque events). New optional
   fields on `workflow.started` are ignored by old readers.
2. **Old logs in new readers.** No `revision.*` events → lifecycle `none` →
   eligibility per §5 with no behavior change anywhere.
3. **Ordinary resume unchanged** except one refusal: P with lifecycle
   `open`/`candidate-pending` → "a plan revision is in progress — continue or
   abandon it with /flow revise <runId>"; lifecycle `approved-pending-launch`
   → "the revision was approved — complete the launch with /flow revise
   <runId>"; lifecycle `launched` while `launchIncomplete` holds → "the
   revision launch is incomplete — complete it with /flow revise <runId>"
   (same repair path); lifecycle `launched` with a running successor →
   "revised by <successorRunId> — revise the successor run instead". These
   are new `Refusal` variants in `src/workflows/resume.ts` (checked in
   `handleResume` before lock acquisition), fail-closed and explicit.
4. **Successor is a plain feature run.** After launch, `/flow resume <S>`,
   `/flow stop`, `/flow log`, outcomes and crash healing work with zero
   revision awareness.
5. **Fail-closed handling of corrupt revision evidence.** A `revision.*`
   event with missing fields, or a sha that matches no recoverable content,
   refuses the affected paths (revise, repair, P resume) with explicit
   messages; only the explicit abandon (B8) unblocks. Minimum evidence to
   revise a legacy run: `workflow.started` with `description` + `baseline`
   and a replayable/terminal-decidable log (§5 rows).
6. **`/flow log-all`** renders the revision pointer (`revised-by=...` /
   `revises=...`) when present; rendering only, no semantics.
7. **No log rewrites; honest append accounting.** Existing events are never
   edited or reordered. The revision session appends `revision.*` audit
   events to P's log from the moment it OPENS — `revision.started`,
   `revision.candidate` and `revision.candidate.rejected` precede any
   approval — so the predecessor log is not "untouched until approval".
   What holds: the session never appends loop, outcome or failure events of
   the execution workflow; replay ignores `revision.*`, so P's replay
   verdict is unchanged by their presence; and the successor's execution
   events live only in the successor's log. The `already_decided` heal that
   already exists is unchanged.
8. **Verified, idempotent persistence for critical events.** All
   `revision.*` events go through `RunLog.appendCritical` (§8) and carry a
   stable content-derived `eventId`: a filesystem failure or a failed
   re-read verification resolves by reconciliation (identical event already
   on disk → success without duplicating; provably absent → one clean
   retry; unreadable log or same-id-with-different-canonical-projection →
   throw, fail-closed),
   and the revision session aborts before any irreversible step. Promotion
   (§7 step 0) and every repair re-derive the approval from a disk re-read,
   so no promotion ever runs on an approval that is not verifiably
   persisted. Ordinary events keep the best-effort `append`; ordinary
   behavior is unchanged.
9. **Revision context on every successor resume.** `replayRunLog`
   reconstructs `ResumeState.revision` from `workflow.started.revision`
   (§8, §15), so corrected-contract prompting survives any number of
   successor resumes; ordinary logs lack the field and replay leaves it
   undefined, keeping their behavior byte-identical.

## 17. Acceptance scenarios → observable outcomes and tests

| Scenario (brief) | Observable outcome | Proposed tests |
|---|---|---|
| Stop during development, correct a requirement, approve, continue | `/flow stop` → outcome `cancelled`; `/flow revise` opens revision; candidate approved; promotion archives old artifacts; successor runs from `develop` with original baseline; final review judged the complete original diff against the new contract; partial code still on disk | `tests/revise.test.ts`: end-to-end with fakes (fake agents/git/verifier per `tests/feature-workflow.test.ts` patterns): assert sidecar contents, both logs' event sequences, diffSince called with the ORIGINAL baseCommit, developer/reviewer prompts contain correction + retention note |
| Cancel revision / reject candidate / malformed planner output | Abandon (pre-promotion only): `revision.abandoned`, sidecar gone; interrupted/failed P ordinarily resumable under the old contract; cancelled/needs_human P still refuses `terminal_outcome` exactly as before the revision (asserted, not promised); reject-with-notes: round+1, artifacts untouched, budget respected; invalid output: `revision.candidate.rejected`, no round consumed, rejected output persisted; approval append failure (B2b): nothing promoted, approval retryable | revise.test.ts: one scenario per predecessor status asserting the ACTUAL post-abandon resume outcome (success for interrupted, `terminal_outcome` refusal for cancelled/needs_human); P log never gains a `workflow.outcome` from the revision session; fault-injected `appendCritical` failure aborts the session before promotion |
| Crash across approval boundaries (B2b, B3–B8 incl. B4a, B5a) | Repair completes promotion deterministically from disk re-reads; contract choice is single (S's `spec.approved`); approval never skipped; repair reachable from lifecycle `approved-pending-launch` AND from `launched` while `launchIncomplete` holds; `appendCritical` is idempotent under the stable `eventId` with CANONICAL equality — a write that landed but failed verification reconciles to success with NO duplicate, provable absence retries once, unreadable logs and same-id-different-canonical-projection refuse; the same logical event re-emitted with a fresh timestamp reconciles to the persisted copy; B4a: on BOTH the normal path and the step-1→5 skip path, a verified archive is never rewritten, a damaged one refuses repair, a lost one (promoted artifacts, no archive) is reported and does not block the approved launch; B5a: a partial seed is completed by prefix verification — only the missing `spec.approved` is appended, any divergence refuses, `spec.approved`-without-`workflow.started` refuses; B7 split: pointer-without-successor-log (B7a), seeded-stub-without-`workflow.resumed` (B7b), `workflow.resumed`-without-`phase.started` (B7c, at most one resumed marker ever); B8 refuses execution and only the explicit forced abandon lifts the block, reporting real disk state | revise.test.ts: fault injection at every boundary; `appendCritical` verification-failure-then-reread-success leaves exactly ONE copy of the event — including the retry with a REGENERATED timestamp (same canonical projection → success, one persisted line); same-id-different-canonical-projection refuses; repair run twice (idempotence); damaged `previous-*` refuses repair and stays byte-identical on BOTH paths (normal and step-1→5 skip); skip path with absent archive reports the loss and launches; partial seed gains only `spec.approved` (assert: event count and order); divergent seed field-by-field refuses; no `workflow.started` duplication across B7a–B7c; exactly one `workflow.resumed` after B7c repair; B8 fail-closed with on-disk-state report |
| Resume twice after revised-loop interruption | `/flow resume <S>` twice: counters re-derived identically, no double-charged verify retry, findings fresh, usage = carried + successor segments, consistent across resumes, and the revision context (correction text) present in developer/reviewer prompts on EVERY resume — reconstructed from the successor log, not held in memory | `tests/resume.test.ts` extension: successor log with `carriedUsage` and `revision`; two sequential replays assert identical `ResumeState` incl. `revision`; prompt-level assertion that the correction text appears after the second resume; launcher-level test asserts outcome usage covers the chain |
| Lock held / cancellation pending / candidate changed / partial work changed / frozen inputs changed | Refuse-or-revalidate per §5/§10/§13 with explicit messages; no execution in any refuse case | revise.test.ts: eligibility + preconditions matrix; run-lock interaction via `acquireRunLock` fakes; changedScriptKeys and repoStateDigest mismatch refusals; approval-dialog and launch-time change detection |
| Existing non-revision logs | Ordinary resume and crash healing byte-identical behavior; new code paths never appended to non-revision logs | resume.test.ts regression pass (existing suite green, plus explicit test: replay of a legacy log ignores `revision.*` events injected adversarially) |

Observable acceptance criteria (each maps to at least one assertion above):
AC-1 revision exists as a distinct command and never mutates approved
artifacts before a verified-persisted `revision.approved`; AC-2 approved
candidate contents are hash-bound and verified before launch; AC-3 successor
diffs the original baseline and never re-snapshots; AC-4 stale
reviews/verifications cannot complete the successor; AC-5 all crash
boundaries B0–B8 (incl. B2b and the three B7 windows) recover
deterministically or fail closed, with repair reachable from both
`approved-pending-launch` and `launched`-with-incomplete-launch; AC-6
budgets recover without double consumption; AC-7 ordinary resume of
untouched logs is unchanged; AC-8 abandonment outcomes match predecessor
reality per status (resumable again for interrupted/failed, still
`terminal_outcome` for cancelled/needs_human), as asserted messages;
AC-9 no promotion or launch starts unless `revision.approved` is
verified-persisted on disk (`appendCritical` + re-read), and `appendCritical`
is idempotent: a write that landed but failed re-read verification
reconciles via the stable `eventId` under CANONICAL equality (the eventId
input: all fields except `eventId` and timestamps) to exactly one on-disk
copy — the same logical event with a fresh timestamp reconciles to the
persisted copy, never a duplicate, never a blind retry; AC-10
post-promotion abandonment is
unavailable — the only post-approval paths are launch repair and the B8
fail-closed exit; AC-11 the revision context is reconstructed from the
successor log at every resume; AC-12 the `previous-*` archive is written
once and hash-verified against `baseContract`, on EVERY repair path
including the step-1→5 skip: repair skips a verified archive, refuses a
damaged one without overwriting, and explicitly reports a lost one;
AC-13 a partial successor seed recovers only by prefix
verification — the missing `spec.approved` is appended alone, any
divergence from the canonical seed refuses.

## 18. Residual assumptions and unresolved decisions

**Unresolved decisions blocking implementation: none.** Every brief decision
above is settled with a bounded policy. Residual assumptions (accepted costs,
each observable in tests or docs):

1. Consumer repos keep engine state out of the reviewer diff via their
   `.gitignore` of `.pi/pi-brain/` — the same assumption the existing run
   logs already make (§3). If a consumer tracks `.pi/pi-brain/`, sidecar
   files would appear in successor diffs exactly as run logs already would;
   no new class of exposure.
2. The revision session's detached UX reuses the active-run slot with
   `workflow: "revision"`; `/flow stop` during planner execution cancels the
   session but never the revision state (T10). Fine-grained progress rendering
   of the revision session is a UI polish concern, deferred.
3. Keep/change/remove completeness is enforced by human approval, not by
   output validation (§10). A candidate without usable guidance is the
   user's to reject; the correction text itself is always passed verbatim.
4. The 48,000-character partial-patch cap for planner evidence may drop
   hunks on very large diffs; the file list and truncation marker remain, and
   the approval dialog is where staleness surfaces.
5. Chain depth is uncapped (`-r3`, `-r4`, …), bounded in practice by each
   revision requiring an explicit approval. If unbounded chains ever matter,
   a cap is a one-line policy change in the id rule.
6. Abandonment is intentionally unavailable after a persisted approval
   (§14): the way out of an approved-but-unwanted revision is revising the
   launched successor — a second explicit approval — never a silent
   rollback of the approved artifacts.

## 19. Out of scope / future work

- Revising a `completed` run (refused today; a new `/feature` is the
  contract-preserving path).
- Merging multiple corrections into one revision transaction.
- Carrying predecessor review findings into the successor's reviewer prompt
  (deliberately not done: they judged the old contract; the correction is
  the distilled guidance).
- Any tooling that resets, stashes or commits consumer trees around
  revision.
