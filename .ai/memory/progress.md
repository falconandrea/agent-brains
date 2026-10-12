# Progress

## Open items

- New `agent-readiness` and `html-report` skills are registered in common/full;
  existing curated consumers need their next profile refresh to discover them.
  `extra/skills/humanizer` now includes compose/scan references and a lexical
  comparison helper; independent manual copies must receive the whole folder.
  Consumer copies have not been updated in this task. Provenance, decisions and
  the upstream README PR recipe are in
  [the adaptation note](../../docs/research/alfonso-skills-adaptation.md).
- Spotify-inspired context/read-cost workstream is planned, not started:
  S1 deduplicate discovered/injected context → S2 complete cost/cache/latency
  accounting and baseline → S3 trial an explicit optional read-only bulk-reader.
  Status and acceptance criteria live in
  [the adoption roadmap](../../docs/plans/pi-plugin-adoption-roadmap.md#s--local-context-and-read-cost-optimization);
  evidence lives in
  [the assessment](../../docs/research/spotify-shunt-assessment.md).
  When resuming this workstream, start with S1. Automatic hooks, code-writing
  workers and Jev remain deferred; no Portal installation is planned.
- `test-review` remains an explicit experimental extra. Initial pilot and isolated
  mutation evidence are in `docs/evals/test-review/README.md`. Three samples
  recorded so far: the initial T1–T3 historical pilot (B) and two fresh-feature
  runs — code-review follow-ups T4 (2026-10-11, `docs/evals/test-review/runs/E-test-review.md`)
  and T5+T6 (2026-10-12, `docs/evals/test-review/runs/F-test-review.md`): no
  must-fix in either, E one convergent minor overlap, F two accepted minor
  incomplete-coverage findings (one new, one sharpening a Spec-axis catch), no
  false positives, bounded overhead in both. The recurrence condition for
  reconsidering conditional workflow integration is met; the decision is the
  user's. Two
  missing unlink preservation cases were verified in a temporary fixture only;
  the shipping tests have not been changed.
- No queued agent-workflow follow-up. W2 and W3 remain evidence-triggered and
  deferred.
- code-review-follow-ups T7–T10 pending (see
  `.ai/features/code-review-follow-ups/tasks-…md`); T1–T6 done.

## Done

- 2026-10-12 code-review follow-ups T5+T6 (F4, baseline `1239a20`, uncommitted):
  verification commands are now bounded — `verifyTimeoutMs` (default 600000,
  bounds 1000–3600000, missing key = silent legacy default, invalid value =
  fallback + bounds-naming warning) in `src/config.ts`; `ShellVerifyRunner`
  runs each command detached (own process group; plain `spawn` is required
  because the exec family drops `detached` on current Node) and on timeout or
  `/flow stop` SIGTERMs the group, escalates to SIGKILL after a 5s grace, and
  destroys its pipe ends. Results distinguish timeout (exit 124, `timedOut`),
  cancellation (exit 143, `cancelled`) and ordinary failures; the workflow
  reports timeouts to the developer as timeout findings and returns
  `cancelled` when the abort lands mid-verify (retry budget untouched);
  runaway output >16MiB is truncated with the tree killed. Lock release after
  timeout/cancellation is by construction (workflow returns an outcome,
  extension `finally` releases — Pi surface, not unit-testable; precondition
  tested).   TDD: hanging command blocked the full 30s pre-fix and cancellation
  leaked the grandchild; 16 new tests (3 config, 11 runner incl. tree kill,
  SIGKILL escalation, off-pipe grandchild, at-return tree-death guarantee,
  cancel-vs-timeout race, overflow; 2 workflow routing). Third review round:
  settle() returns the cleanup outcome so the result message (and the README)
  says "could not be confirmed dead — check for leftover processes" in the
  unkillable D-state edge case instead of claiming a clean termination
  (branch not automated-testable, documented limit); groupGone() counts the
  group absent only on ESRCH.
  Two-axis review fixed one real defect (escalation timer must stay armed
  after the shell closes — regression test verified by mutation) and cleaned
  the finish branches. Second review round (user-reproduced, red-first): the
  result could resolve at shell close while children were still being killed
  (266ms return with a live child — now `settle()` waits for the group to be
  empty before resolving, asserted at return time), and a late timeout could
  overwrite an ongoing cancellation (single idempotent termination cause,
  first wins; abort deactivates the timeout timer).   test-review trial F (separate context, review findings
  withheld): no must-fix, two minor accepted (bounds off-by-one coverage,
  overflow-kill detection via trailing `sleep 300`); two user-reproduced
  races escaped both that trial and the two-axis review and are recorded in
  the F run doc. Platform limit: group
  kill is POSIX-only; elsewhere falls back to killing the shell (pre-existing
  guarantee), documented in `docs/pi-brain/README.md`. `npm test` 269/269,
  typecheck and `git diff --check` clean, no stray processes. T7–T9/S1
  untouched.

- 2026-10-11 code-review follow-ups T4 (F3, baseline `1239a20`, uncommitted):
  a manual `stack` override no longer discards detected metadata —
  `resolveStack` always detects, then applies the configured primary via the
  pure `applyStackOverride` in `src/stack.ts`. Languages, package managers and
  secondary frameworks are repo facts and are always retained (pnpm/yarn/bun
  selection survives an override; a `laravel` override keeps pest/pint/phpstan
  checks). Capability decision: same-ecosystem override keeps everything;
  cross-ecosystem override keeps only the configured ecosystem's capabilities
  (PHP = laravel only), and the detected winner framework token is dropped when
  the primary changes. Explicit `config.verify` remains authoritative (pinned).
  TDD: 4 regressions failed pre-fix (Laravel checks, pnpm runner,
  cross-ecosystem both ways), unit + workflow level; `npm test` 253/253,
  typecheck and `git diff --check` clean. Two-axis review round fixed a stale
  `config.ts` doc comment ("detection is skipped"), added an `isPhp` predicate
  and deduplicated the test fixture. Known limits: the low-confidence
  human-choice path still swaps primary without the ecosystem filter
  (pre-existing, out of F3 scope); the ecosystem/capability taxonomy is a
  module-level set, so a future PHP capability must be added to it explicitly.
  T5–T9/S1 untouched.

- 2026-10-11 Adapted selected Alfonso Graziano skill ideas: evidence-based
  operational readiness audit; local offline HTML kit with browser checker;
  preventive composition and optional English lexical before/after scans in
  the existing humanizer. Preserved MIT attribution and pinned origin metadata;
  research optionally routes requested visual artifacts to html-report. Both
  canonical additions are operational-only in the Pi role router. Validation:
  three skill validators passed; focused helper/profile/routing checks 40/40;
  typecheck clean; HTML template verified in Chrome desktop/mobile light/dark
  and print, with no external asset requests, errors or overflow. Final full
  suite passed 246/246, including routing and scanner regression additions.
- 2026-10-11 Initial test-review pilot: created a read-only explicit extra outside
  profiles, routing and installers; evaluated historical implementation, skill
  and documentation diffs in separate contexts. A concrete unlink coverage gap
  was verified by mutation: original suite passed 24/24 despite removed ownership
  guards; two focused probes failed on mutated code and passed on restored code
  (26/26). Narrowed the skill's handling of pending manual eval evidence. No
  shipping implementation or automatic review phase changed.
- 2026-10-08 Remaining consumer alignment: refreshed `ardizio-design` with
  `astro`, `itinerary-ai`, `linkedin-analytics`, and `ga-analytics` with
  `laravel-analytics`, `careguru/carefinder-backend` and the Laravel boilerplate
  with `laravel`, and the Next.js boilerplate with `nextjs`. Added project-owned
  shared-workflow guidance and missing local trackers. Boost-generated blocks
  were verified byte-identical; pointers outside those blocks survive Boost
  regeneration. Ardizio's four local skill directories were preserved and
  verified against canonical SKILL.md files; its two old flat skills were
  archived outside discovery. Profile coverage and destinations are valid,
  zero broken links, all seven project diff checks clean. Existing backend
  changes were preserved; no commits or application-code edits made.
- 2026-10-08 Consumer-project alignment: refreshed `andreafalcon.dev` and
  `appuntidalgiappone` with `astro`, `craftcv.online` with `nextjs`, and
  `careguru-brain` with `nodejs-ai-backend`. Replaced seven obsolete `.md`
  symlinks, restored exact current manifest membership, added local Markdown
  issue-tracker configuration, and corrected stale workflow/skill references
  in each project's agent instructions while retaining project conventions.
  Read-only verification confirmed 34/34/42/33 skills respectively, valid
  canonical destinations, no broken links, tracker presence and clean
  per-project `git diff --check`. Changes remain uncommitted; other consumers
  were not modified.
- 2026-10-08 code-review follow-ups T1–T3 (baseline `e5f8e56`): `setup.sh` and
  `unlink.sh` are now ownership-aware — only symlinks whose resolved
  destination is inside this repo (canonical store, `.agents/workflows`,
  `.agents`, `.opencode`) are removed/replaced; relative destinations are
  resolved against the link's directory, name alone proves nothing. Profile
  manifests (incl. `@include` cycles and invalid entries) are validated before
  any mutation, so invalid profiles leave installations intact. Real
  files/dirs occupying a skill path are preserved with a clear skip diagnostic
  (no nested links) and only correctly linked skills are counted. Curated↔full
  profile switches convert in both directions, but only when the directory
  holds exclusively agent-brains-owned links — otherwise the switch fails and
  leaves the previous installation intact. Regression
  coverage: `tests/setup-unlink.test.ts` (17 integration tests in a temp
  fixture, nothing outside the temp workspace is touched). Known limitation:
  after moving/renaming this repo, old links no longer resolve under the new
  copy and unlink conservatively preserves them (reported, manual removal).
  `npm test` 232/232, `npm run typecheck` clean, `bash -n` clean,
  `git diff --check` clean; real-profile smoke test passed for all profiles.
- 2026-10-08 T1–T3 review round (same baseline): fixed three defects in the
  first implementation. (1) `full` no longer traverses a symlinked `.agents`
  during cleanup — a repeated full setup could delete symlinks inside the
  canonical store or inside a foreign destination; (2) curated→full now
  validates convertibility BEFORE removing anything: a directory holding
  non-managed content fails with exit 1 and the curated installation is left
  intact (previously managed links were removed, the whole-dir link skipped,
  and the command still succeeded); (3) removing a `skills → canonical store`
  symlink no longer depends on `.agents/workflows` being present. Three new
  regression tests (+ the corrected blocked-conversion test) failed on the
  old code and pass now: 20/20 integration, `npm test` 235/235.
- 2026-10-08 T1–T3 second review round: fixed two more P2s. (1) hidden
  symlinks (`.alias → store`) were validated as removable by the curated→full
  convertibility check but skipped by cleanup (`*` vs `* .[!.]* ..?*` globs),
  leaving a half-destroyed installation with exit 0 — cleanup, curated
  refresh and unlink now scan hidden entries with the same globs as
  validation; (2) a real FILE at `.agents/skills` passed the convertibility
  check vacuously, so cleanup removed the managed workflows link and skipped
  `full` with success — now the check rejects it, and curated setup's
  validation fails early (before any mutation) with a clear message for a
  real file at `.agents` or `.agents/skills`. Both defects reproduced on the
  pre-fix code (exit 0 + workflows link lost / .opencode linked before the
  error); 4 new regression tests: integration 24/24, `npm test` 239/239.
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
