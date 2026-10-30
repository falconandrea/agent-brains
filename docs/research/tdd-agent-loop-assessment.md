# TDD in the agent loop: assessment for agent-brains

Mode: assessment
Date: 2026-10-22
Checkout: `f065e5a970554b91fd86427a7e123c2fbc4caa7b`

## Status updated after local review (2026-10-22)

Reconciled against `af37cf6`: U9–U11 (workflow pointers, OpenCode warning, and
Pi runtime ignore rules) are complete and committed. They do not change the
technical evidence relevant here. Upstream sources remain at the original
snapshots: this review is not a new upstream check or benchmark. The [agreed
roadmap](../plans/pi-plugin-adoption-roadmap.md#agreed-consolidation-sequence-2026-10-22)
owns the order and status of future work; this research preserves the evidence.

Decision: merge into workstream C2 with `test-review` and selected QA checks,
without a new skill or mandatory reviewer. First C1/U15; work on the verify
outcome contract remains separate and must preserve retry and resume. This
review made no changes to instructions or code.

## Scope

I read the original article and statically inspected the local checkout,
comparing it with the report provided by the user. No code, skill, or
configuration was changed; no test suite or new mutation was run. Historical
results cited below belong to their respective pilots, not this session.
Pre-existing untracked files were left untouched.

## Upstream facts and limits

The [article by Birgitta Böckeler](https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html) is mainly about TDD performed entirely by the agent. It distinguishes that case from human-defined scenarios and human checkpoints on tests.

The exploratory comparison uses Sonnet 4.6, judgments from Opus 4.8,
greenfield business-logic tasks, and a required coverage of at least 80%. It
finds no clear TDD advantage in quality or mutation score. The average batches
reuse non-TDD solutions, so they are not fully independent replications.

The appendix reports token multipliers of about 2.96–8.50, including cache
reads and repeated context. These are not equivalent to economic cost
multipliers. The advantage attributed to initial design is a hypothesis drawn
from traces, not a demonstrated cause.

**Inference for us:** the article justifies revisiting costly prescriptions; it
does not show that test-first is useless or that tests written afterward are
equivalent in every context.

## Local evidence: what I confirm and correct

| Point in the supplied report | Local finding and implication |
|---|---|
| Good verification architecture already exists | Confirmed: [feature.ts](../../src/workflows/feature.ts) runs checks before review and handles retries; [verify.ts](../../src/verify.ts) freezes commands and script sections. These safeguards do not certify assertion effectiveness. |
| TDD is available to the Pi developer without shell access | Confirmed: [common.list](../../profiles/common.list), [skill-router.ts](../../src/skill-router.ts), the allowlist, and developer prompt. Availability/routing does not prove the skill was activated or followed in a real run. |
| Mainly the TDD skill needs changes | Incomplete: when the context is TDD, [test-master](../../.agents/skills/test-master/SKILL.md) points to [tdd-iron-laws.md](../../.agents/skills/test-master/references/tdd-iron-laws.md), which has absolute test-first requirements. This can conflict when that reference is loaded; it is not a global test-master requirement. [verification-before-completion](../../.agents/skills/verification-before-completion/SKILL.md), a craft skill routed to the developer, requires executions that role cannot perform. Fixing one file is not enough. |
| Our discipline is red/green/refactor | Needs clarification: [tdd](../../.agents/skills/tdd/SKILL.md) explicitly excludes refactoring from the cycle and defers it to review, while the test-master reference includes it. This is a local choice to assess, not a consequence of the article. |
| Feature always prescribes the procedure | Overstated: [feature](../../.agents/skills/feature/SKILL.md) already says “TDD where applicable.” What is missing is a definition of applicability, not an entirely new exception. Also, this conversational skill is operational and excluded from Pi children; it is not the TypeScript `/feature` implementation. |
| Test-quality review needs strengthening | Confirmed: [feature-prompts.ts](../../src/workflows/feature-prompts.ts) mentions test quality without explicitly asking what defect a test could detect or where the expected result comes from. The reviewer does not receive testing skills through the router. |
| Zero checks can result in passed | Confirmed: `blockingFailures.length === 0` produces `passed: true` even for empty results. The prompt already says “none configured” for an empty list, so the transparency gap is not total; the missing piece is a structured distinction. On direct resume into review, the list is also empty because checks are skipped, so empty does not always mean unconfigured. |

Historical test-file counts do not measure effective protection and are not an
adoption criterion.

## What has already been tested here

[test-review](../../extra/skills/test-review/SKILL.md) already asks for an
independent source of expected results, a plausible defect the test could catch,
proportionate tests, and recognition of existing coverage. It is an
experimental extra, not a mandatory phase.

The [local pilot](../evals/test-review/README.md) documents a test on isolated
copies: removing two ownership guards left the historical suite green, while
two targeted probes failed on the altered code and passed after restoration.
This is already a concrete example of the method proposed in the supplied
report.

The same pilot records two races discovered by the user and missed by both
ordinary review and test-review: checking only the final state can miss event
ordering guarantees. **Inference:** for orchestration, ordering, cancellation,
and cleanup are stronger candidates than automatically selecting only pure
functions. Purity makes a mutation inexpensive; it does not determine its value.

## What to import, and at what cost

1. **Targeted acceptance scenarios.** For risky behavior, state the initial
   state/input, event, and observable result; add a rejection or invariant only
   when material. Reuse the existing PRD gate. Do not require a happy/negative
   quota for every criterion; that would add noise even for simple changes.
2. **Three questions in the existing review.** What contract does the test
   protect? Where does the expected result come from? What realistic defect
   would make the assertion fail? Reuse the wording from test-review without
   loading the whole skill or adding another mandatory reviewer. Do not ask for
   new tests when existing coverage is sufficient.
3. **A contract consistent with the tools.** Use strict TDD when required and
   when the cycle can be observed. In the Pi developer role, test authorship
   and execution ownership are separate: the agent writes, the orchestrator
   runs, and the reviewer evaluates protection. Do not claim unobserved
   red/green. PRD approval can count as agreement on boundaries already
   defined; ask again only for new material decisions.
4. **Verification outcome, as separate work.** Distinguish zero commands,
   executed checks, non-blocking failures, and results reused/unavailable on
   resume. Preserve retry semantics in historical logs: [ports.ts](../../src/ports.ts)
   and [resume.ts](../../src/workflows/resume.ts) consume the current boolean.
   This is a contract change with targeted checks, not just a report string.

Items 1–3 align instructions; the fourth requires design and code. Before
implementing item 3, review tdd, feature, test-master, and
verification-before-completion together, preserving the usefulness of these
skills in sessions with shell access. There is no need to make the entire
catalog less rigorous.

## Alternatives and what to discard

- **Status quo:** no immediate cost, but documented conflicts remain between
  instructions and role capabilities.
- **Targeted import:** low cost and highly reversible; the risk of adding
  prompts without changing behavior must be checked with real cases.
- **General anti-TDD rewrite:** no local evidence justifies it; it would lose a
  useful method for reproducible bugs and user-directed work.
- **Permanent mutation framework, global coverage target, or new gates:**
  premature. They do not automatically solve omitted requirements or wrong
  expectations.
- **Large new benchmark now:** disproportionate. First reuse the existing
  pilot and a real problem; do not replace product work with experiment
  maintenance.

To evaluate later prompt changes, use the same commit, tasks, and tools, with
the correctness criterion fixed before runs and at least one healthy case and
one with a known regression. Separate the effect of scenarios from that of
removing prescriptions, or it will be unclear which change helped. Compare
missed defects, unnecessary requests, and overhead; distinguish cached/fresh
tokens and cost only when measurable. A few cases can guide a decision but do
not prove a general law.

## Decision

**Verdict: selectively import.** The new value is limited but concrete:
observable scenarios, more precise review criteria, and correction of
conflicts between instructions and Pi capabilities. The repository already has
both the architecture and an initial experiment with independent oracles. A
new philosophy or skill is not needed.

Priority: align instructions and add a few review questions; treat
deterministic-outcome transparency as separate work. Reassess mutation tooling
only when further isolated probes find material gaps at sustainable cost.
Reassess test-review integration based on the pilot and its overhead, not on
the article.
