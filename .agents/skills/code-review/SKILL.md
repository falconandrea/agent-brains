---
name: code-review
description: "Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to \"review since X\"."
license: MIT
metadata:
  management: local
  provenance: adopted
  origins:
    - repository: https://github.com/mattpocock/skills
      path: skills/engineering/code-review/SKILL.md
      commit: unknown (imported via npx skills before local adoption; the original installed upstream revision was never pinned — the lock file recorded only a content hash)
      license: MIT — full text in LICENSE in this folder
  adopted_at: 2026-10-30
  adaptation: >
    Upstream already remapped here: the tracker convention reads from
    `.ai/agents/issue-tracker.md` and spec lookup covers `.ai/features/`
    instead of `.scratch/`. M1 (2026-10-30) adds the planning-document inputs
    (`spec.md` + `tasks.md`, including historical `prd-`/`tasks-` files),
    acceptance-criteria verification, verifiable-findings rules, the
    review-is-not-fixing boundary and the test-quality questions transferred
    from the Pi reviewer (C2). Declared management: local so upstream updates
    can no longer silently overwrite these rules.
  last_upstream_review:
    date: 2026-10-30
    commit: 7739eaed7f8f3915437a8def198a6d0d7206dbc7
    outcome: upstream evolved (fresh sub-agent context, explicit parallel dispatch, standards-source search wording); those refinements were not present in the installed revision and are superseded by the local M1 contract — re-evaluate on the next upstream review
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

**Review is not fixing.** This skill reports findings; it does not edit code,
write the missing work, or repair what it finds. Corrections are a separate
step performed after the review is accepted (by the implementing session or a
new one). Every finding must be independently verifiable: point at the diff
location, cite the requirement or standard it violates, and state what would
make the finding false.

The issue tracker is described in `.ai/agents/issue-tracker.md`. If that file is missing, ask the user where issues live and record it there.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via the workflow in `.ai/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. The planning documents for the work under review: `.ai/features/<slug>/spec.md` with its `tasks.md`, or the historical `prd-<slug>.md` / `tasks-<slug>.md` files the Pi `/feature` runtime writes — match by branch name, feature slug or recent modification.
4. A spec file under `.ai/features/`, `specs/`, or `docs/` matching the branch name or feature.
5. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

Alongside the spec, read the matching task list (`tasks.md` / `tasks-<slug>.md`) when it exists: the Spec axis also checks task coverage — every task the plan defined is either implemented or explicitly reported as out of this diff.

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn both sub-agents in parallel

**Standards sub-agent prompt** should include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it).
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** should include:

- The diff command and commit list.
- The path or fetched contents of the spec and its task list.
- The brief: "Report: (a) acceptance criteria / requirements the spec asked for that are missing or partial — quote the criterion and say what in the diff fails or omits it; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong; (d) planned tasks with no corresponding change in the diff. Quote the spec line or task ID for each finding and name the diff location that shows the problem or gap. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_). Drop or rewrite any finding that is not verifiable (no diff location, no cited requirement/standard, or a matter of taste presented as a defect); say so explicitly rather than passing it through.

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent.

## Test-quality questions (both axes)

When the diff adds or changes tests — or when you are tempted to request more tests — ask, per assertion:

- Which approved or established observable contract does it protect?
- Where does the expected value come from, independently of the implementation?
- Which plausible regression would make it fail?

Read the existing tests before requesting more: a green suite or a coverage number alone does not prove protection, and sufficient existing coverage or a non-behavioral edit can justify requesting none. Request the smallest addition that would catch a real defect; when a verification gate or wrapper is configured by the diff, expect evidence of a representative valid input accepted and an invalid one rejected through the real entrypoint. Distinguish a missing observation from a demonstrated defect.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
