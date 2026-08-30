# Plan: improving the agentic workflow

**Created:** 2026-08-08

**Updated:** 2026-08-08 (review and reduction: W0-lite, global kill criteria, W2/W3 deferred)

**Status:** planned — no implementation started

**Working mode:** interactive, evidence-driven, time-boxed phases with
continuation gates

**Maximum acceptable cost of a near-miss:** a few hours of rework

**Guiding criterion:** neutrality versus the baseline equals rejection of the
variant. W2 and W3 stay deferred until an observed problem emerges.

**Source of truth:** this document

## Success condition

The updated workflow improves memory, planning and review without
duplication, without slowing down the fast path and without authorizing
commits or pushes.

The work counts as finished only when the new behaviors have been exercised
on representative cases, compared against the baseline and promoted without
leaving competing versions of the same skill.

## Foundational decision

Do not adopt or fully vendor Compound Engineering. The local system already
has a coherent workflow better suited to human control:

```text
feature → framework/TDD → simplify → code-review → lessons/handoff
```

Compound Engineering is used as a design benchmark. From it we take only the
mechanisms that close measurable gaps:

1. structured knowledge of solved problems;
2. independent verification of the claims contained in plans;
3. specialized reviewers selected based on the risk of the diff;
4. planning depth proportional to the work;
5. a decisional mode for evaluations of external technologies and workflows.

External reference:

