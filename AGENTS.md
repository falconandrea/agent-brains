# AGENTS.md — agent-brains repository directives

> Stable policy for working **in this repository** (the canonical skill store
> and Pi package). Distribution and usage documentation lives in
> [README.md](README.md); volatile status lives in
> [`.ai/memory/progress.md`](.ai/memory/progress.md).

## What this repository is

`agent-brains` is the single source for shared skills, Pi workflow engine, and
project templates. It is both a Pi package and the canonical catalog that
`install-global-skills.sh` exposes globally to Codex/OpenCode. Changes here
propagate live to every global consumer — treat catalog edits as cross-project
changes.

## Fact ownership

| Fact | Owner |
|---|---|
| Distribution model, invocation, update responsibilities | `README.md` |
| Pi engine behavior and commands | `docs/pi-brain/README.md` |
| Cross-repo migration status and priorities | `docs/plans/cross-harness-workflow-migration.md` + `docs/plans/pi-plugin-adoption-roadmap.md` |
| Current phase, open items, next actions | `.ai/memory/progress.md` |
| Stack facts | `.ai/context/TECH_STACK.md` |
| Historical feature documents | `.ai/features/<feature>/` (`prd-*.md`/`tasks-*.md` are historical; new work uses `spec.md`/`tasks.md`) |

## Stable directives

- Skills are edited **here**, never through project symlinks or global links.
  A skill marked `metadata.management: local` in its frontmatter is locally
  authoritative; lock-managed skills update only via the reviewed
  `npx skills update <name>` flow.
- Laravel Boost output is project-specific: never write generated Boost
  content into this catalog through any link.
- Keep the distinction between the `spec-and-tasks` **skill** (planning only)
  and the Pi `/feature` **command** (orchestrated runtime workflow). Do not
  rename Pi runtime artifacts (`<!-- pi-brain:feature -->`, run logs).
- Preserve profiles, provenance, licenses, and `skills-lock.json` discipline
  when touching skills; `npm test` includes structural guards
  (`tests/repo.test.ts`).
- Repository-authored documentation is written in English. Preserve verbatim
  user input and captured output in any language.
- Consumer repositories are migrated **per repository** (M4, see the migration
  plan §6 checklist): never bulk-edit consumer `.ai`/`.agents` content from
  here, and remove only links whose resolved destination is inside this
  repository.

## Verification

- Proportionate checks: catalog/profile/reference changes require
  `npm test` and `npm run typecheck`; shell script changes require `bash -n`.
- Documentation-only changes: link/reference verification and
  `git diff --check` are sufficient; no full application suite exists or is
  needed.
- Do not commit or push — the user reviews first.
