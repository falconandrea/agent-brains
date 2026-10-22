# Progress

## Open items

- 2026-10-22 agreed consolidation order is owned by
  [the roadmap](../../docs/plans/pi-plugin-adoption-roadmap.md#agreed-consolidation-sequence-2026-10-22):
  C1 completion policy/reconciliation → C2 TDD and test-quality consolidation →
  C3 feasible Cloudflare ideas in existing security-reviewer → C4 context/cost
  baseline then optimization → C5 skill usefulness review. No OS sandbox or
  full Cloudflare installation is planned. Analytics is excluded. C1 is complete (U15 implemented); next: C2. R1 plugin trials follow this sequence.

- New `agent-readiness` and `html-report` skills are registered in common/full;
  existing curated consumers need their next profile refresh to discover them.
  `extra/skills/humanizer` now includes compose/scan references and a lexical
  comparison helper; independent manual copies must receive the whole folder.
  Consumer copies have not been updated in this task. Provenance, decisions and
  the upstream README PR recipe are in
  [the adaptation note](../../docs/research/alfonso-skills-adaptation.md).
- Spotify-inspired context/read-cost workstream is planned, not started:
  U16 parent-load measurement + S2 cost/cache/latency instrumentation and
  baseline → S1 deduplicate discovered/injected context and compare → S3
  consider an explicit optional read-only bulk-reader.
  Status and acceptance criteria live in
  [the adoption roadmap](../../docs/plans/pi-plugin-adoption-roadmap.md#s--local-context-and-read-cost-optimization);
  evidence lives in
  [the assessment](../../docs/research/spotify-shunt-assessment.md).
  When resuming this workstream, follow C4 and measure before S1. Automatic hooks, code-writing
  workers and Jev remain deferred; no Portal installation is planned.
- `test-review` remains an explicit experimental extra. Initial pilot and isolated
  mutation evidence are in `docs/evals/test-review/README.md`. Three samples
  recorded so far: the initial T1–T3 historical pilot (B) and two fresh-feature
  runs — code-review follow-ups T4 (2026-10-11, `docs/evals/test-review/runs/E-test-review.md`)
  and T5+T6 (2026-10-12, `docs/evals/test-review/runs/F-test-review.md`): no
  must-fix in either, E one convergent minor overlap, F two accepted minor
  incomplete-coverage findings (one new, one sharpening a Spec-axis catch), no
  false positives, bounded overhead in both. The recurrence condition for
  reconsidering conditional workflow integration is met. C2 now selects
  consolidation of useful checks into the existing review; no additional
  mandatory reviewer is planned and implementation remains pending. Two
  missing unlink preservation cases were verified in a temporary fixture only;
  the shipping tests have not been changed.
- W1/W4 are complete. New consolidation work follows C1–C5 above; W2 and W3
  remain evidence-triggered and deferred.
- code-review-follow-ups T7/T9/T10 pending; T8 covered by U6/U8 (see
  `.ai/features/code-review-follow-ups/tasks-…md`); T1–T6 done.
- 2026-10-12 `main-review-hardening` plan brought onto `main` from commit
  `6c16a01`, originally drafted 2026-10-02 against `e5f8e56`
  (`.ai/features/main-review-hardening/`). U5/F4 is already covered by
  `07d74d7` (code-review-follow-ups T5–T6); U1/F2 (2026-10-14), U2/F1
  (2026-10-15), U3/F1+F2 (2026-10-16), U4/F3 (2026-10-17), U6/F7 and U7/F5
  (2026-10-17) are implemented and committed on `main` (U6 `0815222`, U7
  `8d45508`), and U8/F6 (2026-10-18) is committed on `main` in `f065e5a`.
  U9/U10/U11 (2026-10-22) are committed in `af37cf6` — see
  Done. Remaining tasks U12–U14/U16 are pending; U15 is implemented (2026-10-22).
  This transfer authorizes documentation integration only; the F13
  `changes_requested` policy option B is implemented (U15).

## Done

- 2026-10-22 U15/F13: `changes_requested` with no blocking issues now ends
  `needs_human` with an explicit reason, without another developer pass.
  Approved reviews with only warnings still complete; blocking-issue handling
  is unchanged. Regression observed failing before the fix; unit coverage
  includes empty/warning/suggestion issues and first/last rounds. A fake-runtime
  workflow check preserves the review and asserts exactly one developer pass.
  No new model, reviewer, schema, retry or resume behavior introduced.
  Verification: `npm test` 396/396, `npm run typecheck` and `git diff --check` clean.


- 2026-10-22 main-review-hardening U9/U10/U11 (F8, F9, F3 defence in depth;
  committed on `main` in `af37cf6`): multi-tool setup parity.
  U9: added `.opencode/agents/solution-capture.md` in the same pointer format as
  the other six and the `.agents/workflows/solution-capture.md` symlink to
  `.agents/skills/solution-capture/SKILL.md`. The README workflow section now
  carries a `Workflow skill | OpenCode pointer | Workflow link` table for all
  seven workflows; `tests/repo.test.ts` parses that table and asserts every row
  has an existing pointer that references its `.agents/workflows/<name>.md`
  link, and that the link resolves to the matching `SKILL.md`.
  U10: `setup.sh <proj> opencode` now warns that the OpenCode agent pointers
  read `.agents/workflows/*.md`, which is not linked in that mode, and prints
  the exact follow-up command (`"<repo>/setup.sh" "<project>" full`, or a
  curated profile). The README documents the same dependency and command. A
  smoke test in the temporary setup fixture asserts the warning, the exact
  command, that `.agents` stays unlinked, and that curated runs are unchanged;
  the curated-run guard matches the warning body itself, not only the
  "opencode-only" label.
  U11: setup keeps `.pi/pi-brain.lock` and `.pi/pi-brain/` in an existing
  target `.gitignore` through the existing idempotent helper. That helper now
  inserts the missing separating newline before appending when the file does
  not end with one, so a new entry can never be concatenated onto the previous
  last line (reproduced defect: `.agents` + `.pi/pi-brain.lock` became
  `.agents.pi/pi-brain.lock`). Fixture tests run the same profile twice and
  assert both entries appear exactly once, pre-existing entries survive, and a
  file ending in `.agents` without a final newline keeps `.agents` and the new
  entries on their own lines. Symlink ownership, local-content preservation
  and the other profiles are untouched.
  Verification: targeted `node --test tests/repo.test.ts
  tests/setup-unlink.test.ts` 32/32, `bash -n setup.sh`, `npm test` 394/394,
  `npm run typecheck` clean, `git diff --check` clean. Limits: U11 covers only
  destinations that already have a `.gitignore` (setup still never creates
  one) and does not touch the opencode-only early-exit path; U9's test
  deliberately trusts the README table as the workflow list, so adding a
  workflow requires adding its row. U12–U16 and F13 untouched; no consumer
  project was modified.

- 2026-10-18 main-review-hardening U8 (F6, baseline `8d45508`, committed on
  `main` in `f065e5a`): the detached runner's UI calls (`notify`, terminal `bell`,
  `setStatus`) are now best-effort. New `safeUi(effect, fn)` (Pi-free
  `src/ui-safe.ts`) runs the launcher's three effects in a try/catch that
  reports the failure exactly once on stderr
  (`pi-brain: <effect> failed: <message>`) and swallows it. A UI throw no
  longer reaches the run body's `catch`, so it can no longer persist a
  contradictory `workflow.failed` after `workflow.outcome`, flip a completed
  run to `failed`, reject the promise the extension discards with
  `void launchRun(...)`, or skip `deps.lock.release()`. Guarding the
  per-phase `setStatus` inside the event sink additionally stops a UI hiccup on
  `phase.started` from aborting the workflow's own `events.emit` call (which
  would have turned it into a workflow failure).
  The launcher alone did NOT cover every UI path — two review rounds closed
  the rest. (1) `/feature` and `/flow resume` build their
  `PiAgentRunner.create({ onEvent })` callbacks calling `human.status(...)`
  DIRECTLY, and the runtime fires them from its session listener DURING the
  run — outside the launcher's body. The exported `agentStatus(setStatus)`
  builds the per-agent-event status line and routes it through the same
  `safeUi` guard; both `onEvent` callbacks in `extensions/pi-brain.ts` go
  through it (the "no extension change" reading of the first cut was wrong).
  (2) `runFeatureWorkflow` calls `human.notify(...)` in ~9 places (the first
  is the stack line) and `PiHumanInput.notify` calls `ctx.ui.notify()`
  unguarded, so a UI throw reached the launcher's `catch` and became a
  `workflow.failed`. `runFeatureWorkflow` now wraps `deps.human` once with the
  exported `withBestEffortNotify(human)`, which guards ONLY the informational
  `notify` channel and delegates confirm/select/input/editor untouched — their
  errors are control flow (`UserDismissedError`, aborts) and must propagate.
  `safeUi` moved into `src/ui-safe.ts` so the launcher, the extension's
  `agentStatus` and the workflow decorator share one implementation.
  The scope is deliberately narrow: ONLY the UI effects go through
  `safeUi`/`agentStatus`/`withBestEffortNotify`. Real workflow failures still
  reach the `catch` (classified `cancelled`/`failed`, `workflow.failed`
  persisted, the error `notify` then guarded so it cannot rethrow), and
  persistence failures (`RunLog.append`) are not absorbed — a throwing audit
  trail still rejects loudly and still releases the lock, exactly as before.
  TDD/mutation: 10 new tests, red-first. `tests/run-launcher.test.ts` (8 new,
  18 total) — a throwing outcome `notify` (log ends with `workflow.outcome`
  only, promise resolves, lock released once, one stderr line, the bell still
  rings); a throwing `bell`; a throwing status clear; a throwing status on
  `phase.started` (phase still advances, run stays `completed`, log keeps
  `workflow.started`, `phase.started`, `workflow.outcome`); a workflow
  rejection combined with a throwing error `notify` (still `failed` +
  `workflow.failed`, reported once, not rethrown); a throwing run log (still
  rejects loudly, lock released once); a throwing status during an agent event
  through `agentStatus` (the runtime's `onEvent` path — text still built for
  every event, each throw reported once, never thrown); and `agentStatus`
  passing a working status through unchanged. `tests/feature-workflow.test.ts`
  (2 new, workflow level) — a throwing `human.notify` still completes the run
  (its `workflow.completed` is the last event, no `workflow.failed`, each
  failed notify reported on stderr exactly once) and a throwing `select` still
  REJECTS (response interactions stay propagable). Mutation checks, each
  killed by exactly its covering tests: dropping the sink `setStatus` guard →
  the `phase.started` test; dropping the `finally` guard → the status-clear
  and `phase.started` tests; dropping the catch-path `notify` guard → the
  workflow-error test; making `safeUi` swallow without reporting → the four
  reported-once tests; dropping the guard inside `agentStatus` → the
  agent-event test; dropping the guard inside `withBestEffortNotify` → the
  `human.notify` workflow regression.
  `npm test` 390/390, `npm run typecheck` clean, `git diff --check` clean.
  Limits: the report is one line per failing UI call, not one per run — a UI
  surface that throws on every `phase.started` still prints one line per event
  (a stale/broken Pi UI is already anomalous; a once-per-run latch would hide
  distinct failures); the extension wiring stays typecheck-only (no live Pi
  session was driven, same as before), but the shared
  `safeUi`/`agentStatus`/`withBestEffortNotify` guards it and the workflow
  call — including the runtime `onEvent` path and the workflow's internal
  notifications — are unit-tested; U1–U7 code paths untouched; F13 and U9–U16
  untouched; `extra/skills/ga4-analytics/` untouched.

