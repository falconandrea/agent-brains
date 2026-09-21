# B1 — ponytail-review on Diff B — 2026-09-21

- Fixture repository: agent-brains at `/Users/andreafalcon/dev/agent-brains`
- Fixture state: HEAD `763387a3ee55f371a5ab0d9e1aae7e75abcac789` checked out;
  the working tree additionally contained the untracked pilot skill
  `extra/skills/ponytail-review/` (the lens under test, present by design — this
  is not a clean-HEAD tree; see [README.md](README.md))
- Evaluated range: `906c47e..ed43993` (historical; file versions read via
  `git show ed43993:<path>`)
- Client/runtime: opencode CLI, Task tool, subagent type `general`, fresh context
- Provider/model: host session's configured provider (GLM coding plan); exact
  per-run variant not independently logged
- Lens skill: `extra/skills/ponytail-review/SKILL.md`
- Raw session: prompt and complete returned output below, verbatim

## Input (exact prompt)

You are acting as one independent, READ-ONLY evaluation lens on the repository at /Users/andreafalcon/dev/agent-brains (git worktree; HEAD is 763387a).

Hard read-only rule: do NOT create, edit or delete any file; do NOT run any mutating command (no git commit/checkout/apply/stash/restore, no npm/pip install, no formatters). Only read files and run read-only inspection commands (git show, git diff, git log, ls, etc.).

Your lens: the `ponytail-review` skill. First read /Users/andreafalcon/dev/agent-brains/extra/skills/ponytail-review/SKILL.md and follow it exactly as your review procedure.

