# Assessment of claude-code-skills and review of the ChatGPT report

Mode: assessment
Date: 2026-10-20

## Status updated after local review (2026-10-22)

Reconciled against `af37cf6`: U9–U11 (workflow pointers, OpenCode warning, and
Pi runtime ignore rules) are complete and committed. They do not change the
technical evidence relevant here. Upstream sources remain at the original
snapshots: this review is not a new upstream check or benchmark. The [agreed
roadmap](../plans/pi-plugin-adoption-roadmap.md#agreed-consolidation-sequence-2026-10-22)
owns the order and status of future work; this research preserves the evidence.

Decision: bring only test-quality checks and relevant gate enforcement into
workstream C2, reusing the existing review. Pilots 55/53 remain conditional on
a real need, with no parallel backlog. Checks from 81 can inform the future C5
skill-usefulness audit, comparing performance with and without the guidance on
current models; this does not imply a new `skills-audit` skill.

## Scope and sources

Examined the upstream checkout at commit `e688949073c43212d7cef4f0d0ef623a5b05d0d1`, matching the one cited in the report. Local agent-brains checkout: `f065e5a970554b91fd86427a7e123c2fbc4caa7b`. The pre-existing untracked `extra/skills/ga4-analytics/` directory is excluded.

In-depth reading of the QA candidates, the skill reviewer, and the additional
opportunities listed below; a survey of the remaining catalog. Static analysis
of instructions, fixtures, graders, and workflows, without running skills on
models, benchmarks, or upstream validators. No installation or changes to
local skills. This document is the only artifact produced.

The following upstream links pin the commit so that the assessment does not
implicitly follow future changes:

- [Catalog](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/README.md).
- [Repository rules](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/AGENTS.md).
- [Behavioral validation method](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/docs/behavioral-validation.md).

## What I confirm and correct in the report

**Upstream facts.** QA contains seven standalone skills, with responsibilities
described accurately. The contracts distinguish auditing, test writing, and
implementation. Fresh evidence, independent oracles, and material findings are
real requirements, not an optimistic reading of the README. However, they are
instructions; on their own they do not prove that an agent follows them.

**Verified correction:** at the same commit, the catalog contains **41 skills in
9 suites**, not 40 in 10. Reproducible count: `plugins/*/skills/*/SKILL.md`
files and directories immediately beneath `plugins/`. This does not change the
decision, but the report is not accurate on every fact.

**Local evidence.** The separation between diff-focused `test-review` and
portfolio audits is correct. However, `test-master` already covers strategy,
coverage gaps, flakiness, fixtures, and maintenance, so 55's new contribution
is narrower than a name-only comparison suggests. Reviewer independence and
evidence freezing are also already present in Pi Brain, partly in executable
form.

**Inference to correct:** the pilot that defers `skills-audit` is mainly about
checking upstream changes and provenance; 81 also checks internal
contradictions, triggers, and distribution. Recurrence of the first process
does not automatically measure the need for the second. The pilot is a context
constraint to reassess, not proof that 81 is unnecessary or necessary.

**Verification limit:** I did not re-confirm the individual Actions run from
October 18 cited in the report. The inspected workflow separates structural
validation from behavioral evaluation; I do not infer a behavioral PASS from
the presence of CI.

## Value for our catalog

| Candidate | Concrete additional value | Recommended destination |
|---|---|---|
| 55 — Test Suite Auditor | KEEP/ADD/UPDATE/MERGE/DELETE/NO_TEST decisions, replacing safeguards before deletion, visible quarantine, gate costs | First pilot for a read-only portfolio protocol; separate from test-review's diff-only contract |
| 53 — Documentation Auditor | Operator journey, documented commands/flags checked against the real parser, examples/docstrings checked against signatures/effects | Second pilot focused on technical documentation; preserve context-audit |
| 81 — Skill Reviewer | Contradictions among triggers, permissions, workflows, outputs, and distribution; distinction between static and behavioral review | Checklist for the next manual skill audit; formalize only after observed usefulness |
| 46 — Quality Gate Engineer | Prove that a check rejects invalid input and accepts valid input through the real entrypoint | Selectively import the method; candidate overlooked by the report |
| 57 — Persistence Auditor | Invariants, transactions, retries, deletion, abandoned streams, and connection budgets across replicas | Optional lens for projects with substantial persistence |
| 98 — Mutation Reliability Engineer | Lost response after successful effect, idempotency, concurrency, and recovery after interruption | Specialist material to adapt when a real case arises |
| 99 — Database Lifecycle Engineer | Migrations from a prior state, interrupted backfills, version compatibility, and verified restore | Material for migrations/recovery; separate from SQL tuning |
| 33 — Plan Reviewer | Existing reuse, missing decisions, feasibility, and plan verification | A few checks for current planning, without a new generalist skill |
| 45 — Benchmark Comparator | Symmetric comparison, rules fixed before results, correctness before cost | Method for pilots and model comparisons, without a new component |
| 51/52/54/56 | Responsibilities are already broadly covered | No full import; recover only specific missing checks |

Key sources for the recommendations: [55](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/quality-assurance-suite/skills/ln-55-test-suite-auditor/SKILL.md), [53](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/quality-assurance-suite/skills/ln-53-documentation-auditor/SKILL.md), [81](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/skill-maintenance-suite/skills/ln-81-skill-reviewer/SKILL.md), [46](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/implementation-suite/skills/ln-46-quality-gate-engineer/SKILL.md), [98](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/engineering-foundation-suite/skills/ln-98-mutation-reliability-engineer/SKILL.md), [99](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/plugins/engineering-foundation-suite/skills/ln-99-database-lifecycle-engineer/SKILL.md).

### Why 46 merits attention

A green lint command may have selected zero files, or its wrapper may have
ignored a failure. 46 requires valid/invalid fixtures to go through the actual
entrypoint and distinguishes a “working check” from a “compliant project.” This
is more concrete than adding a generic QA checklist. `agent-readiness` already
distinguishes configured/documented/executed; the incremental novelty is
negative testing of the gate and error propagation, especially when configuring
that gate.

### Verified local overlap

- [test-review](../../extra/skills/test-review/SKILL.md) already challenges circular expectations, mocks that replace behavior, and redundant tests. [The pilot](../evals/test-review/README.md) includes mutations that leave the existing suite green and targeted probes that fail: we are not starting from zero on oracles.
- [test-master](../../.agents/skills/test-master/SKILL.md) already covers broad QA. Any portfolio-audit protocol should explicitly distinguish read-only analysis from test creation; adding a reference alone does not ensure correct routing.
- [context-audit](../../.agents/skills/context-audit/SKILL.md) owns the agentic hierarchy and authority. Operational READMEs, API docs, and docstrings are a distinct scope; assign shared documents according to the audit question.
- [code-review](../../.agents/skills/code-review/SKILL.md) already has two independent axes. [review.ts](../../src/review.ts) and [feature.ts](../../src/workflows/feature.ts) add schema, limits, read-only enforcement, and deterministic validation. Avoid recreating all of this in instructions for 52.
- [agent-readiness](../../.agents/skills/agent-readiness/SKILL.md), security-reviewer, and architecture tools make another general auditor less useful. sql-pro, PostgreSQL references, and Laravel best practices cover parts of 57/98/99 without amounting to one workflow for verifying partial failures.
- [The precedent on skills-audit](upstream-review-pilot-assessment.md) defers creating it until the need recurs more often. A manual audit using 81's new checks can test whether there is a need beyond ordinary upstream updates.

## What not to transfer

55 prescribes E2E as a general preference and limits unit/integration tests to
cases that are difficult to verify through E2E. This is not a neutral
preference: for orchestration and stable internal contracts it can increase
cost and fragility. Keep the local choice of test boundary that best fits the
risk.

The measured files are substantial: 55 is about 19,000 characters, 53 about
17,000, and 52 about 25,500, before references. The shared contract and
accounting for every checkbox add overhead. There is no measurement here that
demonstrates a proportional quality improvement. Avoid the Six Hats protocol,
the mandatory five-field format, and detailed statuses for every check.

The fixtures are interesting but not certification. Case 55 presents a missing
pricing cap with tests that reproduce the formula; 53 presents a false
`--dry-run` ignored by the parser; 81 combines a read-only contract with
writing/committing. These are well-constructed but obvious, single defects;
healthy and near-negative cases are also needed. Some graders check Edit/Write
tools or final patterns, which alone do not prove the absence of every shell
modification. The upstream documentation itself acknowledges limits in
observing writes that were reverted before the final snapshot.

## Proposed experiment without proliferating skills

1. **Test portfolio:** give the baseline and candidate the same task: audit the
   full suite with the same commit, time, tools, and criteria. Use test-master as
   the baseline; use test-review only within its diff-focused scope. Include a
   local case with a known weak oracle, one involving isolation/order, and one
   healthy case. A direct 55-vs-test-review comparison over the whole portfolio
   would structurally favor 55.
2. **Technical documentation:** use the same README/CLI and operational
   question. Compare an ordinary audit with protocol 53; context-audit is the
   appropriate comparison only for documents in its scope. Include intentional
   examples and accurate historical documents to measure false positives.
3. **Skills:** statically audit a local skill and its boundaries with nearby
   skills, distinguishing intrinsic quality from review of upstream changes.
   Do not imply model execution.

Before results are available, define expected material findings, false
positives, duplicates, out-of-scope findings, and observable cost. Where
possible, assess results without knowing the arm. An additional finding in a
known fixture is a signal to continue, not enough evidence to distribute a new
skill: require recurrence in a real task and a healthy case with no unnecessary
test or change requests.

If the pilot confirms value, create at most one optional protocol at a time.
Preserve the source, commit, and full MIT notice for substantially adapted
text; metadata alone does not replace the notice. [Upstream
license](https://github.com/levnikolaevich/claude-code-skills/blob/e688949073c43212d7cef4f0d0ef623a5b05d0d1/LICENSE).

## Decision

**Verdict: selectively import.** The report is broadly sound, with one catalog
count error and an experimental comparison that should be made fairer. Select
useful methods and cases: in the agreed C2 work, start with checks that support
the existing review and 46's proof of gate enforcement. Portfolio pilot 55 and
documentation pilot 53 remain conditional on a real need; 81 informs the
future C5 audit. Do not install the full suite or replace local workflows.
Reassess permanent skills when pilots show recurring value; reassess 57/98/99
when a concrete task involves concurrency, retries, or a migration with data
risk.
