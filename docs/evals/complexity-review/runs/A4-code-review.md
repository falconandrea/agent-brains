# A4 — code-review on Diff A — 2026-09-21 — SUPERSEDED PROXY RUN

> **Superseded.** This run executed both axes in a single context and was
> explicitly instructed not to spawn sub-agents — a deviation from the
> `code-review` skill's contract (two separate parallel sub-agents to avoid
> context contamination). It is preserved as a faithful record of the proxy run,
> but the findings of record are the faithful rerun in
> [A4a-standards-axis.md](A4a-standards-axis.md) and
> [A4b-spec-axis.md](A4b-spec-axis.md).

- Fixture repository: agent-brains at `/Users/andreafalcon/dev/agent-brains`
- Fixture state: HEAD `763387a3ee55f371a5ab0d9e1aae7e75abcac789` checked out;
  the working tree additionally contained the untracked pilot skill
  `extra/skills/ponytail-review/` (present by design; this run was instructed
  not to read it — not a clean-HEAD tree; see [README.md](README.md))
- Evaluated range: `96c639b..763387a`
- Client/runtime: opencode CLI, Task tool, subagent type `general`, fresh context
- Provider/model: host session's configured provider (GLM coding plan); exact
  per-run variant not independently logged
- Lens skill: `.agents/skills/code-review/SKILL.md` (both axes in one run)
- Raw session: prompt and complete returned output below, verbatim

## Input (exact prompt)

You are acting as one independent, READ-ONLY evaluation lens on the repository at /Users/andreafalcon/dev/agent-brains (git worktree; HEAD is 763387a).

Hard read-only rule: do NOT create, edit or delete any file; do NOT run any mutating command (no git commit/checkout/apply/stash/restore, no npm/pip install). Only read files and run read-only inspection commands (git show, git diff, git log, ls, gh for reading issues if needed).

Your lens: the `code-review` skill (two-axis review). First read /Users/andreafalcon/dev/agent-brains/.agents/skills/code-review/SKILL.md. For this historical-diff pilot, run BOTH axes yourself in this single context (do not spawn subagents): the Standards axis including its smell baseline, and the Spec axis.

Spec source for this diff: the R0.3 checklist and acceptance criteria in docs/plans/pi-plugin-adoption-roadmap.md (read the "R0.3 Add a read-only context audit" section) plus, if helpful, the "Recommended local document topology" / P0 item 3 in docs/research/pi-plugins-and-context-structure-assessment.md. There is no issue tracker to consult.

