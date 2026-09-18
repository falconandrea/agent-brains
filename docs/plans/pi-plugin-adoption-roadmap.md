# Plan: Pi plugin and context-system adoption

**Created:** 2026-09-08

**Status:** planned — next action is R0.2

**Source of truth for execution status:** this document

**Assessment and rationale:**
[Pi plugins and context structure assessment](../research/pi-plugins-and-context-structure-assessment.md)

## Goal

Adopt only the external capabilities that measurably improve `agent-brains`
without creating a second workflow owner, a duplicate memory hierarchy, or
weaker safety boundaries.

## Working rules

- Keep `runFeatureWorkflow` as the only owner of `/feature` phase transitions.
- Keep the existing `.ai/` topology as the only project knowledge hierarchy.
- Trial third-party extensions in disposable projects before installing them
  in the normal Pi profile.
- Start every extension trial read-only or with mutation paths disabled.
- Promote one capability only after its acceptance criteria pass; otherwise
  remove or defer it.
- Do not run two delegation runtimes or two compaction implementations at the
  same time.
- Do not copy code from `pi-config` unless upstream adds a clear license.
- Keep only one item marked `IN PROGRESS` at a time.

## Sequence

```text
F0 /feature interaction correction (independent)
 └─ F0.1 Restore batched discovery

R0 Local hygiene
 ├─ R0.1 Repair grilling
 ├─ R0.2 Tighten context templates
 ├─ R0.3 Add context audit
 └─ R0.4 Pilot complexity review
          │
          v
R1 Isolated extension trials
 ├─ R1.1 pi-vcc
 ├─ R1.2 pi-lens
 └─ R1.3 pi-grill-me comparison
          │
          v
R2 Conditional runtime decision
 └─ R2.1 pi-subagents only when a revisit trigger fires
```

F0 is an adjacent `pi-brain` interaction fix, not part of the grilling repair.
It is tracked here so the two question models remain explicit and cannot drift
back into each other.

## F0 — `/feature` interaction correction

### F0.1 Restore batched feature discovery

**Status:** completed 2026-09-13 — npm test 171/171, `tsc --noEmit` clean,
`git diff --check` clean. Evidence: `src/pi/ask-user-batch.ts` (Pi-free
schema/routing/rendering/validation), `#buildAskUserBatchTool` in
`src/pi/pi-agent-runner.ts`, planner prompt in
`src/workflows/feature-prompts.ts`, tests in `tests/ask-user-batch.test.ts`
and `tests/unit.test.ts`.

`/feature` and explicit grilling have different interaction contracts:

- `/feature` collects the open product/design decisions in one numbered batch
  so the user can answer in one message;
- `grilling` and `grill-with-docs` remain adaptive, one decision at a time,
  only when explicitly invoked.

- [x] Add a planner-only `ask_user_batch` tool. Its schema must contain a
  `questions` array with `minItems: 1` and `maxItems: 6`; each question has
  2–3 options plus a `recommendedOption` letter (`A`, `B` or `C`) and a
  non-empty `recommendationReason`.
- [x] Keep the existing single-decision `ask_user` contract for non-planner
  roles. The `/feature` planner receives `ask_user_batch`, not `ask_user`.
- [x] Render the structured batch as one numbered string and pass it to the
  existing child-question callback as `question` without `options`. This must
  reuse `PiHumanInput.askFromChild`'s current freeform `input()` path; do not
  add a second UI bridge.
- [x] Always use the freeform path, including when the batch contains exactly
  one question. Do not special-case a one-question batch back to `select`:
  `/feature` has one stable response pattern.
- [x] Permit one normal batch and, at prompt level, at most one exceptional
  second batch when the first answer creates a genuinely blocking ambiguity.
  Do not turn unclear or partial answers into sequential follow-up questions;
  record the unresolved decisions as explicit PRD assumptions for the approval
  gate.
- [x] Reclassify `feature`, `grilling` and `grill-with-docs` from `planning` to
  `operational` so they remain available to the main session but are not
  injected into pipeline children. Keep `product-thinking`, `to-spec` and
  `prototype` available to the planner in this task.
