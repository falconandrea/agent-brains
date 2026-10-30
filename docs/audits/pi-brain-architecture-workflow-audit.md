# pi-brain architecture and workflow audit

**Date:** 2026-09-21
**Repository:** `falconandrea/agent-brains`  
**Branch analyzed:** `pi-brain`
**Type:** read-only audit of the implementation, contracts, and documentation

## 1. Executive summary

The harness is already mature and consistent with the intended architecture: the
model handles fuzzy work, while code governs transitions, limits, spec freezing,
verification, and the main security properties.

The highest-value changes are:

1. Add a canonical `npm run check` command and CI that runs exactly that command.
2. Add a narrow post-review human gate for high-risk changes or incomplete
   evidence, without introducing a new agent.
3. Resolve contradictions between `U*` and `T*` task IDs, and update
   documentation that is clearly outdated.
4. Extend `lessons-gardener` with a `PROMOTE` classification that only makes
   suggestions and always requires user approval.

A rewrite, a generic policy engine, a mandatory security reviewer, or new
knowledge-management infrastructure is not recommended.

The audit was performed on the local `pi-brain` working tree at `763387a`, one
commit ahead of `origin/pi-brain`. Pre-existing local changes were present, but
no central workflow files appeared modified. No tests or mutating commands were
run during the audit.

## 2. Findings

### F1 — No canonical repository health command or CI

- **Status:** `missing`
- **Evidence:** `package.json` exposes only `test` and `typecheck`.
  `.pi/pi-brain.json` and `docs/pi-brain/README.md` manually duplicate the two
  commands. No GitHub Actions workflows or other tracked CI are present.
- **Why it matters:** “healthy repository” currently means remembering two
  commands. Documentation, workflow configuration, and future CI can diverge.
- **Smallest change:** add:
  - `check: "npm run typecheck && npm test"` in `package.json`;
  - CI with Node 24, `npm ci`, and `npm run check`;
  - `.pi/pi-brain.json` with `verify: ["npm run check"]`;
  - a README that presents `npm run check` as the canonical command.
- **What CI should check:** only typecheck and tests. No linter is configured,
  there is no build, and adding them just to fill the pipeline offers no clear
  value.
- **Relationship to `src/verify.ts`:** no conflict. `resolveVerifyCommands`
  should continue resolving test/typecheck for generic repositories. Only this
  repository should explicitly configure `npm run check`.
- **Files involved:** `package.json`, `.pi/pi-brain.json`,
  `docs/pi-brain/README.md`, and a new `.github/workflows/ci.yml`.
- **Risks:** CI is slower than a focused local check and must download peer
  dependencies. This does not initially justify caching or a multi-version
  matrix.

### F2 — Risk-based human gates are only partially covered

- **Status:** `partial`
- **Evidence already in place:**
  - unobservable submodules cause `needs_human` before review;
  - changes to ignore rules are detected;
  - a spec changed after approval triggers escalation;
  - there is no auto-commit, and the developer has no shell;
  - the reviewer is structured and independent.
- **Real gap:** a reviewer can return `approved` and the workflow can complete
  even when the diff changes migrations, dependencies, CI/CD, infrastructure,
  authentication, or payments. Ignore rules are more problematic: the reviewer
  is notified, but some new files may have become invisible because of the
  change itself.
- **Alternatives considered:**
- **Changed paths:** the best deterministic signal available, but sufficient
  only for conventional or configured surfaces.
- **Task/spec classification:** useful context, but not reliable enough for a
  deterministic gate because the planner produces it.
- **Stack-aware categories:** reasonable for migrations and manifests, but
  could grow quickly.
- **Reviewer metadata:** does not satisfy the requirement for independence
  from the reviewer's own opinion.
- **Explicit configuration:** the best mechanism for project-specific folders,
  such as authentication and payments.
- **No new gate:** defensible because there is no auto-commit, but it lets
  `completed` communicate too much autonomy and safety.
