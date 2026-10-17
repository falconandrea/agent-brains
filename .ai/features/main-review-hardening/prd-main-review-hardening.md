# Feature: main review hardening

Source: code review of `main` at `e5f8e56` (2026-10-02). Baseline: `npm run
typecheck` clean, `npm test` 215/215 after `npm ci`.

## Integration status (2026-10-12)

Imported from `6c16a01` onto `main` after `07d74d7`. The findings below
are the historical review, not a claim that every gap still exists. U5/F4
is already covered by `07d74d7` (code-review-follow-ups T5–T6), with
`verifyTimeoutMs` defaulting to 600000 (10 min), validated between 1000 and
3600000 ms. Other tasks remain pending; F13 still needs a policy decision.
Documentation integration does not authorize the remaining implementation.

## Overview

The `/feature` harness is well built: deterministic transitions, a
spec-tamper guard, independent budgets, a robust run lock, resume. The review
still found gaps where the code's own invariants are weaker than its comments
claim, plus a bug that only shows up in target projects, not in this repo.
There are also smaller parity gaps in the OpenCode / Codex / Claude Code setup.

Primary usage is Pi + `/feature`; OpenCode / Codex / Claude Code must keep
working as secondary consumers of the same skill store.

The work splits into three milestones that ship independently. Implement each
as its own cycle:

- **M1 — pi-brain harness** (must): U1–U8
- **M2 — multi-tool setup parity**: U9–U12
- **M3 — cleanup and decisions**: U13–U16

## Findings this feature closes

| # | Finding | Evidence |
|---|---|---|
| F1 | The developer has no `bash`, but verify runs `bash -lc` on commands the developer can rewrite (`package.json` scripts; `.pi/pi-brain.json` reloaded on resume). This happens before the reviewer sees the diff. | `src/verify.ts:62`, `src/shell.ts:282`, `src/workflows/feature.ts:454`, `extensions/pi-brain.ts:362` |
| F2 | Pi's `write`/`edit` accept any absolute path. Nothing stops writes to `.git/hooks/`, `.git/config`, `.pi/` or paths outside the repo. `.git/` writes are invisible to the reviewer's diff. | `node_modules/@earendil-works/pi-coding-agent/dist/utils/paths.js:82` (no cwd guard) |
| F3 | In target repos without the manual `.gitignore` entries, the run log `.pi/pi-brain/runs/<runId>.jsonl` (and the lock and rejected-planner files) lands in the reviewer's diff. | Reproduced: `files in reviewer diff: ['.pi/pi-brain/runs/run-x.jsonl']`; `src/shell.ts:121`; `setup.sh` does not add the entries |
| F4 | Verify commands have no timeout. A watch-mode test hangs the run and holds the repo lock until `/flow stop`. | `src/shell.ts:280-296` |
| F5 | `/feature` opens the run log and the agent runtime **before** acquiring the lock. A refused run leaves an empty `.jsonl` that `/flow log-all` lists as `in-progress-or-interrupted`. The resume path already avoids this on purpose. | `extensions/pi-brain.ts:98,114` vs `:128`; `:504` |
| F6 | The detached runner calls `ctx.ui.notify` without a guard. A stale ctx throwing after `workflow.outcome` logs a contradictory `workflow.failed`, and a second throw in `catch` becomes an unhandled rejection. | `extensions/pi-brain.ts:215,221,592,598` |
| F7 | `/feature` and `/flow resume` duplicate about 70 lines: event sink, outcome emission, detached runner. Every fix to F5/F6 would have to be applied twice. | `extensions/pi-brain.ts:143-226` vs `:519-603` |
| F8 | `solution-capture` has no OpenCode agent pointer and no `.agents/workflows/` link (6 of 7 workflows). | `.opencode/agents/`, `.agents/workflows/` |
| F9 | `setup.sh <proj> opencode` links `.opencode/` only, but its agent pointers reference `.agents/workflows/*.md`, which is not linked in that mode. | `.opencode/agents/*.md`, `setup.sh` opencode branch |
| F10 | `setup.sh` / `scaffold.sh` create nothing for Claude Code (`.claude/skills`, `CLAUDE.md`). | `setup.sh`, `scaffold.sh` |
| F11 | Stale statements: "NEVER RUN" headers (spike passed 2026-08-17, real runs since 2026-08-21), "212 tests" (now 215), the "legacy loose .md" comment (none left). | `extensions/pi-brain.ts:6`, `src/pi/pi-agent-runner.ts:7`, `docs/pi-brain/README.md`, `extensions/pi-brain.ts:38-40` |
| F12 | A planner TITLE with no ASCII letters or digits yields an empty slug, so the files become `.ai/features/prd-.md`. | `src/workflows/feature.ts:748-756` |
| F13 | A `changes_requested` verdict with only warnings/suggestions completes as "FEATURE COMPLETE". No test pins this behaviour. | `src/review.ts:112` |
| F14 | `pi install .` exposes all 62 skills to the parent Pi session regardless of profile; profiles filter child agents only. Possible context cost, unmeasured. | `package.json` `pi.skills`, `src/pi/pi-agent-runner.ts:172-186` |

