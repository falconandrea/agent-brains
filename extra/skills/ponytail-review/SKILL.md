---
name: ponytail-review
description: >
  Read-only complexity review of an existing diff or commit range. Reports
  only over-engineering findings — code that can be deleted, existing project
  code that should be reused, hand-written code replaceable with the standard
  library, dependencies or wrappers replaceable with native platform features,
  speculative abstractions or extension points, and simpler equivalent
  implementations. Explicitly excludes correctness, security, performance and
  spec findings. Use when the user asks to review a diff for
  over-engineering, what can be deleted, whether code is over-engineered, or
  explicitly invokes this skill by name.
license: MIT
metadata:
  opencode/autoinvoke: false
  short-description: Complexity-only review of a diff
  upstream:
    project: ponytail
    author: DietrichGebert
    repository: https://github.com/DietrichGebert/ponytail
    commit: 356918eba965ee1eac64bd3a7f0dd02108350de5
    license: MIT — full text in LICENSE in this folder
  adaptation: >
    Adapted, not copied verbatim, from upstream skills/ponytail-review/SKILL.md:
    adds the reuse tag, the commit-range input contract, the needs-confirmation
    rule and explicit never-flag boundaries; adds local invocation guards
    (agents/openai.yaml with allow_implicit_invocation: false for Codex;
    metadata.opencode/autoinvoke: false for OpenCode V2 — ignored, harmlessly,
    by OpenCode V1 and tolerated by Codex); drops upstream mode-state commands
    ("stop ponytail-review" / "normal mode") tied to the Ponytail Pi extension.
    No Ponytail persona, lifecycle hooks, always-on injection or benchmarks are
    imported.
---

# Ponytail Review — complexity-only diff review

Review an existing diff exclusively for unnecessary complexity. One line per
finding: location, what to cut, what replaces it. The diff's best outcome is
getting shorter. Never apply fixes — report only.

Derived from the [ponytail](https://github.com/DietrichGebert/ponytail)
project by DietrichGebert at commit
`356918eba965ee1eac64bd3a7f0dd02108350de5`, MIT licensed (see [LICENSE](LICENSE)).

## Input

Review a diff the user supplies: a commit range, `base...HEAD`, a single
commit, or a pasted diff. If none was supplied, ask for the range first. Do
not widen the range beyond what the user asked for.

## Tags

Each finding is one line, `<file>:L<line>` or `L<line>-L<end>`:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `reuse:` the diff hand-writes what existing project code already provides. Name it.
- `stdlib:` hand-rolled thing the language standard library ships. Name the function.
- `native:` dependency or wrapper doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, extension point with no second caller.
- `shrink:` same logic, meaningfully fewer lines. Show the shorter form.

Every finding states what can be removed and what replaces it.

## Uncertainty

When a simplification depends on an unverified assumption (for example, that
nothing else calls a helper), report it as `needs-confirmation:` naming the
assumption to verify — not as an actionable deletion.

## Estimate

End with the directional metric: `net: -<N> lines possible.` Count only lines
the cited findings actually support; call it approximate when it is.

If there is nothing to cut, say `Lean already. Ship.` and stop.

## Never flag for removal or weakening

- security controls and trust-boundary validation;
- necessary validation of inputs, state or invariants;
- necessary error handling;
- data-loss protection;
- accessibility behavior;
- required compatibility behavior;
- tests that prove requested behavior — a minimal smoke test or assertion is
  the floor, not bloat;
- anything an approved spec explicitly demands.

## Boundaries

Complexity findings only. Correctness bugs, security holes, performance issues
and spec deviations belong to their existing review passes — do not report
them here. Read-only: list findings, apply nothing.
