# Tasks — Code review follow-ups

Status: in progress. T1–T3 are implemented and verified (2026-10-08); T4–T10 are pending. Requirements and review evidence are in the [PRD](prd-code-review-follow-ups.md).

## Safety fixes and regression coverage

- [x] **T1 — Reproduce setup/unlink ownership defects (F1/F5).** Added `tests/setup-unlink.test.ts`: temporary-fixture integration tests covering foreign skill/workflow/whole-directory symlinks (absolute and relative destinations), managed-link refresh/removal, real file/directory conflicts, repeated setup, profile switches, invalid manifests, and unlink ownership. All defect tests failed against the old scripts and pass after the fix.
- [x] **T2 — Make setup/unlink ownership-aware (F1).** `setup.sh` and `unlink.sh` now modify only links whose resolved destination is inside this repository (relative destinations resolved against the link's directory; name alone never proves ownership). The profile manifest is resolved and validated — including `@include` cycles and invalid entries — before any mutation; an invalid manifest leaves existing links intact. A foreign `.agents` (or `.agents/skills`) symlink aborts curated setup before anything is written through it.
- [x] **T3 — Handle local skill conflicts (F2/F5).** Setup skips a skill path occupied by a real file/directory with a clear diagnostic, creates no nested symlink, and counts only correctly linked skills (the summary reports linked vs skipped). Covered for repeated setup and profile switches with a mix of managed links and local content.

## Verification reliability

- [ ] **T4 — Retain metadata under stack overrides (F3).** Update stack resolution in `src/workflows/feature.ts` to detect metadata and apply the configured primary stack. Decide how incompatible capabilities are filtered. Test retained Laravel checks, non-npm package-manager selection, differing manual/detected stacks, and explicit `verify` precedence.
- [ ] **T5 — Define verification timeout configuration (F4).** Choose and document a finite default, a configuration key, validation bounds, and supported-platform behavior. Extend `src/config.ts` and its tests so missing or invalid values receive predictable defaults and existing configurations remain compatible.
- [ ] **T6 — Enforce verification timeouts and cleanup (F4).** Implement the duration limit in `ShellVerifyRunner`; report timeout separately from an ordinary command failure. Test a fast success, ordinary failure, hanging command, child-process tree, and explicit cancellation. Verify that termination leaves no child processes and that workflow cleanup releases its lock. Depends on T5.

## Later maintainability improvements

- [ ] **T7 — Extract planner parsing/validation if it yields a clearer boundary (F6).** Review existing helpers in `src/workflows/feature.ts`, move the coherent parsing/validation responsibility into a focused module, and update imports/tests. Preserve accepted output formats and rejection behavior; record the rationale if extraction is not useful.
- [ ] **T8 — Simplify extension run-lifecycle handling (F6).** Inspect feature/resume wiring in `extensions/pi-brain.ts` for actual duplication. Extract shared lifecycle handling where justified, preserving lock release, active-run tracking, cancellation, event ordering, and outcome rendering. Keep this change separate from behavioral fixes.
- [ ] **T9 — Record and declare verified compatibility (F7).** Inspect locked SDK/typebox versions and current runtime requirements. Validate suitable peer ranges and Node support through local checks and a Pi SDK smoke run. Update `package.json` and documentation; update the lockfile if required. Record evidence and any runtime validation still pending.

## Completion

- [ ] **T10 — Verify and document completed work.** Run focused setup/unlink integration tests and shell syntax checks, then `npm test`, `npm run typecheck`, and `git diff --check`. Update relevant setup/configuration/compatibility documentation and mark only implemented, verified tasks complete. Record remaining decisions or deferred improvements in these artifacts.

Suggested order: T1–T3 first; T4 independently; T5 before T6; T7–T9 after the safety and verification fixes. Apply T10 checks to each implementation change as appropriate and again at final completion.