Do NOT read these files (independence requirement): extra/skills/ponytail-review/**, .agents/skills/karpathy-guidelines/SKILL.md, .agents/skills/simplify/SKILL.md, docs/evals/**.

Target diff (implementation-heavy): fixed point 96c639b, HEAD-side 763387a ("Add read-only context audit skill"). Obtain it with:
- git diff 96c639b...763387a
- git log 96c639b..763387a --oneline
You may read repo files in the working tree, and `git show <sha>:<path>` for versions at the range ends.

Deliverable (final message, plain text):
1. `## Standards` section: per finding — path | line/range | violated standard or smell name (judgement call vs hard) | proposed fix | estimated net line change.
2. `## Spec` section: per finding — missing/partial requirement, scope creep, or wrong-looking implementation, quoting the spec line.
3. Mark each finding actionable (yes | needs-confirmation | no) and note false-positive risk.
4. One-line summary per axis.

This is research/evaluation work only: write no files; return everything in your final message.

## Raw output (verbatim)

Both axes run. Sources used: `templates/AGENTS.md` (Conventions), existing `src`/`tests` patterns, the smell baseline; `.agents/AGENTS.md` (pint/phpstan) is Laravel boilerplate with no `vendor/` here — treated as inapplicable, nothing suppressed from it. Verified read-only: `tsc --noEmit` clean, `git diff --check` clean, `node --check` on the helper OK. `npm test` not run (read-only lens); the 203/203 claim is taken from the roadmap note.

## Standards

S1. .agents/skills/context-audit/scripts/context-audit.mjs | 83 | Speculative Generality (judgement call): capture group `(!?)` in `MD_LINK` (image marker) is never read — `match[1]` unused; dead hook | drop the group (or use it to tag image links) | net ~0 (−1 token) | actionable: yes | FP risk: low (could be argued as regex readability of MD syntax).

S2. .agents/skills/context-audit/scripts/context-audit.mjs | 131 vs 137, 147 | Duplicated Code (judgement call): the "which files count as docs" predicate is written three ways — `/\.(md|mmd)$/.test(rel)` for `.ai/context` but `rel.endsWith(".md")` for `.ai/features` and ADRs; the `.mmd`-only-in-context rule is unexplained at both sites, against the "comment only non-obvious logic" convention (templates/AGENTS.md:58) | extract one `isMarkdown(rel)` helper with a one-line comment on why `.mmd` applies only to context (database_schema.mmd), or comment the asymmetry in place | net +1 | actionable: needs-confirmation | FP risk: medium (asymmetry looks deliberate: templates place `.mmd` only in `.ai/context/`).

S3. tests/unit.test.ts | 158–167 | Duplicated Code (judgement call): new test re-asserts the exact banned-role property just added to the list at :152 ("no operational skill reaches any pipeline role"); only the `common`-profile resolution and the `missing` assertion are new | trim to the two novel assertions, or fold into the existing test | net ~−5 | actionable: needs-confirmation | FP risk: medium-high — repo convention already favors per-concern routing tests (cf. :169 "interactive workflow skills…").

S4. tests/unit.test.ts | 152 | style drift (judgement call; no formatter configured, nothing tooling-enforced): appending `"context-audit"` pushes the inline array ~25 chars past the file's prevailing wrap style (cf. :105–127, :162) | wrap the banned array one item per line | net +1 | actionable: yes | FP risk: medium (the pre-change line was already long).

S5. .agents/skills/context-audit/scripts/context-audit.mjs | 73–79 | Mysterious/oversilent behavior (judgement call): `findAdrDir` — when `--adr-dir X` is passed and `X` doesn't exist, it silently falls back to auto-detected candidates, so an explicit instruction is ignored without any signal (`missingOptional.adr` then reports false from a different dir); also an absolute `--adr-dir` silently nests under root via `join()` | strict mode: if explicit dir is missing, keep it and surface it via `missingOptional` (or exit with error) | net +2 | actionable: yes | FP risk: low-medium (undocumented edge; usage header doesn't promise strictness).

Standards summary: 5 findings, all judgement calls, no hard violations of documented repo standards; worst is S5 (explicit `--adr-dir` silently overridden).

## Spec

Spec: roadmap R0.3 checklist + acceptance (docs/plans/pi-plugin-adoption-roadmap.md @96c639b, lines ~156–170); research doc P0 item 3 and ownership table (docs/research/pi-plugins-and-context-structure-assessment.md:335–370).

P1. Partial — behavioral acceptance never demonstrated. Acceptance: "**Acceptance:** the audit reports actionable findings with source paths and does not mutate any context file before approval." Only the helper is unit-tested; CA-1–CA-4 are unexecuted protocols, and the evals file itself says structural validation "does not count as a behavioral run" (evals/README.md:10–14) — yet all checklist boxes are `[x]` and status says "completed". | actionable: needs-confirmation (run CA-1–CA-4, or record the caveat inside the acceptance line rather than only the status note) | FP risk: low (the commit concedes it).

P2. Partial — operational-path validation under-covers the common form. Checklist: "- [ ] Classify references by role and authority: validate operational paths…" The helper surfaces only Markdown-link targets (`[t](path)`, context-audit.mjs:83–104); backticked inline path mentions — the dominant form in AGENTS.md (e.g. templates/AGENTS.md:44–45 references `.ai/context/TECH_STACK.md` in backticks, no link) — are never surfaced, while SKILL.md:81 says "each link or path mention the helper surfaces", implying broader coverage | minimum fix: correct the SKILL.md wording to say the agent gathers path mentions itself; better: extend the helper to emit backticked relative paths as candidates | net +1 (wording) / ~+15 (script) | actionable: yes | FP risk: medium (the agent can find these during step 1 regardless; helper is described as candidates-only).

P3. Wrong-looking implementation — template artifacts inventoried as live context. SKILL.md:60–61: "Exclude dependencies, build output, caches, generated artifacts and session logs", but the script excludes only `EXCLUDED_DIRS` + `.agents/skills` (context-audit.mjs:16–23), so `templates/AGENTS.md` (scaffold artifact) is classified `agents-scoped` when auditing this repo or a freshly scaffolded one | add `templates` to `EXCLUDED_PATHS` or classify template AGENTS.md separately | net +1 | actionable: needs-confirmation | FP risk: medium (a generic target project may legitimately keep a live scoped AGENTS.md under a dir named `templates`; exclusion by default could then hide real context).

P4. Benign scope note (not creep): routing registration (profiles/common.list:15, src/skill-router.ts:73, two test hooks) is nowhere requested by R0.3, but mirrors the sibling `lessons-gardener` integration and is disclosed in the status note ("implicit invocation left enabled"); contrast R0.4's explicit-only rule for ponytail skills, which has no R0.3 counterpart | actionable: no | FP risk: n/a.

All five research-doc P0.3 categories (staleness, contradictions, duplicate authority, broken references, growth) plus the approval gate and the lessons admission rule (SKILL.md:139–146, defers pruning to `lessons-gardener`) are present and faithful; the authority table matches `templates/AGENTS.md` verbatim.

Spec summary: 4 findings; worst is P1 — acceptance is claimed "completed" while the behavior it accepts has never been observed, only designed and structurally tested.
