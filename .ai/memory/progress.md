# Progress

## Open items

- **Merge main → pi-brain** (when closing the feature branch). Known conflicts to resolve deliberately, not blindly:
  - Skill format divergence: main has legacy flat `designer.md` / `product-thinking.md` (in `.agents/skills/` and `.opencode/skills/`); pi-brain normalized them to directories (`<name>/SKILL.md`). **Keep pi-brain's directory convention** — it's the documented standard.
  - `profiles/common.list`: main has `product-thinking.md` entry + the 5 newly profiled skills (codebase-design, domain-modeling, prototype, resolving-merge-conflicts, writing-for-agents); pi-brain has `product-thinking`. Combine: pi-brain's entry name + main's additions.
  - `profiles/laravel.list`: main added `socialite-development` (was orphaned); pi-brain already had it. Same content, trivial.
  - After the merge: re-run the profile integrity check and smoke tests (see `extra/skills/update-skills/SKILL.md`).

## Done

- 2026-08-29 humanizer 2.11.0 (no-ai-slop merge), mattpocock skills to 1.2.3 + 4 new skills, `.ai/` path remap, tracker/scaffold conventions, profiles fixed (bidirectional check), `update-skills` maintenance skill in `extra/`.
