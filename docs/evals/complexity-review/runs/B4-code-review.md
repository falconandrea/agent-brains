# B4 — code-review on Diff B — 2026-09-21 — SUPERSEDED PROXY RUN

> **Superseded.** This run executed both axes in a single context and was
> explicitly instructed not to spawn sub-agents — a deviation from the
> `code-review` skill's contract (two separate parallel sub-agents to avoid
> context contamination). It is preserved as a faithful record of the proxy run,
> but the findings of record are the faithful rerun in
> [B4a-standards-axis.md](B4a-standards-axis.md) and
> [B4b-spec-axis.md](B4b-spec-axis.md).

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
- Lens skill: `.agents/skills/code-review/SKILL.md` (both axes in one run)
- Raw session: prompt and complete returned output below, verbatim
- Note: finding S3 concerns `skills-lock.json`, a file **unchanged** by the
  evaluated range; the evaluator itself flagged it as such. It is preserved
  verbatim and reclassified as an out-of-range context observation in the
  synthesized report.

## Input (exact prompt)

You are acting as one independent, READ-ONLY evaluation lens on the repository at /Users/andreafalcon/dev/agent-brains (git worktree; HEAD is 763387a).

Hard read-only rule: do NOT create, edit or delete any file; do NOT run any mutating command (no git commit/checkout/apply/stash/restore, no npm/pip install). Only read files and run read-only inspection commands (git show, git diff, git log, ls, gh for reading issues if needed).

Your lens: the `code-review` skill (two-axis review). First read /Users/andreafalcon/dev/agent-brains/.agents/skills/code-review/SKILL.md. For this historical-diff pilot, run BOTH axes yourself in this single context (do not spawn subagents): the Standards axis including its smell baseline, and the Spec axis.

Spec source for this diff: the R0.1 checklist and acceptance criteria in docs/plans/pi-plugin-adoption-roadmap.md ("R0.1 Repair the grilling path") plus the grill-with-docs defect and Action items in section 7 (`pi-grill-me`) of docs/research/pi-plugins-and-context-structure-assessment.md (the diff implements that repair). There is no issue tracker to consult.