- **Recommended smallest change:**
  1. immediately make changes to ignore rules end in `needs_human`, because
     evidence may be incomplete;
  2. after a passing review, consider a small built-in list of high-precision
     surfaces: manifests/lockfiles, migrations, CI workflows, `.gitmodules`,
     and IaC;
  3. allow a configurable list of sensitive paths for authentication, payments,
     or local conventions;
  4. if triggered, retain the review but end as `needs_human` with the detected
     categories/paths.
- **Files involved:** `src/workflows/feature.ts`, `src/config.ts`, tests in
  `tests/feature-workflow.test.ts`, and possibly a small pure helper, but not a
  new subsystem.
- **Risks:** false positives and pattern maintenance. Avoid generic semantic
  classification and keyword matching against text for this reason.

### F3 — Lessons are already promoted, but only implicitly

- **Status:** `partial`
- **Evidence:** a real incident in which the developer created a commit is
  documented in `docs/pi-brain/IDEAS.md`. The prohibition later became a
  mechanical no-shell allowlist in `src/workflows/feature.ts`, also covered by
  tests. This is already the “incident → lesson → guardrail” cycle, but it is
  not named as such.
- **Gap:** `lessons-gardener` knows only `KEEP`, `COMPRESS`, `MERGE`, and
  `DROP`. It cannot identify a lesson that should become a test, invariant,
  directive, or ADR.
- **Smallest change:** add `PROMOTE` to the gardener's classification:
  - identify the recommended target: test, invariant, AGENTS, ADR, or skill;
  - never implement it automatically;
  - keep the lesson until the guardrail exists;
  - after verified promotion, allow it to be removed or reduced to residual
    context.
- **Automation:** suggested by the agent only; application always requires
  user approval. No additional workflow phase.
- **Growth control:** keep the current admission rule, threshold of about 50
  entries, one-line format, and pruning. `PROMOTE` must not mean “also copy it
  into AGENTS.md.”
- **Files involved:** `.agents/skills/lessons-gardener/SKILL.md`,
  and possibly `templates/.ai/memory/lessons.md`.
- **Risks:** promoting one-off incidents too early. The criterion should be
  “recurring or severe and mechanically preventable,” not merely “important.”

### F4 — The task ID contract is contradictory

- **Status:** `missing`
- **Evidence:** the Pi planner requires `T1`, `T2` in
  `src/workflows/feature-prompts.ts`, and the parser deterministically accepts
  only `T\d+` in `src/workflows/feature.ts`. The real feature uses `T1…T8`.
  The standalone skill instead requires `U1`, `U2`. `SPEC.md` also retains
  `U*` examples.
- **Why it matters:** `.ai/features` artifacts are shared between manual and Pi
  modes. A task file valid for the skill may be rejected by the workflow.
- **Smallest change:** standardize on `T*`, which is already the executable,
  tested contract. Update skills and examples; do not expand the parser to
  accept two formats.
- **Source of truth:** parser and tests for syntax; prompts and skills must
  document that contract.
- **Files involved:** `.agents/skills/feature/SKILL.md`,
  `docs/pi-brain/SPEC.md`, and any examples.
- **Risks:** old task files with `U*` will not be backward-compatible, but they
  are already rejected by the Pi planner contract.

### F5 — Some operational documentation is demonstrably outdated

- **Status:** `partial`
- **Evidence:**
  - `ARCHITECTURE.md` says developer → verify → reviewer has never been
    executed, while the README documents complete runs;
  - `ARCHITECTURE.md` says resume is still missing; the resume module and the
    README document it as implemented;
  - `src/pi/pi-agent-runner.ts` says “nothing here has executed”, contradicted
    by the documented real runs;
  - the README refers to `ROLE_POLICIES`, but the implementation uses
    `ROLE_CATEGORIES`.
- **Why it matters:** “known gaps” guide architectural decisions; if outdated,
  they can cause duplicate work.
- **Smallest change:** update only claims that are contradicted. Label
  `SPEC.md` as historical/initial design, not current status.
