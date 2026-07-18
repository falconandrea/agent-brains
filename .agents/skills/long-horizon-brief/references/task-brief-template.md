# Pseudo-Formal Task Brief Template

Fill only the blocks the triage called for. Blocks marked *(full brief only)* are skipped on the medium path. Delete sections you do not use before saving the brief.

## TASK

<One sentence stating what must be true of the returned artifact for it to count as done. Quantifiers and scope explicit.>

Examples:

- **Bug fix**: "The reproduction script `repro.sh` exits 0 on the frozen failing input AND the existing test suite still passes with no behavioral change on the gold traces."
- **Refactor**: "Module `X` is split per the target dependency graph in `docs/adr/007-split.md`, all public callers updated, the full CI suite is green, and there is no behavioral diff on the recorded traffic replay."
- **Migration**: "The zero-downtime cutover script runs end-to-end on the staging replica of production shape, including the rollback path, within the defined maintenance window."

## DEFINITIONS *(full brief only)*

<Define every load-bearing term an adversarial reader could interpret two ways. Include degenerate and boundary cases: empty input, trivial solution, zero-measurement, offline path, single-row table, already-migrated state. In empirical domains: units, populations, inclusion criteria, measurement procedure.>

## DOES NOT COUNT

Partial progress does not count unless it implies exactly the TASK predicate. The following are insufficient:

- A fix that resolves the symptom on the reported case but not on the frozen evaluation slice
- A refactor that "should" fix the bug without a reproduction proving it
- An explanation of the cause without an intervention that closes the gap
- A list of hypotheses without an identified defect
- A change that passes tests but skips the case that originally failed
- A migration that works on the sample dataset but not on the production-shaped one
- A performance optimization without a benchmark on the agreed workload
- "Works on my machine" without the repro environment captured

<Add the near misses specific to THIS problem. Method: imagine a junior collaborator returning with each plausible partial result; write down every one you would send back. That list, verbatim, is this block.>

## VERIFICATION

An adversarial reviewer (fresh context, not the author) checks every candidate against this list:

<Enumerate the domain-specific ways a candidate can look right and be wrong. Examples by domain:>

- **Bug fix**: train/serve skew, eval-slice leakage, seed sensitivity, flaky test masking the fix, preprocessing divergence, the fix only works on the reported repro
- **Refactor**: hidden behavioral diff on edge inputs, public API signature drift, transitive caller breakage, test suite passing because the assertion got weakened
- **Migration**: rollback path untested, idempotency not verified, foreign-key order ignored, partial-failure state unhandled
- **Performance**: benchmark warm-up effect, GC pause hiding regression, micro-benchmark not representative of production workload

Always include the domain's version of **circularity**: satisfying the goal by assuming something equivalent to it (e.g. "the migration is correct because the post-migration validator passes" when the validator is the migration's own output).

Workers return concrete artifacts: <scripts, diffs, traces, measurements, migrated datasets, green test runs, benchmark reports>. Reject status reports, vague optimism, and claims that an unresolved step is "routine" or "should be easy".

## RETURN CONDITION

Return only when a candidate satisfies the TASK predicate AND survives the verification audit above. Do not return a partial result, workaround, explanation of difficulty, or "best-effort" summary.

If the externally enforced budget is exhausted first, return the strongest rigorously verified result and its exact remaining gap, clearly labeled as incomplete.

## EFFORT *(full brief only)*

Spend at least <floor: e.g. 3 subagent rounds, 1 hour of attempts, 5 distinct hypotheses> before considering returning or giving up. Do not return merely because current approaches fail; launch new rounds and search for fresh formulations.

Note: effort floors are permissions, not schedules. They remove the agent's permission to quit early; they neither guarantee nor bound runtime. Enforce actual time and cost budgets in the harness.

## CONTAMINATION *(full brief only, only if external retrieval is in scope)*

External search may be used only for <ordinary background, documented APIs, standard library references, public specs>. Do not search for a solution to this exact problem, the specific error message, the benchmark answers, or anything that would launder the result from sources it is supposed to be independent of.

## ORCHESTRATION *(usually skip — opencode is single-agent)*

Relevant only if you spawn multiple subagents. Rules if you do:

- Spawn N subagents with genuinely independent formulations, not N copies of the same prompt with role labels.
- Keep early-round workers blind to each other; cross-pollinate only after each route has developed its real strengths and gaps.
- Maintain a registry of approach families keyed by underlying idea, not surface wording. Redirect workers away from crowded families.
- When a route stalls at a gap as hard as the original goal, mark it blocked. Reopen only for a materially new mechanism, not for renewed enthusiasm.
- Never use inter-agent agreement alone as a return trigger; committees converge most tightly on the hardest problems, where unanimity reflects shared bias rather than corroboration.

## Pre-Launch Rubric

Score each dimension before launching. Fix every "no" before committing agent time.

| # | Question | Pass |
|---|---|---|
| 1 | Can an adversarial reader decide unambiguously whether an artifact satisfies the TASK predicate? | ☐ |
| 2 | Are the plausible near misses for THIS problem excluded by name in DOES NOT COUNT? | ☐ |
| 3 | Does the verification checklist enumerate domain-specific failure modes, including the circularity analogue? | ☐ |
| 4 | Is every persistence instruction (EFFORT, "do not return until") paired with a verification gate of matching strength? | ☐ |
| 5 | Is the return condition a predicate over the artifact, not over confidence, effort, or elapsed time? | ☐ |
| 6 | Are reporting requirements artifact-based rather than status-based? | ☐ |
| 7 | Are contamination guards stated for any external retrieval? | ☐ |
| 8 | Is every hard constraint (budget, tool permission, sandbox) enforced outside the prompt? Prompt-stated constraints are advisory under optimization pressure. | ☐ |

## Red-Team Pass

Before launching, re-read the brief with the single question: "How could an agent satisfy the letter of this brief without solving the problem?" Patch every credible answer. Repeat until the answers stop being credible.

Common answers to hunt for:

- An agent narrows scope and claims the smaller problem is the real one
- An agent "fixes" the symptom on a single case while leaving the class broken
- An agent cites a passing test suite whose assertions were weakened
- An agent returns a refactor that compiles but shifts the regression elsewhere
- An agent reports "done" based on confidence or elapsed effort, not on the predicate
