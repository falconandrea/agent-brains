# A4b — code-review, Spec axis on Diff A — 2026-09-21

- Fixture repository: agent-brains at `/Users/andreafalcon/dev/agent-brains`
- Fixture state: HEAD `763387a3ee55f371a5ab0d9e1aae7e75abcac789` checked out;
  working tree additionally contained the untracked pilot skill
  `extra/skills/ponytail-review/` (the lens under test; not referenced by this
  run) and, later in the session, unrelated R0.4 artifacts — see
  [README.md](README.md) for the exact chronology
- Evaluated range: `96c639b...763387a`
- Client/runtime: opencode CLI, Task tool, subagent type `general`, fresh context
- Provider/model: host session's configured provider (GLM coding plan); exact
  per-run variant not independently logged
- Lens: `.agents/skills/code-review/SKILL.md` Spec axis, executed faithfully
  (separate sub-agent, per the skill's contract)
- Spec source: R0.3 checklist + acceptance from
  `docs/plans/pi-plugin-adoption-roadmap.md` at fixed point `96c639b` (pasted in
  the prompt)
- Raw session: prompt and complete returned output below, verbatim

## Input (exact prompt)

You are the Spec sub-agent of a two-axis code review, executing exactly the brief below. Repository: /Users/andreafalcon/dev/agent-brains.

READ-ONLY: do not create/edit/delete files; no mutating git commands; no installs. Only read files and run read-only commands (git show/diff/log, ls). Historical-diff review; no issue tracker.

Diff command: git diff 96c639b...763387a
Commit list (git log 96c639b..763387a --oneline): 763387a Add read-only context audit skill
For line-accurate citation use `git show 763387a:<path>`; read working-tree files for context if needed.

The spec (originating requirement, from docs/plans/pi-plugin-adoption-roadmap.md at the fixed point 96c639b — the R0.3 item this diff implements):

### R0.3 Add a read-only context audit

**Status:** pending — depends on R0.2

- [ ] Extend `lessons-gardener` or add a sibling `context-audit` skill.
- [ ] Detect stale implementation claims, contradictions with code/ADRs,
  duplicate authority, broken references and abnormal file growth.
- [ ] Classify references by role and authority: validate operational paths,
  distinguish historical or descriptive mentions, and treat non-canonical
  research as evidence rather than current project truth.
- [ ] Keep diagnosis read-only until the user approves a proposed rewrite.
- [ ] Preserve the current lessons admission rule: retain only non-obvious,
  project-specific knowledge an agent would otherwise lose.

**Acceptance:** the audit reports actionable findings with source paths and
does not mutate any context file before approval.

Your brief (report under 400 words): Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words.

Return only your report as your final message.

## Raw output (verbatim)

**Spec review — R0.3 "Add a read-only context audit" (commit 763387a)**

**(a) Missing / partial requirements**

1. **Partial — "Detect … abnormal file growth."** The helper (`scripts/context-audit.mjs`) reports only point-in-time line/byte counts; there is no baseline storage or history comparison, so "growth since the previous audit" exists only as SKILL.md prose (step 6, "unexplained large growth since the previous audit (Git history)") delegated to the agent with no mechanical support and no record kept for the *next* audit. First-run growth detection is effectively impossible.
2. Otherwise all spec bullets are addressed: sibling skill added; staleness/contradiction, duplicate-authority, broken-reference detection defined (SKILL.md steps 3–6); read-only invariant ("Keep diagnosis read-only until the user approves a proposed rewrite") enforced in Invariants and proven read-only by test (`tests/context-audit.test.ts`, byte+mtime snapshot); lessons admission rule preserved (step 7, "may hold only non-obvious, project-specific knowledge…"). Acceptance "reports actionable findings with source paths" is met via the Output Contract (evidence "with file paths and line numbers").

**(b) Scope creep**

1. `.agents/skills/context-audit/evals/README.md` (124 lines of manual eval protocols CA-1–CA-4) — not requested by any spec bullet; the diff itself admits "they have not been executed."
2. Router/test wiring (`profiles/common.list`, `src/skill-router.ts:73`, `tests/unit.test.ts`) — plausibly required for the skill to load in this repo, but the spec only says "add a sibling `context-audit` skill"; the "operational" categorization and never-reaches-pipeline-roles guarantee are extra design decisions.
3. `scripts/context-audit.d.mts` type declarations — supporting, unrequested.

**(c) Implemented but looks wrong**

1. **"Classify references by role and authority" vs. script behavior:** the link regex `/\[[^\]]*\]\(([^)\s]+)…\)/` silently skips any relative link whose target contains a space, and `EXCLUDED_DIRS` skips *any* directory named `logs`/`tmp`/`build` at any depth (e.g. `docs/build-notes/` would be pruned), so some "operational paths" the spec wants validated never become candidates. Minor, untested edges.
2. **"contradictions with code/ADRs":** detection is purely instructional; the deterministic helper "does not classify references, decide contradictions" — acceptable by design, but the roadmap marks the checkbox `[x]` "Detect …" when only guidance (unverified by the unexecuted evals) provides detection. Evidence for that `[x]` rests on manual protocols explicitly "not executed."

**Verdict:** core spec satisfied and well-tested for read-only behavior; growth detection is partial, evals/wiring are creep, and two helper edge cases under-collect reference candidates.