Do NOT read these files (independence requirement): extra/skills/ponytail-review/**, .agents/skills/karpathy-guidelines/SKILL.md, .agents/skills/simplify/SKILL.md, docs/evals/**.

Target diff (skill/workflow/documentation-heavy): fixed point 906c47e, HEAD-side ed43993 ("fix: repair grill-with-docs workflow"). Obtain it with:
- git diff 906c47e...ed43993
- git log 906c47e..ed43993 --oneline
You may read repo files in the working tree; for line-accurate findings use `git show ed43993:<path>`.

Deliverable (final message, plain text):
1. `## Standards` section: per finding — path | line/range | violated standard or smell name (judgement call vs hard) | proposed fix | estimated net line change.
2. `## Spec` section: per finding — missing/partial requirement, scope creep, or wrong-looking implementation, quoting the spec line.
3. Mark each finding actionable (yes | needs-confirmation | no) and note false-positive risk.
4. One-line summary per axis.

This is research/evaluation work only: write no files; return everything in your final message.

## Raw output (verbatim)

## Standards

Standards sources found: README.md (canonical skill-store / registration / explicit-only conventions), `templates/AGENTS.md`, `.agents/AGENTS.md` (pint/phpstan — not applicable: markdown-only diff, no PHP), plus the skill's smell baseline. Note: `agents/openai.yaml` + `allow_implicit_invocation: false` matches the repo's documented Codex explicit-only convention (README "Explicit-only activation") — good.

**S1 — Lost OpenCode-side explicit-invocation guard**
- Path/lines: `.agents/skills/grill-with-docs/SKILL.md:1-4` (frontmatter at ed43993)
- Violation: convention inconsistency (judgement call). The old frontmatter had `disable-model-invocation: true`; the diff drops it and adds only the Codex-side `agents/openai.yaml`. Repo convention for explicit-only skills is either frontmatter `disable-model-invocation: true` (handoff, to-spec, to-tickets, review-animations) and/or description phrasing "Invoke explicitly … do not auto-trigger" (feature, setup, handoff). New description has neither, so OpenCode models may now auto-invoke a skill whose own body says "Use this skill for an explicit … grilling session" and whose roadmap contract is "only when explicitly invoked" (roadmap:74-75).
- Fix: restore `disable-model-invocation: true` and/or add explicit-only phrasing to the description.
- Net line change: +1–2.
- Actionable: needs-confirmation (owner may intend trigger-phrase auto-invocation like `grilling`). False-positive risk: medium.

**S2 — Duplicated Code (smell, judgement call)**
- Path/lines: `.agents/skills/grill-with-docs/SKILL.md:13-19, 75-92` vs `.agents/skills/grilling/SKILL.md`
- The one-question-at-a-time + facts-from-repo/decisions-from-user + recommendation-with-trade-off contract is now fully restated; the old version delegated ("Run a `/grilling` session"). Two copies of the interview contract can drift — the pair the roadmap treats as one contract class.
- Fix: delegate interview mechanics to `grilling` (one line), keep only checkpoint/phase/output-gate additions here.
- Net line change: −6–10.
- Actionable: needs-confirmation. False-positive risk: medium-high (self-contained SKILL.md is a legitimate pattern since skills are injected standalone, and the repair's goal was removing broken delegation).

**S3 — Lockfile divergence unrecorded**
- Path/lines: `skills-lock.json:28-32` (unchanged by the diff)
- Smell: judgement call. `grill-with-docs` is lock-managed from `mattpocock/skills` with `computedHash: e7ef25bb…`; the hand-rewrite leaves the hash stale, and a future `npx skills update` (documented update path in README) could clobber or flag the repair.
- Fix: record the fork (re-point the entry or note the local override).
- Net line change: ±2–4.
- Actionable: needs-confirmation. False-positive risk: medium (`computedHash` may exist precisely to surface local edits).

**S4 — Checkpoint template clarity nit**
- Path/lines: `.agents/skills/grill-with-docs/SKILL.md:64-65` — `## Approved outputs` initialized as `- [ ] None yet.`
- Smell: Mysterious Name-adjacent (judgement): unclear whether "None yet" is a checkbox to tick or placeholder to delete on first approval.
- Fix: plain `- None yet.`
- Net line change: ±1.
- Actionable: yes. False-positive risk: low.

## Spec

Spec sources: roadmap R0.1 (checklist + acceptance, ed43993 lines 115-132) and assessment §7 Action (lines 264-268). Verified complete: `domain-modeling` dependency removed (acceptance "uses only available skills" holds — only `grilling` is referenced, which exists); checkpoint schema contains all six required elements (known facts, open decisions, assumptions, coverage, decision branches, approved outputs) plus phase; explicit `interview → output selection → output` boundary with persisted transitions and a hard output gate ("Until approval, write nothing except the checkpoint"); one-question-at-a-time kept; three eval cases defined; heuristic bash blocker correctly NOT copied; `docs/pi-brain/README.md` edit is required consistency maintenance (the stale "next action is R0.1" line), not scope creep.

**P1 — "repair the local skill pair" only half-touched**
- Quote: "First repair the local skill pair." (assessment:264). Only `grill-with-docs` changed; `grilling` untouched. The operative R0.1 checklist scopes repair to `grill-with-docs` alone and the defect lived only there, so likely intended.
- Actionable: needs-confirmation. False-positive risk: high.

**P2 — "evals before replacing" satisfied only atomically**
- Quote: "[x] Add representative skill evals before replacing the current version." (roadmap:127). Evals and the replacement landed in one commit; no state existed where evals were present while the old skill was still in place. The status line honestly notes the protocols are unrun (roadmap:117-119).
- Actionable: needs-confirmation. False-positive risk: high (atomic landing arguably meets intent).

**P3 — Unverifiable status evidence**
- Quote: "completed 2026-09-18 — official skill validation, policy parsing, structural acceptance checks and `git diff --check` pass" (roadmap:117-118). No in-repo command or artifact named "official skill validation" exists; the repo's own resume instruction requires "Record evidence … when the item ends". Claims may refer to external tooling, but nothing in-repo corroborates them.
- Actionable: needs-confirmation. False-positive risk: medium.

Summary — Standards: 4 findings (2 substantive); worst is S1, the silently dropped OpenCode explicit-invocation guard. Spec: core R0.1/§7 requirements verifiably implemented; worst residual is P3, completion evidence that the repo cannot corroborate.
