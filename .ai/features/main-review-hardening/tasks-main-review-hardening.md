# Tasks: main review hardening

PRD: `.ai/features/main-review-hardening/prd-main-review-hardening.md`.
Finding ids (F1–F14) refer to the PRD table. Each milestone is its own cycle.

## Integration status (2026-10-12)

Imported from `6c16a01` onto `main` after `07d74d7`. U5 is already covered
by code-review-follow-ups T5–T6; U1–U4 and U6 are implemented (U6 on
2026-10-17, uncommitted); remaining tasks are pending. Use the
existing `verifyTimeoutMs` interface rather than introducing a seconds-based
setting. Documentation integration does not authorize implementation.

## File Map

| File | Responsibility in this feature |
|---|---|
| `src/write-guard.ts` (new) | Pure path policy: allowed iff inside the repo root and not under `.git/` or `.pi/`, after symlink resolution |
| `src/pi/pi-agent-runner.ts` | Replace built-in `write`/`edit` for writable roles with guarded definitions |
| `src/verify.ts` | Script-dependency digest for resolved commands |
| `src/workflows/feature.ts` | Resolve verify once, script-change and repo-state checks, slug fallback |
| `src/workflows/resume.ts` | Replay persisted verify commands and the state digest |
| `src/ports.ts` | Optional `verify` / `scriptsDigest` / `repoStateDigest` fields; `GitService.repoState()` |
| `src/shell.ts` | Snapshot pathspec exclusion, repo-state digest, process-group timeout |
| `src/config.ts` | Existing `verifyTimeoutMs`, validated (U5 complete) |
| `src/review.ts` | F13 policy (after the decision) |
| `src/run-launcher.ts` (new) | Event sink, outcome emission and detached runner shared by `/feature` and resume |
| `extensions/pi-brain.ts` | Wiring only: lock first, launcher, safe UI calls |
| `.opencode/agents/solution-capture.md` (new), `.agents/workflows/solution-capture.md` (new symlink) | Workflow parity |
| `setup.sh`, `scaffold.sh` | Pi runtime ignore entries, opencode-only warning, Claude Code links |
| `README.md`, `docs/pi-brain/README.md`, `docs/plans/pi-plugin-adoption-roadmap.md` | Docs, stale statements, F14 measurement |
| `tests/*.test.ts` | One test file per behaviour below |

## M1 — pi-brain harness

- [x] **U1 — Developer write-path guard** (F2). `src/write-guard.ts`,
  `src/pi/pi-agent-runner.ts`, `tests/write-guard.test.ts`.
  Completed 2026-10-14 (uncommitted), after a review round that fixed three
  P1s.
  `checkWritablePath` is the Pi-free policy: resolve the target through its
  nearest existing ancestor (so not-yet-created files and symlinked ancestors
  are caught; a dangling symlink is followed link by link via `lstat` +
  `readlink` — not mistaken for a new file — so its true destination is
  judged; a `".."` inside a symlink target keeps its raw component sequence
  and is resolved by the kernel, never collapsed lexically — otherwise
  `dangling -> link-out/../victim.txt` would be judged as `repo/victim.txt`
  while the write lands outside), then allow only paths inside the repo root
  whose repo-relative segments contain no `.git` or `.pi`; unresolvable paths
  fail closed.
  `guardedWriteTools()` in `pi-agent-runner.ts` feeds Pi's
  `createWrite/EditToolDefinition` guarded `operations` (built-ins replaced by
  name via `customTools`, read-only roles get none) and only replaces
  write-capable tools already present in the role's explicit allowlist — the
  planner (`read/grep/find/ls`, no `readOnly`) gains nothing (review P1).
  Refusals throw `WriteGuardError`, which Pi's agent loop renders as a tool
  error naming the refused path, before any filesystem effect.
  Tests: 27 in `tests/write-guard.test.ts` — the nine required scenarios
  (absolute outside, `../` escape, `.git/hooks/pre-commit`,
  `.pi/pi-brain.json`, symlink out, symlinked ancestor into `.git`, nested
  allowed, new-file creation, write/edit refusals with no filesystem effect),
  `.gitignore`-stays-editable, in-repo symlink allowed, read-only exclusion,
  the two dangling-symlink regressions and the two `".."`-in-target
  regressions (relative and absolute variants, each at policy level and
  through the real write tool: no file created outside the repo or under
  `.git`), and two session-level tests with a real offline
  `createAgentSession` — the developer session resolves `write` to the
  guarded definition, the planner-shaped session (same wiring as `run()` via
  the exported `resolveTools`) gets no write/edit at all.
  Mutation-checked all five decision branches (containment, protected
  segments, dangling-symlink follow, lexical-`..` collapse, allowlist filter):
  each mutation fails exactly its own tests. `npm test` 296/296, typecheck,
  `git diff --check` clean.

