---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
license: MIT
metadata:
  management: local
  provenance: adopted
  origins:
    - repository: https://github.com/mattpocock/skills
      path: skills/engineering/tdd/SKILL.md
      commit: 321658273cb1d20b76026717d027d505790106d4
      license: MIT — full text in LICENSE in this folder
  adopted_at: 2026-10-22
  adaptation: >
    Aligns verification ownership with available tools, preserves observable
    test-first work and uses existing approved contracts without repeated gates.
---

# Test-Driven Development

Use test-first development when requested, or when a reproducible bug or risky
behavior has a stable executable contract. Choose verification proportional to
the change; existing protection may suffice for a small edit. Documentation and
non-behavioral changes normally need no new automated tests.

## Execution ownership

With command access, write one focused test, observe its meaningful failure,
implement the smallest fix, and rerun it. Report red/green only when observed.

In a Pi developer role without a shell, author the tests and implementation for
the approved behavior; the orchestrator executes verification after the pass
and returns failures, and the reviewer judges the protection. This is deferred
verification, not an observed test-first cycle. Report what remains unexecuted.
If the user explicitly requires an observed red/green cycle, surface the tool
limitation to the orchestrator for a shell-capable pass instead of claiming it.

When exploring the codebase, read `.ai/context/GLOSSARY.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

Use the public boundary named in the approved plan or established contract.
Approval of that boundary is sufficient; choose routine fixtures and assertions
without another confirmation. Ask only when choosing the boundary introduces a
new material product, scope or compatibility decision.
When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), consult the available `codebase-design` skill for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green when executable.** Follow the execution ownership above; distinguish observed failures from proposed regression checks.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.
