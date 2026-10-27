# Harness retro assessment

Mode: assessment · Evidence date: 2026-10-27

Local baseline: `483332e95878b80baf7b11149861d77e745305f4`, initially clean working tree.
Scope: upstream skill and primer, local workflow/memory skills, profile routing,
Pi event persistence and child-session lifecycle. This is a source assessment,
not a behavioral trial or an audit of all repository capabilities.

## Upstream facts

The [path history](https://api.github.com/repos/alfonsograziano/skills/commits?path=skills/harness-retro&per_page=5)
returned one introducing commit, [355219b](https://github.com/alfonsograziano/skills/commit/355219b53a1bcd03ac9dcae1197d70864507933b),
dated 2026-10-25. The inspected skill directory contains a procedural skill and
a primer, without dedicated scripts or evaluations. This establishes its shape
and recency, not its effectiveness or the absence of external evaluations.

The [skill](https://github.com/alfonsograziano/skills/blob/355219b53a1bcd03ac9dcae1197d70864507933b/skills/harness-retro/SKILL.md)
examines session evidence, inspects existing harness mechanisms, selects likely
recurring problems and proposes exact changes at the appropriate layer. Past
sessions are optional when unavailable; zero findings is explicitly valid.
It separates incidental discoveries from session-supported findings and asks
for user selection before applying changes. It also checks whether mechanisms
already exist but were undiscoverable or failed to load.

The [primer](https://github.com/alfonsograziano/skills/blob/355219b53a1bcd03ac9dcae1197d70864507933b/skills/harness-retro/references/harness-primer.md)
prefers enforceable checks for invariants, scoped context, scripts for fixed
steps and skills for judgment. These are design heuristics, not demonstrated
performance results. A check prevents bypass only when the workflow actually
requires it; merely adding a script does not establish enforcement.

Important qualifications omitted from the supplied analysis:

- There is an explicit fifth step for implementation after selection. The
  upstream skill is proposal-first, rather than permanently read-only.
- The trigger description is broad enough to activate after retries or human
  corrections; explicit-only invocation would be a local adaptation.
- Severity treats human intervention alone as sufficient for High. A normal
  clarification or intended approval should not automatically become a defect.
- A closing instruction prescribes a Medium finding requesting richer child
  reports when delegation occurred and that reporting rule is absent. This
  risks creating a finding without an observed consequence.
- A promotional book footer is mandatory. It has no operational value here.

The repository [MIT license](https://github.com/alfonsograziano/skills/blob/355219b53a1bcd03ac9dcae1197d70864507933b/LICENSE)
permits adaptation subject to its notice requirements. If text is reused,
preserve the license and provenance; a promotional footer is not a substitute.

## Local evidence

| Existing capability | Evidence | Consequence for this assessment |
| --- | --- | --- |
| Capability-based harness audit | [agent-readiness](../../.agents/skills/agent-readiness/SKILL.md) | Already evaluates operational obstacles; retro adds incident-led selection rather than another general audit. |
| Context hygiene | [context-audit](../../.agents/skills/context-audit/SKILL.md) | Owns document contradictions, duplication and broken operational references; retro should route such work instead of duplicating its full procedure. |
| Verified diagnosis and prevention | [solution-capture](../../.agents/skills/solution-capture/SKILL.md) | Already includes failed attempts and Prevention. The novel value is identifying process defects without requiring a solved technical problem. |
| Memory maintenance | [lessons-gardener](../../.agents/skills/lessons-gardener/SKILL.md) | Maintains existing entries, not incident discovery. |
| Evidence before claims | [verification-before-completion](../../.agents/skills/verification-before-completion/SKILL.md) | Retro can expose noncompliance; another instruction saying to verify adds little. |
| Ownership and scoped loading | [AGENTS template](../../templates/AGENTS.md) | Already assigns canonical owners and discourages global context growth. These are existing policies, not new upstream capabilities. |
| Behavioral trial precedent | [W1 results](../evals/agent-workflows/results/W1-2026-09-26.md) | Demonstrates a bounded local trial with rejection and retrieval checks; it does not validate harness-retro. |

[RunLog](../../src/run-log.ts) persists workflow events to
`.pi/pi-brain/runs/<runId>.jsonl` with best-effort writes. The
[event union](../../src/ports.ts) records command names and exit codes,
verification status, review summaries/issues, outcome reasons, questions and
usage. It is not a full tool trace: command events omit output, and agent
completion events omit the child's full answer and message history.

The limitation is stronger than merely uncertain transcript availability:
[PiAgentRunner](../../src/pi/pi-agent-runner.ts) creates children using
`SessionManager.inMemory(request.cwd)` and disposes their sessions after each
call. It returns final text/structured output and usage, while its subscription
forwards tool-start traces, not a durable complete transcript. A workflow run
log can support findings about failed verification or review rounds; by itself
it cannot establish the hidden sequence or cause of every child difficulty.
This does not rule out separately supplied parent transcripts or external traces.

[Skill routing](../../src/skill-router.ts) defaults unknown skills to `craft`.
If promoted into [common](../../profiles/common.list), a new retro skill needs
an explicit `operational` entry to stay out of pipeline children. The
[full manifest](../../profiles/full.list) is documentary: setup special-cases
the full store. These are promotion requirements, not reasons to distribute
an unvalidated prototype immediately.

## Independent assessment and alternatives

The supplied analysis is directionally sound about optional use, ownership and
avoiding a new memory system. Its description understates existing prevention
capture and the upstream's prescriptive reporting behavior. Low installation
cost also understates ongoing human review and global skill-catalog growth.

| Option | New value | Cost/risk | Assessment |
| --- | --- | --- | --- |
| Use current skills only | No new workflow; captures verified prevention and audits capabilities | Session friction can remain unexamined unless the user asks | Viable baseline to compare against. |
| One bounded manual retro experiment | Tests whether incident-led analysis finds useful changes current workflows miss | Requires real session evidence and a reviewer | Best next step; fully reversible. |
| Install upstream unchanged | Immediately available procedure | Broad triggers, inflated severity, prescribed child-report finding, footer and overlap | Poor fit. |
| Promote an adapted local skill now | Clear ownership and explicit invocation | Adds maintenance and discovery cost before utility is demonstrated | Premature. |
| Add automatic Pi retro/logging | Can eventually make run selection easier | More orchestration and persistence without demonstrated information demand | Unsupported at present. |

Inference: the missing capability is a selective incident-to-harness decision
process. It does not require a new memory store, a mandatory workflow phase or
new telemetry. Its usefulness remains unmeasured here. A repeated failure is a
strong signal; a single reproducible systemic failure can also justify a fix.
Conversely, repeated normal exploration does not prove the harness is broken.

## Proposed experiment, not executed

Use at most two real sessions: one with substantial friction and one ordinary
or clean session. Start with a manual prompt/procedure, outside common/full
distribution. Inspect current conversation, selected run events and supplied
artifacts only; enumerate unavailable sources. Do not infer child attempts
from aggregate usage or an exit code. Do not expand the trial indefinitely to
obtain a positive result.

Compare with what existing capture/audit procedures already provide. For each
candidate record: observed incident and source, supported cause or explicit
unknown, existing mechanism checked, owning repository, destination layer,
exact proposed change, expected benefit and a check that could demonstrate it.
Separate observation, causal hypothesis and proposed intervention. Rank impact
and recurrence separately from confidence. Merge common causes and allow zero
findings. Missing optional tools and ordinary approval steps are not defects.

Pass conditions are proposed decision criteria, not measured results:

- At least one useful, non-duplicate change supported by the difficult session
  and accepted as worthwhile by the maintainer.
- No unsupported factual claims after review; record rejected proposals and
  review effort rather than hiding them.
- The clean/control session produces no forced recommendation.
- No automatic changes to instructions, skills or memory; proposals identify
  the project owner instead of promoting project details into agent-brains.

If a candidate is selected for implementation, authorize that concrete change
through the normal workflow and verify its behavior. Route verified technical
knowledge through solution-capture when it qualifies; do not also create a
parallel retro memory entry. A retro proposal can exist before a fix is proven,
so it must not masquerade as a verified solution.

After a successful trial, consider a small explicit-only local operational
skill with provenance and license, plus focused distribution/routing checks.
Keep cross-session analysis optional and omit the promotional footer and the
automatic child-report recommendation. Add new persisted evidence only if a
specific valuable finding was blocked by a specific missing field.

## Decision

Verdict: **trial**. Test the incident-led method manually before installing or
distributing a new skill. Revisit promotion after the bounded trial supplies
novel useful findings at acceptable review cost; retain the existing workflows
if it mostly duplicates Prevention or produces speculative recommendations.
Revisit Pi integration only after useful retros repeatedly require the same
missing evidence. This assessment adds only this research note; no skill,
profile, orchestrator, memory entry or dependency was changed.