- [Compound Engineering upstream](https://github.com/EveryInc/compound-engineering-plugin)

## Non-negotiable constraints

- A single hierarchy of project artifacts under `.ai/`.
- No commits, pushes, PR openings or remote changes by the agent.
- Fast path unchanged for typos, config tweaks, one-line fixes and isolated
  refactors.
- TDD red-green-refactor preserved where applicable.
- Minimal and proportional verification; no automatic full suite without
  need.
- Subagents only when they add independence or coverage, not for ceremony.
- No external model or provider invoked without explicit request.
- Same functional contract in Codex and OpenCode.
- No duplicated stable skill: an experiment is either promoted or removed.
- Project and harness instructions always take precedence over skills.

## Current baseline

| Area | Current source | Contract to preserve |
| --- | --- | --- |
| Feature design | [feature](../../.agents/skills/feature/SKILL.md) | Discovery in one batch, 2–3 approaches, PRD + tasks, single hard gate |
| Implementation | Laravel/Next/Astro skills + [tdd](../../.agents/skills/tdd/SKILL.md) | Atomic tasks and red-green-refactor |
| Debug | [diagnosing-bugs](../../.agents/skills/diagnosing-bugs/SKILL.md) | Red-capable feedback loop before hypotheses |
| Cleanup | [simplify](../../.agents/skills/simplify/SKILL.md) | Mechanical pass, no scope creep |
| Review | [code-review](../../.agents/skills/code-review/SKILL.md) | Separate Standards and Spec axes, report-only |
| Research | [research](../../.agents/skills/research/SKILL.md) | Primary sources and a single cited report |
| Memory | `.ai/memory/lessons.md` + [lessons-gardener](../../.agents/skills/lessons-gardener/SKILL.md) | Synthetic index, cheap to load |
| Continuity | [handoff](../../.agents/skills/handoff/SKILL.md) | Temp by default, repo only on request |
| Distribution | `profiles/*.list`, `setup.sh`, `scaffold.sh` | Curated profiles and a single canonical store |

## Execution sequence

```text
W0-lite Minimal baseline (E1, E3, E7)
         │
         └── W4 Research assessment  ── gate ──┐
                                               │
                           W1 trial (time-box 2 sessions) ── gate ──┐
                                                                     │
                                               checkpoint: continue?
                                                                     │
                           W2 annotation-only  ── gate ──┐
                                                      │
                           W3 only on evidence ────────┘
```

- Only one `in_progress` phase at a time.
- Every `gate` is an explicit promote-or-abandon point, decided by the user
  based on the global kill criteria.
- W2 and W3 are **deferred**: they do not start until an observed problem
  justifies them. They are not "pending in a queue".
- The former W5 (extended pilot + promotion) is replaced by per-phase gates
  and the global kill criteria. The Codex+OpenCode pilot happens only on the
  candidate for promotion, not from the beginning.

## W0-lite — Minimal baseline

**Status:** completed — 2026-08-30

**Goal:** measure the current workflow on three representative extremes
before any modification.

**Priority:** mandatory and blocking for W4 and W1.

### Active scenarios

| ID | Scenario | What it must put to the test |
| --- | --- | --- |
| E1 | Trivial change | Fast path, absence of superfluous artifacts and ceremony |
| E3 | Cross-cutting feature | Grounding, risks, scope and test coverage |
| E7 | Evaluation of an external dependency | Primary research and a project-grounded verdict |

For E7, a real new external dependency is selected at test time, avoiding
artificial fixtures and already-known evaluations.

### Deferred scenarios (library)

E2 (standard feature), E4 (hard bug), E5 (code review), E6 (memory) are kept
as a library and activated only when the corresponding phase starts (W3 for
E2/E4, W2 for E5, W1 for E6). They are not part of the minimal baseline.

### Reduced rubric

For each scenario, record with evidence (not just scores):

- correctness and evidence of claims;
- number of turns and tool calls;
- artifacts produced;
- constraint violations;
- blind user preference (A/B, not agent self-assessment).

A 1–5 rubric over seven dimensions is too subjective when filled in by the
agent about its own skills; blind comparison and human spot-checks are
preferred.

### Tasks

- **W0.1** Define repeatable prompts for E1, E3, E7 and register them.
- **W0.2** Run the baseline in a fresh session on fixed prompts; keep raw
  outputs, not just impressions.
- **W0.3** Save results in `docs/evals/agent-workflows/` (or another
  convention chosen during the phase) without modifying skills.

### Acceptance criteria

- Every scenario has explicit input, expected output and failure modes.
- At least one blind comparison or human spot-check exists, not just
  self-assessment.
- Baseline results are saved before W4 begins.

### Kill criterion

If the baseline is not ready within one session, reduce it further (for
example only E1 + E7) instead of extending it. W0 is not lengthened to cover
E2/E4/E5/E6.

## W1 — Structured knowledge loop (time-boxed trial)

**Status:** next — W4 promoted 2026-08-30

**Goal:** keep `lessons.md` cheap, adding retrievable solution documents for
non-trivial problems.

**Budget:** at most two sessions and two real problems. No extension beyond
that.

### Target structure

```text
.ai/memory/
├── lessons.md
└── solutions/
    ├── _TEMPLATE.md
    └── <category>/<problem>.md
```

A solution document contains only verified knowledge:

- observable symptoms;
- root cause;
- relevant failed attempts;
- applied solution and its verification;
- prevention strategies;
- references to files, tests, issues, PRs or ADRs.

`lessons.md` remains the synthetic index. An extended solution produces a
single `Refs:` line pointing to the related document; content is never
duplicated.

### When to create a solution

Create a solution only if **at least three** of these conditions hold:

- cause not evident from the final diff;
- problem plausibly recurring;
- verified solution;
- knowledge not already documented;
- presence of hidden coupling, failed attempts or expensive diagnostics.

### Tasks

- **W1.1** Design `_TEMPLATE.md` and minimal frontmatter, avoiding metadata
  not used by search or maintenance.
- **W1.2** Prototype an explicit `solution-capture` skill in `extra/skills/`.
- **W1.3** Add the template to `templates/.ai/memory/` and prepare the
  corresponding idempotent behavior in `scaffold.sh` only after the pilot.
- **W1.4** Have `feature` and `diagnosing-bugs` search for relevant
  solutions via targeted queries (`rg` on terms, tags and symptoms), without
  preloading the folder.
- **W1.5** Extend `lessons-gardener` to detect broken references, duplicates
  and potentially obsolete solutions, always with approval before writing.
- **W1.6** Try capture and retrieval on at least two different real
  problems.

### Design defaults

- Capture only after a positive verification that the problem is solved.
- No solution for obvious or generic framework knowledge.
- No automatic capture: proposal or explicit invocation.
- Progressive retrieval: index/`rg` first, full document only if relevant.
- No automatic edits to `AGENTS.md` to make the solution visible.

### Trial success and abandonment

- **Success:** at least one solution is retrieved and used correctly in a
  subsequent task.
- **Abandonment:** unused folder; obvious documents; duplication of
  `lessons.md`; disproportionate manual maintenance. In any of these cases
  W1 is discarded and `solutions/` removed.

### Acceptance criteria

- From a known symptom, a new agent finds the pertinent solution without
  reading all solutions.
- `lessons.md` stays in single-line format and does not replicate the
  extended document.
- The template clearly distinguishes verified facts from hypotheses or
  attempts.
- The fast path and tasks without reusable learning produce no artifacts.

## W2 — Adaptive code review (deferred)

**Status:** deferred. Activated only if real tasks show missing findings or
false negatives in the base review on risky diffs (auth, queries, UI,
concurrency).

**Goal:** keep Standards/Spec and add specialists only when the diff
contains risky surfaces.

**Annotation-first approach:** before any specialist, the base review
classifies the diff and *annotates* the risky surfaces (e.g. "auth surface
detected: a security check would help"), without subagents. Precision and
false positives of the routing are evaluated. Only if the routing proves
useful is a specialist tried, and promotion requires it to find real
problems the base review missed.

### Initial router

| Signal in the diff | Candidate specialized reviewer |
| --- | --- |
| Auth, sessions, permissions, external input, secrets | Security |
| Queries, migrations, indexes, locking, transactions | Database/performance |
| UI, CSS, components, forms, navigation | Accessibility/UI |
| Queues, retries, concurrency, webhooks, idempotency | Correctness/reliability |

### Tasks

The following tasks activate only after the annotation-first phase has
demonstrated that the routing is precise and useful.

- **W2.1** Prototype `code-review-next` in `extra/skills/`, starting from
  the local skill instead of importing `ce-code-review`.
- **W2.2** Define deterministic routing signals and a conservative fallback.
- **W2.3** Always keep the Standards and Spec axes; add at most two
  specialists, only if justified by the diff.
- **W2.4** Introduce severities P0–P3, `high/medium/low` confidence,
  file/line evidence and deduplication across reviewers.
- **W2.5** Suppress findings without concrete consequence or not
  demonstrable from the diff/repository.
- **W2.6** Compare stable vs next on E5 and on at least two real diffs.

### Design defaults

- Report-only; no implicit autofix.
- Confidence is not promoted when two lenses run in the same context.
- The router does not invoke a specialized skill merely because it is
  installed.
- The review does not flag what formatter, linter or type checker already
  cover.
- Maximum budget: two base axes plus two specialists.

### Acceptance criteria

- The variant does not lose Standards/Spec findings present in the baseline.
- Additional reviewers have an explicit motivation tied to the diff.
- Duplicates are aggregated without inflating severity or confidence.
- The final report stays decisional, ordered by impact and report-only.

## W3 — Graduated and verified planning (deferred)

**Status:** deferred. `feature-next` is born only if W0-lite or real tasks
show concrete problems: false claims in plans, missing scope, tasks not
linked to requirements, insufficient planning for systemic features. If
these problems do not emerge, `feature` is not modified.

**Goal:** devote more rigor to risky features without slowing down simple
ones.

### Levels

| Level | Contract |
| --- | --- |
| Fast path | Unchanged: direct change, no PRD |
| Lightweight | Minimal discovery in one batch, compact PRD/tasks, no subagents |
| Standard | Current workflow + final independent verification of claims |
| Deep | Targeted initial grounding + systemic risks + independent verification |

### Tasks

- **W3.1** Define observable criteria for Lightweight/Standard/Deep.
- **W3.2** Prototype `feature-next` in `extra/skills/`, preserving the hard
  gate and single-batch discovery.
- **W3.3** For Standard/Deep, have a fresh context check cited files,
  existing behaviors, absence claims, requirement→task→test coverage and
  scope.
- **W3.4** For Deep, add targeted grounding while the main agent works on
  discovery; no web research unless explicitly needed.
- **W3.5** Correct the plan before presenting it, distinguishing refuted,
  verified and residual-assumption claims.
- **W3.6** Compare stable vs next on E1–E3.

### Design defaults

- No "one question per turn" model as the default.
- Follow-ups only when the initial batch leaves a material ambiguity.
- No verifier for Lightweight.
- The verifier does not redesign the product: it verifies claims and
  coverage.
- PRD and tasks stay separate under `.ai/features/<name>/`.
- Stable U-IDs and the WHAT/HOW separation remain unchanged.

### Acceptance criteria

- E1 produces no additional turns, files or subagents.
- Standard/Deep correct false claims before user approval.
- No product decision is silently introduced by the verifier.
- The number of approval gates stays one.

## W4 — Assessment mode for research

**Status:** completed — promoted 2026-08-30

**Goal:** turn research on technologies or workflows into project-grounded
verdicts without introducing a new overlapping skill.

**Why now:** it formalizes a behavior (project-grounded verdict on an
external candidate) already demonstrated as useful in this conversation.

**Kill criterion:** if research assessment does not produce a more
consistent verdict than the current `research` without sensibly increasing
cost and ceremony, the change is cancelled and `research` stays as is.

### Target modes

- `research`: neutral collection of facts from primary sources.
- `assessment`: comparison of an external candidate with the repository,
  constraints and alternatives; ends with `adopt`, `trial`,
  `selectively import` or `reject`.

### Tasks

- **W4.1** Define routing between neutral research and assessment.
- **W4.2** Extend the existing skill preserving the primary-source
  requirement and single Markdown report.
- **W4.3** Add a minimal rubric: new value, overlap, cost, risk,
  compatibility, reversibility and recommendation.
- **W4.4** Verify the mode using E7 on a real new external dependency.

### Acceptance criteria

- An assessment distinguishes upstream facts, local evidence and inferences.
- The verdict is motivated with respect to the project, not the candidate's
  popularity.
- Neutral research is not forced to produce a recommendation.
- No second `decision-pov` skill is born as long as this extension suffices.

## W5 — Per-phase promotion (replaces the extended pilot)

**Status:** absorbed into the per-phase gates

**Goal:** promote only the variants that beat the baseline, one phase at a
time.

The extended pilot over three projects × two harnesses is withdrawn. Each
phase brings its evidence to the gate and promotion is decided per phase by
the user.

### Per-phase promotion rules

- Test on the primary runtime first; Codex/OpenCode portability is verified
  only on the candidate for promotion, not from the beginning.
- The variant is compared with the baseline on the same prompts/fixtures.
- Promotion is a separate user decision for each phase.
- The previous stable variant is replaced, not left running in parallel.
- `*-next` prototypes in `extra/` are deleted after promotion or rejection.
- Proportional verification of scripts, manifests and symlinks happens on
  the candidate for promotion.

The global promotion criteria are in the homonymous section.

## Global kill criteria

A variant is eliminated if any of these conditions holds:

- it is neutral versus the baseline (no material observable benefit);
- it increases turns or artifacts without an observable benefit;
- it needs supervision to work correctly;
- it duplicates an existing source of truth;
- it only works through fragile interpretations by the agent;
- it violates an operational constraint even once (commit/push/PR, fast
  path, security, Codex/OpenCode contract on the promoted candidate).

Neutrality = rejection. A variant is not kept "because it does not get
worse".

## Expected file map

This is a forecast, it does not authorize early modifications. Every phase
must confirm the paths before writing.

| Phase | Probable file or area |
| --- | --- |
| W0-lite | `docs/evals/agent-workflows/` or another convention chosen during W0 |
| W1 | `extra/skills/solution-capture/`, `templates/.ai/memory/solutions/`, `scaffold.sh`, `feature`, `diagnosing-bugs`, `lessons-gardener` |
| W2 | `extra/skills/code-review-next/`, then possibly `code-review` |
| W3 | `extra/skills/feature-next/`, then possibly `feature` |
| W4 | `research` and its examples/references |
| Promotion | `profiles/*.list`, `README.md`, `skills-lock.json`, selected pilot projects |

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Meta-work / permanent infrastructure | Time-boxed phases, global kill criteria, W2/W3 deferred on evidence, checkpoint after W4+W1 |
| Increased ceremony | Baseline E1/E3/E7, depth levels and no subagents for Lightweight |
| Double memory | `lessons.md` as the single index and solutions only for non-trivial knowledge |
| Noisy review | Reviewer budget, confidence, mandatory evidence and deduplication |
| Expensive subagents | Risk-based activation and explicit cost/benefit comparison |
| Divergent artifacts | Everything under `.ai/`; no CE `docs/plans` or `docs/solutions` |
| Drift between Codex and OpenCode | Pilot only on the promotion candidate, not from the beginning |
| Competing workflows | Prototypes in `extra/`, atomic replacement and removal after decision |
| Scope creep | One `in_progress` phase, stable task IDs and approval for every promotion |
| Unwanted remote actions | Explicit commit/push/PR ban in every operational variant |

## Cross-session protocol

At the start of every new session dedicated to this plan:

1. Read this document and the evidence already produced by completed phases.
2. Check `git status --short` and preserve unrelated modifications.
3. Identify the first `in_progress` phase; if none exists, take the first
   non-completed phase whose dependencies are satisfied and which is not
   `deferred` without evidence.
4. Declare which task IDs will be tackled in the session.
5. Do not start a later phase until the current phase's acceptance criteria
   have saved evidence and the gate has been passed.

At the end of every session:

1. Update the status of actually verified tasks.
2. Add a row to the log below with decisions, evidence and next ID.
3. Register new decisions in the Decision log section, without rewriting
   previous history.
4. Leave a single concrete next step.

Allowed status values: `pending`, `in_progress`, `completed`, `blocked`,
`deferred`.

## Decision log

| Date | ID | Decision | Rationale |
| --- | --- | --- | --- |
| 2026-08-08 | D1 | Do not adopt Compound Engineering wholesale | Duplicates workflow and artifacts and overextends operational authority |
| 2026-08-08 | D2 | Keep `.ai/` as the artifact root | Avoids two sources of truth between the local system and CE |
| 2026-08-08 | D3 | Preserve batch discovery and single approval | Reduces round-trips without giving up the human gate |
| 2026-08-08 | D4 | Extend `research` before creating `decision-pov` | Avoids a new skill as long as an explicit mode suffices |
| 2026-08-08 | D5 | Prototypes in `extra/`, never directly in profiles | Allows reversible testing without propagation to projects |
| 2026-08-08 | D6 | W0 → W0-lite: only E1, E3, E7 | Seven full scenarios before value were excessive; E2/E4/E5/E6 in the library |
| 2026-08-08 | D7 | Order W0-lite → W4 → gate → W1 trial → gate → W2 → W3 | W4 has demonstrated usefulness; W1 time-boxed; W2/W3 on evidence |
| 2026-08-08 | D8 | Neutrality = rejection, as a global kill criterion | A neutral variant is not kept |
| 2026-08-08 | D9 | W2 annotation-first, W3 only on observed problems | No modification without a demonstrated problem |
| 2026-08-08 | D10 | Codex+OpenCode pilot only on the promotion candidate | Do not double the test surface from the beginning |
| 2026-08-30 | D11 | Promote W4 assessment mode in the existing `research` skill | The assessment and neutral runs preserved their distinct contracts without adding a second skill, dependency or source-code change |

## Questions to decide during the work

These are not initial blockers; they are to be resolved in the indicated
phase with evidence.

- **W0-lite:** final placement of the eval fixtures.
- **W1:** minimal solution frontmatter and staleness criterion.
- **W2:** precise threshold for suppressing `low confidence` findings (only
  if the phase activates).
- **W3:** Lightweight/Standard/Deep heuristics and maximum grounding budget
  (only if the phase activates).

## Session log

| Date | Session | Work done | Evidence | Next step |
| --- | --- | --- | --- | --- |
| 2026-08-08 | Initial planning | Compared local workflow and Compound Engineering; defined the W0–W5 plan | Comparison done in session and this document | Start W0.1: define E1–E7 prompts and fixtures |
| 2026-08-08 | Plan review and reduction | Identified meta-work risk; W0 → W0-lite (E1/E3/E7); reordered to W0-lite → W4 → W1 trial; W2/W3 deferred; added global kill criteria | This document (D6–D10) | Start W0.1: repeatable prompts for E1, E3, E7 |
| 2026-08-30 | W0.1 | Defined and registered repeatable E1, E3 and E7 prompts, expected results, failure modes and a raw-output run sheet | [Baseline protocol](../evals/agent-workflows/README.md) | Run W0.2 in fresh sessions on a frozen fixture |
| 2026-08-30 | W0.2–W0.3 | Ran E1, E3 and E7 in fresh Pi sessions and saved the observed outcomes, including E3's planner-format failure | [E1](../evals/agent-workflows/results/E1-2026-08-30.md), [E3](../evals/agent-workflows/results/E3-2026-08-30.md), [E7](../evals/agent-workflows/results/E7-2026-08-30.md) | Start W4.1: define routing between neutral research and assessment |
| 2026-08-30 | W4.1–W4.3 | Defined the research/assessment routing, six-dimension rubric and report contract; extended the existing `research` skill without creating a second skill | [W4 routing contract](../evals/agent-workflows/W4-assessment-routing.md), [research skill](../../.agents/skills/research/SKILL.md) | Run W4.4: repeat E7 in a fresh session and compare it with the baseline |
| 2026-08-30 | W4.4 | Repeated E7 with `Mode: assessment` and ran a neutral comparison with `Mode: research`; both preserved the report-only boundary | [W4 result](../evals/agent-workflows/results/W4-2026-08-30.md), [assessment report](../evals/agent-workflows/results/E7-2026-08-30.md) | User gate: promote or abandon the W4 research extension |
| 2026-08-30 | W4 promotion gate | Promoted the updated `research` skill as the stable version after the assessment and neutral-mode evidence passed review | [W4 result](../evals/agent-workflows/results/W4-2026-08-30.md), [routing contract](../evals/agent-workflows/W4-assessment-routing.md) | Start W1.1: design the solution-capture template and retrieval path |

## Next step

W4 is promoted. Start W1.1: design the solution-capture template and retrieval
path, keeping the trial within the existing budget of two sessions and two real
problems.
