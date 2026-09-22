---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
license: MIT
metadata:
  management: local
  provenance: adopted
  origins:
    - repository: https://github.com/mattpocock/skills
      path: skills/engineering/research/SKILL.md
      commit: 0d74d01cbc64ca27778a49b38599f70c534e76a0
      license: MIT — full text in LICENSE in this folder
  adopted_at: 2026-09-22
  adaptation: >
    Keeps the upstream stub (background-agent instruction and job steps 1-3)
    verbatim, then adds local behaviour: research/assessment mode selection
    reported as Mode: near the title, repository-implementation inspection
    and the upstream-facts / local-evidence / inference separation (steps
    4-5), assessment-mode comparison and the single adopt / trial /
    selectively-import / reject verdict with revisit triggers, and a
    report-only boundary.
  last_upstream_review:
    date: 2026-09-22
    commit: 321658273cb1d20b76026717d027d505790106d4
    outcome: no-action
---

Spin up a **background agent** to do the research, so you keep working while it reads.

## Mode selection

Select the mode from the user's requested outcome:

- `research` — the user wants facts, documentation, explanation or a neutral
  comparison. Do not invent a recommendation or winner.
- `assessment` — the user asks whether this repository should adopt, trial,
  select or reject a candidate, or asks which option to choose here.

Honor an explicit mode from the user. If the request is materially ambiguous,
ask one focused clarifying question; otherwise default to `research`. State the
selected mode near the report title as `Mode: research` or `Mode: assessment`.

Its job:

1. Investigate the question against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.
4. Inspect the repository's current implementation and only the local areas
   relevant to the question.
5. Separate upstream facts, local evidence and inferences in the report.

For `assessment`, also:

6. Compare the candidate with realistic alternatives.
7. Evaluate new value, overlap, cost, risk, compatibility and reversibility.
8. End with exactly one verdict: `adopt`, `trial`, `selectively import` or
   `reject`. Tie the verdict to the repository, not to popularity alone, and
   include revisit triggers when the decision is deferred or rejected.

Neutral `research` does not require a verdict. Both modes remain report-only:
do not install dependencies, modify source code or commit unless the user
separately requests that work.
