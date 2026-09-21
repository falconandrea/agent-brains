# B4b — code-review, Spec axis on Diff B — 2026-09-21

- Fixture repository: agent-brains at `/Users/andreafalcon/dev/agent-brains`
- Fixture state: HEAD `763387a3ee55f371a5ab0d9e1aae7e75abcac789` checked out;
  working tree additionally contained the untracked pilot skill
  `extra/skills/ponytail-review/` (the lens under test; not referenced by this
  run) and, later in the session, unrelated R0.4 artifacts — see
  [README.md](README.md) for the exact chronology
- Evaluated range: `906c47e...ed43993` (historical; file versions read via
  `git show ed43993:<path>`)
- Client/runtime: opencode CLI, Task tool, subagent type `general`, fresh context
- Provider/model: host session's configured provider (GLM coding plan); exact
  per-run variant not independently logged
- Lens: `.agents/skills/code-review/SKILL.md` Spec axis, executed faithfully
  (separate sub-agent, per the skill's contract)
- Spec source: R0.1 checklist + acceptance from
  `docs/plans/pi-plugin-adoption-roadmap.md` at fixed point `906c47e` and the
  §7 Action paragraph from
  `docs/research/pi-plugins-and-context-structure-assessment.md` (pasted in the
  prompt)
- Raw session: prompt and complete returned output below, verbatim

## Input (exact prompt)

You are the Spec sub-agent of a two-axis code review, executing exactly the brief below. Repository: /Users/andreafalcon/dev/agent-brains.

READ-ONLY: do not create/edit/delete files; no mutating git commands; no installs. Only read files and run read-only commands (git show/diff/log, ls). Historical-diff review; no issue tracker.

Diff command: git diff 906c47e...ed43993
Commit list (git log 906c47e..ed43993 --oneline): ed43993 fix: repair grill-with-docs workflow
For line-accurate citation use `git show ed43993:<path>`; read working-tree files for context if needed (they may have evolved).

The spec (originating requirement): the R0.1 item this diff implements, from docs/plans/pi-plugin-adoption-roadmap.md at the fixed point 906c47e, plus the upstream defect/Action it resolves from docs/research/pi-plugins-and-context-structure-assessment.md section 7:

### R0.1 Repair the grilling path

**Status:** NEXT

- [ ] Remove the unresolved `domain-modeling` dependency from
  `grill-with-docs`, or add an intentionally designed replacement.
- [ ] Add a persistent shared-understanding checkpoint containing known facts,
  open decisions, assumptions, coverage and decision branches.
- [ ] Add an explicit `interview → output selection → output` phase boundary.
- [ ] Keep the existing one-question-at-a-time behavior.
- [ ] Add representative skill evals before replacing the current version.

**Acceptance:** invoking `grill-with-docs` uses only available skills, preserves
one current checkpoint and cannot enter an output-producing phase without
explicit user approval.

From the assessment (section 7, `pi-grill-me`): "A concrete local defect was also found: `grill-with-docs` instructs the agent to run `domain-modeling`, but that skill does not exist in this repository or its profiles. The workflow is therefore incomplete today." and its Action: "First repair the local skill pair. Import the checkpoint schema—known facts, open decisions, assumptions, coverage, decision branches and approved outputs—and the explicit `interview → output selection → output` phase. … Do not copy its heuristic bash blocker into the core workflow without tests."

Your brief (report under 400 words): Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words.

Return only your report as your final message.

## Raw output (verbatim)

**Spec review — R0.1 "Repair the grilling path" (ed43993)**

## (a) Missing / partial

1. **Partial — "Add representative skill evals before replacing the current version."** Three eval cases exist (`evals/README.md`), but the README itself states: "These are manual evaluation protocols, not execution results… no transcript is claimed until they are run." The skill was replaced in the same commit with zero behavioral runs; the safeguard the spec asked to have *before* replacement was never executed. The roadmap nonetheless marks this checkbox `[x]` and R0.1 "completed," with only a hedge in the status line.

2. **Partial — Acceptance: "invoking `grill-with-docs` uses only available skills…"** This is satisfied structurally (the only skill referenced is `grilling`, which exists), but it is unverified: no eval transcript demonstrates an actual invocation. Acceptance is claimed on structural review plus "official skill validation" — not on the behavior the acceptance sentence describes.

## (b) Scope creep

3. **Roadmap/doc rewrites beyond R0.1.** The commit rewrites `docs/plans/pi-plugin-adoption-roadmap.md` F0 section text (deleting "R0.1 remains the current next action" clauses), flips R0.2 to NEXT, rewrites the closing "Next action," and edits `docs/pi-brain/README.md`. Benign bookkeeping, but adjacent F0 prose edits exceed the R0.1 item.

4. **Invocation-metadata change.** `disable-model-invocation: true` frontmatter was dropped and replaced by `agents/openai.yaml` (`allow_implicit_invocation: false`). This follows repo convention (feature, nextjs, laravel, etc.) but is a behavior change for non-OpenAI harnesses that honored the frontmatter; the spec never asked for it.

## (c) Implemented but looks wrong

5. **Checkbox honesty.** "`- [x] Add representative skill evals before replacing the current version.`" is marked complete while the evals' own "Execution status" section says no run has occurred and "Structural validation of the skill does not count as a behavioral run." The completion claim contradicts the artifact it cites.

6. **"cannot enter an output-producing phase without explicit user approval."** The gate exists in prose (§3–4: explicit approval before writing; approval of documents ≠ approval to implement), but it is prompt-enforced only — consistent with the assessment's caution, no bash blocker was copied, yet nothing executable enforces the gate, and no eval has yet caught a violation.

**Confirmed satisfied:** `domain-modeling` dependency removed; checkpoint schema (facts, open decisions, assumptions, coverage, decision branches, approved outputs, phase); explicit `interview → output selection → output` boundary with persisted phase; one-question-at-a-time preserved; single-checkpoint rule; `.ai/features/<slug>/` matches repo convention.
