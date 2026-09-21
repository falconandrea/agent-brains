# B2 — karpathy-guidelines on Diff B — 2026-09-21

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
- Lens skill: `.agents/skills/karpathy-guidelines/SKILL.md`
- Raw session: prompt and complete returned output below, verbatim

## Input (exact prompt)

You are acting as one independent, READ-ONLY evaluation lens on the repository at /Users/andreafalcon/dev/agent-brains (git worktree; HEAD is 763387a).

Hard read-only rule: do NOT create, edit or delete any file; do NOT run any mutating command (no git commit/checkout/apply/stash/restore, no npm/pip install, no formatters). Only read files and run read-only inspection commands (git show, git diff, git log, ls, etc.).

Your lens: the `karpathy-guidelines` skill. First read /Users/andreafalcon/dev/agent-brains/.agents/skills/karpathy-guidelines/SKILL.md, then apply its three sections (1. Think Before Coding, 2. Simplicity First, 3. Surgical Changes) as review criteria against the target diff. Judge the change the diff introduced: minimum prose/instructions that solve the problem, no speculative structure, no unrequested configurability, and scope discipline.

Do NOT read these files (independence requirement): extra/skills/ponytail-review/**, .agents/skills/simplify/SKILL.md, .agents/skills/code-review/SKILL.md, docs/evals/**.

Target diff (skill/workflow/documentation-heavy): commit range 906c47e..ed43993 ("fix: repair grill-with-docs workflow"). Obtain it with:
- git diff 906c47e..ed43993
- git show ed43993 --stat
The change edits .agents/skills/grill-with-docs/SKILL.md (adds ~126 lines), adds evals/README.md and agents/openai.yaml, and edits docs. You may read any repo file in the working tree for context; for line-accurate findings use `git show ed43993:<path>`.

Deliverable (final message, plain text):
1. Findings, one per item: path | line/range (in the file as of ed43993) | guideline violated (quote the short rule) | proposed deletion/replacement or simplification | estimated net line change.
2. Mark each finding actionable (yes | needs-confirmation | no).
3. Note any false-positive risk in your own findings.
4. "Out-of-lens observations" ONLY if you noticed correctness/security/performance/spec issues — list separately, marked out of scope.

This is research/evaluation work only: write no files; return everything in your final message.

## Raw output (verbatim)

FINDINGS (karpathy-guidelines lens; lines are from `git show ed43993:<path>`)

1. .agents/skills/grill-with-docs/SKILL.md | 13–22 | Simplicity First: "Write the minimum code that solves the problem." | The `## Invariants` block restates rules that sections 1–4 already state authoritatively: one-checkpoint (15 ↔ 26–29), one-question-at-a-time+recommendation (18–19 ↔ 77–80, 88), phase separation (20 ↔ 94–96), no-source-code/no-implementation (21–22 ↔ 119–121, 125–127), inspect-repo-first (16–17 ↔ 31–34, 77). Delete the section and keep the phase-section wording (or keep Invariants and strip the repeats in the body — one copy either way). | ~−10 | needs-confirmation

2. .agents/skills/grill-with-docs/SKILL.md | 26–29 | Simplicity First (same rule) | "Reuse … if it already exists; otherwise create … Never create a second checkpoint" is the third statement of the one-checkpoint rule (see finding 1). Compress to: "Use `.ai/features/<slug>/grill-checkpoint.md` as the topic's only checkpoint; create the directory tree if missing." | −2 | yes

3. .agents/skills/grill-with-docs/SKILL.md | 96–101 | Simplicity First | Phase-bookkeeping mechanics ("First set `## Current phase` … and persist that update" / "set the phase back … and persist the checkpoint before asking the next question") state the persistence obligation twice and over-specify; the load-bearing gate is user confirmation. Compress to ~2 lines: enter only after confirmation, keep `Current phase` in sync, return to interview if the user keeps grilling. | −3 | yes

4. .agents/skills/grill-with-docs/SKILL.md | 109–115 | Simplicity First | "Do not create an ADR, glossary entry or plan merely because it was mentioned during the interview" (110–111) is subsumed by "Until approval, write nothing except the checkpoint" (114–115). Merge into one sentence. | −2 | yes

5. .agents/skills/grill-with-docs/evals/README.md | 13–18 | Simplicity First / no speculative structure | `## Execution status` duplicates the roadmap's status record (docs/plans/pi-plugin-adoption-roadmap.md:117–119, which declares itself execution source of truth) and adds an unrequested completed-run artifact protocol (save prompt, fixture revision, transcript, checkpoint, artifact list). Reduce to "Not yet run." or delete the section. | −5 | needs-confirmation

6. .agents/skills/grill-with-docs/SKILL.md 1–4 + agents/openai.yaml:1–2 | Surgical Changes: "Match the existing codebase style" | Local interactive skills (handoff, to-spec, to-tickets, review-animations, improve-codebase-architecture) gate invocation via frontmatter `disable-model-invocation: true`; this change dropped that flag and adopted the installed-skill convention (`agents/openai.yaml`, README.md:106–107) — but without the "Invoke explicitly ($x / /x) … do not auto-trigger" clause every yaml-carrying skill's description carries. Restore the frontmatter flag and/or add the clause. | +1 | needs-confirmation

7. docs/pi-brain/README.md | 24–26 | Surgical Changes: "Do not 'improve' adjacent code … orthogonal to the task" | The surgical edit was "R0.1" → "R0.2"; instead the sentence was refactored into a generic "source of truth for the next action" pointer. Revert to the minimal status update, or accept as intentional de-rotting (it does match the roadmap's declared role). | 0 | needs-confirmation

Deliberately NOT flagged (calibration): the 31-line checkpoint template (SKILL.md:39–69) looks heavy, but every section maps 1:1 to R0.1's requested contents (roadmap:121–127) — requested structure, not speculative. Roadmap status/checkbox/next-action edits are required bookkeeping, in scope.

Net estimated line change if all accepted: ~−21.

FALSE-POSITIVE RISK
- Findings 1–4: skills are prompts; restating invariants up top is a known adherence tactic for LLM consumers, and the repo's own evals score behavior, not wording. Compression should only land if GWD-1..3 still pass — the duplication may be load-bearing.
- Finding 5: the section may be a guard against agents falsely claiming evals ran (roadmap wording "no transcript is claimed" hints at a prior incident); deleting removes a guardrail.
- Finding 6: roadmap status says "official skill validation, policy parsing … pass," suggesting an external validator required `agents/openai.yaml`; the frontmatter drop may have been explicitly requested outside this diff.
- Finding 7: the generic pointer may be the intentionally minimal long-term fix rather than scope creep.

OUT-OF-LENS OBSERVATIONS (marked out of scope)
- Correctness/spec: dropping `disable-model-invocation: true` with no opencode-side replacement (finding 6's file) likely re-enables model auto-invocation of `grill-with-docs` in opencode — a behavior regression vs. the old skill, which explicitly disabled it. No security or performance issues observed in the diff.
