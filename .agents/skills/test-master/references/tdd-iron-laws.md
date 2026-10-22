# TDD execution and evidence

For test-first work, consult [the TDD skill](../../tdd/SKILL.md), especially
Execution ownership and Rules of the loop. It owns applicability, approved
boundaries and the difference between shell-capable and no-shell roles.

In shell-capable work, observe a focused failure caused by the missing behavior
before implementing the fix. A syntax error or broken fixture is not evidence
that the regression is detected. Rerun after the fix and report actual results.

A Pi developer without a shell authors tests and implementation; the
orchestrator runs verification and returns failures. Label those tests
unexecuted until results arrive. A user-requested observed red/green cycle
requires a shell-capable execution path; never infer it from a later green run.

For each material behavior, identify an independently grounded expected result
and the realistic defect the assertion catches. For lifecycle code, consider
ordering, cancellation and resource cleanup when these are contractual. Reuse
existing protection before adding tests; no per-function test quota applies.

Refactor only within the agreed scope, keeping behavior and tests stable. In
this repository's TDD skill, refactoring is a separate review-stage decision.

This local reference replaces the earlier absolute TDD prescription adapted
from obra/superpowers by Jesse Vincent (MIT). The retained notice is in
[LICENSE.obra](../LICENSE.obra).
