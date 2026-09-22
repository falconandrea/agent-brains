---
name: grill-with-docs
description: Stress-test a plan or design against project docs through a one-question-at-a-time interview and produce only explicitly approved documentation.
license: MIT
metadata:
  management: local
  provenance: adopted
  origins:
    - repository: https://github.com/mattpocock/skills
      path: skills/engineering/grill-with-docs/SKILL.md
      commit: 658d53e6ded8cc0eaa26a96e0580bee9381ca0e3
      license: MIT — full text in LICENSE in this folder
  adopted_at: 2026-09-22
  adaptation: >
    Upstream is a seven-line stub that delegates to the grilling and
    domain-modeling skills. The local copy replaces it with a self-contained
    checkpoint-based workflow (.ai/features/<slug>/grill-checkpoint.md,
    interview / output selection / output phases, repository-facts-first
    questions, explicit output approval) and drops the domain-modeling
    dependency, which is not installed here. Explicit-only activation is kept
    via agents/openai.yaml instead of upstream's disable-model-invocation
    flag, and a manual behavioral eval protocol is added under evals/.
  last_upstream_review:
    date: 2026-09-22
    commit: 447ca70872026d5b79d6073a546dac082117fed7
    outcome: no-action
---

# Grill with Docs

Use this skill for an explicit, documentation-backed grilling session before a
plan or design is enacted. It extends the one-question-at-a-time behavior of
`grilling` and keeps a durable record of the shared understanding. It does not
implement the plan.

## Invariants

- Keep exactly one current checkpoint for the topic.
- Resolve repository facts by inspecting the repository; ask the user only for
  decisions, preferences and facts the repository cannot establish.
- Ask one decision question at a time and include a recommended answer with
  its trade-off.
- Keep the interview, output selection and output phases separate.
- Do not write source code, run implementation workflows or treat document
  approval as implementation approval.

## 1. Initialize the checkpoint

Choose a stable slug for the topic. Reuse
`.ai/features/<slug>/grill-checkpoint.md` if it already exists; otherwise create
the missing `.ai/features/<slug>/` directory tree and then create that one file.
Never create a second checkpoint for the same topic.

Before asking questions, read the project's `AGENTS.md`, the relevant
`.ai/context/` files, `.ai/memory/lessons.md`, and any glossary or ADRs that
cover the topic, when those files exist. Load context by area instead of
preloading the whole tree.

The checkpoint must contain these sections and remain the single source of
current interview state:

```markdown
# Grill checkpoint — <topic>

## Scope
<!-- goal, boundaries and non-goals -->

## Known facts
- [verified] Fact with a source path or code reference.

## Open decisions
- [OPEN] D1: Decision still requiring the user's choice.

## Assumptions
- [ASSUMED] Temporary assumption, owner and what would invalidate it.

## Coverage
- [x] Area or branch resolved.
- [ ] Area or branch not yet explored.

## Decision branches
### D1 — <decision>
- Option A: consequence.
- Option B: consequence.
- Chosen: pending.

## Approved outputs
- [ ] None yet.

## Current phase
interview
```

Update the checkpoint after each material repository discovery and after each
user answer. Keep facts, assumptions and decisions distinct. Mark branch
coverage explicitly so an unresolved branch cannot disappear from the record.

## 2. Interview

Start in `interview`. Inspect code and documentation before asking about
anything that can be established from them. Then ask exactly one question in a
turn. The question must identify the decision, offer the relevant options when
known, and state your recommendation.

After the user answers:

1. Record the decision and its consequences in the checkpoint.
2. Update affected assumptions, branches and coverage.
3. Continue with the next highest-impact unresolved decision.

Do not batch questions, silently resolve material ambiguity, or generate a PRD,
ADR or glossary update while the interview is still open. When the material
branches are covered, summarize the checkpoint and ask the user to confirm that
shared understanding has been reached. If they want to keep grilling, remain
in this phase.

## 3. Output selection

Enter `output selection` only after the user confirms shared understanding.
First set `## Current phase` in the checkpoint to `output selection` and persist
that update. Then propose the exact artifacts to write, their paths, their
purpose and any remaining assumptions. If the user wants to keep grilling, set
the phase back to `interview` and persist the checkpoint before asking the next
question.

Typical choices are:

- a feature plan under `.ai/features/<slug>/`;
- an ADR under the project's existing ADR convention;
- additions to the project's existing `.ai/context/GLOSSARY.md`.

The checkpoint itself remains the durable interview record. Do not create an
ADR, glossary entry or plan merely because it was mentioned during the
interview.

Ask for explicit approval of the proposed artifact set. If the user changes
the set, revise the selection and ask again. Until approval, write nothing
except the checkpoint.

## 4. Output

Set the checkpoint phase to `output` only after explicit output approval. Write
only the approved artifacts, using the repository's conventions and language.
Do not modify source code or create unapproved files. Record the paths and
approval in `## Approved outputs`, then leave the checkpoint alongside the
artifacts.

If the user wants implementation after the documents are produced, hand off to
the project's normal feature/implementation workflow; this skill's document
approval is not permission to enact the design.