- [x] Add tests for the hard six-question schema limit, planner-only tool
  selection, one-question freeform behavior, one-dialog live rendering,
  one-entry deferred queuing, and workflow-skill exclusion from child roles.

**Acceptance:** the `/feature` planner can ask 1–6 structured decisions in one
freeform dialog; a single-question batch behaves identically; non-planner roles
retain the single-decision tool; ambiguous answers become PRD assumptions
instead of a question-by-question loop; and interactive workflow skills no
longer reach pipeline children.

**Out of scope follow-up:** review `to-spec` separately. Its conversational
contract suggests it may also belong in `operational`, but changing it is not
required to restore `/feature` batching and must not expand F0.1.

## R0 — Local hygiene

### R0.1 Repair the grilling path

**Status:** completed 2026-09-18 — official skill validation, policy parsing,
structural acceptance checks and `git diff --check` pass. The behavioral evals
are defined as manual protocols; no transcript is claimed until they are run.

- [x] Remove the unresolved `domain-modeling` dependency from
  `grill-with-docs`, or add an intentionally designed replacement.
- [x] Add a persistent shared-understanding checkpoint containing known facts,
  open decisions, assumptions, coverage and decision branches.
- [x] Add an explicit `interview → output selection → output` phase boundary.
- [x] Keep the existing one-question-at-a-time behavior.
- [x] Add representative skill evals before replacing the current version.

**Acceptance:** invoking `grill-with-docs` uses only available skills, preserves
one current checkpoint and cannot enter an output-producing phase without
explicit user approval. The repaired skill and its three behavioral eval cases
are in `.agents/skills/grill-with-docs/`.

### R0.2 Tighten the context templates

**Status:** NEXT

- [ ] Reduce `templates/AGENTS.md` to stable directives, authority order and
  routing pointers; remove duplicated skill catalogs and workflow tutorials.
- [ ] Simplify `templates/.ai/memory/progress.md` to current phase, active task,
  blockers and next actions.
- [ ] Remove the reference to the missing `blockers.md` or deliberately add the
  file to the scaffold.
- [ ] Fix the malformed heading character in `progress.md`.
- [ ] Document one owner per fact type: instructions, context, feature specs,
  lessons, progress and session history.

**Acceptance:** the templates have no broken references or duplicated sources
of truth, and a fresh agent can locate the relevant context without preloading
the whole `.ai/` tree.

### R0.3 Add a read-only context audit

**Status:** pending — depends on R0.2

- [ ] Extend `lessons-gardener` or add a sibling `context-audit` skill.
- [ ] Detect stale implementation claims, contradictions with code/ADRs,
  duplicate authority, broken references and abnormal file growth.
- [ ] Keep diagnosis read-only until the user approves a proposed rewrite.
- [ ] Preserve the current lessons admission rule: retain only non-obvious,
  project-specific knowledge an agent would otherwise lose.

**Acceptance:** the audit reports actionable findings with source paths and
does not mutate any context file before approval.

### R0.4 Pilot an explicit complexity review

**Status:** pending — independent after R0.1

- [ ] Add `ponytail-review` and optionally `ponytail-audit` under
  `extra/skills`, with attribution and license retained.
- [ ] Keep them explicit-only; do not add the Ponytail base persona to
  `profiles/common.list`.
- [ ] Compare findings on two real diffs against `karpathy-guidelines`,
  `simplify` and `code-review`.
- [ ] If useful, decide between keeping a standalone skill or adding a clearly
  separate Complexity axis to local review.

**Acceptance:** the pilot finds actionable deletions or native/stdlib
replacements without duplicating correctness, security or spec findings.

## R1 — Isolated extension trials

No item in this phase authorizes installation by itself. Start only after an
explicit user request.

### R1.1 Trial `pi-vcc`

**Status:** pending — recommended first external trial

- [ ] Run against the currently pinned Pi `0.84.2` in a disposable long
  session.
- [ ] Exercise manual compaction and automatic threshold compaction.
- [ ] Verify that continuation happens exactly once.
- [ ] Recall an early decision, an unresolved failure and a touched file.
- [ ] Confirm uninstall restores default behavior without changing project
  state.
