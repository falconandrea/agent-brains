# AI Agent Rules

## File Update Rules

- To update project progress → edit `.ai/memory/progress.md`
- To log a new lesson learned → edit `.ai/memory/lessons.md`
- To track a blocker → edit `.ai/memory/blockers.md`
- To update API contracts → edit `.ai/context/API_CONTRACTS.md`
- To update tech stack info → edit `.ai/context/TECH_STACK.md`

> [!WARNING]
> **NEVER** modify the root `agents.md` — it is auto-generated and will be overwritten by `php artisan boost:update`.

## After Every Task

1. Update the relevant `.ai/memory/` files
2. Run `./vendor/bin/pint` to ensure code style compliance
3. Run `./vendor/bin/phpstan analyse --memory-limit=2G` to ensure code quality
4. The user will run `php artisan boost:update` to sync the root `agents.md`

## Matt Pocock skills: local path remap

The `mattpocock/skills` skills in `.agents/skills/` are patched to use this repo's `.ai/` layout instead of Matt's defaults:

- `CONTEXT.md` (root glossary) → `.ai/context/GLOSSARY.md`
- `docs/adr/` → `.ai/adr/` (created lazily on first ADR)
- `docs/agents/issue-tracker.md` → `.ai/agents/issue-tracker.md`
- `.scratch/<feature>/` (local tickets) → `.ai/features/<feature>/`

`npx skills update` overwrites local edits to skill files: re-apply this remap after every update.
