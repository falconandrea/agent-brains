# 🤖 agent-brains

Centralized repository for AI agent configurations, skills, and project templates. Share cognitive abilities across projects and bootstrap AI-native context structures.

> **Pi workflow harness** — this repository is also a [Pi](https://pi.dev)
> package that orchestrates plan → develop → verify → independent review as a
> `/feature` workflow, reusing the same `.agents/skills/` and `profiles/*.list`.
> The harness is part of `main`; see [docs/pi-brain/README.md](docs/pi-brain/README.md).

Planned cross-harness centralization and project-context alignment are tracked
in the [adoption roadmap](docs/plans/pi-plugin-adoption-roadmap.md#cross-harness-workflow-migration-m)
and its [detailed migration plan](docs/plans/cross-harness-workflow-migration.md).
M1 (portable skill references, the `feature` → `spec-and-tasks` skill rename,
planning/implementation/review boundaries) and M2's global installer are
committed. M3 verified CLI discovery/invocation in Codex, OpenCode, and Pi;
refresh in an already-running GUI/TUI remains open. M4 has started: the first
wave (agent-brains self-alignment, both `_tests` boilerplates, and the
`linkedin-analytics` pilot) is reviewed and recorded in per-repository commits; the remaining
consumers are still pending.
Existing project-local setup stays available during that gradual rollout.

## Repository structure

```
├── AGENTS.md                 # Directives for working in this repository
├── .opencode/              # Project-local compatibility adapters
│   ├── agents/             #   Agent definitions (markdown)
│   └── skills/             #   Skill definitions (markdown)
│
├── .agents/                # → Canonical skill store (DO NOT edit per-project)
│   ├── workflows/          #   Workflow agent definitions (markdown)
│   └── skills/             #   Skills (managed by laravel-boost / npx skills / hand-written)
│
├── profiles/               # → Curated skill selections per tech stack
│   ├── common.list         #   Generic skills inherited by every profile
│   ├── frontend.list       #   All frontend skills (alias; includes common)
│   ├── frontend-core.list  #   Base UI and accessibility skills
│   ├── frontend-design.list  #   Design-system and visual-design skills
│   ├── frontend-motion.list  #   Animation and motion skills
│   ├── frontend-qa.list    #   Browser testing and performance skills
│   ├── laravel.list        #   Laravel profile (common + frontend core)
│   ├── nextjs.list         #   Next.js / React profile (core + design + QA)
│   ├── astro.list          #   Astro profile (core + design)
│   ├── nodejs.list         #   Generic Node.js backend profile (includes common, NO frontend)
│   ├── nodejs-ai-backend.list # Node.js/TypeScript backend with API, DB & security skills
│   └── full.list           #   Reference of "everything" (full is special-cased in setup.sh)
│
├── templates/              # → Copied to projects (project-specific context)
│   ├── AGENTS.md            #   Project-level agent guidance
│   └── .ai/
│       ├── agents/         #   issue-tracker.md (local tracker convention)
│       ├── context/        #   PRD, GLOSSARY, APP_FLOW, TECH_STACK, ROADMAP, DB schema
│       ├── features/       #   Feature tracking template
│       └── memory/         #   lessons.md, progress.md, solutions/_TEMPLATE.md
│
├── extra/                  # Optional/manual extras, not linked by profiles
│   └── skills/             # Tool-specific skills for manual use
│
├── adapters/opencode/      # Standalone global OpenCode command adapters
├── setup.sh                # Legacy project-local links (profile-aware)
├── scaffold.sh             # Copy .ai templates to a project
├── unlink.sh               # Remove project-local symlinks
└── install-global-skills.sh # Preview/apply/diagnose/rollback global links
```

## Documentation language

Write repository-authored documentation and maintenance comments in English.
Preserve verbatim user input, captured output, test fixtures, and language
examples when their original language is part of the evidence or behavior.

## Global skill distribution

`agent-brains` remains the canonical source. The installer creates individual
symlinks from the catalog into `~/.agents/skills`, which Codex and OpenCode
both discover. Per-skill links allow existing personal skills to stay in the
same directory and let name conflicts be skipped without replacing content.
The installer also checks OpenCode's higher-priority global skills directory
and skips a same-name collision there.
The installer also exposes only the standalone OpenCode `/spec-and-tasks`
command adapter under `~/.config/opencode/commands/`; it never links the whole
`.opencode` directory.

Use a stable checkout and review the read-only preview before applying:

```bash
./install-global-skills.sh                 # preview; no writes
./install-global-skills.sh --doctor         # catalog, manifests, links, duplicates, config paths
./install-global-skills.sh --apply          # explicit global installation
./install-global-skills.sh --doctor         # inspect the resulting state
./install-global-skills.sh --rollback       # remove only recorded unchanged links
```

`--apply` preserves existing files, directories and foreign symlinks at every
skill/command destination and reports conflicts, including a same-name skill
already defined in OpenCode's higher-priority global skill directory. It
records only links it created. Rollback removes a recorded path only while it
is still a symlink to the same canonical source; changed paths and personal
content remain. The manifest is stored at
`~/.agents/.agent-brains-global-manifest`. The catalog
is not copied or moved. A global install is a live link to this checkout, so
keep the checkout in a stable location and use `--doctor` after moving it.

### M3 CLI verification

The pilot tested Codex 0.166.0, OpenCode 2.2.5, and Pi 0.85.1. In a temporary
Git project without local skill links, sessions started from a subdirectory
found and invoked `spec-and-tasks`; OpenCode's `/spec-and-tasks` command and
Pi's `/skill:spec-and-tasks` also worked. All three wrote planning documents
under the project root without changing application code. New and resumed
persistent CLI sessions read catalog updates after explicit reinvocation; an
installer rerun was not needed. The generated specifications differed on
whether literal `OK` included a trailing newline, so the pilot verifies loading
and invocation, not equivalent planning output. Refresh in a GUI/TUI that stays
open during a content change remains unverified. See the
[migration plan](docs/plans/cross-harness-workflow-migration.md#5-machine-configuration-m3)
for the baseline, evidence, and limits.

### Restore personal content

Installer rollback and restoration of personal content are separate operations:

1. Run `./install-global-skills.sh --rollback`. It removes only unchanged links
   listed in the manifest, including the OpenCode command link.
2. Before moving personal content out of a global discovery directory, save a
   copy in a private, persistent `<backup-directory>` outside the repository.
   Include any existing skill folders or configuration files that may need
   restoration; keep that backup out of version control.
3. After rollback, copy each moved folder from `<backup-directory>` back to its
   original location. For example, restore skill folders to
   `~/.agents/skills/` and OpenCode-specific skills to
   `~/.config/opencode/skills/`. Link rollback does not restore moved content
   or other configuration files.

To install on another machine, clone this repository to a stable path, run the
preview and `--doctor`, review any name conflicts, then run `--apply` and
`--doctor` again. The installer covers Codex/OpenCode skills and the OpenCode
command. It does not register Pi packages: retain an existing `agent-brains`
Pi package registration, or follow the repository's Pi install instructions if
that package is absent. No consumer repository links are needed for the global
catalog.

Codex reads user skills from `~/.agents/skills`, follows symlinked skill
folders, and supports `$skill` invocation; the installed CLI is 0.166.0. See
[Codex skill documentation](https://developers.openai.com/codex/skills/).
OpenCode 2.2.5 uses global `SKILL.md` discovery and does not interpret skill
metadata as slash-command definitions. The standalone command adapter supplies
`/spec-and-tasks`; it invokes the skill by ID. See [OpenCode skills](https://docs.opencode.ai/docs/skills/)
and [OpenCode commands](https://dev.opencode.ai/docs/commands/). Codex,
OpenCode, and Pi discovery and invocation were verified in live CLI sessions in
M3; GUI/TUI refresh remains untested.

### Update responsibilities

- Edit local skills directly in this repository. `npx skills update <name>`
  remains limited to reviewed upstream-managed skills listed in
  `skills-lock.json`; local-managed skills are protected.
- `update-upstream-skills.sh` retains the former selected upstream download
  operation. The historical `install-global-skills.sh --update-upstream`
  option is a compatibility route; invoking `install-global-skills.sh` with no
  arguments now only previews the global distribution.
- Laravel Boost output depends on one Laravel project's installed packages and
  versions. Run `php artisan boost:update` in that project with its own real
  `.agents/skills` directory. Do not run it through project links into this
  repository or through global catalog links. Keep generated output project
  local; review and deliberately adapt only genuinely reusable guidance into
  the canonical `laravel` skill. The generic Laravel skill in this catalog is
  not a container for Boost-generated project rules.

## Project-local setup (migration compatibility)

### Link project-local adapters (legacy migration path)

```bash
# Link agents & skills with a PROFILE (curated subset per tech stack)
./setup.sh /path/to/your-project laravel     # or: nextjs | astro | nodejs | full

# Scaffold AGENTS.md and .ai context structure (copy — project-specific)
./scaffold.sh /path/to/your-project
```

Available profiles: `frontend`, `laravel`, `nextjs`, `astro`, `nodejs`, `nodejs-ai-backend`, `full` (all skills). Default (no arg) is `full`.
These profile links are retained for gradual migration; they do not define the
catalog available from a completed global install. Pi continues to use profiles
for role/stack selection.

### Link .opencode only (no .agents)

```bash
./setup.sh /path/to/your-project opencode   # link .opencode only (no .agents)
```

> **OpenCode-only warning.** The OpenCode agent pointers in
> `.opencode/agents/*.md` read `.agents/workflows/*.md`, which is **not** linked
> in this mode. `setup.sh` prints the same warning and the exact command to fix
> it: `./setup.sh /path/to/your-project full` (a curated profile such as
> `laravel`, `nextjs`, `astro` or `nodejs` works too).

### Existing project (with local configurations)

If your target project already has a physical `.agents` or `.opencode` directory (for example, skills generated by third-party tools like `laravel-boost` or custom configurations):

`setup.sh` never deletes local content. Real files/directories and symlinks it
does not own (anything not pointing into this repository) are preserved; a skill
whose path is occupied is skipped with a warning and not counted as installed.
To actually adopt existing local skills into the canonical store:

1. **Migrate existing skills/workflows**: Check if there are local configurations you want to preserve, and copy them to the corresponding folders in this repository first (e.g. to `.agents/skills/` in `agent-brains`).
2. Preserve the local content and run the link script only after checking its
   conflict report. Do not remove a physical `.agents` directory as a shortcut.
3. **Run the project-local link script** (with a profile, or `full`):
   ```bash
   ./setup.sh /path/to/your-project laravel   # or: nextjs | astro | nodejs | full
   ```

### 4. Unlink

```bash
./unlink.sh /path/to/your-project
```

Removes only the symlinks agent-brains owns (resolved destination inside this
repository — the link's name alone is never proof of ownership). Foreign
symlinks and real files are preserved and reported; directories are removed
only when left empty.

## Workflow skills → Codex + OpenCode + Pi

The seven workflow skills live as native skills in
`.agents/skills/<name>/SKILL.md` and are invoked the same way in both tools. Each
one has an OpenCode pointer and a workflow link:

| Workflow skill | OpenCode pointer | Workflow link |
|---|---|---|
| `start` | `.opencode/agents/start.md` | `.agents/workflows/start.md` |
| `setup` | `.opencode/agents/setup.md` | `.agents/workflows/setup.md` |
| `spec-and-tasks` | `.opencode/agents/spec-and-tasks.md` | `.agents/workflows/spec-and-tasks.md` |
| `laravel` | `.opencode/agents/laravel.md` | `.agents/workflows/laravel.md` |
| `nextjs` | `.opencode/agents/nextjs.md` | `.agents/workflows/nextjs.md` |
| `astro` | `.opencode/agents/astro.md` | `.agents/workflows/astro.md` |
| `solution-capture` | `.opencode/agents/solution-capture.md` | `.agents/workflows/solution-capture.md` |

| Tool | Syntax | Example |
|---|---|---|
| OpenCode | global command adapter `/spec-and-tasks`; skills are loaded by ID | `/spec-and-tasks` or `@spec-and-tasks` |
| Codex (CLI / IDE) | `$` mention or `/skills` | `$spec-and-tasks` |
| Pi | `/skill:spec-and-tasks` (documentary skill) — `/feature` remains the orchestrated runtime command | `$spec-and-tasks` / `/feature <idea>` |

Profile membership: `start` / `spec-and-tasks` / `setup` / `solution-capture`
are in `common.list` (every profile); `laravel` / `nextjs` / `astro` are in
their own profile manifest. The documentary skill was renamed from `feature`
to `spec-and-tasks` (M1): it now covers planning only — explore, clarify,
produce an approved `spec.md` + `tasks.md`, hand off. The Pi `/feature`
**command** (the orchestrated runtime workflow with its own planner,
developer, verify and reviewer roles) is a separate mechanism and keeps its
name, its `prd-<slug>.md` / `tasks-<slug>.md` documents and resume
compatibility with historical runs.

**Explicit-only activation.** In Codex, the invasive workflows
(`spec-and-tasks`, `setup`, `laravel`, `nextjs`, `astro`) and the gated
`solution-capture` workflow carry `agents/openai.yaml` with
`allow_implicit_invocation: false`, so Codex will **not** auto-trigger them from a
prompt — you must type `$spec-and-tasks` or `$solution-capture`. `start` keeps implicit
activation on (useful to auto-suggest when you ask "what's the status").

Pi `/feature` filters skills by role: the `laravel`, `nextjs` and `astro`
session workflows remain available for explicit use, while pipeline children
receive their framework specialists. `simplify` belongs to the main session,
which can edit files and run cleanup commands; it is excluded from pipeline roles.

`.opencode/agents/*.md` and `.agents/workflows/*.md` (symlinks) both point at the
same `SKILL.md` — single source of truth per workflow, no duplication.

## How It Works

### Canonical skill store → single source of truth

`.agents/skills/` in **this repo** is the canonical store for setup-managed agent
skills. Projects never install or update those skills directly — they consume
them via symlinks (see Profiles). Optional, tool-specific skills for manual use
live in `extra/` and are intentionally outside the setup/profile flow.
How you update depends on the tool:

- **`npx skills`** (mattpocock, anthropics, vercel, …) runs **here**, in this repo —
  it downloads from GitHub and needs no project context. It may only update
  skills still listed in `skills-lock.json`. A skill whose `SKILL.md` declares
  `metadata.management: local` (including `grill-with-docs`, `research`,
  `code-review`, `to-spec`, `tdd` and
  `verification-before-completion`) is
  locally authoritative — never update it through `npx skills`. Reviewed
  workflow, one skill at a time:
  ```bash
  git status --short             # start from a clean working tree
  npx skills update <name>       # named update of one lock-managed skill
  git diff                       # inspect the resulting diff
  npm test && npm run typecheck  # run proportional checks
  git commit                     # commit that skill's update separately
  ```
  Prefer a named update over bulk `npx skills update` — an unreviewed bulk
  update changes behaviour in every symlinked project at once.
- **`php artisan boost:update`** (`laravel/boost`) must run **inside a Laravel project** —
  it reads that project's packages to generate project-relevant skills. Run it
  only when that project's `.agents/skills/` is a real project-local directory;
  never allow generated output to write through links into this canonical store:
  ```bash
  cd /path/to/laravel-project
  php artisan boost:update
  ```

This keeps one canonical version shared across all projects.

### Updating installed skills — the `.ai/` path remap

Skills from `mattpocock/skills` are patched to use this repo's `.ai/` layout
instead of their upstream defaults:

| Upstream | This repo |
| --- | --- |
| `CONTEXT.md` (root glossary) | `.ai/context/GLOSSARY.md` |
| `docs/adr/` | `.ai/adr/` (lazy: created on first ADR) |
| `docs/agents/issue-tracker.md` | `.ai/agents/issue-tracker.md` |
| `.scratch/<feature>/` (local tickets) | `.ai/features/<feature>/` |

The tracker convention (shipped by `scaffold.sh`): issues and specs are local
markdown under `.ai/features/<feature-slug>/` — `spec.md` plus one file per
ticket in `issues/NN-<slug>.md`. `to-spec`, `to-tickets` and `code-review`
read this from `.ai/agents/issue-tracker.md`.

**Warning:** `npx skills update` overwrites local edits with upstream content —
no warning, no conflict (verified empirically; the lock's `computedHash` does
not protect modified files). After any update the remap must be re-applied.

That is the job of the `update-skills` maintenance skill
(`extra/skills/update-skills/`): it runs the update, re-applies the remap with
its deterministic script (`scripts/remap-matt-paths.sh`), hand-fixes the prose
the script cannot, checks for broken skill dependencies (skills invoking
uninstalled skills), missing tracker config, and profile orphans, then reports
and asks before installing or committing anything. The remap is also documented
in `.agents/AGENTS.md`.

### Profiles → Pi role/stack selection and legacy project subsets

The global installer exposes every non-conflicting catalog skill regardless
of profile. Pi uses the manifests to select the skills relevant to a stack and
pipeline role. Projects still using the migration-compatible `setup.sh` path
receive only the skills listed in their profile. `.opencode` is linked whole
only in that legacy project-local mode.

```
# full profile (escape hatch):
project-a/.agents        →  symlink  →  this-repo/.agents            (all skills)

# profiled mode (e.g. laravel):
project-b/.agents/       →  real dir
project-b/.agents/skills/  →  real dir of per-skill symlinks → this-repo/.agents/skills/<name>
```

Each symlink points into the canonical store. Re-running `setup.sh` refreshes
legacy project links; rerunning `install-global-skills.sh --apply` links newly
added catalog skills globally. Global links are not filtered by Pi profiles.

**Ownership rule.** A symlink is agent-brains' only when its *resolved
destination* is inside this repository (relative destinations are resolved
against the link's own directory). On refresh, setup removes only those links;
foreign symlinks and real files/directories in the project's `.agents/skills/`
are preserved, and a skill whose path is occupied by them is skipped with a
warning — never nested-linked, never counted as installed. The profile manifest
is fully resolved and validated before anything is modified, so an invalid
profile cannot leave a partially cleared installation. Switching a curated
project to `full` converts only directories that contain exclusively
agent-brains-owned links; when non-managed content blocks the conversion the
command fails and the curated installation is left intact.

### Project Context (.ai) → Copy (project-specific)

```
this-repo/templates/.ai/  ──copy──→  project-a/.ai/  (independent)
                           ──copy──→  project-b/.ai/  (independent)
```

Each project gets its own copy. PRD, roadmap, DB schema are unique per project.

### Laravel Boost content

Boost-generated files capture a particular project's package set and versions.
They belong in that project's local `.agents/skills` directory. A symlinked
project skill path can route writes into the canonical repository, so do not
run Boost while that path points into agent-brains. To adopt reusable rules,
review them separately and edit the canonical Laravel skill by hand; do not
copy project-specific output into the shared catalog.

## Profiles

A profile is a plain-text manifest in `profiles/<name>.list` — one skill name
per line (matching the folder/file name in `.agents/skills/`). A manifest can
pull in another with `@include <name>`, so common skills are defined once.

```
# profiles/laravel.list
@include common
@include frontend-core
laravel
laravel-best-practices
laravel-permission-development
livewire-development
volt-development
pest-testing
```

| Profile    | Includes                         | Use for                                  |
| ---------- | -------------------------------- | ---------------------------------------- |
| `frontend` | common + all frontend groups     | Full frontend/UI stack                  |
| `laravel`  | common + frontend-core + Laravel | PHP full-stack (Blade + backend)         |
| `nextjs`   | common + core + design + QA + Next | Next.js / React                        |
| `astro`    | common + core + design + Astro   | Astro content/static sites               |
| `nodejs`   | common + Node.js backend patterns | Generic Node.js backend APIs (no UI skills) |
| `nodejs-ai-backend` | nodejs + API/security/SQL/testing/TypeScript | Node.js/TypeScript AI and integration backends |
| `full`     | (whole-dir symlink)              | Escape hatch — every skill, zero curation |

Frontend skills are split into composable groups: `frontend-core`,
`frontend-design`, `frontend-motion`, and `frontend-qa`. The `frontend` profile
includes all four groups; stack profiles choose a smaller default set. Add a
group with `@include <name>` when a project needs more than its default profile.

### Adding / editing a profile

1. Edit `profiles/<name>.list` (create it for a new Pi stack profile).
2. For projects that still use local links, re-run
   `./setup.sh /path/to/project <name>` to refresh that project's symlinks.

### Making a skill available everywhere

Global installation links all canonical skills independent of profiles. Add a
skill to `profiles/common.list` only when it should participate in every Pi
stack profile; legacy linked projects still need a profile refresh.

### Adding a new agent skill — canonical workflow

When you create a new agent skill folder under `.agents/skills/<name>/`, run
`install-global-skills.sh --apply` once to add its global link. Register skills in
the manifests instead of creating symlinks by hand inside project
`.agents/skills/` directories: links pointing into this canonical store are
refreshed (removed/recreated) by the next `setup.sh` run, so a hand-crafted
link into the store does not survive a refresh.

1. **Author the skill** in `.agents/skills/<name>/SKILL.md` (this repo).
2. **Register it in the manifest(s)**:
   - Generic / cross-stack skill → `profiles/common.list` (inherits to every profile)
   - Frontend / motion / UI skill → the relevant `profiles/frontend-*.list` group (or `frontend.list` for every frontend profile; not nodejs)
   - Stack-specific skill → the relevant `profiles/<stack>.list`
   - Keep `profiles/full.list` aligned with the canonical catalog: Pi resolves this manifest before role filtering. `setup.sh full` links the whole directory directly.
3. **Refresh legacy project links only where still needed**:
   ```bash
   ./setup.sh /path/to/project laravel   # or nextjs | astro | nodejs | full
   ```
   Idempotent: refreshes only links this repository owns, never touches real
   files or foreign symlinks.

To re-sync many projects at once, see the fingerprint trick: resolve each
profile with `resolve_manifest` (defined in `setup.sh`) and match against the
sorted list of symlinks present in `project/.agents/skills/` — that recovers
which profile each project uses without a registry.

For a manual, tool-specific skill that should not be installed into projects,
place it under `extra/skills/<name>/` instead. Do not add it to a profile or run
`setup.sh` for it.

## Recommended Workflow

### Project setup

1. **`setup`**: Interrogates you to bootstrap the project and create `.ai/context/GLOSSARY.md`.

### Feature lifecycle (pre → during → post)

Planning procedures — one job each, no duplicate interviews or approvals:

- **`spec-and-tasks`**: the standard planning skill for non-trivial work —
  repository exploration, one-batch clarification, approved
  `.ai/features/<slug>/spec.md` + `tasks.md`, explicit handoff. It never
  implements and never reviews; approval ends planning.
- **`grilling`**: quick stress-test of a plan or decision in batched rounds;
  no artifacts. Use it for ordinary brainstorming, not for producing documents.
- **`grill-with-docs`**: documentation-backed stress test, one decision at a
  time with a persisted checkpoint; produces only explicitly approved
  documents (e.g. edits to the draft spec after stressing it). Optional
  detour before `spec-and-tasks`' approval gate.
- **`to-spec`** / **`to-tickets`**: publish to the configured tracker — a
  conversation-derived spec (`to-spec`, no interview) or the approved tasks as
  tracer-bullet tickets (`to-tickets`). The local documents stay the source of
  truth. `to-spec` never silently overwrites an existing `spec.md`: an
  already-approved planning document is updated in place only on explicit
  request, preserving its own contract (criteria, decisions, assumptions).

Lifecycle:

1. **`setup`**: bootstrap a new project (see Project setup above).
2. Plan with **`spec-and-tasks`** (above). Historical `prd-<slug>.md` /
   `tasks-<slug>.md` documents (including everything the Pi `/feature` runtime
   writes) remain valid inputs — never mass-rename them.
3. **Implementation, in a fresh session/agent that consumes the approved
   documents**: framework agents (`/laravel`, `/nextjs`, `/astro`) implement
   the task list task-by-task using **`tdd`** (red-green-refactor where
   execution is available); reference the spec/tasks **by path**, without
   repeating the planning discovery. For generic stacks, start a fresh
   implementation session, reference the approved documents by path and apply
   `tdd` plus the project's stack skills.
4. **Review, separate from implementation and from fixing**: `code-review` (or
   the project's review procedure) takes the approved requirements, the task
   list and the diff, judges the observable acceptance criteria and returns
   verifiable findings; corrections happen only after the review comes back —
   the reviewer never repairs the code itself.
5. **Verification**: follow the project's `AGENTS.md` policy. Run the smallest
   proportional check by default; use `verification-before-completion` when the
   user explicitly asks for verification.

### Cross-cutting

Optional assessments and reporting:

- `agent-readiness` audits operational capabilities for coding agents, with
  evidence and prioritized root fixes. `context-audit` owns documentation hygiene.
- `html-report` creates offline HTML reports from a local kit and checks browser
  rendering. Research remains Markdown by default; HTML is an optional deliverable.
- `extra/skills/humanizer` supports composition, editing and optional English
  candidate scanning for long prose. Manual copies must include its references
  and scripts; see [the adoption note](docs/research/alfonso-skills-adaptation.md).

5. **`diagnosing-bugs`**: auto-activates on bugs — build a reproducible case first, then fix.
6. **`improve-codebase-architecture`**: runs periodically to produce before/after refactoring reports.
7. **`/handoff`**: when a chat becomes too long (deep context, many back-and-forths), compact the conversation into a doc the next agent can pick up in a fresh chat. Saved to `$TMPDIR` by default; `--keep` to persist it in `docs/handoffs/`.
8. **`lessons-gardener`**: periodically prunes and compresses `.ai/memory/lessons.md` so it stays short and useful.
9. **`solution-capture`**: after a difficult problem is positively verified,
   `$solution-capture` assesses whether the diagnosis is reusable, stops at an
   approval gate, then writes one detailed solution plus one `lessons.md` index
   line. Feature and bug-diagnosis workflows search this memory progressively;
   they do not preload every solution or trigger capture automatically.

### Frontend & Motion

The frontend skills are split by **intent**, not by "frontend" in general. Triggering the wrong one is the most common cause of generic AI-slop output — each owns a specific job and points to its siblings when the request is out of scope.

| Intent | Skill |
| --- | --- |
| Bold, distinctive aesthetics — landing pages, marketing, hero sections, concept UI, posters, portfolios. Anti-AI-slop. | `frontend-design` |
| Product UI structure & design systems — dashboards, admin panels, SaaS, charts. Database of 161 color palettes, 57 font pairings, 25 chart types. | `ui-ux-pro-max` |
| Animations, transitions, easing curves, spring physics, micro-interactions, gestures, polish/feel. Emil Kowalski (Sonner/Vaul). | `emil-design-eng` |
| shadcn/ui components (add, fix, style, compose). | `shadcn` |
| Tailwind utility classes, responsive layouts, dark mode. | `tailwindcss-development` |
| Scalable design systems with Tailwind v4 (tokens, component libraries). | `tailwind-design-system` |
| View Transition API — page transitions, shared-element animations, directional navigation. | `vercel-react-view-transitions` |
| React composition patterns (compound components, render props, context). | `vercel-composition-patterns` |
| React/Next.js performance (RSC, data fetching, bundle size). | `vercel-react-best-practices` |
| **Review** UI against Vercel Web Interface Guidelines. | `web-design-guidelines` |
| **Review** animation/motion code (slash command, brutal craft bar). | `/review-animations` |

### Anti-patterns

- Going straight to a framework agent (`/laravel`, `/nextjs`, …) without an approved spec/task list → plan with `spec-and-tasks` first (small fixes exempt).
- Skipping TDD on individual tasks → every task goes through `tdd`.
- Letting a chat grow too long without `/handoff` → compact and resume fresh.
- Re-running the planning discovery in the implementation session, or "reviewing" by silently fixing — review reports findings; fixing is a separate step.

## Notes

- `.opencode` and `.agents` in consuming projects are **personal dev configs** (like `.vscode/`) → `.gitignore`
- `.ai/` is **project documentation** → commit to the project repo
- `extra/skills/` contains optional, tool-specific skills for manual use; it is not part of the agent profiles or setup flow
- reusable diagnoses live in project-owned `.ai/memory/solutions/`; the
  canonical template is scaffolded without overwriting existing project files
- Keep secrets, private prompts, and project-specific context out of this public repository
