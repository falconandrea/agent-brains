# Test review: code-review follow-ups T5+T6 (verification timeout)

Fresh-context evaluator run on 2026-10-12, current skill (post-C3 wording).
Scope supplied to the evaluator: working-tree diff versus `HEAD` (baseline
`1239a20`, unchanged since T4 — no commits were made in between), changed
files under `src/`, `extensions/` and `tests/` plus the untracked
`tests/shell-verify.test.ts`, requirements context PRD F4 + tasks T5/T6.
The evaluator received the full skill text inline, the repo path and the
review boundary; it did not receive the prior two-axis (Standards/Spec)
review or its findings, per protocol. Read-only execution rules applied
(isolated targeted test run permitted).

## Returned findings

Must-fix: none. All material F4/T5/T6 contracts judged protected at stable
boundaries: bounded duration with a distinct result and a message naming
command and limit (`tests/shell-verify.test.ts:64-73`), tree termination via
pid-liveness probes including the SIGTERM-trapping escalation and the
off-pipe grandchild whose shell closes first (`:75-104`), the three-way
distinction timeout/ordinary-failure/cancellation at runner and workflow
level (`:116-146`, `tests/feature-workflow.test.ts:341-363`, with the
mid-verify `cancelled` early-return protected), runtime JSON config behavior
including the silent legacy default (`tests/unit.test.ts:404-435`), and the
workflow-return precondition for the extension's `finally` lock release.
Fake verifiers in the workflow tests were judged appropriate (routing is the
contract there; the runner has real-process tests).

Minor, both incomplete coverage, both from inspection:

1. Bounds off-by-one undetected: the pass-through test used only 30000, so
   mutating `>=`/`<=` to `>`/`<` in `src/config.ts` would reject
   documented-valid boundary values (1000, 3600000) with the suite green.
   Smallest correction: assert both boundary values pass through.
2. Overflow kill not directly detected: the added overflow test's producer
   ends naturally, so deleting `killTree("SIGKILL")` on overflow left all
   assertions green — only the later timeout would remain as protection.
   Smallest correction: append `; sleep 300` so elapsed-time and
   `not timedOut` assertions fail unless the runaway tree is actually killed.

Verification limits noted: TDD ordering and mutation claims are process
assertions not independently reproducible from a working-tree diff; lock
release and `/flow stop` end-to-end live on the untested Pi extension
surface; runner tests are POSIX-specific by documented supported platform.

Executed: `node --test tests/shell-verify.test.ts tests/unit.test.ts
tests/feature-workflow.test.ts` → 99/99 (7.1 s, temp fixtures only);
`npm run typecheck` → clean.

## Parent comparison (not shown to the evaluator)

- New findings: (1) entirely new — no ordinary-review counterpart; accepted
  and applied (boundary values added to the pass-through test). (2) is a
  sharpening of an area the Spec sub-review had flagged as untested
  (overflow path); after the ordinary review added a test, the test lens
  correctly found that the new test did not detect the kill it existed to
  protect; accepted and applied (`; sleep 300` appended, verified green).
- Overlap: the overflow area converges with the Spec axis (same contract,
  successive depth). No overlap on the escalation-timer defect — that was
  the Standards/Spec reviews' unique catch; conversely the boundary
  off-by-one was unique to the test lens.
- False positives: none. Both minor findings were actionable and are now
  covered; the evaluator did not request disproportionate suites.
- Overhead: ~10 file reads, 3 greps, 2 git commands, 1 targeted test run
  (7.1 s), 1 typecheck. Comparable to the E run's footprint; still bounded
  by the read-only rules.

This is the third recorded sample (B historical, E and F on fresh work) with
actionable findings, no false positives and bounded overhead — the recurrence
condition for reconsidering conditional integration is now met; the decision
remains with the user.

## Addendum (2026-10-12, post-run): two externally reproduced escapes

After the F run and the two-axis review were recorded, the user reproduced
two Spec defects in the same diff that BOTH lenses had missed:

1. **Early return before cleanup completes** — the runner resolved its result
   at shell close while the SIGKILL of surviving children was still scheduled;
   run() returned in 266 ms with a live child, so the workflow could proceed
   and release the lock while the process kept running. The F review had
   praised the pid-liveness probes (`assertPidGone`) without noticing they
   poll AFTER run() returns — exactly the window that hides the defect.
   The two-axis review had fixed a sibling of this bug (escalation timer
   cancelled on close) and stopped one step short of the return-time
   guarantee.
2. **Timeout overwriting an ongoing cancellation** — cancel at 100 ms,
   timeout at 300 ms, grace 500 ms produced `timedOut: true` / exit 124:
   terminate() was callable twice with independent flags, and the abort path
   left the timeout timer armed. No review had exercised the interleaving.

Both were fixed red-first (regressions: at-return tree-death assertion with
no post-run polling; cancel-first-wins with a TERM-trapping command). Lesson
for the experiment: assertions on eventual state can mask ordering
guarantees; a test-evidence lens should ask not only "does this fail when the
behavior is removed" but "does the asserted moment match the contract's
moment". These escapes do not reverse F's recorded findings, but they bound
its claims: the run verified presence of protection, not absence of races.