## User Stories

- As a pi-brain user, I want the "never commits, no shell for the developer"
  invariant to hold mechanically, so that a model that ignores the prompt cannot
  commit, push, or plant a git hook through a side channel.
- As a pi-brain user, I want the reviewer's diff to contain only project
  changes, so that tokens are not wasted and the review is not polluted by
  pi-brain's own audit trail.
- As a pi-brain user, I want a hung test command to end the run with a clear
  reason, so that the repo lock is not held indefinitely.
- As a pi-brain user, I want `/flow log-all` to list only runs that actually
  started.
- As an OpenCode / Codex / Claude Code user, I want every workflow skill and the
  project context to be discoverable after `setup.sh` + `scaffold.sh`.

## Approaches for F1 + F2 (the core decision)

Running the test suite **always** executes developer-written code (the tests
themselves), so no approach makes verify fully hermetic short of an OS sandbox.
The goal is to close the *direct* channels and **detect** any violation of the
actual invariant: no commit, no ref change, no git-config or hook change.

1. **Recommended — freeze + guard + detect.**
   - Resolve verify commands once per run and persist them.
   - Refuse to run verify when the `scripts` the commands depend on changed since baseline.
   - Wrap `write`/`edit` with a path policy (repo root only; never `.git/` or `.pi/`).
   - Compare a repository-state digest (HEAD, refs, `.git/config`, `.git/hooks/`) after develop and after verify, and escalate to `needs_human` on any change.
   - Gain: closes every channel found in review with small, testable, Pi-free logic.
   - Lose: a legitimate script change in `package.json` now escalates instead of being verified. That is acceptable: the human sees why.
2. **OS sandbox for verify** (`sandbox-exec` on macOS, `bwrap` on Linux, read-only `.git`, no network).
   - Gain: strongest guarantee, including against tests that shell out.
   - Lose: platform-specific, brittle with toolchains (php, node caches), a large surface to maintain. Revisit only if approach 1 proves insufficient.
3. **Detect only** (repository-state digest, nothing else).
   - Gain: about 1 h of work.
   - Lose: a push cannot be undone after detection, and writes outside the repo stay possible.

Decision: **approach 1**.

## Acceptance Criteria

### M1 — pi-brain harness
- [ ] Developer `write`/`edit` calls targeting a path outside the repo root,
      inside `.git/`, or inside `.pi/` return a tool error and do not touch the
      filesystem; normal in-repo paths behave exactly as before.
- [ ] Verify commands are resolved once per run and persisted on
      `workflow.started` (optional field, backward compatible). Resume uses the
      persisted commands, not a re-read of `.pi/pi-brain.json`.
- [ ] If the `scripts` (package.json, plus composer.json for Laravel) changed
      since baseline, verify does not run and the run ends `needs_human` with a
      reason naming the changed scripts.
- [ ] A change of HEAD, any ref, `.git/config` or `.git/hooks/` after develop or
      after verify ends the run `needs_human` before the reviewer is called.
- [ ] Snapshots exclude `.pi/pi-brain.lock*` and `.pi/pi-brain/`: the reproduction
      above yields an empty file list.
- [x] Each verify command has a timeout (default 10 min, optional
      `verifyTimeoutMs` in config, validated between 1000 and 3600000 ms).
      Timeout/abort terminates the process group with SIGTERM then SIGKILL;
      results report the timeout in ms and whether cleanup was confirmed.
      POSIX group kill falls back to shell-only termination on other platforms.
      Implemented in `07d74d7`; see `tests/shell-verify.test.ts`.
- [ ] A `/feature` refused by the lock creates no run-log file and no agent
      runtime.
- [ ] UI failures (`notify`, bell, status) in the detached runner never change
      the persisted outcome and never produce an unhandled rejection.
