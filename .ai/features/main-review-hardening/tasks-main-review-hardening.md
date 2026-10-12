# Tasks: main review hardening

PRD: `.ai/features/main-review-hardening/prd-main-review-hardening.md`.
Finding ids (F1–F14) refer to the PRD table. Each milestone is its own cycle.

## Integration status (2026-10-12)

Imported from `6c16a01` onto `main` after `07d74d7`. U5 is already covered
by code-review-follow-ups T5–T6; remaining tasks are pending. Use the
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

- [ ] **U1 — Developer write-path guard** (F2). `src/write-guard.ts`,
  `src/pi/pi-agent-runner.ts`, `tests/write-guard.test.ts`.
  Satisfy: writes outside the repo root, under `.git/`, or under `.pi/`
  (including through a symlinked ancestor) return a tool error with the refused
  path and leave the filesystem unchanged. In-repo writes and edits are
  unchanged. Read-only roles keep the read-only tool set.
  Tests: absolute outside path, `../` escape, `.git/hooks/pre-commit`,
  `.pi/pi-brain.json`, symlink to outside, normal nested path.

- [ ] **U2 — Freeze verify inputs** (F1). `src/verify.ts`, `src/ports.ts`,
  `src/workflows/feature.ts`, `src/workflows/resume.ts`, `extensions/pi-brain.ts`,
  `tests/feature-workflow.test.ts`, `tests/resume.test.ts`.
  Satisfy: commands are resolved once at run start and persisted on
  `workflow.started` together with a digest of the scripts they depend on
  (`package.json` `scripts`; `composer.json` `scripts` for Laravel). Before each
  verify, a changed digest ends the run `needs_human` without executing anything,
  and the reason names the changed script keys. Resume uses the persisted
  commands and digest. A log without them resumes as today, with a one-line
  notice.
  Tests: unchanged scripts run verify; a changed `test` script escalates and
  runs zero commands; the explicit `config.verify` path also checks the
  `npm run …` scripts it invokes; a resume with an edited `.pi/pi-brain.json`
  still runs the persisted commands; an old-format log gets the notice.

- [ ] **U3 — Repository-state invariant** (F1, F2). `src/shell.ts`,
  `src/ports.ts`, `src/workflows/feature.ts`, `tests/git.test.ts`,
  `tests/feature-workflow.test.ts`.
  Satisfy: a digest of HEAD, all refs, `.git/config` and `.git/hooks/` is taken at
  baseline and persisted. It is re-checked after the developer and after verify.
  Any change ends the run `needs_human` before the reviewer is called. Resume
  compares against the persisted digest.
  Tests (real temporary repo): commit, new branch, tag, edited hook, edited
  config, each detected; an untouched repo is not flagged. Workflow tests with
  fakes: escalation after develop and after verify, reviewer never called.

- [ ] **U4 — Exclude pi-brain runtime files from snapshots** (F3). `src/shell.ts`,
  `tests/git.test.ts`.
  Satisfy: the snapshot ignores `.pi/pi-brain.lock*` and `.pi/pi-brain/`
  regardless of `.gitignore`. Other `.pi/` files (e.g. a committed
  `.pi/pi-brain.json`) are still diffed.
  Tests: the PRD reproduction (lock + run log written after baseline gives an
  empty file list); an edit to `.pi/pi-brain.json` still appears.

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

- [ ] **U6 — Shared run launcher** (F7). `src/run-launcher.ts`,
  `extensions/pi-brain.ts`, `tests/run-launcher.test.ts`.
  Satisfy: one Pi-free function owns the event sink (in-memory buffer, Pi
  history best-effort, run log, phase tracking), the `workflow.outcome`
  emission, the status transitions and the lock release. `/feature` and
  `/flow resume` both call it; the outcome payload is built in one place.
  Tests with fakes: completed, needs_human, cancelled (`UserDismissedError`),
  thrown error. In every case the lock is released exactly once and the event
  order matches today's.

- [ ] **U7 — Lock before side effects in `/feature`** (F5). `extensions/pi-brain.ts`.
  Satisfy: the lock is acquired before `RunLog.open` and `PiAgentRunner.create`.
  A failed runtime creation releases the lock. A refused run leaves no file
  under `.pi/pi-brain/runs/`. This matches the ordering the resume path
  already documents.
  Tests: covered through U6's launcher contract plus a typecheck; manual check in
  Pi: a refused `/feature` adds no row to `/flow log-all`.

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