- **Source of truth:** code and tests for implementation status;
  `ARCHITECTURE.md` for decisions; README for current usage; `SPEC.md` for
  intent and history.
- **Files involved:** `docs/pi-brain/ARCHITECTURE.md`,
  `docs/pi-brain/README.md`, `docs/pi-brain/SPEC.md`,
  `src/pi/pi-agent-runner.ts`.
- **Risks:** none technical; the risk is turning the documentation into a
  changelog again. Keep it concise.

### F6 — The repository contains a scoped directive incompatible with its stack

- **Status:** `missing`
- **Evidence:** `.agents/AGENTS.md` requires Pint, PHPStan, and
  `php artisan boost:update`, but this branch is a Node/TypeScript package and
  does not contain the corresponding Laravel stack.
- **Why it matters:** an agent editing skills under `.agents/` may receive
  instructions it cannot execute or update nonexistent memory files.
- **Smallest change:** replace that file with directives genuinely scoped to
  skill maintenance, or remove it if it no longer serves a purpose.
- **Source of truth:** a root `AGENTS.md`, if present, for repository policy;
  `.agents/AGENTS.md` only for rules specific to the skills tree.
- **Files involved:** `.agents/AGENTS.md`.
- **Risks:** first check whether the file is still used on `main`/OpenCode; do
  not delete it blindly.

### F7 — The lesson lifecycle has a small admission-rule contradiction

- **Status:** `partial`
- **Evidence:** the feature skill says to add a lesson for any
  bug, pattern, or gotcha. The template instead excludes typos, one-off issues,
  and problems already caught by tooling.
- **Why it matters:** the more permissive rule fuels exactly the growth the
  gardener must later prune.
- **Smallest change:** make the feature skill defer to the template's admission
  rule: only non-obvious, project-specific, reusable information that is not
  already encoded.
- **Source of truth:** `templates/.ai/memory/lessons.md` for admission and
  format; the gardener for maintenance.
- **Files involved:** `.agents/skills/feature/SKILL.md`, perhaps with an update
  to the template examples.
- **Risks:** criteria that are too strict could lose useful context; when
  uncertain, a lesson can stay until the next gardening pass.

### F8 — Core invariants are already much stronger than prompts alone

- **Status:** `already covered`
- **Evidence:**
  - planner is read-only through an allowlist;
  - human approval is required and the spec is hash-frozen;
  - planner output structure is validated before writing;
  - developer has no shell;
  - verification runs before review, with separate retries;
  - reviewer is forced to be read-only even if configuration says otherwise;
  - reviewer result is validated;
  - blocking issues override an `approved` verdict, with round limits and
    no-progress detection;
  - unobservable submodule → escalation.
- **Why it matters:** these protections should not be replaced by longer
  prompts or new agents.
- **Recommended change:** none, apart from keeping the tests.
- **Risks of changing them:** more tokens, dependence on model discipline, and
  loss of fail-safe behavior.

### Classification of the main prompt-only rules

1. **Already mechanically enforced:** read-only planner/reviewer, developer
   without shell, spec freeze, planner/reviewer schemas, verify-before-review
   order, retry/round bounds, no-progress detection, submodule gate, one-writer
   lock, and workflow no-auto-commit.
2. **Prompt-only but acceptable:** keep changes focused, follow existing
   patterns, preserve language, use appropriate semantic granularity for
   tasks, ask only materially relevant questions, assign appropriate finding
   severity, and use no more than two planner batches.
3. **Convert to invariants:** ignore-rule changes that make evidence
   incomplete; a final gate for high-precision or configured sensitive
   surfaces. It is not useful to make every Markdown detail or exactly one
   `submit_review` an invariant: final-result validation already provides the
   substantial benefit.

## 3. Things I should NOT change

- Do not add an automatic security reviewer or review swarm. The existing
  reviewer is independent, structured, and bounded.
- Do not create a generic risk engine, an extended taxonomy, or LLM-based gate
  classification.
