<!-- pi-brain:feature "/flow resume <runId>: riprendere una run /feature interrotta senza ripartire da zero. Oggi un'interruzione (Ctrl-C, crash, quota reviewer esaurita — due incidenti reali) perde tutto: alla rilanciata il planner rifà domande e piano da capo. Fonte primaria: docs/pi-brain/IDEAS.md sezione \"Resume mode for interrupted runs\" (design sketch) e src/run-log.ts (log run-state persistito per runId). Implementa /flow resume <runId>: (1) replay dell'event log (.pi/pi-brain/runs/<runId>.jsonl) per derivare l'ultima fase completata e il review round; (2) re-validazione delle preconditions: lock acquisibile, file PRD/tasks presenti con marker pi-brain, baseline git ancora risolvibile; (3) rientro alla prima fase incompleta — se interrotto durante review, il reviewer riparte sul diff attuale senza replay; se il diff è cambiato dall'interruzione (edit umani), warning e scelta restart-vs-resume via ask_user. Due gap noti da chiudere nel design: l'event log NON registra l'approvazione del gate né il baseline commit usato da diffSince — oggi derivabili/irrecuperabili: l'approvazione del gate è inferibile deterministicamente (develop phase.started implica gate approvato), il baseline va persistito (es. campo opzionale in workflow.started, retrocompatibile). La logica di resume deve essere pi-free in src/ (workflows/ o nuovo modulo resume.ts), unit-testata con i fake esistenti come il resto; extensions/pi-brain.ts solo wiring del comando. Fuori scope: cambiare le semantiche del workflow feature (es. inoltrare i warning al fix round — idea separata in IDEAS.md), auto-resume dopo crash, resume di run di altri workflow. Done: npm run typecheck e npm test verdi; test che coprono replay→resume in develop, in review, run con log corrotto/monco, gate non ancora approvato, diff cambiato → ask_user." -->
## PRD

### Problem
An interrupted `/feature` run (hard Ctrl-C, process crash, reviewer quota exhausted — two real incidents) loses everything: on relaunch the planner re-asks its questions and rebuilds the plan from scratch. Yet the run-state log (`.pi/pi-brain/runs/<runId>.jsonl`, `src/run-log.ts`) already persists every workflow event, the developer's work is the uncommitted diff on disk, and verify/review recompute their inputs fresh each round. Resume is mostly *skipping phases whose events are already logged* — the missing pieces are the replay logic, re-validation of preconditions, two persisted fields (gate approval is inferable; the git baseline is not), and a changed-diff guard.

### User stories
- As a **pi-brain user**, I want `/flow resume <runId>` to continue an interrupted feature run from the first incomplete phase, so that a crash or exhausted quota does not force a full planner restart.
- As a **pi-brain user**, I want resume to re-validate preconditions (lock, PRD/tasks markers, baseline) and refuse cleanly with a reason, so that I never resume into a corrupted or foreign state.
- As a **pi-brain user**, when the working diff changed since the interruption (my own edits), I want a warning and an explicit restart-vs-resume choice, so that the reviewer never judges a diff the developer never made without my consent.

### Scope
- `/flow resume <runId>` command (extension wiring only in `extensions/pi-brain.ts`).
- Event-log replay (pure, pi-free) deriving: gate approval (any `develop`/`fix #n` `phase.started` ⇒ gate approved), review round, verify retries, developer runs, last review issues, per-role usage.
- Persisted-state additions (all optional, retrocompatible): `workflow.started` gains `description`, resolved `stack`, `baseline`; `phase.started` gains `patchSha` (review phases); new `workflow.resumed` event; `review.completed` issues gain optional `file`/`line`/`recommendation`.
- Precondition re-validation: lock acquirable (existing `acquireRunLock`), PRD/tasks present with the pi-brain description marker, baseline still resolvable (via `diffSince` succeeding).
- Re-entry at first incomplete phase: developer agent incomplete → re-run developer turn; developer done but verify missing → re-run verify only; review started but not completed → re-run reviewer on the current diff, same round number.
- Changed-diff guard at review re-entry: sha256 of current patch vs the `patchSha` recorded when the interrupted review started; mismatch (including empty diff) → warning + `select` [Resume with current diff / Abort]; Abort stops cleanly (user re-runs `/feature` manually — decided).
- Resumable set (decided): runs with **no** final outcome, plus runs ended by `workflow.failed`. `completed`, `needs_human` and `cancelled` (via `/flow stop`) outcomes are refused.

