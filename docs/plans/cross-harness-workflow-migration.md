# Cross-harness skill and workflow centralization plan

Inventory date: 2026-10-19. Reconciled: 2026-10-22, against `cdf54f3`. Current status (2026-10-31): M1 is committed as `6567873`; M2 is committed as `06039e9`; M3 installed the global catalog and verified discovery/invocation in Codex, OpenCode, and Pi in temporary projects. M3 remains open for the limits recorded in §5 and the progress log. M4 has started: the first wave (agent-brains self-alignment, both `_tests` boilerplates, and the first-wave consumer pilot) is reviewed and committed (2026-11-01); all other consumers are untouched — the per-project inventory rows are maintained in `PERSONAL_PROJECTS.local.md`, anchored to the 2026-10-19 observations unless annotated there.

The plan was moved from a workspace-root file (`AI-WORKFLOW-MIGRATION.md`) into the agent-brains repository. The [roadmap](pi-plugin-adoption-roadmap.md#cross-harness-workflow-migration-m) governs priorities and coordination with other work; this document contains the shared checklist and aggregate status. Do not duplicate the checklists in the roadmap. The detailed per-project inventory — repository names, paths relative to the `dev` directory, and per-project status — lives in the Git-excluded `PERSONAL_PROJECTS.local.md`, not in this document.

This document coordinates work across repositories and the Mac configuration. Creating it does not modify skills, projects, or global configuration. Check off tasks only after implementing and verifying them in the relevant scope.

### Relationship to the October 22 changes

The changes in `af37cf6`, `201ba14`, `cc05d97`, and `cdf54f3` do not change the migration goal. They are part of the baseline to preserve, not migration work to repeat:

- C1/C2 are complete on the roadmap; do not reopen TDD consolidation or verdict policy as new tasks in this plan.
- The future `spec-and-tasks` skill must retain the observable criteria and proportionate checks introduced in `feature`: state/input, event, result, invariants when relevant, and reuse of adequate coverage.
- Preserve the distinction between observed red/green with command access and deferred verification by the Pi developer without shell access. The orchestrator runs checks; the agent does not claim outcomes it did not observe.
- `tdd`, `test-master`, and `verification-before-completion` are locally managed: preserve provenance, licenses, and protections against reinstall or upstream updates. The spec/implementation/review split must retain the new questions about the contract, source of the expected result, and plausible regression.
- The new OpenCode adapter and `solution-capture` workflow link complete the current system. `tests/repo.test.ts` now checks the README table, pointers, and links: migrate documentation, adapters, and tests together when the distribution model changes.
- Preserve the `setup.sh` fixes for `.gitignore` newlines, Pi runtime exclusions, and the OpenCode-only mode warning. The new installer must retain these safeguards where they still apply.
- Keep `needs_human` for `changes_requested` without blocking issues, with no further fix round; reviews approved with warnings only may complete.
- C4 measures context and costs before optimization; record a baseline coordinated with C4 before exposing the full catalog globally. C5 owns the skill usefulness/overlap assessment: this plan does not authorize independent removals.

At the October 22 reconciliation, global centralization, the `feature` rename, and consumer migration were not implemented in the commits examined. Later M1 work is recorded in the checklist and progress log below.

## 1. Goal and shared decisions

- `agent-brains` remains the single source for shared skills and procedures, independent of the harness.
- Pi loads the local `agent-brains` package globally; Codex and OpenCode access the shared global catalog.
- Projects do not need new skill links individually.
- Each project keeps its own documents and status in `.ai/`, with stable rules in `AGENTS.md`.
- The skill currently called `feature` becomes `spec-and-tasks`: brainstorming, requirements clarification, specification, and tasks. It does not implement or review code.
- Implementation moves to a dedicated agent/session, and review to another agent/session. Handoff automation depends on the harness.
- Pi `/feature` remains the programmed orchestrator command. Pi `/skill:spec-and-tasks` invokes the shared documentation procedure instead.
- Proposed convention for new work: `.ai/features/<slug>/spec.md` and `tasks.md`. Keep historical `prd-<slug>.md` / `tasks-<slug>.md` documents readable.

## 2. Inspection findings and limits

- The `agent-brains/.agents/skills` catalog contains 64 skill directories, each with a `SKILL.md`.
- Existing projects expose different selections through per-skill links: for example, the four largest consumers expose between 33 and 44 links each (exact per-project counts in `PERSONAL_PROJECTS.local.md`). These are not complete catalogs.
- The scan of AI configuration links, limited to the depth examined, found no broken destinations. This does not prove that the harnesses load them correctly.
- `~/.agents/skills` contains `diagnose`, `find-skills`, and `i-have-adhd`; it does not expose the agent-brains catalog.
- `~/.config/opencode/skills` also contains `react-doctor`; check for duplicates before migration.
- `~/.pi/agent/settings.json` already registers the local `../../dev/agent-brains` package, and the path resolves correctly. The manifest exposes extensions and skills. Loading in a Pi session was not tested during this inventory.
- Five skill manifests contain local references to `.agents/skills/`: `context-audit`, `feature`, `nextjs`, `astro`, and `laravel`. Extend the search to references, scripts, and templates during implementation.
- Adapters in `.opencode/agents/*.md` point to `.agents/workflows/*.md` in the project. Making them global without correcting them would leave a local dependency.
- The `.ai` inspection checked structure, names, and references in the rules; it did not verify every document's accuracy against the code.
- A file's absence from the proposed core is not automatically a defect: assess the project's needs and activity before creating it.

## 3. Execution order

1. Fix portability and separation of responsibilities in agent-brains.
2. Prepare global installation, inventory, verification, and rollback.
3. Configure the Mac while preserving existing content and configuration.
4. Try all three harnesses in a pilot project with no dependencies on the old links.
5. Align and migrate each project separately, starting with the boilerplates.
6. Remove historical adapters only after verifying that no active workflow needs them.

Do not start by bulk-removing `.agents` or `.opencode` directories.

## 4. Work in agent-brains

### A. Portable catalog

- [x] Inventory skills, declared names, licenses, provenance, dependencies, profiles, and metadata for the different harnesses. (M2 read-only snapshot: Codex CLI 0.166.0, OpenCode 2.2.4, Pi 0.85.1. M3 rechecked and found OpenCode 2.2.5. No credentials or secret values were read or reported. Both OpenCode versions support global `~/.agents/skills` discovery, on-demand skills, and global Markdown commands; skill metadata does not create slash commands.)
- [x] Fix cross-skill references: use paths discovered by the harness or a documented resolution from the catalog; do not assume `.agents/skills` exists in the current project. (2026-10-30: `spec-and-tasks`, `laravel`, `nextjs`, `astro`, and `context-audit` now reference skills by name and resolve files relative to the skill itself; checked by `tests/repo.test.ts`.)
- [x] Explicitly distinguish paths relative to a skill from paths relative to the project root. (2026-10-30: "Skill and path references" section in `spec-and-tasks`; `.ai/...` remains relative to the root of the project being worked on.)
- [x] Search all manifests, references, scripts, templates, operational documents, and tests for obsolete references, including `.agents/skills/designer.md` and `.agents/workflows`. (2026-10-30: full sweep; remaining references are distribution mechanics or historical documents. The `EXCLUDED_PATHS` constant in `context-audit.mjs` is a scan exclusion, not an instruction.)
- [x] Update together the structural tests introduced by `af37cf6`: replace expectations about the old layout with guarantees for the new system without removing workflow integrity checks. (2026-10-30: added checks in `tests/repo.test.ts` for resolved sibling references, `name:` == directory, and `.agents/workflows` link integrity; README table and profiles remain covered.)
- [x] Verify dependency names and that invoked skills exist. (2026-10-30: tests cover profiles → real skills, skills required by the router, and existing sibling references.)
- [x] Keep `.ai/...` paths relative to the project being worked on. (2026-10-30: convention documented in the skills.)
- [ ] Verify behavior when the harness starts from a subdirectory. (Pending: requires real sessions on each harness — M3/M4. Documented convention does not replace this verification.)
- [x] Preserve local-management metadata, licenses, and local patches during upstream updates. (2026-10-30: no upstream update performed; `code-review` was adopted with `management: local`, provenance, and an MIT LICENSE before M1 changes, then removed from `skills-lock.json`; test guards are active.)
- [x] Separate generic skills from output generated for a project: Laravel Boost's package/version-specific output must stay in the consuming project's real `.agents/skills`; do not run Boost through project or global links into the canonical catalog. Only manually reviewed generic guidance may be promoted into the shared Laravel skill. README and Pi guide updated.

### B. Separate specification, implementation, and review

- [x] Rename the `feature` skill to `spec-and-tasks`: directory, `name`, description, UI metadata, references, profiles, and adapters. Do not automatically rename the Pi `/feature` command. (2026-10-30: directory, SKILL.md, unchanged `agents/openai.yaml`, `.agents/workflows/` symlink, `.opencode/agents/` pointer, `common.list`, `skill-router.ts`, README, and tests.)
- [x] Limit the skill to repository exploration, brainstorming, decisions, acceptance criteria, and document creation. (2026-10-30: SKILL.md rewritten as planning-only, with a HARD GATE against implementation code and an explicit final handoff.)
- [x] Define the `spec.md` contract: goal, behavior, boundaries, constraints, edge cases, decisions, verifiable criteria, and remaining assumptions. (2026-10-30: in the skill and `templates/.ai/features/_TEMPLATE.md`.)
- [x] Preserve C2 guidance on observable scenarios and proportionate checks in the new documentation skill; leave test execution and evaluation to their respective roles. (2026-10-30: observable criteria and proportionate checks are in the spec/tasks contract; execution ownership is explicit — the Pi developer without shell access hands execution to the orchestrator.)
- [x] Define the `tasks.md` contract: stable IDs, concrete tasks, dependencies, affected areas/files when known, checks, and status. Avoid prescriptive pseudocode and invented details.
- [x] End with approved documents and a handoff; the planning skill must not implicitly start implementation.
- [x] Read and harmonize `grilling`, `grill-with-docs`, `to-spec`, and `to-tickets` to avoid competing procedures for the same outputs. (2026-10-30: division documented in the README and `grill-with-docs`; no skills removed or merged; `grilling`/`to-tickets` remain lock-managed and untouched; `to-spec` was adopted locally in the correction round to guard existing specs.)
- [x] Resolve the current conflict between `grilling`'s batched-question interview and `grill-with-docs`' single-question/checkpoint interview. The latter also described the former's behavior inaccurately. (2026-10-30: `grill-with-docs` now describes `grilling` as a batched interview with a frontier — its current behavior — and distinguishes itself as the single-question checkpoint variant.)
- [x] Choose and document which procedure to use for ordinary brainstorming and document stress tests; avoid duplicate interviews and approvals for the same decision. (2026-10-30: `grilling` for ordinary stress tests without artifacts; `grill-with-docs` for documented stress tests; `spec-and-tasks` for feature planning; test `grill-with-docs` only before the approval gate.)
- [x] Do not require small fixes or maintenance to go through a new spec. (Fast path in the skill; AGENTS template updated.)
- [x] Review the `laravel`, `nextjs`, and `astro` implementation skills: they consume approved documents and do not repeat discovery. Also define the path for generic stacks. (2026-10-30: Specification Detection recognizes `spec.md`+`tasks.md` and historical `prd-`/`tasks-` names; the generic path is defined in the README and skill handoff.)
- [x] Review `code-review`: spec/task/diff inputs, criteria checks, prioritized findings, and separation of review from fixes. (2026-10-30: spec sources extended to new documents, task coverage and acceptance criteria added, findings made verifiable, and the "review is not fixing" section added.)
- [x] Preserve C2 guidance already present in the Pi reviewer; move any relevant parts into shared review without adding another mandatory reviewer. (2026-10-30: Pi reviewer prompt unchanged; the three C2 questions were moved into `code-review` as shared guidance.)
- [x] Document manual handoffs between sessions and harness-specific delegation options without promising unimplemented automation. (2026-10-30: the skill handoff and README describe fresh sessions for implementation and review; no automation is promised.)

### C. Pi engine compatibility

- [x] Preserve `/feature`, `/flow`, `/stack`, and the package's global configuration. (2026-10-30: no changes to `extensions/pi-brain.ts`, `src/workflows/`, or `src/run-launcher.ts`; suite 449/449.)
- [x] Check whether the planner, context router, skill router, replay/resume, and log depend on the `feature` name or document names. Do not confuse the workflow name with the skill name. (2026-10-30: the `/feature` workflow and `<!-- pi-brain:feature -->` marker belong to the runtime and remain; only the skill name changed in `skill-router.ts`.)
- [x] Update profiles and role policies for the skill rename without accidentally removing instructions needed by the planner/developer/reviewer. (2026-10-30: `common.list` and `skill-router.ts` renamed; `full.list` includes it through `@include`; role policies unchanged.)
- [x] Align the Pi planner with the spec/task contracts where possible; if it still produces historical names, document and preserve compatibility before changing formats. (2026-10-30: the planner still produces `prd-<slug>.md`/`tasks-<slug>.md`; compatibility documented in the README and skill; format change deferred and outside M1.)
- [x] Preserve readability of interrupted runs and existing documents; do not bulk-rename artifacts needed for resume. (2026-10-30: no artifacts renamed; `tests/resume.test.ts` and `tests/feature-workflow.test.ts` pass.)
- [x] Verify that the developer receives approved documents and the reviewer receives requirements and diff, with checks and roles separated as the engine expects. (2026-10-30: behavior unchanged and covered by existing `feature-workflow` tests; no engine changes.)
- [x] Preserve and verify C1's inconsistent-verdict policy during any workflow or review changes; do not rewrite it as part of the rename. (2026-10-30: policy and tests unchanged.)

### D. Global installation and maintenance

- [x] Introduce a global installation operation separate from project scaffolding, with preview, conflict detection, and rollback. `install-global-skills.sh` previews by default; `--apply`, `--doctor`, and `--rollback` are explicit operations.
- [x] Expose the canonical catalog to `~/.agents/skills` while preserving existing personal skills. Implementation uses direct per-skill symlinks rather than a whole-directory link: the inventory found an existing personal catalog, and individual links preserve names and contents while allowing conflicts to be skipped. M3 applied and verified this layout in live CLI sessions; see §5.
- [x] Coordinate with C4 on a baseline of the discovered catalog before the change and a comparison afterward; any skill merges/removals remain reasoned C5 decisions. No C4 efficacy/cost experiment was repeated. Pre-install doctor and Codex session, plus post-install doctor and all three CLI sessions, are recorded in §5; OpenCode/Pi pre-install state is static inventory only.
- [x] Verify skill discovery and invocation in installed Codex/OpenCode/Pi CLI sessions. New and resumed sessions loaded the skill from the global catalog without project-local links; GUI/TUI refresh with an already-running session remains open in §5.
- [x] Prepare a global OpenCode command adapter without linking the repository's `.opencode` directory. One standalone Markdown adapter is installed at `~/.config/opencode/commands/spec-and-tasks.md` by the explicit installer; M3 verified `/spec-and-tasks` in a live OpenCode CLI session.
- [x] Use a minimal global adapter for `/spec-and-tasks`: OpenCode 2.2.5 discovers skills by ID and does not use skill metadata as command metadata.
- [x] Keep profiles for role/stack selection in the Pi engine; Pi runtime/profile files were not changed. Legacy project-local profile links remain available during migration.
- [x] Retain `setup.sh`/`unlink.sh` as project-local compatibility commands and document that unlink does not remove global links; global rollback is `install-global-skills.sh --rollback`.
- [x] Clarify installer names and responsibilities: `install-global-skills.sh` is global preview/apply/diagnose/rollback; the former upstream package downloader is `update-upstream-skills.sh`. `--update-upstream` remains an explicit compatibility route.
- [x] Update the README and Pi guide with global paths, invocation, updates, diagnosis, limits, and rollback.
- [x] Add `--doctor` diagnostics for catalog `SKILL.md` names, profile includes/entries, duplicate skill names, managed links/manifest, and OpenCode command-path conflicts. Diagnostics report only structural/configuration checks; they do not assert live harness discovery.

### E. Templates and scaffold

- [x] Update `templates/AGENTS.md`, `templates/.ai`, `scaffold.sh`, and the local tracker according to the plan's conventions. (2026-10-30, for M1: `spec-and-tasks` directive in `templates/AGENTS.md`; `templates/.ai/features/_TEMPLATE.md` rewritten with the `spec.md`+`tasks.md` contracts. `scaffold.sh` unchanged: `copy_if_missing` is already idempotent and conservative.)
- [x] Do not require every project to create every context document; distinguish the minimum core from area-specific documents. (2026-10-31: satisfied by §6 — the core is a target for active projects, not a placeholder requirement, and extensions are kept "when useful".)
- [x] Make scaffolding idempotent and conservative: add only required, missing files without overwriting content. (2026-10-31: verified `scaffold.sh` `copy_if_missing` skips existing files and never overwrites; unchanged since M1 noted it.)
- [x] Ensure UI rules do not require reading a missing or empty `DESIGN_SYSTEM.md`. (2026-10-31: canonical template route made conditional on the file being present and filled; the scaffold still ships the template. Consumer precedent applied in the first-wave consumer pilot — its AGENTS.md no longer mandates the absent file. Existing consumers are checked during their own M4 migration.)
- [x] Align agent-brains' own `.ai` as well: it currently lacks `context/TECH_STACK.md`; add it if required by the new rules. (2026-10-31: `.ai/context/TECH_STACK.md` added, verified against `package.json`/`tsconfig.json`/installed toolchain; root `AGENTS.md` created; M4 first wave.)

## 5. Machine configuration (M3)

- [x] Inventory relevant Codex, OpenCode, and Pi configuration without including credentials or sensitive values in reports. The installed versions are Codex 0.166.0, OpenCode 2.2.5, and Pi 0.85.1. Codex has no skill/exclusion setting; OpenCode's global config has no skill, permission, or agent override. Pi's existing global `agent-brains` package registration remains unchanged. Codex CLI wrote temporary model/trust settings while running the live checks; these were restored from the protected pre-task backup, and the final Codex config compares byte-for-byte with that backup. OpenCode and Pi settings also remain byte-identical to their copies.
- [x] Record the pre-install baseline without reopening C4 experiments. Before applying the installer, `--doctor` found 64 valid catalog entries, no manifest, the OpenCode `react-doctor` duplicate, and the two Pi-router references later resolved by adopting `find-skills` and `i-have-adhd`. A real pre-install Codex session reported `spec-and-tasks` was not discovered. OpenCode and Pi were not run as pre-install sessions; their baseline is the recorded static inventory/configuration only.
- [x] Save a recoverable copy before global changes in a private persistent `<backup-directory>` (mode 700); a temporary working copy was also used. It contains copies of the three personal skill directories, the old OpenCode `react-doctor`, and Codex/OpenCode/Pi config files; no sessions or authentication files. The exact moved live skill directories are under `original-live/`.
- [x] Compare and resolve the personal skills. `find-skills` and `i-have-adhd` were adopted into the canonical catalog with upstream repository/path and MIT license recorded; their original live directories remain recoverable in the backup. The personal `diagnose` was left in place and backed up: the canonical catalog already has `diagnosing-bugs`, a locally adapted skill with a different name and material changes, while the personal copy has no independently verifiable license/import revision. No duplicate or unlicensed copy was added.
- [x] Compare `~/.config/opencode/skills/react-doctor` with the canonical version. The live copy was v1.0.0; the canonical copy is v1.2.0 and includes `references/explain.md`. The old copy and its `AGENTS.md` were preserved in the private backup and moved out of OpenCode discovery; the catalog version is now linked globally.
- [x] Apply the reviewed installer after a clean preview. It created links for 66 catalog skills and the standalone OpenCode command (67 links total); the post-install `--doctor` reported 66 valid catalog entries and no structural issues.
- [x] Check harness configuration for discovery exclusions. No Codex skill/exclusion setting or OpenCode skill/permission/agent override was present. The installed OpenCode `/spec-and-tasks` command was invoked successfully.
- [x] Keep the existing global Pi package registration; it was not reinstalled. `/skill:spec-and-tasks` loaded from the shared global catalog in Pi 0.85.1.
- [x] Check content refresh in new and resumed persistent CLI sessions. After changing a temporary marker in the central skill, new and resumed logical sessions in Codex, OpenCode, and Pi each returned the new marker when the skill was explicitly invoked again. No installer rerun was needed; resumed sessions ran in new CLI process invocations.
- [ ] Determine whether an already-running GUI/TUI session must reload or restart to see changed skill contents. These M3 checks controlled CLI sessions, not an interactive UI left open during the update.
- [x] Document link rollback separately from restoration of moved personal content and installation on another machine in the [README](../../README.md#global-skill-distribution).

agent-brains remains the source of the content. The global link is a local access point, not a move of the source into a harness. Remote environments or containers will need an equivalent installation in their filesystem.

## 6. Common project structure

```text
AGENTS.md                         # stable policies and context routing
.ai/
  context/
    TECH_STACK.md                 # stack verified against the project
  agents/
    issue-tracker.md              # work-document convention
  features/
    <slug>/
      spec.md
      tasks.md
  memory/
    progress.md                   # status, current task, and blockers
    lessons.md                    # concrete, reusable lessons
```

The core is a target for active projects, not a requirement to create placeholders in inactive repositories. `AGENTS.md` must describe files that actually exist.

Keep these extensions when useful: `context/PROJECT.md`, product `PRD.md`, `APP_FLOW.md`, `GLOSSARY.md`, `DESIGN_SYSTEM.md`, API contracts, DB schema, `adr/`, `memory/solutions/`, `knowledge/`, `inbox/`, `research/`, and `reviews/`. A common structure does not require identical content.

Distinguish the product-wide PRD from a feature spec. Preserve any local language conventions: for example, one consumer requires AI documentation in English while another requires it in Italian.

### Checklist for each migrated repository

- [ ] Read applicable instructions and git status; inventory `.ai`, `.agents`, `.opencode`, `.pi`, configuration, and local content.
- [ ] Check the accuracy of essential context against the code; classify documents as active, historical, or redundant.
- [ ] Fix references to missing files, old paths, and old `feature` semantics.
- [ ] Update `AGENTS.md`, the local tracker, and any `.ai/agents/agent-brains.md` without duplicating global documentation.
- [ ] Handle historical PRD/task prompts: adopt useful content and archive only what has been replaced, after updating references.
- [ ] Keep historical documents readable; use `spec.md`/`tasks.md` for new work without bulk-renaming existing files.
- [ ] Verify global skill access before removing local links managed by agent-brains.
- [ ] Preserve local and third-party skills, agents, plugins, and files; remove directories only when empty.
- [ ] Check any Pi configuration and preserve overrides; exclude local locks and runs from new commits.
- [ ] Record the migration result, checks performed, and limitations. Use a separate Conventional Commit in English for each repository.

## 7. Tasks by project

The following tasks add to the common checklist. “Core present” means that TECH_STACK, progress, lessons, and issue-tracker were found; it does not certify that their content is accurate.

- [x] `agent-brains` self-alignment — section 4 applied to its own rules and `.ai` (2026-10-31).
- [x] First M4 wave, reviewed and committed (2026-11-01): the two `_tests` boilerplates and one consumer pilot, migrated per the §6 checklist; in each, the dangling `.agents/skills/feature` managed link was replaced by `spec-and-tasks`. The pilot's validation pattern is recorded in §11.
- [ ] All remaining inventoried consumers are pending. M4 migrates per repository — never bulk-edit consumer `.ai`/`.agents` content from here. Per-project names, paths relative to `dev/`, observed situations, and specific actions are maintained in `PERSONAL_PROJECTS.local.md`, anchored to the 2026-10-19 inventory unless annotated there.

Search separately for other subdirectories and nested repositories not found in the inventory before declaring the migration of the entire `dev` directory complete. Do not automatically include archives or application data among the projects to migrate.

> **Inventory refresh 2026-10-31 (read-only, first M4 step).** All inventoried
> consumer paths exist at `dev/` root with exact ASCII names, and the
> nested-repo scan found no repository outside the known list plus
> `agent-brains`. Every profile-linked consumer still had a dangling
> `.agents/skills/feature → …/skills/feature` symlink (the M1 rename removed
> the target); replace it with a managed `spec-and-tasks` link during each
> repository's own migration after checking the link resolves inside
> agent-brains. Do not bulk-fix across consumers in one pass. Per-repository
> git activity and `.ai`-state deltas from the 2026-10-19 inventory are
> recorded in `PERSONAL_PROJECTS.local.md`.

## 8. Verification and completion criteria

- [x] In a temporary project with no local links, Codex finds and loads `$spec-and-tasks` from the central catalog.
- [x] OpenCode discovers the same skill; `/spec-and-tasks` is exposed by the standalone command adapter and was invoked in a real session.
- [x] Pi finds `/skill:spec-and-tasks` from the global catalog. Existing `/feature`, `/flow`, and `/stack` package registration was left unchanged; those workflows were not reinstalled or retested here.
- [x] The documentation skill creates specs and tasks in the temporary project's `.ai` and does not modify application code in all three harness runs.
- [x] Skill discovery works without `.agents` in the temporary project and from `src/nested`; output files were written at the Git repository root.
- [ ] Handoff to a new implementation session works by reading the documents, without reconstructing the previous conversation.
- [ ] A separate review compares the requirements and diff and returns verifiable findings.
- [ ] Pi remains compatible with existing runs; any full implementation trials happen in a test repository, not an active project merely to verify loading.
- [x] Catalog changes were read in new and resumed persistent CLI sessions after explicit skill invocation, without rerunning project setup or the installer.
- [ ] Check whether a GUI/TUI left running must reload or restart before it sees an updated skill.
- [ ] Run meaningful tests for the engine and modified scripts, including `npm test` and `npm run typecheck` when changing Pi code. Do not run full application suites for documentation-only changes with no executable effects.
- [ ] No local or third-party content was lost; rollback for global installation is documented and verified.

> **Status 2026-10-31 (M3):** discovery, invocation, root-path behavior, and
> content refresh were verified in real CLI sessions after global installation.
> Codex's pre-install session reported the skill was not discovered. The three
> harnesses made different assumptions about whether literal `OK` includes a
> trailing newline, and Pi made one unsupported claim that prior planning files
> existed; the observed outputs are recorded without treating their content as
> equivalent. GUI/TUI behavior was not tested. Handoff, independent review, and
> consumer migration remain outside the completed M3 pilot.

## 9. References

- Codex: https://learn.chatgpt.com/docs/build-skills — global discovery in `~/.agents/skills`, links, invocation, and metadata.
- OpenCode: https://opencode.ai/docs/skills/ — global discovery, permissions, and slash-command metadata; check the installed version.
- Local Pi: `agent-brains/node_modules/@earendil-works/pi-coding-agent/docs/skills.md` and `docs/packages.md` — local packages and `/skill:<name>`.
- Current implementation: `agent-brains/package.json`, `extensions/pi-brain.ts`, `src/pi/`, `src/workflows/`, `docs/pi-brain/README.md`.
- [Coordination roadmap](pi-plugin-adoption-roadmap.md#cross-harness-workflow-migration-m) and [C1–C5 consolidation](pi-plugin-adoption-roadmap.md#agreed-consolidation-sequence-2026-10-22).
- [C2 assessment](../evals/tdd-review/C2-2026-10-22.md): evidence and limits of the completed TDD/review consolidation.

## 10. Progress log

| Date | Scope | Completed change | Verification | Limitations / next step |
|---|---|---|---|---|
| 2026-10-19 | Plan | Created the inventory and cross-project plan | Read-only inspection of relevant structures, configuration, and skills | Implementation not started; harness configuration not tested in sessions |
| 2026-10-22 | Documentation | Moved the plan into the repository and linked it to the roadmap; incorporated safeguards from commits through `cdf54f3` | Compared commits and checked documentation links | Documentation only; migration and Mac configuration not started |
| 2026-10-30 | M1 in agent-brains | Renamed the `feature` skill to `spec-and-tasks` (planning-only, `spec.md`/`tasks.md` contracts, final handoff); made cross-skill references portable in `spec-and-tasks`/`laravel`/`nextjs`/`astro`/`context-audit`; adopted `code-review` locally with spec/task/diff inputs and review≠fix; harmonized `grill-with-docs`; updated profiles, router, adapters, templates, and README; Pi `/feature`, `/flow`, resume, and historical artifacts unchanged | `npm test` 449/449 (4 new structural tests in `tests/repo.test.ts`), `npm run typecheck`, `git diff --check` | Files only, not real sessions: discovery/invocation on Codex/OpenCode/Pi NOT verified (M3/M4); subdirectory use not tested; Laravel Boost separation not addressed; consumers with a `feature` symlink remain pending until `setup.sh` is rerun (M4); diff uncommitted, awaiting review |
| 2026-10-30 | M1 — review round 1 corrections | Independent review: 4 P2 findings, all corrected. (1) `setup/SKILL.md` had reverted to the old `feature` reference after an accidental revert during checks — reapplied with the Pi `/feature` distinction. (2) `to-spec` adopted locally (LICENSE + upstream provenance `5c89081d`, removed from the lock) with a guard against silently overwriting an existing `spec.md`; an approved planning document is updated in place only on request, preserving its own contract. (3) Skill-relative paths now require resolving symlinks to the skill's real directory first (skills are also loaded through `.agents/workflows/<name>.md` links); a test checks resolution from the real directory. (4) The "subdirectory" item was split: convention documented [x], behavior verified [ ]. | `npm test` 450/450, `npm run typecheck`, `git diff --check`; reviewer manual check confirmed (workflow link → destination not found when resolving from link path; resolved from physical directory) | Superseded the same day by M1 approval and commit `6567873`; no live harness verification |
| 2026-10-30 | M2 global distribution preparation | Added default-preview global installer, per-skill conflict-safe links, install manifest and conservative rollback; standalone OpenCode command adapter; doctor checks; renamed old upstream downloader and retained explicit compatibility route; updated setup/unlink responsibilities, Laravel Boost separation, README and Pi guide. No global installation or consumer migration. Review fixes: retain the rollback journal through manifest rename, refuse symlinked rollback parents, validate the full manifest before mutation, and define the home error helper before use. | Ten isolated fixture tests pass; `npm test` 460/460; `npm run typecheck`; `bash -n` for all four modified shell scripts; `git diff --check`. Read-only real-home `--doctor`: 64 catalog entries valid; detected existing OpenCode `react-doctor` duplicate and two Pi-router skills absent from catalog; config values not read. | Live Codex/OpenCode/Pi discovery/invocation remains M3; consumer migration remains M4; work is uncommitted for independent review |
| 2026-10-31 | M2 doctor manifest validation | `doctor()` now validates the complete installer manifest before checking managed links, counts malformed manifests as an issue, and exits nonzero even when no other diagnostics fail. Added a minimal isolated repository fixture with no unrelated findings; observed it fail before the fix and pass afterward. No global configuration changed. | Installer fixtures 11/11; `npm test` 461/461; `npm run typecheck`; `bash -n` for all four relevant shell scripts; `git diff --check` | Live harness discovery remains M3; consumer migration remains M4; no commit created |
| 2026-10-31 | M3 machine install and live pilot | Backed up affected content/configuration privately; adopted licensed `find-skills` and `i-have-adhd`; retained the personal `diagnose` and the old OpenCode `react-doctor` copy in backup; applied 66 catalog skill links plus the OpenCode command; left Pi package registration unchanged. A temporary project with no local `.agents` ran from `src/nested`. | Pre-install Codex session: `spec-and-tasks` not discovered. Post-install: Codex `$spec-and-tasks`, OpenCode `/spec-and-tasks`, and Pi `/skill:spec-and-tasks` loaded and wrote only `.ai/features/m3-smoke/{spec,tasks}.md` at each project root. New and resumed persistent sessions in all three harnesses returned an updated temporary skill marker after explicit reinvocation; marker then removed and source restored byte-for-byte. Post-install `--doctor`: 66 valid skills, no structural issues. | No full C4 cost/efficacy experiment was repeated. OpenCode/Pi were not run as pre-install baseline sessions; their pre-install state is documented by inventory/doctor. Interactive GUI/TUI reload/restart behavior remains unverified, so M3 stays open. Existing Pi workflow commands, spec-to-implementation handoff, review, and all consumer migrations remain unverified/out of M3. |
| 2026-10-31 | M3 independent-review corrections | Added both adopted skills to `common.list` and `full.list`; updated the D checklist to reflect live CLI discovery and the still-open TUI refresh; copied the M3 backup to a persistent private path. | `tests/repo.test.ts` 11/11; `npm test` 461/461; `npm run typecheck`; post-change `--doctor` reports 66 valid skills and no issues; `git diff --check`; persistent backup matches the temporary copy byte-for-byte. | M3 remains open until refresh/restart behavior is checked in a GUI/TUI already running during content changes. The exact backup location is retained only in a local ignored note. |
| 2026-10-31 | M4 first wave (self-alignment + boilerplates + pilot) | Read-only inventory refresh of all §7 paths and nested repos (see the note under §7). agent-brains: root `AGENTS.md`, `.ai/context/TECH_STACK.md`, README tree. the Laravel `_tests` boilerplate: stub workflow renamed `spec-and-tasks.md` with the new document contracts, `_TEMPLATE.md` ×2, historical PRD prompts marked, `.ai/agents/agent-brains.md` + AGENTS note updated. the Next.js `_tests` boilerplate: fixed dangling `feature.md` workflow reference, same planning-contract alignment. the consumer pilot: consolidated duplicate agent-brains note inside the Boost block, UI/GLOSSARY routing made conditional on actually present files, same `.ai` updates. In all three consumers the dangling `.agents/skills/feature` managed link was replaced by `spec-and-tasks` (destination-checked). Pre-edit copies of every modified file are in the private persistent M4 backup. | Laravel boilerplate: Pest 76/76 (stub test updated red→green), Pint `--dirty` clean, PHPStan clean (memory-limit flag needed). Next.js boilerplate + pilot: link/reference existence checks, stale-reference grep, `git diff --check`; all 36/42/44 managed links resolve; Boost wrapper and its rules byte-unchanged outside the consolidated note; pilot validation pass before any extension. | Documentation/context only in consumers — no live harness session was run inside any consumer (M3 CLI evidence stands; per-consumer live discovery remains a prerequisite for removing managed links, which are all kept). Remaining inventoried consumers untouched; their per-project rows and annotations live in `PERSONAL_PROJECTS.local.md`. Uncommitted everywhere, awaiting review. M4 is not complete. |
| 2026-10-31 | M4 first-wave review corrections | Independent review: four findings, all corrected before approval. (1) Standards — the three consumers' AGENTS.md notes and `agent-brains.md` files no longer assume the global catalog: they state the `install-global-skills.sh --apply` prerequisite with the `setup.sh <profile>` alternative for fresh clones. (2) Spec — the Laravel stub `spec-and-tasks.md` conforms to the approved contract: `spec.md` and `tasks.md` prepared together, ONE joint approval, explicit handoff to a fresh implementation session (mirrors canonical Step 5). (3) Spec — both boilerplate READMEs migrated away from `/feature` / `feature.md` / PRD-only flow. (4) Spec — central status de-conflicted: stale `progress.md` "M4 has not started" line corrected; §4.E items 118–121 closed with evidence (`copy_if_missing` verified skip-only; canonical `templates/AGENTS.md` UI route now conditional on `DESIGN_SYSTEM.md` being present and filled); consumer changes staged for review. | Reviewer re-ran Pest 76/76 (non-fatal sandbox cache-write warning); link/reference checks and `git diff --check` clean in all four repositories; no live harness sessions. | M4 remains open: 19 consumers pending; managed-link removal requires per-consumer live discovery checks; M3 GUI/TUI refresh still open. |

| 2026-11-01 | M4 first-wave commits | Independent review corrections approved. Consumer commits: Laravel boilerplate `a2897f2`, Next.js boilerplate `6c597cd`, consumer pilot `3c0d0ec` (identity mapping in `PERSONAL_PROJECTS.local.md`). agent-brains self-alignment is committed with this record. | Diff checks passed; previous review verified consumer Pest 76/76. | Remaining consumers and live verification remain open; historical uncommitted notes above describe the review-time state. |

## 11. M4 consumer global-catalog pilot — 2026-11-01

**Outcome:** fresh CLI discovery and explicit loading passed in Codex 0.166.0,
OpenCode 2.2.5 and Pi 0.85.1, from both the repository root and `app/`, with
all 44 local shared-skill links absent. These are six new real CLI sessions,
not manual file-read simulations. Interactive GUI/TUI verification remains
open; commands below make that limit reproducible. This does not close M4 for
other consumers or M3's already-running GUI/TUI refresh check.

### Inventory and preservation

Both repositories started clean. A private persistent backup contains the
before-state Git output, categorized inventory, exact 44-link manifest,
original link objects, per-run commands/stdout/stderr/results, native Codex
invocation provenance and a conflict-safe `restore.zsh`. Its machine-local
location is recorded in the ignored `.ai/memory/m4-local.md` note.

- **Skills:** `.agents/skills/` was a real directory containing 44 per-skill
  symlinks, all resolving inside `agent-brains/.agents/skills/`. No real or
  personal skill files occupied it. Only these 44 links were moved out of the
  consumer into the private backup after the live checks. The directory stays.
- **Workflows:** `.agents/workflows` points to `agent-brains/.agents/workflows`;
  preserve it, including `spec-and-tasks.md`, because OpenCode agent adapters
  still reference it. It was not disabled during the skill-discovery tests.
- **Agents/adapters:** preserve `.opencode -> agent-brains/.opencode` in full:
  seven agent Markdown files, three legacy skill adapters, package files and
  `.gitignore`. Global skill installation does not replace these adapters.
- **Commands:** no project `.opencode/commands` directory exists. The global
  `~/.config/opencode/commands/spec-and-tasks.md` adapter remains available.
  An OpenCode slash command and an OpenCode agent are separate resources.
- **Configuration:** preserve real project `opencode.json` (Sail Boost MCP),
  `.ai`, AGENTS and historical plans. Project `.pi` and `.codex` are absent;
  none were created. Preserve global Pi package registrations, including
  agent-brains and the existing third-party package. No harness config changed.

### Codex diagnosis: discovery is not initial prompt exposure

`spec-and-tasks/agents/openai.yaml` contains
`policy.allow_implicit_invocation: false`. The current model-visible startup
catalog omits this explicit-only skill. This is not evidence that the native
scanner failed: `skills/list` with `forceReload: true` returned it enabled,
with **scope `user`**, from both launch directories, with no loading errors,
while there were **zero** local skill symlinks. No `skills.config` exclusion
was present in user config; project Codex config is absent.

Both `$spec-and-tasks` runs received the canonical skill body as an
harness-generated message with
`content_item_kinds: ["skills.selected_skill_instructions"]` and provenance
`type: skills`. No filesystem tools ran in either session. The model's final
answers called this user-supplied injection and reported the initial catalog
entry ABSENT; the transcript metadata establishes native explicit loading.
Do not turn that model interpretation into a false discovery failure. Equally,
do not claim the skill appeared in the initial model-visible catalog.

The [official skill documentation](https://learn.chatgpt.com/docs/build-skills)
distinguishes explicit invocation from implicit invocation and documents that
`allow_implicit_invocation: false` preserves explicit `$skill` invocation.
No central policy or skill content was changed to perform this diagnosis.

### Evidence by harness, without local skill links

| Harness | Root | `app/` | Native loading evidence |
|---|---|---|---|
| Codex 0.166.0 | Pass | Pass | `skills/list`: enabled user scope, no errors; `$spec-and-tasks` inserted `skills.selected_skill_instructions` in both transcripts. Initial model-visible catalog entry remains absent. |
| OpenCode 2.2.5 | Pass | Pass | Fresh standalone `/spec-and-tasks` sessions called `skill` with `id: spec-and-tasks`; returned skill content reports base `~/.agents/skills/spec-and-tasks`. Only the skill tool ran. |
| Pi 0.85.1 | Pass | Pass | `/skill:spec-and-tasks` expanded into a skill block whose location is `~/.agents/skills/spec-and-tasks/SKILL.md`; both sessions reported the native available-skills entry. Only `app/` additionally used `read` on that catalog path. |

All six exited 0 and reported the single joint spec/tasks approval and fresh
implementation-session handoff. No session drafted planning documents, asked
discovery questions, wrote application files, or launched `/feature`. Exit
codes alone were not used as proof: tool events and expansion provenance were
examined. Initial sandbox denials for Pi's trust lock and OpenCode's log were
resolved by approved execution against the real home configuration; they were
not counted as harness discovery failures.

The test runner restored all 44 original links byte-for-byte by link text
before evidence review. After the six successful CLI checks and the Codex
user-scope check, the same 44 destination-validated links were moved into the
persistent backup as the final state. **Removed from the consumer: 44 skill
links; removed workflow/agent/command/configuration links: zero.** Restoration
uses the exact per-link `rtk mv` operations in `restore.zsh`, rejects occupied
destinations and leaves third-party content alone. No commit or push was made.

### Open interactive checks and exact repetition procedure

These non-interactive CLI sessions do not prove interactive selector rendering,
GUI/TUI refresh, or behavior of a UI left running during an update. Leave those
checks open. With the current final state (no local shared-skill links), start
six new interactive processes, one per row; do not resume existing sessions.
Run every launch command below from the project root:

| CWD | Harness | Launch command |
|---|---|---|
| root | Codex | `rtk proxy codex -C . -s read-only` |
| `app/` | Codex | `rtk proxy codex -C app -s read-only` |
| root | OpenCode | `rtk proxy opencode --standalone .` |
| `app/` | OpenCode | `rtk proxy opencode --standalone app` |
| root | Pi | `rtk proxy pi --tools read,grep,find,ls` |
| `app/` | Pi | `rtk proxy sh -c 'cd app && exec pi --tools read,grep,find,ls'` |

In Codex inspect `/skills` or the `$` selector for `spec-and-tasks`, then send
`$spec-and-tasks` followed by the diagnostic below. In OpenCode send
`/spec-and-tasks` followed by it and inspect the actual `skill` tool result.
In Pi send `/skill:spec-and-tasks` followed by it and inspect the expanded
location. Use this diagnostic text in each new session:

> Diagnostic only. Do not start planning, ask questions, create documents,
> modify files, delegate, or run implementation commands. Report whether the
> native catalog exposes spec-and-tasks and its source; load it only by native
> explicit invocation, then report its name, ONE joint approval rule and
> fresh-session handoff rule. If absent, report ABSENT without filesystem
> search fallback. Stop immediately after reporting.

Success requires a native entry/selector or native expansion/tool event linked
to the global catalog, the expected rules and no write actions; a manual `cat`
is insufficient. Record harness version, CWD and actual events. Exit each UI
with Ctrl-C without proceeding to planning. On a genuine discovery/loading
failure, run the private `restore.zsh` and retain the failure evidence. No
central skill markers or content edits are needed. An already-running UI
refresh experiment is a separate M3 check and remains unperformed.

### Pilot review corrections — 2026-11-01

- **Standards P2:** all six new interactive launch commands use project-relative paths; run them from the project root. Machine-specific backup paths remain in the private note.
- **Spec P1:** the original rollback guard incorrectly relied on `set -e` after an AND-list. It was never executed against the live project. Replaced it with explicit `if`/`exit 1` checks, a preflight across all destinations before any move, and a repeated guard immediately before each `rtk mv -n`. The rejected script is retained privately as non-executable evidence.
- **Fresh verification:** the replacement script passed `zsh -n` and six isolated fixture scenarios: occupied file, directory, live symlink, dangling symlink, conflict at the last destination (no partial restore), and successful restoration of 44 links followed by an idempotent rerun. Each conflict exited 1 and left the entire fixture unchanged. The live restore was not run; all 44 backup links remain in place. No application code or central skill changed; interactive checks remain open.

### Global general workflows implementation — 2026-11-01 (partial CLI delivery, uncommitted)

Follows the approved [`.ai/features/global-workflows`](../../.ai/features/global-workflows/spec.md)
plan (T1–T6 executed; T7 interactive checks open, so AC8 and M3 remain open).
Machine delta applied after a reviewed preview: the seven OpenCode agent
adapters installed under `~/.config/opencode/agents/` by the extended
installer (RESULT: COMPLETE, doctor clean); skills, the planning command and
the Pi registration already existed and were left untouched (the
pre-existing registration is not owned and survives rollback). The pilot
kept its isolated final state: its two shared links (`.agents/workflows`,
`.opencode`) were removed with ownership proof, snapshot, conflict-tested
restore (occupied/dangling/last-entry-conflict abort with no partial
restore), live restore with inventory equality, and re-isolation. Doctor
clean after reapply; `opencode.json`, Boost content and `.ai` untouched.

Observed CLI evidence (diagnostic-only sessions, transcript metadata as
proof, pilot root and `app/`): Codex `$name` matrix 8/8 (W + code-review)
from the canonical catalog, zero filesystem commands; OpenCode seven agents
registered `mode: primary`, native skill-tool matrix 8/8 per CWD, each agent
firing its own skill id, `/spec-and-tasks` loading the skill from both CWDs;
Pi 16/16 `/skill:` expansions from the global catalog and `/stack`,
`/flow status` handled locally by the registered package from both CWDs.
Disposable-fixture boundaries held: planning reports one joint approval and
the fresh-session handoff; a workflow skill refuses to implement without an
approved plan; code-review reports findings and fixes nothing; a fixture
`/feature` run gated implementation (planner drafts only) and persisted
`agent.completed` + `workflow.failed` in the existing run schemas — with the
observed limit that Pi `-p` makes the extension ctx stale before an
interactive cancel can happen (U8 guards contained it). Observed precedence
contracts: OpenCode project scope shadows user scope for skills and commands;
Pi discovers project scope only under project trust (then project wins);
Codex user-scope `$name` injects natively while a same-name project skill
suppresses the injection (local overrides intentionally block the shared
route and are reported, never forced).

Proportionate checks at handoff: `rtk npm test` 472/472, `rtk npm run
typecheck` clean, `rtk proxy bash -n` for both changed shell scripts,
`rtk git diff --check` clean, no personal paths in changed public files.
No other consumer was touched; no commit or push was made.

Implementation review round 1 (2026-11-01) — corrected before commit: the
relocation recovery message now includes the stale-manifest archive step and
the full managed-link list, and a fixture walks the printed procedure to a
successful reinstallation (doctor clean); the OpenCode config root honors
`XDG_CONFIG_HOME` (verified against `opencode debug paths` on 2.2.5), is
reported, and nothing is silently installed into an unused location; `--apply`
now ends `RESULT: INCOMPLETE` when a managed source is obsolete (kept, never
auto-pruned); the AC5 claim was downgraded to partial — cancel and
interrupted-run resume are covered by the existing unit suite only, while
`/stack`, `/flow status` and the gate behavior are the live-observed parts.
Installer fixtures 23/23 after the corrections.
