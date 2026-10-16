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
