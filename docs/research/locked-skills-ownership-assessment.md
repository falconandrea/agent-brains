# Phase 2 assessment — ownership classification of the remaining locked skills

Date: 2026-09-22
Mode: assessment (read-only; no skill was migrated, edited or removed from `skills-lock.json`)
Scope: the 22 skills remaining in `skills-lock.json` after Phase 1 (`docs/plans/skill-ownership-lifecycle-plan.md`)
Verdict: selectively import — 11 keep-upstream, 5 adopt-candidates (each pending an explicit implementation decision), 1 adoption blocked by missing upstream license, 5 review/repair-first
Revisit trigger: before the next `npx skills update`; before adopting any skill listed here; if any listed source repository changes its licensing

## Evidence base

All checks performed on 2026-09-22 against primary sources (GitHub API and raw
file fetches at specific commits; local git history; local file hashes).

- **Local divergence** — folder hash for each of the 22 skills, replicating the
  installer's algorithm (`computeSkillFolderHash` in
  `vercel-labs/skills/src/local-lock.ts`: recursive files sorted by relative
  path, `sha256(path + content)`), compared with the lock's `computedHash`.
- **Upstream licenses** — `/license` and root `/contents` endpoints for each of
  the 11 distinct source repositories; full license text read where a license
  file exists.
- **Local edit history** — `git log` per skill folder since install.
- **Missing companions** — scan of each skill's `SKILL.md` for references to
  skills and setup conventions that do not exist in this repository.

## Findings that update the plan's preliminary hypotheses

1. **Four vercel skills show a lock-vs-folder hash mismatch that is not local
   divergence.** `vercel-composition-patterns`, `vercel-react-best-practices`,
   `vercel-react-view-transitions` and `web-design-guidelines` mismatch their
   lock `computedHash`, but each folder has exactly one commit (`7c1173f`,
   the install commit) and was never edited afterwards, and the lock entries'
   hashes are unchanged since that same commit. The mismatch is install-time
   state noise (most plausibly EOL normalization or a transient file between
   installer write and commit). Consequence: these are still clean
   keep-upstream candidates; a future named update rewrites folder and lock
   consistently.
2. **`frontend-design` adoption is license-blocked.** `anthropics/skills` has
   no license file at its root; `THIRD_PARTY_NOTICES.md` covers bundled
   Python dependencies only. Per the plan's licensing policy ("do not claim
   compatibility or permission when the upstream license is missing or
   unclear"), the skill must stay installer-managed until the upstream
   clarifies licensing.
3. **`react-doctor` is MIT-modified with additional restrictions** (prior
   written permission required for AI-training data use and for offering it
   as a paid hosted product). Fine as an installer-managed inference-time
   dependency under a plain reading, but it must never be adopted (copied and
   modified locally) without a permission review.
4. **No root license** on `better-auth/skills`, `vercel-labs/agent-skills` and
   `vercel-labs/next-skills`. All locked skills from these sources are
   keep-upstream verdicts, so this is a note, not a blocker. It becomes a
   blocker only if one of them is ever proposed for adoption.
5. **Missing companion skills confirmed.** `code-review`, `to-spec` and
   `to-tickets` instruct the agent to run `/setup-matt-pocock-skills` and
   assume a `docs/agents/issue-tracker.md` convention — neither exists here.
   `improve-codebase-architecture` depends on `/codebase-design` (vocabulary
   and principles) and `/domain-modeling` — both absent from this repository.
6. **`shadcn/ui` has been renamed to `shadcn-ui/ui`** (GitHub redirect;
   license MIT unchanged). Harmless today because the installer follows
   redirects, but the source should be re-pinned at the next named update.

## Source-license summary

| Source repository | License (verified 2026-09-22) |
| --- | --- |
| `mattpocock/skills` | MIT |
| `anthropics/skills` | none at root (THIRD_PARTY_NOTICES.md only) |
| `vercel-labs/next-skills` | none at root |
| `vercel-labs/agent-skills` | none at root |
| `better-auth/skills` | none at root |
| `millionco/react-doctor` | MIT-modified (AI-training and commercial-hosting restrictions) |
| `nextlevelbuilder/ui-ux-pro-max-skill` | MIT |
| `wshobson/agents` | MIT |
| `shadcn/ui` → `shadcn-ui/ui` | MIT |
| `supabase/agent-skills` | MIT |
| `obra/superpowers` | MIT |

## Per-skill classification