- [x] **U2 — Freeze verify inputs** (F1). `src/verify.ts`, `src/ports.ts`,
  `src/workflows/feature.ts`, `src/workflows/resume.ts`, `extensions/pi-brain.ts`,
  `tests/feature-workflow.test.ts`, `tests/resume.test.ts`.
  Completed 2026-10-15 (uncommitted), after three review rounds (P1 compound
  command bypass + P2 `verify: null` crash + validation in round 2; P1 nested
  manifest bypass + capture/replay alignment in round 3; P1 manifest created
  mid-run escaping the diff + perimeter persistence in round 4). TDD
  throughout (34 tests red-first across the rounds; the changed-script gate,
  the nested scan and the perimeter re-scan each mutation-killed exactly their
  blocking tests).
  `freezeVerifyInputs` in `src/verify.ts` resolves the commands once and
  snapshots the involved manifest script sections. Sections are frozen
  wholesale, not per key: `pre/post` hooks and script-to-script calls make
  key-scoped freezing trivially bypassable. Manifest involvement:
  stack-resolved commands (plain, single, our own shape) freeze the
  ecosystem's ROOT manifest (`package.json` for node primaries — npm/pnpm/
  yarn/bun all run package.json scripts via `<pm> run`; `composer.json` for
  Laravel); explicit `config.verify` freezes the whole reachable perimeter —
  both root manifests PLUS every nested `package.json`/`composer.json` in the
  tree. The perimeter (`"root"` | `"tree"`) is persisted on the freeze and
  re-resolved by `changedScriptKeys` before EVERY verify (start, rounds,
  resume), so a manifest CREATED mid-run — nested `frontend/package.json` that
  did not exist at freeze time — is a detected change, not a silent pass
  (round 4 P1: the diff only walked the baseline paths, reproduced then
  fixed). Arbitrary shell cannot be tokenized safely and the `cd`/`--prefix`/
  workspace forms execute a subfolder manifest the root snapshot never saw
  (round 3 P1: `cd frontend && npm run test` froze only the root, so a
  hijacked `frontend/package.json scripts.test` ran — reproduced, then fixed);
  round 2 P1 was the compound `true && npm run test` that froze only
  composer.json, and wrappers/`sh -c '…'` defeat heuristics too. A missing
  root manifest snapshots as `{}`, so creating it mid-run is a detected change
  as well; a newly created nested manifest is caught by the perimeter
  re-scan.
  The nested scan skips `node_modules`, `vendor`, `.git`, `.pi`,
  `bower_components` and symlinked directories; above `MAX_FROZEN_MANIFESTS`
  (200) `freezeVerifyInputs` returns `{ok:false, reason}` and the workflow
  fails closed `needs_human` (an incompletely frozen perimeter is never
  verified).
  The freeze (`commands`, `scripts`, `scriptsDigest`) persists on
  `workflow.started` (optional, backward compatible). Before every verify —
  start, fix rounds, resume — `changedScriptKeys` diffs the live sections
  against it; any change ends the run `needs_human` before any command runs,
  naming the changed keys. Script bodies compare by canonical content
  (composer bodies may be arrays). Capture and replay share `isPlainRecord`,
  so a non-object `scripts` section is captured as `{}` — the program can
  never emit a freeze its own replay would call corrupt (round 3 standards).
  Resume: `resume.ts` validates the freeze structurally AND checks
  `scriptsDigest` binds to `scripts` (round 2 P2/standards: `verify: null`
  crashed the replay, and `scripts: []` passed as a valid empty guard,
  silently voiding protection). Absent field → legacy path (per-verify
  re-resolution + one-line notice); present but corrupt → resume REFUSED
  (`corrupt_verify_freeze`, message wired in `extensions/pi-brain.ts`
  refusalMessage) — protection is never silently downgraded. The workflow
  prefers the persisted freeze over the freshly loaded config, so an edited
  `.pi/pi-brain.json` cannot rewrite what runs.
  Tests: `tests/unit.test.ts` (freeze/diff/digest; conservative explicit
  freeze incl. the compound repro, wrappers/options/cd/workspace shapes and
  the nested-frontend regression; nested-manifest + composer cases;
  scan exclusions; stack-default scoping; over-cap refusal; capture/replay
  alignment; perimeter persisted; created-after-freeze + new-subfolder
  re-scan; root-only scope; array-body regression),
  `tests/feature-workflow.test.ts` (persisted + executed on unchanged
  scripts; changed `test` script → needs_human, zero commands, no verify
  phase; explicit `config.verify` on Laravel → blocked; compound
  `true && npm run test` regression → blocked; nested
  `cd frontend && npm run test` regression → blocked with zero
  verifier/reviewer calls; nested manifest CREATED mid-run → blocked;
  change between rounds caught against the original baseline; resume uses
  persisted commands despite edited config; resume blocked on post-crash
  script change; resume blocked when a nested manifest appears after the
  crash with a tree perimeter; legacy log → notice + re-resolve),
  `tests/resume.test.ts` (freeze replayed with digest binding and preserved
  perimeter; legacy absent → state.verify undefined; a freeze without a
  perimeter normalizes to root-only; 16 corrupt shapes refused incl.
  `verify: null`, `verify: []`, `scripts: []`, section arrays, digest
  mismatch, unknown perimeter; isResumable false).
  Limits: what a script BODY runs (other files, `node_modules/.bin`,
  `vendor/bin`) is not resolved or frozen — and U3 does not close that gap
  (it snapshots git state, not arbitrary working-tree files); the nested scan
  excludes dependency/VCS directories and symlinked dirs (a script executed
  from inside one is outside the perimeter); a legacy freeze without the
  perimeter field normalizes to root-only, so those resumed runs keep the
  round-3 behavior (no tree re-scan); explicit config over-freezes (whole
  perimeter, e.g. package.json on Laravel even when unused) and above 200
  manifests refuses rather than truncating. Documented in
  `docs/pi-brain/README.md`.