- [x] `/feature` and `/flow resume` share one launcher; no duplicated outcome
      emission.
      Implemented 2026-10-17 (U6): `src/run-launcher.ts` — Pi-free, all
      effects injected; see the U6 task entry.

### M2 — multi-tool setup parity
- [ ] `solution-capture` has `.opencode/agents/solution-capture.md` and
      `.agents/workflows/solution-capture.md`; a repo test asserts that every
      workflow skill in `common.list` and the stack lists has both.
- [ ] `setup.sh <proj> opencode` either links what the pointers need or prints
      an explicit warning naming the missing `.agents/` dependency.
- [ ] `setup.sh` adds `.pi/pi-brain.lock` and `.pi/pi-brain/` to an existing
      `.gitignore` (defence in depth; the snapshot exclusion is the primary fix).
- [ ] What Claude Code reads natively (AGENTS.md vs CLAUDE.md, `.claude/skills`
      vs `.agents/skills`) is verified against current docs and recorded in the
      README. `setup.sh` / `scaffold.sh` create only what is missing.

### M3 — cleanup and decisions
- [ ] Stale statements in F11 are corrected.
- [ ] An empty slug falls back to `feature-<runId>`.
- [ ] The F13 policy is decided and pinned by a test (see Open decision).
- [ ] F14 is measured (count and size of the skill descriptions the parent
      session receives) and the result is recorded in the roadmap. No behaviour
      change in this feature.

## Open decision (can defer to M3)

**F13 — `changes_requested` with zero blocking issues.**
- (A) Keep it: warnings never block, and the completion message already counts
  the non-blocking notes.
- (B, recommended) Escalate as `needs_human` with the reason "reviewer requested
  changes but marked none blocking". It costs one human glance, and the
  contradiction becomes visible instead of being silently resolved toward
  "complete".
- (C) Treat the warnings as one extra fix round.

## Out of Scope

- OS-level sandboxing of verify (approach 2).
- Re-reviewing the 62 skills' content, `resume.ts` internals and
  `feature-prompts.ts` (not covered by the source review).
- Changing which skills Pi loads in the parent session (F14 is measurement only).
- Deleting the stale `origin/pi-brain` branch (already fully merged; separate
  manual action).

## Technical Notes

- **Write guard.** Pi exports `createWriteToolDefinition(cwd, { operations })` and
  `createEditToolDefinition(cwd, { operations })`. Guarded `operations` can
  enforce the policy, so built-ins are replaced, not forked. The path policy is
  a pure function in `src/` (Pi-free, unit-tested). Resolve symlinks of the
  nearest existing ancestor before comparing, so `repo/link-to-home/x` is
  caught.
- **Repository-state digest.** Hash `git for-each-ref` output, `HEAD`,
  `.git/config` and the `.git/hooks/` listing plus contents. Resolve the git dir
  through `git rev-parse --git-dir` (worktrees). The digest goes on `GitBaseline`
  and is persisted, so a resumed run compares against the original.
- **Snapshot exclusion.** Pathspec on the scratch-index `git add -A`:
  `:(exclude).pi/pi-brain.lock*` and `:(exclude).pi/pi-brain/`. Keep the
  existing `-- .` semantics otherwise.
- **Timeout.** `execFile` `timeout` only kills `bash`, and `bash -lc` children
  (vitest, jest, php) survive. Spawn with `detached: true` and kill the process
  group (`process.kill(-pid)`) on timeout and on abort.
- **Resume compatibility.** Every new persisted field is optional. Logs without
  them resume as today and get a one-line notice that the new guards are
  inactive for that run (same pattern as the spec-freeze residual).
- Error handling: every new guard fails closed to `needs_human` with a reason a
  human can act on. None of them throws out of the workflow.

## Testing Strategy

- Pi-free units with the existing fakes: path policy, verify freeze and script
  diff, state-digest escalation (develop and verify), slug fallback, F13 policy.
- `tests/git.test.ts`: real temporary repos for the snapshot exclusion (the F3
  reproduction as a regression test) and the state digest (commit, ref, hook,
  config change).
- `tests/unit.test.ts` or a new shell test: timeout with a script that spawns a
  sleeping child; assert the child is gone afterwards.
- Extension wiring (U6–U8) stays thin. Cover the extracted launcher with fakes;
  the extension file itself is covered by typecheck only, as today.
- `tests/repo.test.ts`: workflow pointer parity (U9).
- Done for each milestone: `npm run typecheck` and `npm test` green, plus
  `git diff --check` clean.