| Skill | Source | License state | Local state | Verdict | Notes |
| --- | --- | --- | --- | --- | --- |
| better-auth-best-practices | better-auth/skills | no root license | in-sync | keep-upstream | value depends on evolving Better Auth API |
| next-best-practices | vercel-labs/next-skills | no root license | in-sync (19 reference files) | keep-upstream | framework-paced knowledge |
| react-doctor | millionco/react-doctor | MIT-modified | in-sync | keep-upstream | never adopt without permission review (Finding 3) |
| shadcn | shadcn-ui/ui (renamed) | MIT | in-sync | keep-upstream | re-pin source at next update (Finding 6) |
| supabase-postgres-best-practices | supabase/agent-skills | MIT | in-sync | keep-upstream | evolving Postgres/Supabase guidance |
| ui-ux-pro-max | nextlevelbuilder/ui-ux-pro-max-skill | MIT | in-sync | keep-upstream | maintained dataset (palettes, fonts, charts) |
| vercel-composition-patterns | vercel-labs/agent-skills | no root license | lock-hash mismatch, no local edits | keep-upstream | Finding 1 |
| vercel-react-best-practices | vercel-labs/agent-skills | no root license | lock-hash mismatch, no local edits | keep-upstream | Finding 1 |
| vercel-react-view-transitions | vercel-labs/agent-skills | no root license | lock-hash mismatch, no local edits | keep-upstream | Finding 1 |
| web-design-guidelines | vercel-labs/agent-skills | no root license | lock-hash mismatch, no local edits | keep-upstream | Finding 1 |
| webapp-testing | anthropics/skills | none at root | in-sync | keep-upstream | Playwright/browser capabilities evolve |
| diagnosing-bugs | mattpocock/skills | MIT | in-sync (`scripts/hitl-loop.template.sh` included) | adopt-candidate | include the script in provenance when adopting |
| grilling | mattpocock/skills | MIT | in-sync (single file) | adopt-candidate | cleanest Phase 3 pilot; behaviorally coupled to the locally adopted `grill-with-docs` and required by `tests/repo.test.ts` |
| prototype | mattpocock/skills | MIT | in-sync (`LOGIC.md`, `UI.md`) | adopt-candidate | stable workflow policy |
| tdd | mattpocock/skills | MIT | in-sync (`mocking.md`, `tests.md`) | adopt-candidate | stable workflow policy |
| verification-before-completion | obra/superpowers | MIT | in-sync | adopt-candidate | stable behavioral policy |
| frontend-design | anthropics/skills | none at root | in-sync | adopt-blocked | workflow-stable and adoptable in behaviour, blocked by Finding 2 |
| code-review | mattpocock/skills | MIT | in-sync | review-repair-first | assumes `/setup-matt-pocock-skills` + `docs/agents/issue-tracker.md` (Finding 5); repair refs or keep upstream before adopting |
| to-spec | mattpocock/skills | MIT | in-sync | review-repair-first | same missing-convention assumption |
| to-tickets | mattpocock/skills | MIT | in-sync | review-repair-first | same missing-convention assumption |
| improve-codebase-architecture | mattpocock/skills | MIT | in-sync (`HTML-REPORT.md`) | review-repair-first | references missing `/codebase-design` and `/domain-modeling` (Finding 5) |
| tailwind-design-system | wshobson/agents | MIT | in-sync (`references/`) | review-repair-first | mixes stable design-system workflow with version-sensitive Tailwind knowledge; consider splitting policy from version-paced facts before adopting |

## Decision-criteria notes

- **Framework/product/API dependence** drove every keep-upstream verdict; none
  of the 11 has received local edits (the 4 hash mismatches are Finding 1
  noise), so upstream freshness outweighs local stability for them.
- **Stable workflow/behaviour policy** drove the 5 adopt-candidates. None has
  diverged locally yet — adoption would be preventive (blast-radius control),
  not divergence-response. This is a weaker justification than Phase 1's; each
  adoption should still be an explicit decision with recorded provenance.
- **Blast-radius coupling:** `grilling` is invoked by the locally authoritative
  `grill-with-docs` and hard-required by `tests/repo.test.ts`. An upstream
  rewrite of `grilling` could change behavior the repository now depends on —
  the strongest adoption case in the list.
- **Companion-skill assumptions** (Finding 5) mean adopting
  `code-review`/`to-spec`/`to-tickets`/`improve-codebase-architecture` as-is
  would preserve instructions that reference skills this repository does not
  have — a repair decision is required before any adoption.

## Recommended next actions (no migration in this pass)

1. Phase 3 pilot on `grilling` (single file, MIT, clean history, highest
   coupling to already-local behavior).
2. Ask `anthropics/skills` to clarify licensing, or obtain permission, before
   any `frontend-design` adoption.
3. Decide repair-vs-keep-upstream for the four companion-referencing skills
   before considering their adoption.
4. Re-pin the `shadcn` source to `shadcn-ui/ui` at its next named update.
