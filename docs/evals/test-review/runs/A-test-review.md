# Test review

## Scope

Reviewed historical range `96c639b..763387a3ee55f371a5ab0d9e1aae7e75abcac789` at target revision `763387a`, focusing on the R0.3 context-audit contract in `docs/plans/pi-plugin-adoption-roadmap.md:156-188` and its helper, skill, routing, and tests. Target files were read with `git show`; later fixes, reports, and follow-up documents were excluded. This was read-only inspection: no tests or other checks were executed and no repository files were changed. Rough review duration: a few minutes; three batched read-only shell invocations.

## Findings

### 1. Medium — incomplete coverage — behavioral acceptance is unverified

`docs/plans/pi-plugin-adoption-roadmap.md:187-188` requires the audit to produce actionable, source-cited findings while leaving context files untouched. `tests/context-audit.test.ts:1-3,74-153` explicitly tests only the mechanical helper (inventory, counts, link candidates, and fixture immutability), while `.agents/skills/context-audit/evals/README.md:8-14,32-40,58-67,84-95,109-115` says the four behavioral cases are manual protocols and have not been run. No test or saved transcript checks operational-versus-historical classification, verified contradiction evidence, duplicate-authority/growth findings, report sections, or read-only behavior of an actual audit session.

A plausible mutation—reporting a dated research mention as a broken operational reference, omitting the artifact side of a contradiction, or editing a context file—would leave the current suite green. The smallest correction is to run CA-1 through CA-4 in disposable fixtures and save the required prompt, fixture revision, transcript, and report; if those remain manual, record their actual results before treating R0.3 as accepted. This conclusion is from inspection, not an executed failure.

### 2. Low — incomplete coverage — documented CLI boundary is untested

The skill directs the agent to execute `node .agents/skills/context-audit/scripts/context-audit.mjs <project-root>` and consume its JSON output (`.agents/skills/context-audit/SKILL.md:66-77`). The tests import `auditProject` directly (`tests/context-audit.test.ts:13`) and never exercise `main` (`.agents/skills/context-audit/scripts/context-audit.mjs:183-197`). A plausible mutation to argument validation, path resolution, JSON serialization, or the non-directory exit path would break the documented audit invocation while all current tests pass. Add one disposable-fixture subprocess test that parses stdout, plus an invalid-input assertion. This is an inspection-based risk, not an observed defect.

## Good protection and limits

The helper tests cover scoped/root roles, excluded trees, ADR role de-duplication, lesson and progress counts, unresolved-link candidates, missing optional inputs, and content/mtime preservation. `tests/unit.test.ts:149-166` also pins common-profile availability and exclusion from every pipeline role. Those are useful stable-boundary checks. I did not run the claimed `npm test`, TypeScript check, validator, or behavioral evals, so their pass status and the runtime skill behavior remain unverified.