- Do not create new memory files, a lesson database, or a “knowledge promotion”
  workflow phase.
- Do not automatically promote a lesson into AGENTS, a skill, or an ADR.
- Do not add lint, a formatter, a build, or a dependency audit to CI without a
  concrete need.
- Do not change `resolveVerifyCommands()` to prefer `npm run check` globally:
  it is a resolver for heterogeneous repositories.
- Do not make every PRD/task-file detail rigidly validatable. Unique IDs and
  nonempty sections are sensible invariants; quality, granularity, and “WHAT
  over HOW” remain fuzzy judgments.
- Do not introduce worktrees, automatic rollback, or auto-commit to address
  risk: the one-writer lock, Git snapshots, and no-auto-commit are already a
  simple, solid solution.
- Do not replace the JSONL run log or resume logic: they are more robust than
  the generic proposal to “save state.”
- Do not load more context “for safety”: the context router already implements
  progressive, role-aware routing.

## 4. Inconsistencies / sources of truth

| Contract | Inconsistency | Recommended source of truth |
|---|---|---|
| Task ID | Skill uses `U*`; planner/parser use `T*` | `validateTaskList` + tests; document `T*` everywhere |
| Implementation status | ARCHITECTURE and comments say the pipeline/resume has not been tested | Code and tests; README as the current summary |
| Initial spec vs current behavior | `SPEC.md` retains one-by-one discovery and `U*` examples; implementation uses batches and `T*` | Code/prompts/tests for execution; label SPEC as historical design |
| Manual verification vs `/feature` | AGENTS template prefers the smallest targeted check; Pi runs configured full gates after each pass | AGENTS for manual/per-task work; `src/verify.ts` and `.pi/pi-brain.json` for the workflow |
| Current status | `progress.md` claims the “current phase,” while Pi uses the run log and `/flow status` | Run log for runtime phase; `progress.md` only for project snapshots and next steps |
| Lesson admission | Feature skill records almost every bug; template excludes one-off/tool-caught issues | Lessons template for admission; gardener for pruning/promotion |
| Read-only reviewer | Config field appears configurable, but code ignores `false` | Code as invariant; examples/config should clarify that it cannot be disabled |
| Security reviewer | Present in config and routing but not invoked by `/feature` | Remove or explicitly mark as reserved/future; do not present it as an active capability |
| Role policy | README cites `ROLE_POLICIES`; code uses `ROLE_CATEGORIES` | `src/skill-router.ts` |
| Rules under `.agents/` | Laravel directives in a Node repository | Repository root policy; scoped file only for skills |

## 5. Proposed implementation order

1. Add `npm run check` and CI that runs the same command.
2. Align the documentation contracts: `T*`, resume/runtime status,
   `ROLE_CATEGORIES`, and `.agents/AGENTS.md`.
3. Add a narrow risk gate: fail-safe handling of ignore rules, high-precision
   built-in surfaces, and configurable overrides.
4. Add `PROMOTE` to `lessons-gardener` and align the feature skill's admission
   rule.
5. Reassess risk-pattern false positives only after real use; do not expand the
   taxonomy preemptively.

## 6. First change

The first change to implement is the canonical verification command with CI.

### Expected behavior

- `npm run check` runs `npm run typecheck` and then `npm test`.
- CI uses Node 24, installs with `npm ci`, and runs only `npm run check`.
- The local pi-brain configuration uses `verify: ["npm run check"]`.
- The README presents `npm run check` as the complete repository health check;
  the two individual commands remain available for local diagnosis.
- No lint, build, or dependency audit is added.

### Acceptance criteria

- Exactly one command is documented as the full gate.
- `npm run check` fails if typecheck or any test fails.
- GitHub Actions runs exactly `npm run check`, without rebuilding the command
  list manually.
- `/feature` in this repository runs the same command through
  `.pi/pi-brain.json`.
- `src/verify.ts` remains unchanged for other repositories.
- `npm run check` passes locally before the change is declared complete.