Do NOT read these files (independence requirement): .agents/skills/karpathy-guidelines/SKILL.md, .agents/skills/simplify/SKILL.md, .agents/skills/code-review/SKILL.md, docs/evals/**.

Target diff (skill/workflow/documentation-heavy): commit range 906c47e..ed43993 ("fix: repair grill-with-docs workflow"). Obtain it with:
- git diff 906c47e..ed43993
- git show ed43993 --stat
The change edits .agents/skills/grill-with-docs/SKILL.md (adds ~126 lines), adds evals/README.md and agents/openai.yaml, and edits docs. You may read any repo file in the current working tree to verify reuse claims (note: files may have evolved since ed43993 — for line-accurate findings use `git show ed43993:<path>` to read the file as of that commit).

Deliverable (final message, plain text):
1. Your report in the skill's own output format: one line per finding with tag (delete/reuse/stdlib/native/yagni/shrink), location (path:line or line range), what to cut, what replaces it; `needs-confirmation:` lines for assumption-dependent findings; final `net: -N lines possible.` or `Lean already. Ship.`
2. A structured per-finding list: path | line/range | tag | actionable (yes | needs-confirmation | no) | estimated net deletion (lines) | false-positive risk you see in your own finding.
3. An "out-of-lens observations" section ONLY if you noticed correctness/security/performance/spec issues — list them separately and mark them out of your scope.

This is research/evaluation work only: write no files; return everything in your final message.

## Raw output (verbatim)

All verification done. Line numbers below refer to the files as of ed43993 (`git show ed43993:<path>`).

---

## Ponytail review — 906c47e..ed43993 ("fix: repair grill-with-docs workflow")

```
reuse:   .agents/skills/grill-with-docs/SKILL.md:L77-80,L88-92 — interview mechanics (one question per turn, look up repository facts yourself, give a recommendation, confirm shared understanding) re-spec the existing `grilling` skill (.agents/skills/grilling/SKILL.md:L6-12), which ships in the same profiles/common.list; replace with "Run the `grilling` interview; additionally record each answer and discovery in the checkpoint" — the checkpoint bookkeeping (L82-86) is the genuinely new part and stays.
shrink:  .agents/skills/grill-with-docs/SKILL.md:L13-22 — Invariants block restates rules already enforced at point of use (one-question at L77-80, phase gating at L96/L113-115/L119, no-code/no-output-without-approval at L88-89,L119-121,L125-127); keep each rule once at point of use and cut the summary restatements (e.g. L125-127 → one line).
shrink:  .agents/skills/grill-with-docs/SKILL.md:L99-101 — "set the phase back to interview and persist the checkpoint before asking the next question" repeats L91-92 plus the generic persist rule; replace with "otherwise return to §2."
shrink:  .agents/skills/grill-with-docs/evals/README.md:L13-18 — "Execution status" disclaimer duplicates the status sentence this same commit adds to docs/plans/pi-plugin-adoption-roadmap.md ("The behavioral evals are defined as manual protocols; no transcript is claimed…"); keep it in one place (the roadmap is the declared source of truth for execution status).
shrink:  .agents/skills/grill-with-docs/evals/README.md:L71-76 — "Failure signals" restates per-case "Must observe" bullets in negative form (batch questions ↔ L31/L52, premature output ↔ L66, code edits ↔ L26/L35, lost branch ↔ L48-51); only new item is the `domain-modeling` regression check — replace the section with that single line.
needs-confirmation: reuse finding above assumes cross-skill references are acceptable; R0.1's acceptance ("uses only available skills") and the eval failure signal only forbid unavailable skills, and `grilling` is in common.list — but if the maintainers require each SKILL.md to be self-contained when injected, keep the restated rules and cut nothing there.
```

Protected, not flagged: the five-section checkpoint template (SKILL.md:L39-69) — roadmap R0.1 explicitly demands "known facts, open decisions, assumptions, coverage and decision branches"; `agents/openai.yaml` — byte-identical to the existing convention in setup/feature/astro/laravel/nextjs; the three eval cases — spec-demanded ("Add representative skill evals"); the roadmap/README edits are net deletions/dedup toward the declared source of truth.

```
net: -23 lines possible (approximate).
```

## Per-finding list

| path | line/range | tag | actionable | est. net deletion | false-positive risk |
|---|---|---|---|---|---|
| .agents/skills/grill-with-docs/SKILL.md | L77-80, L88-92 | reuse | yes | ~6 | Skill prompts are often deliberately self-contained because runtimes inject SKILL.md bodies individually; `grilling`'s text may not be loaded when grill-with-docs fires, so the restatement may be functional, not duplication |
| .agents/skills/grill-with-docs/SKILL.md | L13-22 | shrink | yes | ~6 | Repeated constraints in prompt files measurably improve LLM compliance; the evals score exactly these behaviors, so cutting restatements risks eval regressions |
| .agents/skills/grill-with-docs/SKILL.md | L99-101 | shrink | yes | ~2 | Tiny; the explicit "persist" wording may exist because phase-revert was the previously buggy path |
| .agents/skills/grill-with-docs/evals/README.md | L13-18 | shrink | yes | ~5 | The local disclaimer guards against over-claiming at the file a reader of the evals actually opens; removing it relies on readers also opening the roadmap |
| .agents/skills/grill-with-docs/evals/README.md | L71-76 | shrink | yes | ~4 | Negative-form failure signals are easier to score than inverting five positive bullet lists per case; folding may reduce evaluator usability |

## Out-of-lens observations (correctness/spec — outside ponytail scope)

1. **Dropped OpenCode invocation guard (possible spec regression):** the commit removes `disable-model-invocation: true` from SKILL.md frontmatter and replaces it with `agents/openai.yaml`, which per repo docs (README "Explicit-only activation") governs **Codex** only. Net effect: OpenCode may now implicitly auto-invoke grill-with-docs where it previously could not. needs-confirmation whether intentional; if not, restore the frontmatter key.
2. **Stale comment, pre-existing file:** `profiles/common.list:L6` says "feature & setup are allow_implicit_invocation:false" — now inaccurate since grill-with-docs also carries the flag (comment-only; file untouched by this diff).
