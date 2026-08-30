# W4 — Research and assessment routing

This document defines the W4.1 routing contract and the W4.3 minimum rubric
before the existing `research` skill is extended. W4 keeps one skill and one
Markdown report convention; it adds an explicit mode to the existing behavior.

## Routing

Select the mode from the user's requested outcome, not from the topic:

| User intent | Mode | Required ending |
|---|---|---|
| Understand, document or verify what a technology does | `research` | Evidence-backed factual report; no recommendation required |
| Decide whether this repository should adopt, trial, select or reject it | `assessment` | Project-grounded comparison and explicit verdict |
| Compare options without asking which one to choose | `research` | Neutral comparison; no winner selected |
| Compare options and choose one for this repository | `assessment` | Rubric and explicit verdict |

Explicit wording such as “should we adopt”, “is this appropriate here”,
“which should we choose” or “recommend” selects `assessment`. Wording such as
“research”, “explain”, “document”, “what are the capabilities” or “compare”
without a decision request selects `research`.

If the user names a mode explicitly, honor it. If the request is genuinely
ambiguous and the mode would materially change the output, ask one focused
clarifying question. Otherwise default to `research`; neutral facts must not be
silently turned into a recommendation.

The report must state `Mode: research` or `Mode: assessment` near its title so
the selected contract is visible and reviewable.

## Shared contract

Both modes must:

- use primary sources for upstream claims;
- inspect only the repository areas relevant to the question;
- distinguish verified facts, local evidence and inferences;
- cite sources close to the claims they support;
- produce one Markdown report in the repository's existing research location;
- avoid installing dependencies, modifying source code or committing unless
  the user separately requests those actions.

## Assessment contract

In addition to the shared contract, `assessment` must:

1. state the repository need or decision being evaluated;
2. compare the candidate with the current implementation and realistic
   alternatives;
3. complete the six-dimension rubric below with evidence and caveats;
4. end with exactly one of `adopt`, `trial`, `selectively import` or `reject`;
5. define revisit triggers when the verdict is `reject` or deferred.

The verdict is about fit for this repository, not popularity or upstream
quality in isolation. A strong upstream project can still receive `reject` if
there is no current need, it duplicates the local system or its cost is not
justified.

## Minimum assessment rubric

| Dimension | Question to answer |
|---|---|
| New value | What concrete capability would be added now? |
| Overlap | What current code, package or workflow already covers it? |
| Cost | What dependency, tokens, runtime, maintenance or operational cost is introduced? |
| Risk | What security, reliability, supply-chain, compatibility or lock-in risks exist? |
| Compatibility | Does it fit the current runtime, architecture, policies and interfaces? |
| Reversibility | Can it be removed or replaced without leaking into the workflow core? |

Each row should contain concise local evidence, the relevant upstream source,
and an inference where the conclusion is not directly stated by a source.
The report must explain how the six rows lead to the final verdict.

## E7 verification after the change

Repeat the E7 prompt from the W0 protocol in a fresh session, using the same
fixture and a candidate that is still new to the repository. Compare it with
the W0 E7 report on:

- whether the mode is visibly `assessment`;
- primary-source coverage;
- separation of facts, local evidence and inferences;
- completion of all six rubric dimensions;
- explicit and repository-specific verdict;
- additional turns, tool calls and artifacts;
- constraint violations.

The new run must not be judged successful merely because it is longer or more
decisive. The W4 gate requires a more consistent project-grounded verdict
without disproportionate cost or ceremony.