### Out of scope
- Changing feature-workflow semantics (e.g. forwarding warnings to fix rounds — separate IDEAS.md idea).
- Auto-resume after crash; resume of non-`feature` workflows; re-asking the spec gate; re-planning.
- Any migration that makes pre-existing (old-format) logs resumable.

### Acceptance criteria
- `npm run typecheck` and `npm test` pass, with all pre-existing tests unchanged in behaviour.
- Replay of a log interrupted mid-develop (developer agent not completed) resumes by re-running the developer turn; planner is not called again and the spec gate is not re-asked.
- Replay of a log where the developer completed but verification is missing resumes at verify without re-running the developer.
- Replay of a log interrupted mid-review re-runs the reviewer on the current diff with the pre-interruption round number; `maxReviewRounds` is respected across the resume (no budget reset).
- A log with a torn/corrupt final line is replayed (torn line skipped); a log missing `workflow.started`, empty, or unrecognizable produces a clean refusal, not a throw.
- A log that ends before any develop phase (gate not approved) is refused with a message telling the user to re-run `/feature`.
- When the current patch sha differs from the recorded `patchSha` at review re-entry, the user is asked restart-vs-resume via `select`; choosing Abort stops the resume with no agent calls; choosing Resume proceeds on the current diff. Unchanged diff ⇒ no dialog.
- Runs whose log carries `workflow.outcome` (`completed`/`needs_human`/`cancelled`) or whose `workflow.started` lacks `baseline` (old format) are refused with distinct reasons.
- Missing/tampered PRD or tasks (marker mismatch) and an unresolvable baseline (diffSince throws) each produce a refusal.
- Usage totals of the resumed run fold in the pre-interruption `agent.completed` usage from the log; the resumed run appends to the same `<runId>.jsonl`.
- Resume of a run whose lock is held (live owner) is refused with the existing lock messages.

### Alternatives considered
- **Re-ask the spec gate on resume using the on-disk PRD** — rejected: gate approval is deterministic from `develop phase.started`; re-asking risks approving artifacts a later run may have overwritten, and IDEAS.md already leans "probably not".
- **Re-baseline to absorb human edits, then re-develop** (option B in the changed-diff dialog) — rejected for now: elegant but adds a second resume semantic; the user chose clean abort (manual `git stash`/revert achieves the same).
- **Persist resume state as a separate snapshot file** — rejected: the JSONL event log already exists and is crash-tolerant; a second artifact would need its own consistency story.
- **Recover the baseline for old logs by re-snapshotting** — rejected: a fresh baseline makes `diffSince` empty; the historical snapshot commit is unrecoverable, so old logs honestly refuse.

### Assumptions
- Resume logic lives in a new pi-free module `src/workflows/resume.ts` (replay + validation + orchestration); `feature.ts` is refactored to accept an optional resume/re-entry state; `extensions/pi-brain.ts` only wires the command.
- The resumed run **reuses the same runId** and appends to the same log; a `workflow.resumed` event marks the discontinuity; chained resumes (resume of a resumed run) work by replaying the whole log.
- Baseline and stack resolution move before the `workflow.started` emission so the event can carry them; `phase.started(discover)` ordering is otherwise unchanged.
- Loop-state reconstruction: `verifyRetries` = count of failed `verification.completed`; `developerRuns` = count of develop/fix `phase.started`; `fixes`/`previousBlockingIds` = blocking issues of the last `review.completed` (verify-failure fix rounds are synthesized from `command.completed` without output tails — degraded prompt, noted); `previousPatch` is unknown ⇒ treated as changed, disabling the no-progress escalation for the first post-resume decision; `lastReview` reconstructed from the event (may lack `file`/`line`/`recommendation`).
- Diff-change detection applies only at review re-entry (the request scopes it there); missing `patchSha` in an otherwise new-format log skips the check with a notify.
- Config drift is accepted: the resumed run resolves roles/budgets from the **current** config (IDEAS.md "probably fine"); if the reconstructed round already meets `maxReviewRounds`, the loop escalates naturally.
- `/flow resume` without a runId shows usage plus the list of resumable run ids; argument completions offer resumable ids (sync replay over `listRunIds`).
- A resumed run is guarded like `/feature`: refused while another run is active in the session; same `ActiveRun` bookkeeping, `/flow stop` works on it.