- [x] **U3 — Repository-state invariant** (F1, F2). `src/shell.ts`,
  `src/ports.ts`, `src/workflows/feature.ts`, `extensions/pi-brain.ts`,
  `tests/git.test.ts`, `tests/feature-workflow.test.ts`.
  Completed 2026-10-16 (uncommitted), TDD throughout (27 tests red-first;
  every guard and digest section mutation-killed by exactly its own tests).
  `repoStateDigest` in `src/shell.ts` (pure git/fs, no Pi) hashes: HEAD as
  commit id AND symbolic name (a pure branch switch moves the symref without
  touching any ref object), `for-each-ref` output (object id, type, symref
  target, name; deterministic sort), the config file resolved through
  `rev-parse --git-common-dir` (in a linked worktree `.git` is a FILE and
  config/hooks live in the main repo's common dir), a per-worktree
  `config.worktree`, the recursive listing of the common `hooks/` dir — name,
  **permission bits** and content of every entry, symlinks followed, a
  symlink-loop guard so a self-referential dir cannot recurse forever — and —
  when configured at any scope — the `core.hooksPath` location.
  Read failures propagate: unreadable is never unchanged, and "read as
  absent" is kept strictly apart from "could not read" — a missing config or
  hook is a state (`<missing>`), every other error (unreadable file, an entry
  of the wrong type, a `core.hooksPath` that exists but cannot be enumerated)
  throws instead of collapsing into a stable marker. `git config --get`
  distinguishes an absent key (exit 1, the normal case) from a real config
  failure. The workflow owns
  the decision: `RealGitService.repoStateDigest` is taken once at baseline
  (failure → `needs_human` before anything starts, nothing persisted),
  persisted on `workflow.started.repoStateDigest`, and re-checked by
  `stopForRepoStateChange` after every developer pass (including fix rounds
  and the resume re-entry, where it also covers the interruption window) and
  after every verify — before the retry accounting, so a mutated repo never
  spends budget. Any difference or read failure ends the run `needs_human`
  before the reviewer, naming what to inspect (`git reflog`, `git diff`).
  Resume replays the ORIGINAL digest (`extensions/pi-brain.ts` reconstructs
  it into the resume baseline); a log without it resumes with the check
  inactive and exactly one notice saying so — compat, never claimed
  protection.
  Tests: `tests/git.test.ts` (real temp repos: unchanged repo stable; new
  commit/branch/tag; branch switch without new commit; config change; hook
  create/edit/remove restoring baseline; a hook made executable with identical
  content is a change — P1 regression; working-tree edits NOT flagged;
  custom `core.hooksPath`; a nonexistent configured `core.hooksPath` is a
  stable state and populating it later is detected; linked worktree — shared
  refs/config/hooks seen from the worktree, own commit seen, plain worktree
  edit not flagged; unborn repo; non-repo fails closed; fails closed on an
  unreadable hook file, an unreadable `.git/config`, a configured
  `core.hooksPath` that exists but cannot be listed, and one that points at a
  file instead of a dir — P1 regressions; fails closed on a `core.hooksPath`
  and a `config.worktree` sitting behind an inaccessible parent directory —
  P2 regressions), `tests/feature-workflow.test.ts` (digest
  persisted; change after develop → needs_human with zero verify commands and
  no reviewer; change during verify → needs_human, reviewer not called;
  change in fix round caught against the original digest; resume blocked on
  a change made during the interruption with no fresh baseline; matching
  digest resume completes; legacy log without digest runs unprotected with
  exactly one notice; unreadable at re-check and at baseline both fail
  closed).
  Mutation checks: post-develop check disabled → exactly the after-develop
  and resume-blocked tests fail; post-verify check disabled → exactly the
  during-verify test; refs/hooks/config/HEAD sections dropped → exactly their
  own tests (branch/tag, hooks, config, branch-switch; a new commit is caught
  by HEAD+refs together); service swallowing read errors → exactly the
  fail-closed test; resume taking a fresh digest → exactly the two resume
  tests. Review round 2 (two P1s): dropping the permission bits → exactly the
  chmod-activation regression fails; turning an unreadable hook file back into
  a marker → exactly the unreadable-hook regression; swallowing `digestDir`
  errors for `core.hooksPath` → exactly the two hooksPath fail-closed
  regressions. Review round 3 (P2): `existsSync` restored in `digestDir` →
  exactly the `core.hooksPath` behind-an-inaccessible-parent regression;
  `existsSync` restored in `stateFileForDigest` → exactly the `config.worktree`
  one. `npm test` 359/359, `npm run typecheck` clean,
  `git diff --check` clean.
  Limits: git metadata only — swapped working-tree files (e.g. a test-runner
  binary) are invisible (U2 covers manifests, not script bodies); pseudo-refs
  (`ORIG_HEAD`, `MERGE_HEAD`, `FETCH_HEAD`) are not hashed (anything that
  matters moves HEAD or a real ref); detection is after the fact — a push
  already happened by the time it is caught; a legitimate human commit
  mid-run also stops the run (intended, documented). A non-regular entry in a
  hooks dir (FIFO, socket, device node) is digested by type and mode only — it
  is never opened, since reading a FIFO would block. An unreadable
  `.git/config` is refused by git itself before our own read, so the
  `.git/config` fail-closed test passes through git's refusal rather than
  discriminating `stateFileForDigest`; that guard is discriminated through the
  `config.worktree`-behind-an-inaccessible-parent regression instead. Both
  `digestDir` and `stateFileForDigest` use `statSync(…, {throwIfNoEntry:
  false})` so only a genuine ENOENT reads as absent, never a permission error.
  Documented in `docs/pi-brain/README.md`.

- [x] **U4 — Exclude pi-brain runtime files from snapshots** (F3). `src/shell.ts`,
  `tests/git.test.ts`.
  Completed 2026-10-17 (uncommitted), TDD: five exclusion tests red-first on
  the exact F3 reproduction; the committed-`.pi/pi-brain.json` test passed
  before the change and still passes (a conservation test, not a regression).
  `snapshotTree` adds exclude pathspecs to the scratch-index
  `git add -A -- .`: `:(exclude).pi/pi-brain.lock*` — the glob covers the
  lock, its takeover marker `lock.takeover-<inode>` and its staging file
  `lock.<pid>.<runId>.tmp` — and `:(exclude).pi/pi-brain/` (the run-log
  tree). The `-- .` semantics are otherwise unchanged, the scratch index
  stays a scratch index (real index, working tree and .gitignore untouched),
  and the same snapshot procedure serves the baseline, every later diff and
  the submodule dirtiness check — so runtime files inside a submodule no
  longer mark it dirty either (intended: same F3 rationale).
  Tracked runtime files (committed by mistake) are covered by construction:
  `read-tree` seeds HEAD's version into the scratch index and `git add` skips
  the excluded paths entirely — modifications, deletions and new siblings are
  never staged, both snapshots carry HEAD's version, the paths cancel out.
  Tests (`tests/git.test.ts`, real temporary repos, no .gitignore): lock +
  marker + staging + run log created after baseline → empty file list AND
  empty patch (the PRD reproduction); runtime files already present at the
  baseline (the real ordering — the lock is acquired before the workflow
  starts) and removed before the diff → still empty (probes the baseline
  side: a baseline-only exclusion would surface as a deletion); rewritten
  after an earlier empty diff → still empty; a committed
  `.pi/pi-brain.json` edit → exactly `[".pi/pi-brain.json"]` with the content
  in the patch; an applicative edit + new source file + a NEW untracked
  `.pi/pi-brain.json` next to runtime noise → exactly those three paths and
  no run-log content in the patch; runtime files tracked in HEAD then
  modified/appended/deleted → empty (the seed does not reintroduce them).
  Mutation checks: dropping the lock exclusion → exactly the five lock tests;
  dropping the dir exclusion → exactly the four run-log tests; exact-name
  lock exclusion (no `*`) → exactly the four tests whose lock siblings change
  between the snapshots; widening the exclusion to all of `.pi/` → exactly
  the two json-visibility tests. `npm test` 365/365,
  `npm run typecheck` clean, `git diff --check` clean.
  Limits: the exclusion is path-based — anything under those paths is hidden
  from the review diff, not just pi-brain's own files; the developer write
  guard (U1) closes the write/edit channel into `.pi/`, but `bash` remains
  available to writable roles without an explicit tools allowlist, so that
  side channel is narrowed, not closed. U11 (.gitignore entries via
  `setup.sh`) is still the defence-in-depth layer for `git status` and
  ordinary commits.

- [x] **U5 — Verify timeout with process-group kill** (F4). `src/shell.ts`,
  `src/config.ts`, `tests/unit.test.ts` (or a new `tests/shell.test.ts`).
  Completed in `07d74d7` (code-review-follow-ups T5–T6). Each command is
  bounded by `verifyTimeoutMs` (default 600000, bounds 1000–3600000).
  Timeout/abort sends SIGTERM then SIGKILL to the process group and waits
  for cleanup; results report timeouts in ms and unconfirmed cleanup explicitly.
  Group termination is POSIX-only, with shell-only fallback elsewhere.
  Tests: `tests/shell-verify.test.ts`, `tests/unit.test.ts` and
  `tests/feature-workflow.test.ts` cover timeout, abort, cleanup and config.
  Original acceptance: a script that backgrounds a sleeping child and then sleeps itself. With
  a 1 s timeout it is reported as timed out, and the child PID no longer exists.
  An invalid config value produces a warning plus the default.

- [x] **U6 — Shared run launcher** (F7). `src/run-launcher.ts`,
  `extensions/pi-brain.ts`, `tests/run-launcher.test.ts`.
  Completed 2026-10-17 (baseline `fa5303f`, uncommitted on `main`), TDD: 9
  tests red-first, nine mutation checks each killed by exactly its covering
  tests.
  `launchRun(deps, runWorkflow, options?)` in `src/run-launcher.ts` is
  Pi-free (no Pi import; history/status/notify/bell/lock all injected) and
  owns the event sink (in-memory buffer for `/flow`, best-effort Pi-side
  history — a throw is swallowed so the run log still receives every event —
  run-log append, phase tracking), the `workflow.outcome` event (built in
  one place, verbatim payload: conditional reason/summary/files/review
  spreads, optional per-issue fields, usage mapped to input/output with
  `cost` dropped), the run-state transitions, completion /
  UserDismissedError-cancellation / error handling, and the lock release
  exactly once (finally). The workflow call is an injected callback invoked
  INSIDE the run body, so a synchronous throw from deps construction
  (agents/verifier/git) is handled like a rejection — no leaked lock.
  `/feature` and `/flow resume` both call it; resume passes
  `{ resumedPhase }` so `workflow.resumed` is emitted synchronously as the
  first new event in every sink, and the reconstructed ORIGINAL baseline
  (incl. the U3 `repoStateDigest`) still flows through the extension's
  callback into `{ ...state, baseline }` — untouched. Detached execution
  unchanged (`void launchRun(...)`); the started/resumed notifies stay at
  the call sites; `/flow status|log|stop` untouched.
  To keep the launcher free of `src/pi/`, `UserDismissedError` moved from
  `src/pi/human-input.ts` to `src/ports.ts` (identical class and message;
  the HumanInput port contract now owns its error — the extension was the
  only other importer). `renderOutcome`/`renderUsage`/`fmtTokens` moved
  verbatim into the launcher (single owner of the completion path including
  its UI text); `/flow status` and `/flow log` import the last two back.
  The extension keeps wiring only (−140 lines): lock acquisition order in
  `/feature` deliberately untouched (F5/U7), and best-effort UI in the
  detached runner deliberately untouched (F6/U8) — both now have exactly one
  place to be fixed.
  Tests (`tests/run-launcher.test.ts`, 10): completed, needs_human,
  cancelled outcome, UserDismissedError, thrown workflow error, synchronous
  wiring throw, throwing Pi history (run log continues), full outcome
  payload, resume ordering of `workflow.resumed`, and — from the review
  round — a run-log callback throwing on the resumed marker (the finally
  still releases the lock exactly once). Every path asserts events, final
  status and lock released exactly once, plus lock still held while the
  workflow is pending.
  Review round: the `workflow.resumed` emission moved inside the run body's
  try/finally — a sink callback throwing on that first event (broken
  run-log dep) can no longer bypass the lock release, and since the body
  runs synchronously up to the first await the marker is still emitted
  before the workflow is invoked and before `launchRun` returns (ordering
  re-pinned by the same resume test; the placement mutation still kills
  exactly that test on the final code). The header's "never rejects"
  promise was corrected: until U8 a throwing UI effect (notify/bell/status)
  can still reject the promise — F6, unchanged from the former inline
  runners.
  `npm test` 375/375, `npm run typecheck` clean, `git diff --check` clean.

- [x] **U7 — Lock before side effects in `/feature`** (F5).
  `extensions/pi-brain.ts`, `src/run-launcher.ts`, `tests/run-start.test.ts`.
  Completed 2026-10-17 (baseline `0815222`, uncommitted on `main`).
  `/feature` acquires the run lock BEFORE `RunLog.open` and
  `PiAgentRunner.create`: a refused run opens neither the audit log (no
  `.pi/pi-brain/runs/<runId>.jsonl` for `/flow log-all` to list as
  `in-progress-or-interrupted`) nor the agent runtime. The ordering is
  extracted into the Pi-free `startRun` in `src/run-launcher.ts` — the module
  U6 created for the shared execution cycle, whose header already reserved
  this fix — so it can be tested with fakes and no Pi session or model: every
  effect (lock, runtime, log, active-state, UI reporting, hand-off) is
  injected. `startRun` acquires the lock, publishes the run as active, builds
  the runtime, and only then opens the log. A refused/throwing lock publishes
  nothing (active cleared, the old net state) and creates nothing; a runtime
  failure releases the lock exactly once and restores `active = null`; on
  success the lock's ownership passes to `launch`, whose `launchRun` releases
  it when the run settles, and `startRun` never releases it — the two paths
  are disjoint, so no run can release twice. `/feature` keeps the detached
  `void launchRun(...)` hand-off, the started notify and the lock-refusal
  wording; the `onFailure` switch carries the three messages (`lock_error`,
  `lock_refused`, `runtime_error`). Resume, the U1–U4 guards, the U5 timeout
  and the U6 launcher are untouched; F13 untouched.
  Tests (`tests/run-start.test.ts`, 5, fakes-only): refused lock →
  `order === ["lock"]`, no runtime, no log, never active; lock throw → the
  same; runtime failure → `["lock", "agents"]` (no log), released exactly
  once, active `[run, null]`; success → `["lock", "agents", "log", "launch"]`,
  log last, lock handed to the launcher and NOT released by `startRun`; a
  composition test hands the lock to the real `launchRun` and observes it
  held while the fake workflow is pending and released exactly once on
  settle. Mutation checks, each killed by exactly its covering tests:
  dropping the runtime-failure release → the runtime-failure test; dropping
  the active restore → the same; a double release after the hand-off → the
  success and composition tests.
  Deviation from the original file map (extension-only): the sequence lives in
  `src/run-launcher.ts` + `tests/run-start.test.ts` because the U7 test
  mandate (fakes, no Pi/model) cannot be met against an inline
  `PiAgentRunner.create`; the extension keeps wiring only.
  `npm test` 380/380, `npm run typecheck` clean, `git diff --check` clean.

- [ ] **U8 — Best-effort UI in the detached runner** (F6). `src/run-launcher.ts`,
  `extensions/pi-brain.ts`, `tests/run-launcher.test.ts`.
  Satisfy: `notify`, the bell and `status` called from the detached runner are
  best-effort. A throw is reported to stderr once and never changes the
  persisted outcome, never emits `workflow.failed` after `workflow.outcome`, and
  never escapes as an unhandled rejection.
  Tests: a fake UI that throws on the outcome notify. The log ends with
  `workflow.outcome` only, the promise resolves, and the lock is released.

## M2 — multi-tool setup parity

- [ ] **U9 — `solution-capture` workflow pointers** (F8).
  `.opencode/agents/solution-capture.md`, `.agents/workflows/solution-capture.md`,
  `tests/repo.test.ts`.
  Satisfy: same pointer format as the existing six. A repo test asserts that every
  workflow skill named in the README table has an OpenCode pointer and a
  `.agents/workflows/` link resolving to its `SKILL.md`.

- [ ] **U10 — Coherent opencode-only mode** (F9). `setup.sh`, `README.md`.
  Satisfy: `setup.sh <proj> opencode` warns that the agent pointers need
  `.agents/` and names the command that links it. The README states the same.
  Tests: a smoke run in a temporary dir prints the warning; existing profiles are
  unchanged.

- [ ] **U11 — Pi runtime ignore entries** (F3, defence in depth). `setup.sh`.
  Satisfy: when `.gitignore` exists, `.pi/pi-brain.lock` and `.pi/pi-brain/` are
  added once (idempotent, same helper as `.agents`/`.opencode`).
  Tests: run `setup.sh` twice in a temporary repo; each entry appears exactly
  once.

- [ ] **U12 — Claude Code support** (F10). `setup.sh`, `scaffold.sh`, `README.md`.
  Satisfy: first verify in current Claude Code docs whether it reads `AGENTS.md`
  and `.agents/skills` natively, and record the answer with its source in the
  README. Then create only what is missing: a `.claude/skills` link to the
  linked skills dir (profile-aware, same refusal rules as `.agents`) and/or a
  `CLAUDE.md` containing `@AGENTS.md` when absent. `unlink.sh` removes what
  `setup.sh` created.
  Tests: a smoke run for one curated profile and for `full`; a second run is a
  no-op; unlink restores the directory.

## M3 — cleanup and decisions

- [ ] **U13 — Stale statements** (F11). `extensions/pi-brain.ts`,
  `src/pi/pi-agent-runner.ts`, `docs/pi-brain/README.md`.
  Satisfy: headers say "exercised by real runs since 2026-08-21, see SPIKE.md".
  The test count is updated or the hard-coded number is removed. The
  `availableSkills` comment matches the current tree.

- [ ] **U14 — Empty slug fallback** (F12). `src/workflows/feature.ts`,
  `tests/feature-workflow.test.ts`.
  Satisfy: a TITLE whose slug is empty produces `feature-<runId>`, and the
  collision rules of `featureSlug` still apply.
  Tests: an emoji-only title and a CJK-only title.

- [ ] **U15 — `changes_requested` policy** (F13; blocked on the PRD open
  decision). `src/review.ts`, `tests/unit.test.ts`.
  Satisfy: the chosen option is implemented, and one test pins it in each
  direction (approved + warnings, changes_requested + warnings).

- [ ] **U16 — Measure parent-session skill load** (F14).
  `docs/plans/pi-plugin-adoption-roadmap.md`.
  Satisfy: record the number of skills and the total description size that a
  parent Pi session receives after `pi install .`, plus whether profile
  filtering would matter. Investigation only; no code change.
