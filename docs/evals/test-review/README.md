# Test-review skill pilot

Date: 2026-10-11
Status: completed initial pilot; experimental explicit extra, no workflow promotion
Local baseline: `73acb85f01db38ad34f61cf7bf9f1c56a183d8e5`

## Question and acceptance

Does a separate test-evidence lens identify concrete missing or false protection
beyond normal review, while accepting changes that need no new tests?

Keep the experiment if it produces at least one actionable, locally verified
test-evidence finding and avoids asking for tests on a documentation-only control.
Automatic workflow integration additionally needs recurrence on new real work
and acceptable review overhead. This pilot does not establish those conditions.

## Configuration and evidence

The prototype is [test-review](../../../extra/skills/test-review/SKILL.md), stored
outside the canonical skill store, profiles, installer, lockfile and Pi skill
discovery root. Codex implicit invocation is disabled in `agents/openai.yaml`;
the OpenCode V2 metadata guard follows the existing optional-skill convention.
These metadata fields are not a security sandbox or a portability guarantee for
other runtimes. No global skill installation or workflow modification occurred.

Evaluators ran as separate Codex subagents with no inherited parent conversation
(`fork_turns: none`), using the host model/settings without an override. Exact
model ID, token usage, complete tool transcripts and measured evaluator latency
were not exported; this pilot claims none. The supplied historical sources were
read with `git show <target>:<path>`, not checked out over the user's working tree.
Reviewers were forbidden to read other findings, perform mutations or run tests;
their sole output write was to temporary report files, subsequently copied here.
The parent evaluated their findings and performed the isolated mutation probe.

The [v1 skill snapshot](runs/skill-v1.md) preserves the instructions for the
initial runs. The current skill adds a narrow clarification concerning complete
manual-eval evidence protocols and implementation versus validation status.
The C3 rerun assesses that clarification but is not independent replication.
The initial [B baseline proxy](runs/B-code-review-proxy.md) ran both axes in one
context because its evaluator could not spawn children. It is superseded and
excluded from overlap conclusions; the parent launched separate Standards and
Spec evaluators directly for the actual baseline.

| Case | Historical range | Purpose | Evidence |
|---|---|---|---|
| A | `96c639b..763387a` | Context-audit helper, skill and tests | [Review](runs/A-test-review.md) |
| B | `e5f8e56..73acb85` | Setup/unlink safety repairs and 24 integration tests | [Review](runs/B-test-review.md) |
| C | `906c47e..ed43993` | Grilling skill and behavioral-eval protocols | [Corrected full-scope review](runs/C2-test-review.md) |
| D | `168532a..a71bbb6` | W1 documentation-only contract update | [Negative control](runs/D-test-review.md) |
| E | working tree vs `1239a20` | T4 stack-override metadata retention | [Review](runs/E-test-review.md) |
| F | working tree vs `1239a20` | T5+T6 verification timeout and tree termination | [Review](runs/F-test-review.md) |

All comparisons are two endpoints; each base is the target's ancestor, so the
baseline code-review three-dot comparison yields the same patch. Full commit IDs
can be resolved with `git rev-parse`. The first [C output](runs/C-test-review.md)
incorrectly narrowed the supplied scope to the roadmap. It is preserved as a
superseded scope failure, not counted as another successful evaluation.

## Findings and adjudication

Full fixture IDs, patch hashes and skill hashes are saved in
[runs/config.json](runs/config.json). The fresh B baseline's
[Standards](runs/B-standards.md) and [Spec](runs/B-spec.md) outputs are preserved
separately, following the existing review contract.

### B: demonstrated missing regression protection

The reviewer identified two absent boundary cases: `unlink.sh` preserving a
foreign whole-store `.agents/skills` symlink and a foreign `.agents/workflows`
symlink when `.agents` itself is a real directory. Existing tests exercise
foreign individual skills and a whole foreign `.agents` link, but those paths
do not exercise these ownership guards.

The implementation currently preserves both. The finding concerns evidence,
not a demonstrated defect in the shipping script. The parent verified the gap
using the [replay script](run-mutation-experiment.py), Node `v24.12.0`, and only
copies of the target's scripts/tests in a disposable directory:

| Experiment | Result |
|---|---|
| Original code, original suite | 24/24 pass |
| Both ownership guards replaced with `if true`, original suite | 24/24 pass |
| Mutated code, two focused preservation probes added | 24 pass, both probes fail |
| Original code restored, same probes retained | 26/26 pass |

The unchanged suite accepts concrete user-link deletion defects. Each new probe
fails on its corresponding defective path and passes on restored code. This is
stronger evidence than hypothetical mutation reasoning. The probes and altered
scripts were not applied to the production checkout.

