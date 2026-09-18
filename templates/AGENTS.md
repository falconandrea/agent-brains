# AGENTS.md — Project Directives

> Stable agent policy for this project. Volatile status lives in `.ai/memory/progress.md`, never here.

## Ownership and precedence

One fact type, one owner:

| Fact | Owner |
|---|---|
| Instructions and stable agent policy | `AGENTS.md` (this file) |
| Product, architecture, domain, stack, design system, ADRs | `.ai/context/` |
| Approved feature requirements and ordered tasks | `.ai/features/<feature>/` |
| Non-obvious, project-specific, reusable lessons | `.ai/memory/lessons.md` |
| Current phase, active task, blockers, next actions | `.ai/memory/progress.md` |
| Conversation/session narrative | Pi session JSONL or the active session — never project docs |
| Implementation facts | Code, tests, config, migrations, database schema |

When sources conflict, resolve in this order:

current user request and approved feature spec
→ project `AGENTS.md`
→ scoped context/ADRs
→ curated lessons
→ session history

Code and database artifacts remain authoritative for implementation facts. Do not duplicate them into docs, and do not create a second source of truth.

## Context routing

Load context **by task**, never the whole `.ai/` tree. Read a file only when the task touches its area.

| Task area | Read |
|---|---|
| General orientation | `AGENTS.md`, `.ai/context/TECH_STACK.md`, `.ai/memory/progress.md`, `.ai/memory/lessons.md` |
| UI work | `.ai/context/DESIGN_SYSTEM.md` (mandatory) + the `designer` skill and the one relevant UI skill |
| Anything else | The skill or `.ai/context/` file matching the area; `APP_FLOW.md`, `GLOSSARY.md`, `database_schema.mmd`, ADRs only when needed |

Skill details live in the skills themselves — do not preload or copy them here.

## Stable directives

- For non-trivial feature work, follow the `/feature` skill: no code before PRD approval.
- Read `.ai/context/TECH_STACK.md` before technical decisions; `.ai/memory/lessons.md` before starting work.
- Update `.ai/memory/progress.md` when completing a task. Blockers live in its Blockers section — no separate file exists.
- Never install a dependency without checking it is not already present.
- Never store credentials, temporary URLs, or personal data in auto-loaded files.
- UI decisions defer to `.ai/context/DESIGN_SYSTEM.md`; deviations need explicit user approval.

## Verification

- Default: the smallest check that proves a behavior change (one targeted test, the affected route, or a typecheck of the touched file). No full suite, lint-all, or rebuild unless asked or clearly required.
- Manual mode ("verifica manuale" / "manual verify" / "don't run anything"): run nothing; output the exact commands for the user and wait.

## Conventions

<!-- Customize per project -->
- Follow existing code style and naming; comment only non-obvious logic; code and comments in English.
- Do not commit or push — the user reviews before committing.
- Respond in Italian unless the context requires English. Be concise; ask when in doubt.