- [ ] Clarify upstream licensing before vendoring any source.

**Promote when:** compaction preserves the working tail and recall reliably
finds earlier evidence with no duplicate or ghost turns.

**Reject when:** it loses active context, mis-scopes lineage, or causes an
extra turn on Pi `0.84.2`.

### R1.2 Trial `pi-lens` read-only

**Status:** pending — after R1.1 unless edit feedback becomes urgent

- [ ] Use a disposable repository.
- [ ] Disable formatting, autofix, LSP quick-fixes, automatic tests, security
  scanners, git guard and context injection.
- [ ] Measure diagnostic latency, false positives and tool/process overhead.
- [ ] Verify findings carry freshness information after subsequent edits.
- [ ] Separately prove whether lifecycle hooks work inside a programmatically
  created `PiAgentRunner` child session.
- [ ] Do not make Lens findings blocking until failure and freshness semantics
  are deterministic.

**Promote when:** read-only diagnostics shorten at least one real developer fix
loop with acceptable latency/noise and no unrequested mutation.

**Reject when:** child sessions do not receive reliable diagnostics, or the
operational surface costs more than the saved verification round.

### R1.3 Compare `pi-grill-me` with the repaired local skill

**Status:** pending — depends on R0.1

- [ ] Run the same broad planning prompt through both variants.
- [ ] Compare checkpoint quality, decision coverage, number of questions and
  enforcement of the output gate.
- [ ] Keep the trial outside `/feature` to avoid nested orchestration.
- [ ] Do not import the heuristic bash mutation blocker without dedicated
  tests.

**Promote when:** the extension produces materially better decision coverage
than the repaired skill without adding excessive ceremony.

**Otherwise:** keep only its checkpoint and phase-model ideas locally.

## R2 — Conditional runtime decision

### R2.1 Evaluate `pi-subagents` as an `AgentRunner` backend

**Status:** deferred — not queued for implementation

Start only if at least one trigger is observed:

- parallel read-only review/research lanes are repeatedly needed;
- work must continue after the parent session becomes idle;
- a user needs to inspect or steer a running child;
- concurrent mutating workers require isolated worktrees;
- maintaining the local child-session layer becomes more expensive than an
  adapter to `pi-subagents`.

If triggered:

- [ ] Upgrade and revalidate the Pi SDK deliberately.
- [ ] Spike only the `AgentRunner` adapter; keep `runFeatureWorkflow` as owner.
- [ ] Prove developer no-shell, reviewer read-only, structured result,
  cancellation, resume and one-writer invariants.
- [ ] Adopt worktrees before allowing parallel writers.
- [ ] Set run, tool, token, concurrency, depth and cumulative-spawn limits.
- [ ] Verify runtime extension acknowledgement and machine-readable lifecycle
  artifacts.

**Explicitly excluded:** installing `pi-async-fork` alongside `pi-subagents`,
or replacing `/feature` with the package's own orchestration workflow.

## Parked ideas

- **`pi-config` session analytics:** revisit when cross-session cost or prompt
  mining becomes a concrete need; reimplement from behavior because the source
  currently has no clear license.
- **Temporary prompt snippets:** useful for interactive Pi, but not needed by
  the deterministic pipeline yet.
- **New `memory.md` / `todo.md` hierarchy:** rejected for now because it would
  duplicate `.ai/context`, `.ai/memory`, `.ai/features` and ADRs.
- **Full `prompt/shared` import:** rejected; selectively import certainty and
  completeness checks into the relevant role or skill instead.
- **Always-on Ponytail mode:** rejected while local minimalism skills and an
  explicit complexity review cover the need.
- **`pi-async-fork`:** rejected while it requires a second runtime, Pi `0.85+`
  and shares the working directory between writers.

## Resume instructions

A future session should:

1. Read this roadmap first.
2. Inspect only the assessment section relevant to the next item.
3. Confirm the item is still `NEXT`, `pending` or triggered before acting.
4. Change exactly one item to `IN PROGRESS`.
5. Record evidence and the promote/reject decision here when the item ends.

**Next action:** R0.2 — tighten the project context templates.
