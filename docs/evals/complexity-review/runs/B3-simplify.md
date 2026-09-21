# B3 — simplify on Diff B — 2026-09-21

- Fixture repository: agent-brains at `/Users/andreafalcon/dev/agent-brains`
- Fixture state: HEAD `763387a3ee55f371a5ab0d9e1aae7e75abcac789` checked out;
  the working tree additionally contained the untracked pilot skill
  `extra/skills/ponytail-review/` (present by design; this run was instructed
  not to read it — not a clean-HEAD tree; see [README.md](README.md))
- Evaluated range: `906c47e..ed43993` (historical; file versions read via
  `git show ed43993:<path>`)
- Client/runtime: opencode CLI, Task tool, subagent type `general`, fresh context
- Provider/model: host session's configured provider (GLM coding plan); exact
  per-run variant not independently logged
- Lens skill: `.agents/skills/simplify/SKILL.md` (report-only dry run)
- Raw session: prompt and complete returned output below, verbatim

## Input (exact prompt)

You are acting as one independent, READ-ONLY evaluation lens on the repository at /Users/andreafalcon/dev/agent-brains (git worktree; HEAD is 763387a).

Hard read-only rule: do NOT create, edit or delete any file; do NOT run any mutating command (no git commit/checkout/apply/stash/restore, no npm/pip install, no formatters, no test runs). Only read files and run read-only inspection commands (git show, git diff, git log, ls, etc.). This is the `simplify` skill executed in REPORT-ONLY dry-run mode: describe what you would clean up; change nothing.

Your lens: the `simplify` skill. First read /Users/andreafalcon/dev/agent-brains/.agents/skills/simplify/SKILL.md, then walk its passes over the target diff — adapted to a prose/skill change: (1) mechanical lint/format — obvious formatting/markdown drift provable from the diff (do not run formatters); (2) dead content pruning — leftover boilerplate, unused scaffolding, duplicated sections introduced by the diff; (3) noise clean-pass — prose that restates what structure/headers already say, redundant emphasis; (4) verification gate — note which commands would apply, do not run them.

Do NOT read these files (independence requirement): extra/skills/ponytail-review/**, .agents/skills/karpathy-guidelines/SKILL.md, .agents/skills/code-review/SKILL.md, docs/evals/**.

Target diff (skill/workflow/documentation-heavy): commit range 906c47e..ed43993 ("fix: repair grill-with-docs workflow"). Obtain it with:
- git diff 906c47e..ed43993
- git show ed43993 --stat
The change edits .agents/skills/grill-with-docs/SKILL.md (adds ~126 lines), adds evals/README.md and agents/openai.yaml, and edits docs. You may read repo files in the working tree; for line-accurate findings use `git show ed43993:<path>`.

Deliverable (final message, plain text):
1. Findings, one per item: path | line/range (file as of ed43993) | pass (lint-format | dead-content | noise | other) | proposed removal/change | estimated net line deletion.
2. Mark each finding actionable (yes | needs-confirmation | no).
3. Note any false-positive risk in your own findings (e.g. deliberate repetition for LLM consumers).
4. "Out-of-lens observations" ONLY if you noticed correctness/security/performance/spec issues — list separately, marked out of scope.

This is research/evaluation work only: write no files; return everything in your final message.

## Raw output (verbatim)

**simplify dry-run report — commit range 906c47e..ed43993 ("fix: repair grill-with-docs workflow")**

Skill file read (`.agents/skills/simplify/SKILL.md`); passes 1–4 executed read-only against the diff and the files as of ed43993.

## Findings

1. `.agents/skills/grill-with-docs/SKILL.md` | 3 | lint-format | Frontmatter description is 157 chars vs the ~80-col wrap used everywhere else in the file. No change proposed — single-line frontmatter descriptions and long skill descriptions are the repo-wide convention (compare `improve-codebase-architecture`, `pest-testing`). | 0 lines | **no**
2. `.agents/skills/grill-with-docs/SKILL.md` | 88 | noise | "Do not batch questions" is the third statement of the one-question rule (intro L9–10, invariant L18–19, L78 "ask exactly one question in a turn"). Could drop the clause, keeping "silently resolve material ambiguity, or generate a PRD…". | ~1 line | **needs-confirmation**
3. `.agents/skills/grill-with-docs/SKILL.md` | 125–127 | noise | Closing paragraph restates the doc-approval-≠-implementation-approval rule already in the intro (L10–11) and invariants (L21–22); "Do not modify source code" (L121) also repeats L21. Trim intro's "It does not implement the plan." or compress the closing to one sentence. | ~2–3 lines | **needs-confirmation**
4. `.agents/skills/grill-with-docs/SKILL.md` | 77–78 | noise | "Inspect code and documentation before asking about anything that can be established from them" duplicates invariant L16–17. Drop one instance. | ~1–2 lines | **needs-confirmation**
5. `.agents/skills/grill-with-docs/evals/README.md` | 71–76 | dead-content/noise | "Failure signals" negatively restates the GWD-1..3 "Must observe" bullets; the only non-duplicated signal is the `domain-modeling` reference check. Compress to the unique signals. | ~3–4 lines | **needs-confirmation**

Dead-content pass otherwise clean: the `/domain-modeling` dependency is fully gone (no such skill dir, no refs at ed43993); `agents/openai.yaml` follows an existing 6-skill convention (astro, feature, laravel, nextjs, setup); roadmap has no stale "R0.1 is next action" remnants; `docs/pi-brain/README.md` relative link resolves. No trailing whitespace; `git diff --check 906c47e..ed43993` clean (read-only).

## False-positive risk

High on findings 2–4. Skill files are prompts consumed by LLMs, and deliberate restatement of hard gates (one-question-at-a-time, no-implementation, repository-first) at both invariant and phase level is a standard robustness technique — the repo's other skill (`simplify` itself) also repeats its critical rule twice. I would not apply 2–4 without the owner confirming the repetition isn't intentional. Finding 5 has moderate FP risk: failure-taxonomy sections are a conventional eval format even when they mirror observables.

## Verification gate (would apply; not run)

- `npx markdownlint-cli2` or `npx prettier --check` — **not configured** in this repo (no config files; package.json has only `test`/`typecheck`, and no TS changed), so nothing to run.
- The real gate is the manual GWD-1..3 behavioral protocols defined in the new `evals/README.md` (fresh session + fixture, transcript saved beside the file) — none claimed as run yet, consistent with the roadmap's own status text.

Estimated total if all needs-confirmation items applied: ~7–10 net lines removed out of 218 added. The diff is substantially clean; the skill's only mechanical debris is intentional-looking repetition.

## Out-of-lens observations (out of scope)

- Invocation-guard mechanism split: 5 older skills still rely on frontmatter `disable-model-invocation: true` (handoff, improve-codebase-architecture, review-animations, to-spec, to-tickets) while this change moved grill-with-docs to `agents/openai.yaml` `allow_implicit_invocation: false`. If the consuming platform honors only one mechanism, either those 5 skills are implicitly invocable or the new yaml is inert. Pre-existing inconsistency, not introduced here.