The independent Spec baseline also found the missing foreign-workflow unlink
case. That half of the finding overlaps normal review. The foreign whole-store
skills case was additional in this comparison; the mutation probe verifies both.
The baseline also raised other implementation/manifest issues outside the test
reviewer's lens. Those remain inspection findings, unapplied and not validated
by this pilot's mutation experiment. The new lens complements normal review.

Captured outputs are retained in [mutation-results](mutation-results/results.json)
and sibling `.txt` files, with trailing whitespace normalized. Reproduce from
the repository root with:

```sh
python3 docs/evals/test-review/run-mutation-experiment.py /tmp/test-review-results
```

The script reads the pinned revision through Git, modifies only a disposable
fixture, and writes evidence to the chosen output directory. It explicitly uses
Node's TAP reporter. The initial parent probe used the default reporter and its
output-format assertion failed after correctly observing two failed tests;
the completed recorded run fixes that harness issue. Neither the first attempt
nor the completed probe altered the shipping implementation.

### A: partly overlapping evidence concerns

The reviewer distinguished helper tests from unexecuted agent-behavior evals
and identified the untested CLI boundary. The missing behavioral evidence also
appears in the previously persisted faithful
[Spec review](../complexity-review/runs/A4b-spec-axis.md); it is not unique value.
The CLI gap is concrete from inspection, but no mutation or CLI failure was run.
Its value depends on how important the documented CLI boundary is in practice.
Existing inventory, role-routing and read-only tests were recognized as useful.

### C: overlap and an overstatement to correct

Missing behavioral execution overlaps the previous faithful
[Spec review](../complexity-review/runs/B4b-spec-axis.md). The extra recommendation
to require intermediate snapshots/interruption probes is not accepted as a
must-have: the existing protocol already requires a transcript, which may show
write and phase ordering. There is no executed demonstration that the complete
protocol would accept the hypothesized defect. This prompted the narrow skill
clarification; manual protocols must be read as a whole and pending evals must
not automatically be treated as false completion claims.
The [C3 rerun](runs/C3-test-review.md) retained only a minor verification limit,
recognized transcript evidence, and did not demand an automated harness. Because
it used the same evaluator with earlier output in context, this demonstrates
iteration responsiveness, not independent validation of the revised skill.

### D: negative control passed

The documentation-only comparison earned no findings and no request for new
automated tests. The reviewer correctly separated an evaluation-plan edit from
shipping behavior. This is one negative case, not a measured false-positive rate.

## Decision and next use

Keep `test-review` as an explicit experimental extra. The isolated B experiment
demonstrates useful test-evidence scrutiny; A and C show substantial overlap with
Spec review and some risk of excessive evidence requests. Default invocation
on every change is not justified by this small, single-repository pilot.

Two further fresh-work samples were recorded under the standing reminder:
[E (T4, 2026-10-11)](runs/E-test-review.md) — no must-fix, one convergent
minor overlap, no false positives, low overhead; and
[F (T5+T6, 2026-10-12)](runs/F-test-review.md) — no must-fix, two minor
incomplete-coverage findings (one entirely new, one a sharpening of a
Spec-axis catch), both accepted and applied, no false positives, bounded
overhead. After the F run, the user reproduced two races in the same diff
that both the test-review trial and the two-axis review had missed
(early return before cleanup completes; timeout overwriting an ongoing
cancellation) — recorded in the F run addendum as a bound on the lens:
eventual-state assertions can mask ordering guarantees. With recurrence on
fresh work now demonstrated (E and F), the condition for reconsidering
conditional workflow integration is met; that decision is deliberately left
to the user, not taken by the runs themselves.
The likely seam is an optional independently scoped review lens alongside the
existing reviewer, not a second unconditional phase or a replacement for
deterministic checks. Any integration must keep structured results, read-only
policy and existing retry budgets authoritative.

The missing B tests are recorded follow-up findings. This pilot deliberately
does not modify setup/unlink or expand the T1–T3 implementation retrospectively.

## Verification of the pilot artifact

- Official skill validator: pass, using PyYAML in a disposable virtualenv.
- Parsed invocation policies and inspected profile/installer/router/lockfile
  isolation: pass. No structural-wording tests were added to the shipping suite.
- Existing repository suite: 239/239 pass; `npm run typecheck`: pass.
- Isolated B probe: four expected results recorded above, including the restored
  26/26 result.
- Local Markdown links, whitespace checks and `git diff --check`: pass.

These checks establish artifact validity and repository health; they do not
prove the skill's universal review accuracy or future workflow performance.
