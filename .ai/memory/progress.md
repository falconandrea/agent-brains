# Progress

## Open items

- Vercel skills follow-up (composition-patterns / react-best-practices / view-transitions review) — deliberately not touched during the merge.
- `frontend-design` and shadcn follow-ups — deliberately not touched during the merge.

## Done

- 2026-09-22 Merged `main` → `pi-brain` (merge commit on `pi-brain`, then fast-forwarded `main`): kept pi-brain's `<name>/SKILL.md` directory convention (no legacy flat `designer.md`/`product-thinking.md` restored); combined `profiles/common.list` (pi-brain normalized names + main's 5 new skills: codebase-design, domain-modeling, prototype, resolving-merge-conflicts, writing-for-agents); `socialite-development` once in `laravel.list`; kept main's `update-skills`, Humanizer updates, `.ai` tracker conventions, scaffold and path-remap; preserved the local-ownership invariant (`grill-with-docs` and `research` stay `management: local`, absent from `skills-lock.json`, metadata + LICENSE intact, ownership tests active); aligned `extra/skills/update-skills/SKILL.md` to the ownership contract (lockfile-only scope, named updates preferred, adopted/derived skills never updated).
- 2026-08-29 humanizer 2.11.0 (no-ai-slop merge), mattpocock skills to 1.2.3 + 4 new skills, `.ai/` path remap, tracker/scaffold conventions, profiles fixed (bidirectional check), `update-skills` maintenance skill in `extra/`.
