# PRD — Code review follow-ups

## Status and source

- Status: backlog; implementation has not started.
- Source: rapid project review on 2026-10-04, captured on 2026-10-05.
- Review scope: selected TypeScript runtime paths and setup/unlink scripts; not a complete security or SDK integration audit.
- Baseline evidence: `npm test` passed 215 tests and `npm run typecheck` passed during the review.
- Related work: [implementation tasks](tasks-code-review-follow-ups.md).

## Problem

The project has a useful separation between workflow orchestration and the Pi SDK, strict TypeScript settings, and regression coverage for locks, Git snapshots, interrupted runs, and structured agent output. The review nevertheless found setup behavior that can remove unrelated skill links or misreport installation success, and runtime behavior that can weaken verification or leave a workflow waiting indefinitely.

The goal is to address these concrete defects first, then improve integration coverage, maintainability, and dependency compatibility in separately reviewable changes.

## Findings and requirements

### F1 — Preserve unrelated symlinks (high priority, reproduced)

`setup.sh` around line 122 and `unlink.sh` around line 59 delete every symlink directly inside the target `.agents/skills` directory. They do not verify whether agent-brains created or owns each link. A temporary-project reproduction confirmed that setup removes a custom skill symlink pointing outside the canonical store.

- Remove or refresh only links attributable to this repository; preserve unrelated links.
- Apply the same ownership rule to whole-directory and workflow links that setup/unlink may remove or replace.
- Resolve and validate the requested profile before deleting or replacing existing links, so an invalid manifest cannot leave a partially cleared installation.
- Define ownership conservatively, using verified destinations or an explicit installation record. Do not infer ownership solely from the link's name.

### F2 — Handle real-directory conflicts explicitly (medium priority, reproduced)

`setup.sh` around line 141 uses `ln -sfn "$src" "$dst"`. If a real directory already exists at `$dst`, the command creates a symlink inside it. A reproduction with a local `code-review` directory confirmed a nested `code-review/code-review` link while setup reports a successful installation.

- Preserve local directories and files when a skill name conflicts.
- Skip the conflicting skill with a clear diagnostic; do not create a nested link.
- Count only skills installed at the intended destination or already correctly linked.

### F3 — Preserve detected capabilities with a manual stack override (medium priority)

`src/workflows/feature.ts` around line 670 constructs a stack with empty frameworks, languages, package managers, and capabilities when `config.stack` is set. Verification resolution relies on that metadata: a Laravel override therefore loses automatic Pint and PHPStan checks, and package-manager selection can fall back to npm unnecessarily.

- Detect project metadata even when the primary stack is configured manually.
- Override the primary stack while retaining applicable detected capabilities and package-manager information.
- Keep explicit `config.verify` commands authoritative.
- Define and test how capabilities are handled when the configured primary stack differs from the detected one.

### F4 — Bound verification command duration (medium priority)

`src/shell.ts` around line 282 executes verification commands without a timeout. A hung test or a script running in watch mode can keep the workflow and repository lock occupied until someone intervenes. This finding comes from code inspection; a hanging real workflow was not reproduced during the review.

- Add a finite, configurable timeout for verification commands, with a documented default and validated configuration.
- Return a clear non-success result when a command times out, identifying the command and duration limit.
- Preserve explicit cancellation behavior and release workflow resources on termination.
- Verify termination of representative child-process trees, rather than assuming killing the shell also stops its children.
- Choose the default duration and termination strategy during implementation; neither was decided in the review.

### F5 — Cover setup/unlink behavior with integration tests

The existing suite passed despite F1 and F2. Add temporary-project tests for custom symlinks, real local skill directories, repeated setup, profile switches, invalid profiles, and unlink ownership. Tests must run without modifying the user's linked projects or global configuration.

### F6 — Reduce responsibilities in large workflow modules

At review time, `src/workflows/feature.ts` had 931 lines and `extensions/pi-brain.ts` had 770. File length alone is not a defect; the opportunity is to make independently changing responsibilities easier to understand and test.

- First assess extracting planner-output parsing and validation from `feature.ts`.
- Then assess extracting shared run-lifecycle handling from the extension, including feature/resume cleanup where it is actually duplicated.
- Preserve event ordering, approval gates, retry budgets, resume behavior, lock handling, and cancellation semantics.
- Keep this refactor separate from behavioral fixes and avoid introducing abstractions without a concrete responsibility to isolate.

### F7 — Declare verified dependency compatibility

`package.json` declares all Pi-related peer dependencies and `typebox` as `"*"`. This permits combinations outside the versions actually validated by the project.

- Identify the versions used by the current lockfile and the SDK integration evidence.
- Declare supported ranges based on verified compatibility, without guessing a broad supported interval.
- Document the supported Node runtime, given direct execution of TypeScript tests using Node's type stripping.
- Distinguish passing local tests/typecheck from live Pi SDK validation; run a suitable SDK smoke check before claiming runtime compatibility.

## Acceptance criteria

- Setup and unlink preserve foreign skill, workflow, and whole-directory links.
- Invalid profiles or manifests fail before existing skill links are removed.
- Conflicting real files/directories are preserved, reported, and never receive unintended nested symlinks.
- Repeated setup and supported profile switches remain functional.
- A manual stack override retains applicable verification capabilities and the detected package manager; explicit verification commands still take precedence.
- Verification commands have a validated finite timeout, produce useful timeout diagnostics, and terminate representative child processes.
- Cancellation and timeout paths release the repository lock and leave no test child processes running.
- Integration tests cover the reproduced shell-script defects and relevant profile transitions.
- Any module extraction preserves existing workflow behavior and passes the existing regression suite.
- Dependency/runtime support declarations match recorded verification evidence.
- `npm test`, `npm run typecheck`, and `git diff --check` pass after implementation; shell changes also pass syntax checks and their integration tests.

## Scope and sequencing

Implement F1/F2 with their regression tests first. Address F3 and F4 as separate fixes. Treat F6 and F7 as later improvements with their own verification evidence. F5 supplies coverage for the shell fixes rather than requiring a separate large testing project.

## Out of scope

- A complete project rewrite or exhaustive security audit.
- New product features or changes to planner/reviewer responsibilities.
- Automatic replacement or deletion of user-managed local skills.
- Deployment, global skill updates, or modifications to linked external projects while implementing these tasks.

## Open implementation decisions

- How installation ownership is recorded or verified, including relative symlinks.
- The timeout default, configuration key, supported platforms, and process-tree termination strategy.
- Capability handling when manual and detected primary stacks disagree.
- Exact dependency ranges and the minimum supported Node version, based on validation.
