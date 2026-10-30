# Feature documents: spec.md + tasks.md

Per-feature directory: `.ai/features/<slug>/` with two documents. Historical
`prd-<feature>.md` / `tasks-<feature>.md` files stay valid; new work uses this
pair. Small fixes need no spec.

## spec.md

```markdown
# Spec: <Feature Name>

## Goal
<The problem and the outcome, from the user's perspective.>

## Behavior
<What the system does: flows, interactions, data. For risky behavior name
initial state/input, triggering event and observable result.>

## Boundaries
<Scope and explicit non-goals.>

## Constraints
<Stack, conventions, ADRs, performance/security limits.>

## Edge cases
<Error scenarios, rejections, empty/concurrent/interrupted states, expected outcomes.>

## Decisions
- <Choice> — <one-line rationale.>

## Observable acceptance criteria
- [ ] <Testable statement, one line; initial state/input, event, observable result.>

## Residual assumptions
- <Every decision made without asking the user, one line each.>
```

## tasks.md

```markdown
# Tasks: <Feature Name>

- T1 — <concrete WHAT, no pseudocode. Areas: `path/a`, `path/b`. Depends: none.
  Verify: <smallest check that proves it, and who runs it>. Status: open
- T2 — <...>. Depends: T1. Status: open
```

Stable IDs (`T1`, `T2`, …): never renumber; deletions leave gaps; insertions
use the next free number or a sub-id (`T2.1`). Implementation and review
consume the approved documents; planning approval is not implementation
approval.