- 2026-10-17 main-review-hardening U7 (F5, baseline `0815222`, now committed on
  `main` in `8d45508`): `/feature` acquires the run lock BEFORE its side effects. The run
  log (`RunLog.open`) and the agent runtime (`PiAgentRunner.create`) are only
  reached once the lock is held, so a refused `/feature` leaves no
  `.pi/pi-brain/runs/<runId>.jsonl` for `/flow log-all` to list as
  `in-progress-or-interrupted` and no runtime to tear down. To test the
  ordering with fakes and no Pi session or model, the sequence is the new
  Pi-free `startRun` in `src/run-launcher.ts` (the module U6 created and whose
  header already reserved this fix): lock, runtime, log, active-state, UI
  reporting and the hand-off are all injected. A refused/throwing lock
  publishes nothing and creates nothing; a runtime failure releases the lock
  exactly once and restores `active = null`; on success the lock's ownership
  passes to `launch`, whose `launchRun` releases it when the run settles, and
  `startRun` never releases it — the two paths are disjoint, so no run can
  release twice. `/feature` (`extensions/pi-brain.ts`) is wiring only: the
  detached `void launchRun(...)` hand-off, the started notify and the
  lock-refusal wording are unchanged; the `onFailure` switch carries the three
  messages (`lock_error`, `lock_refused`, `runtime_error`). Resume, the U1–U4
  guards, the U5 timeout and the U6 launcher are untouched; F13 untouched.
  Deviation from the task's extension-only file map: the ordering moved into
  `src/run-launcher.ts` (+ `tests/run-start.test.ts`) because the U7 test
  mandate (fakes, no Pi/model) cannot be met against an inline
  `PiAgentRunner.create`.
  TDD/mutation: 5 fakes-only tests pin the contract and the effect ORDER —
  refused lock → `["lock"]`, nothing active, no runtime, no log; lock throw →
  the same; runtime failure → `["lock", "agents"]` (no log), released exactly
  once, active `[run, null]`; success → `["lock", "agents", "log", "launch"]`,
  lock handed to the launcher and NOT released by `startRun`; a composition
  test hands the lock to the real `launchRun` and observes it held while the
  fake workflow is pending, released exactly once on settle. Each mutation
  (drop the runtime-failure release, drop the active restore, double release
  after the hand-off) is killed by exactly its covering tests.
  `npm test` 380/380, `npm run typecheck` clean, `git diff --check` clean.
  Limits: the extension file stays typecheck-only (no live Pi session was
  driven, same as before) — the manual Pi check (a refused `/feature` adds no
  row to `/flow log-all`) is not automated; the unit tests pin the ordering
  that produces it. U5/U6 code paths untouched;
  `extra/skills/ga4-analytics/` untouched.