### Architecture / components
- `src/ports.ts` — `WorkflowEvent` extended: `workflow.started { description?, stack?, baseline? }`, `phase.started { patchSha? }`, new `workflow.resumed { runId, phase }`, `review.completed` issues with optional `file`/`line`/`recommendation`. All optional ⇒ old logs parse unchanged.
- `src/workflows/resume.ts` (new) — `replayRunLog(events): ResumeState | Refusal` (pure); `isResumable(events)`; `resumeFeatureWorkflow(deps, runId)` doing artifact/baseline validation, patch-sha comparison + ask, `workflow.resumed` emission, then delegation.
- `src/workflows/feature.ts` — extract the developer/verify/review turns so `runFeatureWorkflow(deps, description, runId, resume?)` can enter mid-loop with seeded counters/usage; persist the new fields; emit `patchSha` (node:crypto sha256, pi-free); export `descriptionMarker` and the `ResumeState` contract.
- `extensions/pi-brain.ts` — `/flow resume <runId>` subcommand: guards, `readRunLog`, replay, lock acquisition (existing refusal rendering), port wiring identical to `/feature`, RunLog re-opened for append, outcome rendering reused.

### Data flow
`/flow resume <runId>` → extension guards (no active run) → `readRunLog` → `replayRunLog` → refusal (notify, done) or `ResumeState` → `acquireRunLock(runId)` → build deps (PiAgentRunner, PiHumanInput, ShellVerifyRunner, RealGitService, RunLog append) → `resumeFeatureWorkflow`: check PRD/tasks markers → `diffSince(persisted baseline)` (throws ⇒ refusal) → patch-sha compare ⇒ maybe `select` (Abort ⇒ clean stop) → emit `workflow.resumed` → `runFeatureWorkflow(…, resume)` re-enters at the first incomplete phase → events append to the same JSONL → outcome rendered/notified as in `/feature`.

### Error handling
Every failure is a clean refusal (message names the runId and the reason): unknown runId/empty log; unrecognizable/corrupt log; not a `feature` run; gate not approved; terminal outcome present (status named); old-format log without baseline; PRD/tasks missing or marker mismatch; baseline unresolvable; lock held/hung/takeover-in-progress (existing `lockRefusal` texts); user Abort in the changed-diff dialog. No path throws out of the command handler; nothing is written to the working tree before all preconditions pass.

### Testing strategy
New `tests/resume.test.ts` using the existing fakes (`FakeAgentRunner`, `FakeHuman`, `FakeGit`, `FakeVerifier`) plus `RunLog` in a tmpdir: interrupted-run logs are produced either by running the workflow with a throwing/incomplete fake or by hand-writing JSONL; assertions per the acceptance criteria (resume in develop, after develop, in review with round/budget continuity, corrupt/short log, gate unapproved, changed diff ⇒ both dialog choices, unchanged diff ⇒ no dialog, old-format/baseline-missing/artifact-missing/terminal-outcome refusals, usage folding, planner never re-called). `tests/run-log.test.ts` extended for the new optional fields round-trip. Existing `feature-workflow.test.ts` must stay green unchanged (reordering of baseline vs `workflow.started` is invisible to it).