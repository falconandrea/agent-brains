# Progress

## Open items

- No queued agent-workflow follow-up. W2 and W3 remain evidence-triggered and
  deferred.

## Done

- 2026-09-26 W1 promoted: moved `solution-capture` into the canonical skill
  store and every profile while preserving explicit-only invocation; added the
  solution template to idempotent scaffold; added targeted, no-preload retrieval
  to `feature` and `diagnosing-bugs`; extended `lessons-gardener` to audit broken
  references, duplicates and 180-day review candidates; removed the pilot copy
  from `extra/`. The 180-day interval is an explicit maintenance policy, not a
  trial-validated claim.
- 2026-09-26 W1.6 evidence persisted as a public-safe run sheet containing the
  fixture revision, acceptance outcomes, human corrections, artifact counts,
  and the untested 180-day maintenance threshold. Machine-specific
  configuration, session identifiers, and complete transcripts remain local.
  W1.6 met its behavioral acceptance criteria and was subsequently promoted.
- 2026-09-26 W1.6 fresh-session retrieval passed behaviorally in
  `ga-analytics`: each symptom started at `lessons.md`, used targeted searches,
  read only its pertinent solution (never the other document), matched the
  diagnosis to current code and selected the exact focused regression test.
  The retrieval session was read-only; the solution directory still contains
  exactly two files and the index exactly two references.
- 2026-09-24 W1.6 capture session completed in `ga-analytics`: captured the
  live weekly-digest claim/queue failure window and the authorized retrospective
  SQLite date-cast upsert defect (`1dfc83e`), each with one solution document
  and one `lessons.md` index line. The embedded English-only documentation
  correction took the fast path (0/5 conditions, no artifact). Independent
  checks confirmed two solution files, two index references, English-only
  content and clean Markdown whitespace. Retrieval and persisted session
  evidence remain pending.
- 2026-09-24 Prepared W1.6 in `ga-analytics`: verified a clean `main`, existing
  `.ai` memory and regression evidence; installed an ignored local symlink to
  the `solution-capture` prototype without changing project-tracked files. The
  pilot itself has not started.
- 2026-09-24 W1.1 approved and W1.2 completed: added the explicit-only
  `extra/skills/solution-capture/` prototype with a separate write-approval gate
  and structural tests that keep it outside profiles, setup, routing, templates
  and scaffold. W1.6 has not started.
- 2026-09-22 `frontend-design` and `shadcn` updated through named `npx skills@latest update -p -y` runs on `main`; their lockfile hashes changed. `frontend-design` expands typography, layout, motion restraint, and generic-design guidance. `shadcn` updates Base UI toast guidance, chat scroll restoration, and the new upstream `cn` package import. No `.ai/` path remap applies to these sources. No broken skill references or local path-remap references found in their files. `npm test` passed 212/212, `npm run typecheck` passed, and `git diff --check` was clean.
- 2026-09-22 Vercel skills follow-up (commit `51e4e65`): `vercel-composition-patterns` and `vercel-react-best-practices` already byte-identical to upstream `vercel-labs/agent-skills` (verified via shallow-clone diff; `npx skills update` on composition-patterns was a content no-op) — no change applied. `vercel-react-view-transitions` updated to upstream latest (post PR #328: Suspense crossfade readiness, Layout Displacement Morph, Chromium 125+ correction, `router.back()` carries-no-types semantics, new `references/troubleshooting.md`, markdown links to references; ~921 insertions across SKILL.md/AGENTS.md/README/references; lockfile hash c8952fc9→2033ef2). No local patches existed in the three skills (no `.ai/` remap needed — Vercel-sourced); remap script run: 0 files. Health checks: no broken skill deps, tracker config present, profile integrity bidirectional clean, setup.sh smoke test PASS for all 10 profiles; npm test 212/212, typecheck clean. `npx skills update -p` also creates `.pi/skills/<name>` symlinks (Pi discovery root per docs/pi-brain/SPEC.md §9.1) → `.pi/skills/` added to .gitignore as CLI plumbing.
- 2026-09-22 Merged `main` → `pi-brain` (merge commit on `pi-brain`, then fast-forwarded `main`): kept pi-brain's `<name>/SKILL.md` directory convention (no legacy flat `designer.md`/`product-thinking.md` restored); combined `profiles/common.list` (pi-brain normalized names + main's 5 new skills: codebase-design, domain-modeling, prototype, resolving-merge-conflicts, writing-for-agents); `socialite-development` once in `laravel.list`; kept main's `update-skills`, Humanizer updates, `.ai` tracker conventions, scaffold and path-remap; preserved the local-ownership invariant (`grill-with-docs` and `research` stay `management: local`, absent from `skills-lock.json`, metadata + LICENSE intact, ownership tests active); aligned `extra/skills/update-skills/SKILL.md` to the ownership contract (lockfile-only scope, named updates preferred, adopted/derived skills never updated).
- 2026-08-29 humanizer 2.11.0 (no-ai-slop merge), mattpocock skills to 1.2.3 + 4 new skills, `.ai/` path remap, tracker/scaffold conventions, profiles fixed (bidirectional check), `update-skills` maintenance skill in `extra/`.