- 2026-10-17 main-review-hardening U6 (F7, baseline `fa5303f`, now committed on
  `main` in `0815222`): `/feature` and `/flow resume` share one run launcher. New
  `src/run-launcher.ts` — Pi-free, every Pi-facing effect injected (history
  append, status line, notify, bell, lock) — owns the whole execution cycle:
  the event sink (in-memory buffer for `/flow`, best-effort Pi-side history
  where a throw is swallowed so the run log still receives every event,
  run-log append, phase tracking), the `workflow.outcome` event (built in one
  place, verbatim payload: conditional reason/summary/files/review spreads,
  optional per-issue fields, usage mapped to input/output with `cost`
  dropped), the run-state transitions, completion / UserDismissedError
  cancellation / error handling, and the lock release exactly once in the
  `finally`. The workflow call is an injected callback invoked INSIDE the run
  body, so a synchronous throw from deps construction (agents/verifier/git)
  is handled like a rejection — no leaked lock. Detached execution unchanged:
  the extension does `void launchRun(...)` so `/flow status|log|stop` keep
  answering, and the started/resumed notifies stay at the call sites. Resume
  passes `{ resumedPhase }` so `workflow.resumed` is emitted synchronously —
  before the workflow is invoked — as the first new event in every sink; the
  reconstructed ORIGINAL baseline (incl. the U3 `repoStateDigest`) still
  flows through the extension's callback into `{ ...state, baseline }`,
  untouched. To keep the launcher free of `src/pi/`, `UserDismissedError`
  moved from `src/pi/human-input.ts` to `src/ports.ts` (identical class and
  message; the HumanInput port contract owns its error — the extension was
  the only other importer). `renderOutcome`/`renderUsage`/`fmtTokens` moved
  verbatim into the launcher; `/flow status` and `/flow log` import the last
  two back. The extension shrank ~140 lines and keeps wiring only.
  TDD: 9 tests in `tests/run-launcher.test.ts`, red-first — completed,
  needs_human, cancelled outcome, UserDismissedError, thrown workflow error,
  synchronous wiring throw, throwing Pi history (run log continues), full
  outcome payload, resume ordering of `workflow.resumed`; every path asserts
  events, final status, lock released exactly once, and lock still held
  while the workflow is pending. Mutation checks, each killed by exactly its
  covering tests: history guard removed → the history-throws test; run-log
  append dropped → all nine; release removed → all nine; extra release on
  success → exactly the six success-path tests; cancelled/failed
  classification inverted → exactly the three error-path tests;
  `workflow.resumed` emitted after the await → exactly the resume test; bell
  dropped → exactly the two bell-asserting tests; phase tracking dropped →
  exactly the two phase-asserting tests; optional issue fields dropped →
  exactly the payload test. Review round: the `workflow.resumed` emission
  moved inside the run body's try/finally — a sink callback throwing on
  that first event (broken run-log dep) can no longer bypass the lock
  release, and since the body runs synchronously up to the first await the
  marker is still emitted before the workflow is invoked and before
  `launchRun` returns (ordering re-pinned by the same resume test; the
  placement mutation re-run on the final code still kills exactly that
  test); the header's "never rejects" claim was corrected (until U8 a
  throwing UI effect can still reject the promise — F6, as before); one new
  test pins the throwing-log-callback path (lock released exactly once,
  promise rejects loudly with the dep's error, buffer keeps both events for
  /flow log's fallback). `npm test` 375/375, `npm run typecheck` clean,
  `git diff --check` clean.
  Limits: the extension file stays typecheck-only (no live Pi session was
  driven, same as before); a throwing UI effect (notify/bell/status) in the
  detached runner can still emit `workflow.failed` after `workflow.outcome`
  and escape as an unhandled rejection — that is F6, deliberately left for
  U8, which now has exactly one place to fix (as does U7's
  lock-before-side-effects reordering at the `/feature` call site);
  `renderUsage` still runs unconditionally inside `renderOutcome`, so an
  outcome usage entry with an undefined value would crash rendering exactly
  as before — behavior preserved, not fixed (production never produces one).
  F13 untouched; U1–U5 code paths untouched; `extra/skills/ga4-analytics/`
  untouched.

- 2026-10-17 main-review-hardening U4 (F3, baseline uncommitted on `main`):
  pi-brain runtime files are excluded from reviewer snapshots.
  `snapshotTree` (`src/shell.ts`) passes exclude pathspecs to the
  scratch-index `git add -A -- .`: `:(exclude).pi/pi-brain.lock*` (the glob
  covers the lock, its takeover marker and its staging file) and
  `:(exclude).pi/pi-brain/` (the run-log tree). Everything else is
  unchanged: same scratch index via GIT_INDEX_FILE (real index, working tree
  and .gitignore untouched), same `-- .` semantics, one snapshot procedure
  for the baseline, every later diff and the submodule dirtiness check — so
  runtime files inside a submodule no longer mark it dirty either (intended:
  same F3 rationale). Tracked runtime files (committed by mistake) cancel out
  by construction: `read-tree` seeds HEAD's version and the excluded paths
  are never re-staged, so modifications, deletions and new siblings never
  differ between the two snapshots.
  TDD: five exclusion tests red-first on the exact F3 reproduction
  (`tests/git.test.ts`, real temp repos, no .gitignore): lock + marker +
  staging + run log created after baseline → empty files and patch; runtime
  present at the baseline (the real ordering — the lock is acquired before
  the workflow starts) and removed before the diff → still empty (probes the
  baseline side: a baseline-only exclusion would surface as a deletion);
  rewritten after an earlier empty diff → still empty; applicative change +
  a NEW untracked `.pi/pi-brain.json` next to runtime noise → exactly those
  paths and no run-log content in the patch; tracked-in-HEAD runtime
  modified/appended/deleted → empty (the seed does not reintroduce them).
  The committed-`.pi/pi-brain.json`-edit test passed BEFORE the change and
  still passes (conservation, not regression).
  Mutation checks: lock exclusion dropped → exactly the five lock tests; dir
  exclusion dropped → exactly the four run-log tests; exact-name lock
  exclusion (no `*`) → exactly the four tests whose lock siblings change
  between the snapshots; widening the exclusion to all of `.pi/` → exactly
  the two json-visibility tests.
  `npm test` 365/365, `npm run typecheck` clean, `git diff --check` clean.
  Residual limits: the exclusion is path-based — anything under
  `.pi/pi-brain/` or matching `.pi/pi-brain.lock*` is hidden from the review
  diff, not just pi-brain's own files; the U1 write guard closes the
  write/edit channel into `.pi/`, but `bash` (available to writable roles
  without an explicit tools allowlist) can still write there, so the side
  channel is narrowed, not closed; U11 (.gitignore entries via `setup.sh`)
  is still pending as defence in depth for `git status` and ordinary
  commits. Documented in `docs/pi-brain/README.md`. U1–U3 and U5–U16
  untouched (U3's digest shares `src/shell.ts` but is unmodified); F13
  policy untouched.

- 2026-10-16 main-review-hardening U3 (F1, F2, baseline uncommitted on `main`):
  repository-state invariant. New `repoStateDigest` in `src/shell.ts`
  (git/fs only) digests HEAD as commit id AND symbolic name (a pure branch
  switch moves the symref without touching a ref object), all refs via
  `for-each-ref` (object id, type, symref target, name, deterministic order),
  the git config file, a per-worktree `config.worktree`, the recursive
  listing of `hooks/` — name, permission bits and content of every entry,
  symlinks followed with a symlink-loop guard — and the `core.hooksPath`
  location when configured (any scope). Git dirs are resolved through
  `rev-parse --git-dir` / `--git-common-dir`, never by joining `.git` — in a
  linked worktree `.git` is a file and config/hooks live in the main repo's
  common dir, which the digest therefore watches from every worktree. Read
  failures propagate: unreadable is never unchanged, and "read as absent" is
  kept strictly apart from "could not read" — a missing config or hook is a
  state (`<missing>`), every other error (unreadable file, wrong entry type, a
  configured `core.hooksPath` that exists but cannot be enumerated, or any
  path behind an inaccessible parent directory — `existsSync` would read that
  as absent) throws; both `digestDir` and `stateFileForDigest` gate on
  `statSync(…, {throwIfNoEntry: false})`, which swallows only ENOENT and lets
  EACCES through. `git config --get` treats exit 1 (absent key) as the normal
  case and any other failure as a real error.
  The workflow owns the decision (`stopForRepoStateChange` in
  `src/workflows/feature.ts`): the digest is taken once at baseline (failure
  → `needs_human` before anything starts, nothing persisted — no partial run
  to resume), persisted on `workflow.started.repoStateDigest`, and
  re-checked after every developer pass (develop, every fix round, and the
  resume re-entry, where it also covers the interruption window) and after
  every verify — placed before the retry accounting so a mutated repo never
  spends budget. Any difference or read failure ends the run `needs_human`
  BEFORE the reviewer, with a reason naming `git reflog`/`git diff`.
  Resume compares against the ORIGINAL persisted digest
  (`extensions/pi-brain.ts` replays it into the resume baseline — the only
  extension change); logs predating the digest resume with the check
  inactive and exactly one notice saying so: compat, never claimed
  protection. Ordinary working-tree edits never change the digest — U3
  freezes git metadata, not the developer's output.
  TDD: 29 new tests red-first — `tests/git.test.ts` 20 (unchanged repo
  stable; new commit/branch/tag; branch switch without a new commit; config
  change; hook create/edit/remove restoring the baseline; a hook made
  executable with identical content is a change; working-tree edits NOT
  flagged; custom `core.hooksPath`; a nonexistent configured `core.hooksPath`
  is a stable state and populating it later is detected; linked worktree with
  shared refs/config/hooks watched from the worktree plus its own commit, and
  a plain worktree edit not flagged; unborn repo; non-repo fails closed;
  fails closed on an unreadable hook file, an unreadable `.git/config`, a
  configured `core.hooksPath` that exists but cannot be listed, and one
  pointing at a file; fails closed on a `core.hooksPath` and a
  `config.worktree` behind an inaccessible parent directory),
  `tests/feature-workflow.test.ts` 9 (digest persisted; change after develop
  → needs_human with zero verify commands, no verify phase, no reviewer;
  change during verify → needs_human, reviewer not called; change in a fix
  round caught against the original digest; resume blocked on a change made
  during the interruption with no fresh baseline taken; matching-digest
  resume completes; legacy log without the digest runs unprotected with
  exactly one notice; unreadable at re-check and at baseline both fail
  closed). Mutation checks: each disabled guard (post-develop,
  post-verify, resume-original-digest) failed exactly its blocking tests;
  each dropped digest section (refs, hooks, config, HEAD) failed exactly its
  own tests — a new commit is caught by HEAD+refs together, which is why
  only the branch/tag tests fail on the refs mutation; the service
  swallowing read errors failed exactly the fail-closed test (first attempt
  mutated the inner function and was NOT killed — the throw came from the
  service's own `rev-parse`; the mutation was moved to the right layer).
  Review round 2 (two P1s) — dropping the permission bits failed exactly the
  chmod-activation regression; turning an unreadable hook file back into a
  marker failed exactly the unreadable-hook regression; swallowing
  `digestDir` errors for `core.hooksPath` failed exactly the two hooksPath
  fail-closed regressions.
  Review round 3 (P2) — restoring `existsSync` in `digestDir` failed exactly
  the `core.hooksPath` behind-an-inaccessible-parent regression; restoring it
  in `stateFileForDigest` failed exactly the `config.worktree` one.
  `npm test` 359/359, `npm run typecheck` clean, `git diff --check` clean.
  Residual limits: git metadata only — swapped working-tree files (a
  test-runner binary, anything a script body executes outside the frozen
  manifests) are invisible; pseudo-refs (`ORIG_HEAD`, `MERGE_HEAD`,
  `FETCH_HEAD`) are not hashed (anything that matters moves HEAD or a real
  ref); detection is after the fact (a push already happened by the time it
  is caught); a legitimate human commit mid-run also stops the run
  (intended — the diff baseline is stale from that moment); the digest
  re-read is not atomic with the developer's exit (a change landing between
  check and verify is caught by the post-verify check, and vice versa); a
  non-regular entry in a hooks dir (FIFO, socket, device node) is digested by
  type and mode only, never opened (a FIFO read would block); the
  `.git/config` fail-closed test passes through git's own refusal of an
  unreadable config rather than discriminating `stateFileForDigest`, which is
  instead discriminated by the `config.worktree` behind-an-inaccessible-parent
  regression.
  Documented in `docs/pi-brain/README.md`. U1/U2 unaffected; U4–U16
  untouched; F13 policy untouched.

- 2026-10-15 main-review-hardening U2 (F1, baseline uncommitted on `main`):
  frozen verification inputs. `freezeVerifyInputs` (`src/verify.ts`) resolves
  the verify commands once at run start and snapshots the involved manifest
  script sections: stack-resolved commands (our own, plain single commands)
  freeze the ecosystem's ROOT manifest — `package.json` for node primaries,
  `composer.json` for Laravel — while explicit `config.verify` freezes the
  whole reachable perimeter: both root manifests plus every nested
  `package.json`/`composer.json` in the tree (see the review rounds below).
  The perimeter (`"root"` | `"tree"`) is persisted on the freeze and
  re-resolved before every verify, so a manifest CREATED mid-run is caught
  too.
  Sections are frozen wholesale — npm's `pre/post` hooks and script-to-script
  calls make key-scoped freezing trivially bypassable — and persisted on
  `workflow.started` as `{commands, scripts, scriptsDigest}` (optional field,
  backward compatible). Before every verify (start, fix rounds, resume)
  `changedScriptKeys` diffs the live sections against the freeze; any
  changed/added/removed key ends the run `needs_human` before any command
  executes, the reason naming the keys (`frontend/package.json scripts.test`).
  Script bodies compare by canonical content because composer bodies can be
  arrays (two structurally identical arrays from separate JSON parses are
  different references — caught red-first). Capture and replay share
  `isPlainRecord`, so a non-object `scripts` section captures as `{}` and the
  program can never emit a freeze its own replay would reject. Resume replays
  the persisted freeze: `resume.ts` validates it (structure plus digest
  binding; absent → legacy path, present-but-corrupt → resume refused), and
  the workflow prefers it over the freshly loaded config, so an edited
  `.pi/pi-brain.json` cannot rewrite what runs. Logs predating the freeze
  resume with the old per-verify resolution plus a one-line notice. The only
  extension change is the `corrupt_verify_freeze` refusal message (replay
  state already flows through); documented in `docs/pi-brain/README.md`.
  TDD: 34 new tests across four rounds (unit, workflow, replay), all
  red-first; disabling the changed-script gate failed exactly the blocking
  workflow tests, disabling the nested scan failed exactly the nested
  regressions, and disabling the perimeter re-scan failed exactly the
  created-after-freeze tests (mutation checks). Review round 2 (user-reproduced, red-first)
  fixed: (P1) compound commands bypassed the freeze — `true && npm run test`
  on a Laravel run froze only composer.json (first-token detection saw
  `true`), so a hijacked `scripts.test` was executed; (P2) `verify: null`
  crashed the resume replay (`typeof null === "object"` passed the old
  guard); (standards) the replay validation was incomplete — arrays passed as
  the `scripts` container (silently voiding the guard) and any string passed
  as `scriptsDigest`; the freeze is now validated structurally AND the digest
  must bind to its scripts, with absent ≠ corrupt: absent keeps the legacy
  compat path with its one-line notice, present-but-corrupt REFUSES the
  resume (`corrupt_verify_freeze`, wired in the extension's refusalMessage)
  instead of silently disabling protection. Round 3 (user-reproduced,
  red-first) fixed: (P1) freezing only the two root manifests still missed
  subfolder manifests — `cd frontend && npm run test` froze root only, so
  editing `frontend/package.json scripts.test` ran the hijacked script;
  explicit `config.verify` now freezes the whole reachable perimeter (root +
  every nested manifest), the nested scan excludes `node_modules`, `vendor`,
  `.git`, `.pi`, `bower_components` and symlinked dirs, and above 200
  manifests `freezeVerifyInputs` returns `{ok:false, reason}` so the workflow
  fails closed `needs_human` rather than verifying an incompletely frozen
  perimeter; (standards) capture/replay were misaligned — `manifestScripts`
  accepted an array `scripts` section that replay rejects, so the two now
  share `isPlainRecord`; and the test count in this entry was wrong. Round 4
  (user-reproduced, red-first) fixed: (P1) a nested manifest CREATED after the
  freeze still escaped — `changedScriptKeys` only iterated the baseline paths,
  so an author could add `frontend/package.json` mid-run and verify would run
  its scripts; the scan perimeter (`"root"` | `"tree"`) is now persisted on
  the freeze and re-resolved before every verify (start, rounds, resume), so a
  newly created manifest (root or nested) is a detected change; replay
  validates the perimeter (unknown value → refuse) and normalizes a missing
  one to root-only for backward compat. Docs corrected too: U3 does not cover
  test-runner binary swaps (it snapshots git state, not working-tree files).
  `npm test` 330/330, `npm run typecheck` clean, `git diff --check` clean.
  Residual limits: what a script BODY runs (other files, `node_modules/.bin`,
  `vendor/bin`) is not resolved or frozen and U3 will not close that either;
  the nested scan skips dependency/VCS and symlinked dirs (a script run from
  inside one is outside the perimeter); a legacy freeze without the perimeter
  field normalizes to root-only, so those resumed runs keep the round-3
  behavior (no tree re-scan); explicit config over-freezes (whole perimeter,
  e.g. package.json on Laravel even when unused) and above 200 manifests
  refuses instead of truncating.
  U1 is unaffected; U3–U16 untouched; F13 policy untouched.

- 2026-10-14 main-review-hardening U1 (F2, baseline uncommitted on `main`):
  developer write-path guard. New Pi-free `src/write-guard.ts` —
  `checkWritablePath(path, repoRoot)` resolves the target through its nearest
  existing ancestor and allows it only if, after symlink resolution, it is
  inside the repo root with no `.git`/`.pi` segment in its repo-relative
  path; a dangling symlink is followed link by link (`lstat` + `readlink`,
  distinguished from a never-created file) so its real destination is judged,
  and a `".."` inside a symlink target is resolved by the kernel component by
  component (never collapsed lexically);
  unresolvable paths are refused (fail closed). `guardedWriteTools()` in
  `src/pi/pi-agent-runner.ts` builds Pi's write/edit definitions with guarded
  `operations` and `run()` registers them as custom tools for writable roles —
  custom tools override same-named built-ins, so nothing else changes; only
  tools already present in an explicit allowlist get a replacement (read-only
  roles and the planner's `read/grep/find/ls` list get none). Refusals throw
  before any filesystem access; Pi's agent loop converts the throw into a
  tool error whose message names the refused path and its resolution.
  TDD + review round: the first implementation was reported back by
  independent reviews with three P1s — (1) the planner gained write/edit
  because `resolveTools` appended custom tool names to its allowlist, (2)
  `realpath`'s ENOENT on a dangling symlink was read as "new file", letting a
  write land outside the repo or under `.git` (reproduced, not TOCTOU), and
  (3) a relative symlink target containing `".."` was collapsed lexically by
  `join()` before resolution, so `dangling -> link-out/../victim.txt`
  (link-out outside) was judged as `repo/victim.txt` while the write landed
  outside — targets now keep their raw component sequence and the kernel
  resolves them (the absolute-target variant was already handled and is
  pinned by tests). Each defect has regression tests at policy level and
  through the real write tool (nothing created outside the repo or under
  `.git`); a planner-shaped session with the exact `run()` wiring asserts no
  write/edit is active. `resolveTools` is now exported for that wiring test.
  Final: `tests/write-guard.test.ts` 27 tests, all five decision branches
  mutation-checked (each mutation fails exactly its tests — containment,
  protected segments, dangling follow, lexical-`..` collapse, allowlist
  filter), `npm test` 296/296, `npm run typecheck` clean, `git diff --check`
  clean.
  Residual limits: TOCTOU symlink swaps between check and write are not
  covered (single-agent runs under the repo lock); the guard covers Pi's
  write/edit tools only — `bash` remains available to writable roles without
  an explicit `tools` allowlist (unchanged, pre-existing; the developer role
  has one); no live model session was driven — the session tests use a fake
  model and a hermetic agent dir. U2–U4, U6–U16 untouched; F13 policy
  untouched.

- 2026-10-12 code-review follow-ups T5+T6 (F4, baseline `1239a20`, uncommitted):
  verification commands are now bounded — `verifyTimeoutMs` (default 600000,
  bounds 1000–3600000, missing key = silent legacy default, invalid value =
  fallback + bounds-naming warning) in `src/config.ts`; `ShellVerifyRunner`
  runs each command detached (own process group; plain `spawn` is required
  because the exec family drops `detached` on current Node) and on timeout or
  `/flow stop` SIGTERMs the group, escalates to SIGKILL after a 5s grace, and
  destroys its pipe ends. Results distinguish timeout (exit 124, `timedOut`),
  cancellation (exit 143, `cancelled`) and ordinary failures; the workflow
  reports timeouts to the developer as timeout findings and returns
  `cancelled` when the abort lands mid-verify (retry budget untouched);
  runaway output >16MiB is truncated with the tree killed. Lock release after
  timeout/cancellation is by construction (workflow returns an outcome,
  extension `finally` releases — Pi surface, not unit-testable; precondition
  tested).   TDD: hanging command blocked the full 30s pre-fix and cancellation
  leaked the grandchild; 16 new tests (3 config, 11 runner incl. tree kill,
  SIGKILL escalation, off-pipe grandchild, at-return tree-death guarantee,
  cancel-vs-timeout race, overflow; 2 workflow routing). Third review round:
  settle() returns the cleanup outcome so the result message (and the README)
  says "could not be confirmed dead — check for leftover processes" in the
  unkillable D-state edge case instead of claiming a clean termination
  (branch not automated-testable, documented limit); groupGone() counts the
  group absent only on ESRCH.
  Two-axis review fixed one real defect (escalation timer must stay armed
  after the shell closes — regression test verified by mutation) and cleaned
  the finish branches. Second review round (user-reproduced, red-first): the
  result could resolve at shell close while children were still being killed
  (266ms return with a live child — now `settle()` waits for the group to be
  empty before resolving, asserted at return time), and a late timeout could
  overwrite an ongoing cancellation (single idempotent termination cause,
  first wins; abort deactivates the timeout timer).   test-review trial F (separate context, review findings
  withheld): no must-fix, two minor accepted (bounds off-by-one coverage,
  overflow-kill detection via trailing `sleep 300`); two user-reproduced
  races escaped both that trial and the two-axis review and are recorded in
  the F run doc. Platform limit: group
  kill is POSIX-only; elsewhere falls back to killing the shell (pre-existing
  guarantee), documented in `docs/pi-brain/README.md`. `npm test` 269/269,
  typecheck and `git diff --check` clean, no stray processes. T7–T9/S1
  untouched.

- 2026-10-11 code-review follow-ups T4 (F3, baseline `1239a20`, uncommitted):
  a manual `stack` override no longer discards detected metadata —
  `resolveStack` always detects, then applies the configured primary via the
  pure `applyStackOverride` in `src/stack.ts`. Languages, package managers and
  secondary frameworks are repo facts and are always retained (pnpm/yarn/bun
  selection survives an override; a `laravel` override keeps pest/pint/phpstan
  checks). Capability decision: same-ecosystem override keeps everything;
  cross-ecosystem override keeps only the configured ecosystem's capabilities
  (PHP = laravel only), and the detected winner framework token is dropped when
  the primary changes. Explicit `config.verify` remains authoritative (pinned).
  TDD: 4 regressions failed pre-fix (Laravel checks, pnpm runner,
  cross-ecosystem both ways), unit + workflow level; `npm test` 253/253,
  typecheck and `git diff --check` clean. Two-axis review round fixed a stale
  `config.ts` doc comment ("detection is skipped"), added an `isPhp` predicate
  and deduplicated the test fixture. Known limits: the low-confidence
  human-choice path still swaps primary without the ecosystem filter
  (pre-existing, out of F3 scope); the ecosystem/capability taxonomy is a
  module-level set, so a future PHP capability must be added to it explicitly.
  T5–T9/S1 untouched.

- 2026-10-11 Adapted selected Alfonso Graziano skill ideas: evidence-based
  operational readiness audit; local offline HTML kit with browser checker;
  preventive composition and optional English lexical before/after scans in
  the existing humanizer. Preserved MIT attribution and pinned origin metadata;
  research optionally routes requested visual artifacts to html-report. Both
  canonical additions are operational-only in the Pi role router. Validation:
  three skill validators passed; focused helper/profile/routing checks 40/40;
  typecheck clean; HTML template verified in Chrome desktop/mobile light/dark
  and print, with no external asset requests, errors or overflow. Final full
  suite passed 246/246, including routing and scanner regression additions.
- 2026-10-11 Initial test-review pilot: created a read-only explicit extra outside
  profiles, routing and installers; evaluated historical implementation, skill
  and documentation diffs in separate contexts. A concrete unlink coverage gap
  was verified by mutation: original suite passed 24/24 despite removed ownership
  guards; two focused probes failed on mutated code and passed on restored code
  (26/26). Narrowed the skill's handling of pending manual eval evidence. No
  shipping implementation or automatic review phase changed.
- 2026-10-08 Remaining consumer alignment: refreshed `ardizio-design` with
  `astro`, `itinerary-ai`, `linkedin-analytics`, and `ga-analytics` with
  `laravel-analytics`, `careguru/carefinder-backend` and the Laravel boilerplate
  with `laravel`, and the Next.js boilerplate with `nextjs`. Added project-owned
  shared-workflow guidance and missing local trackers. Boost-generated blocks
  were verified byte-identical; pointers outside those blocks survive Boost
  regeneration. Ardizio's four local skill directories were preserved and
  verified against canonical SKILL.md files; its two old flat skills were
  archived outside discovery. Profile coverage and destinations are valid,
  zero broken links, all seven project diff checks clean. Existing backend
  changes were preserved; no commits or application-code edits made.
- 2026-10-08 Consumer-project alignment: refreshed `andreafalcon.dev` and
  `appuntidalgiappone` with `astro`, `craftcv.online` with `nextjs`, and
  `careguru-brain` with `nodejs-ai-backend`. Replaced seven obsolete `.md`
  symlinks, restored exact current manifest membership, added local Markdown
  issue-tracker configuration, and corrected stale workflow/skill references
  in each project's agent instructions while retaining project conventions.
  Read-only verification confirmed 34/34/42/33 skills respectively, valid
  canonical destinations, no broken links, tracker presence and clean
  per-project `git diff --check`. Changes remain uncommitted; other consumers
  were not modified.
- 2026-10-08 code-review follow-ups T1–T3 (baseline `e5f8e56`): `setup.sh` and
  `unlink.sh` are now ownership-aware — only symlinks whose resolved
  destination is inside this repo (canonical store, `.agents/workflows`,
  `.agents`, `.opencode`) are removed/replaced; relative destinations are
  resolved against the link's directory, name alone proves nothing. Profile
  manifests (incl. `@include` cycles and invalid entries) are validated before
  any mutation, so invalid profiles leave installations intact. Real
  files/dirs occupying a skill path are preserved with a clear skip diagnostic
  (no nested links) and only correctly linked skills are counted. Curated↔full
  profile switches convert in both directions, but only when the directory
  holds exclusively agent-brains-owned links — otherwise the switch fails and
  leaves the previous installation intact. Regression
  coverage: `tests/setup-unlink.test.ts` (17 integration tests in a temp
  fixture, nothing outside the temp workspace is touched). Known limitation:
  after moving/renaming this repo, old links no longer resolve under the new
  copy and unlink conservatively preserves them (reported, manual removal).
  `npm test` 232/232, `npm run typecheck` clean, `bash -n` clean,
  `git diff --check` clean; real-profile smoke test passed for all profiles.
- 2026-10-08 T1–T3 review round (same baseline): fixed three defects in the
  first implementation. (1) `full` no longer traverses a symlinked `.agents`
  during cleanup — a repeated full setup could delete symlinks inside the
  canonical store or inside a foreign destination; (2) curated→full now
  validates convertibility BEFORE removing anything: a directory holding
  non-managed content fails with exit 1 and the curated installation is left
  intact (previously managed links were removed, the whole-dir link skipped,
  and the command still succeeded); (3) removing a `skills → canonical store`
  symlink no longer depends on `.agents/workflows` being present. Three new
  regression tests (+ the corrected blocked-conversion test) failed on the
  old code and pass now: 20/20 integration, `npm test` 235/235.
- 2026-10-08 T1–T3 second review round: fixed two more P2s. (1) hidden
  symlinks (`.alias → store`) were validated as removable by the curated→full
  convertibility check but skipped by cleanup (`*` vs `* .[!.]* ..?*` globs),
  leaving a half-destroyed installation with exit 0 — cleanup, curated
  refresh and unlink now scan hidden entries with the same globs as
  validation; (2) a real FILE at `.agents/skills` passed the convertibility
  check vacuously, so cleanup removed the managed workflows link and skipped
  `full` with success — now the check rejects it, and curated setup's
  validation fails early (before any mutation) with a clear message for a
  real file at `.agents` or `.agents/skills`. Both defects reproduced on the
  pre-fix code (exit 0 + workflows link lost / .opencode linked before the
  error); 4 new regression tests: integration 24/24, `npm test` 239/239.
- 2026-09-26 W1 promoted: moved `solution-capture` into the canonical skill
  store and every profile while preserving explicit-only invocation; added the
  solution template to idempotent scaffold; added targeted, no-preload retrieval
  to `feature` and `diagnosing-bugs`; extended `lessons-gardener` to audit broken
  references, duplicates and 180-day review candidates; removed the pilot copy
  from `extra/`. The 180-day interval is an explicit maintenance policy, not a
  trial-validated claim.
- 2026-09-26 W1.6 evidence persisted as a public-safe run sheet containing the
  fixture revision, acceptance outcomes, human corrections, artifact counts,
  and the untested 180-day maintenance threshold. Machine-specific
  configuration, session identifiers, and complete transcripts remain local.
  W1.6 met its behavioral acceptance criteria and was subsequently promoted.
- 2026-09-26 W1.6 fresh-session retrieval passed behaviorally in
  `ga-analytics`: each symptom started at `lessons.md`, used targeted searches,
  read only its pertinent solution (never the other document), matched the
  diagnosis to current code and selected the exact focused regression test.
  The retrieval session was read-only; the solution directory still contains
  exactly two files and the index exactly two references.
- 2026-09-24 W1.6 capture session completed in `ga-analytics`: captured the
  live weekly-digest claim/queue failure window and the authorized retrospective
  SQLite date-cast upsert defect (`1dfc83e`), each with one solution document
  and one `lessons.md` index line. The embedded English-only documentation
  correction took the fast path (0/5 conditions, no artifact). Independent
  checks confirmed two solution files, two index references, English-only
  content and clean Markdown whitespace. Retrieval and persisted session
  evidence remain pending.
- 2026-09-24 Prepared W1.6 in `ga-analytics`: verified a clean `main`, existing
  `.ai` memory and regression evidence; installed an ignored local symlink to
  the `solution-capture` prototype without changing project-tracked files. The
  pilot itself has not started.
- 2026-09-24 W1.1 approved and W1.2 completed: added the explicit-only
  `extra/skills/solution-capture/` prototype with a separate write-approval gate
  and structural tests that keep it outside profiles, setup, routing, templates
  and scaffold. W1.6 has not started.
- 2026-09-22 `frontend-design` and `shadcn` updated through named `npx skills@latest update -p -y` runs on `main`; their lockfile hashes changed. `frontend-design` expands typography, layout, motion restraint, and generic-design guidance. `shadcn` updates Base UI toast guidance, chat scroll restoration, and the new upstream `cn` package import. No `.ai/` path remap applies to these sources. No broken skill references or local path-remap references found in their files. `npm test` passed 212/212, `npm run typecheck` passed, and `git diff --check` was clean.
- 2026-09-22 Vercel skills follow-up (commit `51e4e65`): `vercel-composition-patterns` and `vercel-react-best-practices` already byte-identical to upstream `vercel-labs/agent-skills` (verified via shallow-clone diff; `npx skills update` on composition-patterns was a content no-op) — no change applied. `vercel-react-view-transitions` updated to upstream latest (post PR #328: Suspense crossfade readiness, Layout Displacement Morph, Chromium 125+ correction, `router.back()` carries-no-types semantics, new `references/troubleshooting.md`, markdown links to references; ~921 insertions across SKILL.md/AGENTS.md/README/references; lockfile hash c8952fc9→2033ef2). No local patches existed in the three skills (no `.ai/` remap needed — Vercel-sourced); remap script run: 0 files. Health checks: no broken skill deps, tracker config present, profile integrity bidirectional clean, setup.sh smoke test PASS for all 10 profiles; npm test 212/212, typecheck clean. `npx skills update -p` also creates `.pi/skills/<name>` symlinks (Pi discovery root per docs/pi-brain/SPEC.md §9.1) → `.pi/skills/` added to .gitignore as CLI plumbing.
- 2026-09-22 Merged `main` → `pi-brain` (merge commit on `pi-brain`, then fast-forwarded `main`): kept pi-brain's `<name>/SKILL.md` directory convention (no legacy flat `designer.md`/`product-thinking.md` restored); combined `profiles/common.list` (pi-brain normalized names + main's 5 new skills: codebase-design, domain-modeling, prototype, resolving-merge-conflicts, writing-for-agents); `socialite-development` once in `laravel.list`; kept main's `update-skills`, Humanizer updates, `.ai` tracker conventions, scaffold and path-remap; preserved the local-ownership invariant (`grill-with-docs` and `research` stay `management: local`, absent from `skills-lock.json`, metadata + LICENSE intact, ownership tests active); aligned `extra/skills/update-skills/SKILL.md` to the ownership contract (lockfile-only scope, named updates preferred, adopted/derived skills never updated).
- 2026-08-29 humanizer 2.11.0 (no-ai-slop merge), mattpocock skills to 1.2.3 + 4 new skills, `.ai/` path remap, tracker/scaffold conventions, profiles fixed (bidirectional check), `update-skills` maintenance skill in `extra/`.
