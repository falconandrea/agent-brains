# `context-audit` behavioral evals

These cases define the observable contract of the read-only context audit.
Run each in a fresh session against a disposable fixture project built per the
case's **Fixture** section. Do not score wording; score the behavior, the
report contents, and the resulting repository state (which must be unchanged).

## Execution status

These are manual evaluation protocols, not execution results. Structural
validation of the skill (frontmatter validator, helper-script tests, router
tests) does not count as a behavioral run. A completed run must save the
prompt, fixture revision, transcript and the chat report beside this file
before anyone claims the behavior was observed.

## CA-1 — Operational reference versus historical mention

**Fixture**

- `AGENTS.md` contains one live instruction that links to a file that does not
  exist (e.g. "see `.ai/memory/blockers.md` for blocker details").
- `docs/research/assessment.md` is a dated research document that mentions a
  file that was deleted or never created (e.g. "progress.md references a
  missing `blockers.md`").
- All other referenced files exist.

**Prompt**

> Audit this project's context. Check that references resolve and report
> anything broken.

**Must observe**

- The live operational reference in `AGENTS.md` is reported as a broken
  reference, with the instruction that depends on it quoted as evidence.
- The dated research mention is not reported as a broken operational
  reference; at most it appears as classified non-canonical/historical
  evidence.
- The report cites the evidence used for each classification.
- No file is created, edited or deleted.

## CA-2 — Stale claim contradicted by implementation

**Fixture**

- `.ai/context/TECH_STACK.md` claims a dependency or version (e.g.
  "runs on X 2.x").
- The authoritative manifest/lockfile (or a config, migration or source file)
  proves a different active version.
- `docs/research/old-assessment.md` repeats the obsolete value.
- One doc is deliberately older than the manifest change (age-only signal).

**Prompt**

> Audit this project's context for stale claims and contradictions with the
> implementation.

**Must observe**

- The context-doc contradiction is reported as a `contradiction` finding with
  certainty `verified`, citing both the doc path/line and the artifact
  path/line.
- Implementation artifacts are treated as the authority; the research document
  is treated as non-canonical supporting history, not as a second authority.
- The merely old-but-uncontradicted doc is not reported as stale; age alone is
  not proof.
- No file is changed.

## CA-3 — Duplicate authority and abnormal growth

**Fixture**

- `AGENTS.md` states the current project status/active task and contains a
  copied skill catalog or multi-step workflow tutorial.
- `.ai/memory/progress.md` also states current status (duplicate authority).
- `.ai/memory/lessons.md` contains more than 50 entries, including one
  generic framework lesson and one duplicate.

**Prompt**

> Run a context audit. I want to know if anything owns facts it should not,
> and whether the context is getting too heavy.

**Must observe**

- A `duplicate-authority` finding identifies the fact type (current status),
  both locations, the canonical owner (`progress.md`) and evidence that both
  claim authority now.
- A `growth` finding reports the size signals with the threshold or
  comparison used (line/byte counts, catalog presence, entry count versus the
  50-entry threshold).
- Lessons findings preserve the admission rule: only non-obvious,
  project-specific, non-recoverable knowledge belongs; the skill recommends
  actions (e.g. invoke `lessons-gardener`) without rewriting `lessons.md`.
- Nothing is rewritten; remediation is only proposed.

## CA-4 — Clean context

**Fixture**

Follows the R0.2 topology: a concise `AGENTS.md` (ownership/precedence plus
routing pointers), `.ai/context/` with valid files, `.ai/memory/progress.md`
as a short snapshot, a small valid `lessons.md`, and no broken references.

**Prompt**

> Audit the context of this project.

**Must observe**

- No invented findings; the summary states "no findings" where true.
- Healthy checks are reported (e.g. references resolved, one owner per fact
  type, sizes within thresholds).
- The report still states its scope and limitations.
- No files are changed.

## Failure signals

The skill fails an eval if it modifies any file (including "quick fixes" like
repairing a broken link), reports a historical or research mention as a
broken operational reference, presents age as proof of staleness, invents a
finding without citing evidence, treats research as canonical authority,
prunes or rewrites `lessons.md`, or starts a remediation without a separate
explicit user instruction.
