---
name: simplify
description: Fast, mechanical single-pass code cleanup. Runs formatters, removes unused code/imports, prunes AI comment noise, and verifies tests remain green.
---

# Code Cleanup & Simplification Skill

Use this skill immediately after implementing a feature or completing a set of tasks (Step 6 of the feature workflow), and before running a full code review. It performs a lightweight, mechanical clean-pass to remove AI-generated bloat and format changes properly.

## Guidelines & Process

When this skill is invoked (e.g., via `/simplify` or on demand), execute the following steps in a single, fast pass over the changed files (or git diff):

### 1. Mechanical Lint & Format
*   Detect formatting/linting tooling in the project (e.g., look for `pint`, `eslint`, `prettier`, `typescript` in `composer.json` or `package.json`).
*   Run the appropriate fix commands (e.g., `./vendor/bin/pint`, `npm run lint --fix`, or `npx prettier --write <file>`) to format the newly modified or created files.

### 2. Dead Code & Import Pruning
*   Identify and remove unused imports, unused local variables, or unused private helper methods introduced by the recent changes.
*   Ensure there are no leftover debug statements (e.g., `console.log`, `dd()`, `dump()`, `var_dump`).

### 3. AI Comment Clean-pass
*   Inspect comments in the modified code.
*   **Remove all comments that describe WHAT the code is doing** if it is already obvious from the identifiers (e.g., `// Initialize user variable` before `const user = ...`).
*   Keep only comments explaining **WHY** a non-obvious design decision or business logic constraint was implemented.

### 4. Verification Gate
*   Run the project's test suite for the affected components (e.g., `php artisan test`, `npm run test`, or `jest`).
*   Verify that all tests pass.
*   **CRITICAL RULE**: Under no circumstances are you allowed to relax test assertions, delete assertions, or comment out tests to make the verification pass. If a test fails, report the failure and fix the underlying code, keeping the assertions intact.
