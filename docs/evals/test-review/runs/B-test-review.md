Scope: reviewed the historical comparison `e5f8e56..73acb85`, using target-revision files only. The relevant contract is PRD F1/F2/F5 in `.ai/features/code-review-follow-ups/prd-code-review-follow-ups.md`; the implementation scope is T1–T3. I reviewed `setup.sh`, `unlink.sh`, `tests/setup-unlink.test.ts`, and the README setup contract. This was an inspection-only review; no tests or shell commands from the fixture were executed.

Finding
-------

**P2 — incomplete coverage: unlink ownership is not tested for foreign workflow or whole-store skill links.** F1’s acceptance criterion requires setup *and unlink* to preserve foreign skill, workflow, and whole-directory links. The setup test for a foreign workflow link (target `tests/setup-unlink.test.ts:167-179`) stops after `setup`; the unlink test at `:288-303` uses an agent-brains-owned workflow link, so it only proves the managed-removal path. The foreign whole-directory test at `:181-202` exercises a foreign `.agents` link, but `unlink.sh` returns before reaching the separate `.agents/skills` and `.agents/workflows` branches when `.agents` itself is a symlink. Consequently, `unlink.sh:157-188` has no regression assertion that a foreign `.agents/skills` whole-store link or a foreign `.agents/workflows` link survives unlink.

A plausible mutation (not executed) is replacing either `link_points_to` guard with unconditional `rm`, or accidentally treating every workflow/skills-directory symlink as owned. The current suite would remain green while unlink deletes user-managed links, violating the README contract and the F1 safety requirement. Add isolated temporary-project cases with a real `.agents` directory containing a foreign `workflows` symlink and a foreign `.agents/skills` symlink; run `unlink.sh`, then assert the symlink destination and foreign target content remain. This is a test correction, not a demonstrated implementation defect.

Useful existing protection
--------------------------

The suite has strong coverage for the other T1–T3 boundaries: foreign per-skill links through setup and unlink (`:149-165`, `:288-303`), foreign whole `.agents` links (`:181-202`), relative destinations (`:260-285`), real file/directory conflicts and non-nested linking (`:317-367`), invalid manifests before mutation (`:204-226`), repeated setup and profile switches (`:228-258`), and curated/full conversion guards including hidden entries and real-path conflicts (`:369-493`). The fixture is isolated under a temporary workspace (`:67-97`), satisfying F5’s no-user-project mutation constraint.

Limits/trace: no test execution, mutation experiment, or live-project check was performed. Review used roughly 9 read-only tool calls; wall duration was not measured.
