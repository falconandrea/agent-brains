# Skill ownership and lifecycle plan

**Date:** 2026-09-22

**Status:** proposed implementation handoff

**Repository:** `falconandrea/agent-brains`

**Branch inspected:** `pi-brain`

**Evidence baseline:** `7ef9ec8512343fdbaad8309ce6b860d7052e6dd7`

## Purpose

Define the smallest useful ownership and update model for agent skills in this
repository. The immediate goal is to prevent locally authoritative skill
behaviour from being overwritten by an upstream installer while preserving a
simple update path for skills whose value depends on an evolving framework,
product, CLI or external ecosystem.

This plan is an implementation handoff. It records the full architectural
direction, but deliberately separates the first safe change from later work.

## Executive decision

Implement a lightweight distinction between skills that are managed by an
upstream installer and skills whose local copy is authoritative.

Do not implement a central registry, scheduled updater, background polling,
automatic merge mechanism or large skill taxonomy.

The operational rule is:

> A skill present in `skills-lock.json` is replaceable by the upstream skill
> installer. A locally authoritative skill must not be present in that file.

The current repository already solves distribution, project selection,
explicit-only extras and research/document authority adequately. The missing
piece is an explicit ownership contract around updates.

## Implementation boundary

The default implementation scope for the first development change is only
**Phase 1 — immediate safety and proven adoptions** below.

Phases 2–4 are recorded as follow-up work. Do not implement them in the same
change unless the user explicitly expands the scope.

In particular, the first change must not create `skills-audit`, classify and
migrate every third-party skill, merge existing skills, or introduce a central
registry.

## Verified current state

The following are repository facts verified at the evidence baseline.

- `.agents/skills/` contains 57 canonical skill directories.
- `skills-lock.json` contains 24 entries.
- `extra/skills/` contains `humanizer` and `ponytail-review`.
- Profiles expose the canonical skill store through per-skill symlinks, while
  the `full` profile links the whole `.agents` directory.
- Therefore, a change to one canonical skill can immediately change behaviour
  in every linked project whose profile contains that skill.
- `README.md` presents `npx skills update` as the normal update path.
- `install-global-skills.sh` installs only a subset of the current locked
  skills and suppresses installation failures with `|| true` while still
  printing an `OK` message.
- `grill-with-docs` and `research` remain in `skills-lock.json` even though
  both have received substantial local changes since the last recorded bulk
  upstream update.
- No `ORIGIN.md` or `PROVENANCE.md` convention currently exists.
- `ponytail-review` already records an exact upstream repository, source
  commit, license, adaptation notes and explicit-only invocation policy in its
  `SKILL.md`, and retains the upstream `LICENSE` file.
- `humanizer` declares an MIT license and describes its conceptual basis, but
  does not identify a source repository, source path, exact commit or retained
  license file.
- `context-audit` explicitly treats `docs/research/` as non-canonical evidence
  and does not report research/code divergence as a contradiction by itself.
- The recent research documents already use lightweight headers such as date,
  mode and scope.

Relevant local evidence:

- `README.md:116-159` — canonical store, update instructions and symlink blast
  radius.
- `README.md:262-317` — `extra/skills` is manual and outside profiles.
- `setup.sh:17-21,121-150,195` — canonical store and symlink behaviour.
- `skills-lock.json:28-33` — `grill-with-docs` remains lock-managed.
- `skills-lock.json:64-69` — `research` remains lock-managed.
- commit `ed4399305573bd3d7b86d44cc4f09658b9cfb2c8` — local rewrite of
  `grill-with-docs`.
- commits `5fb6fb9587d716f46e77956fff79a90fbb9b3950` and
  `1fdcf8bd49605bd69d7d91d183939b3cc9fc85f5` — local assessment mode and
  evidence changes in `research`.
- `extra/skills/ponytail-review/SKILL.md:13-29` — current provenance precedent.
- `.agents/skills/context-audit/SKILL.md:90-92` — research authority rule.
- `tests/extra-skills.test.ts:16-94` — structural protection for the Ponytail
  pilot.

## External updater evidence

The current `vercel-labs/skills` project lock records `source`, `sourceType`,
`skillPath` and a `computedHash`. Its project update path reads the lockfile,
groups the entries by source and invokes the CLI's `add` command for each
updatable skill. The implementation does not provide a local ownership concept
that would make a modified lock-managed skill locally authoritative.

Primary sources inspected on 2026-09-22:

- [`src/local-lock.ts`](https://github.com/vercel-labs/skills/blob/main/src/local-lock.ts)
- [`src/update.ts`](https://github.com/vercel-labs/skills/blob/main/src/update.ts)

Repository policy must not depend on the installer detecting the semantic
meaning of local edits. Keeping an adopted skill in `skills-lock.json` is an
avoidable overwrite risk.

## Ownership model

Do not use `native`, `upstream`, `adopted` and `derived` as four values of one
field. They combine two different concerns.

Use these conceptual axes:

### Management

- `upstream` — the installed copy may be replaced by the upstream installer.
- `local` — the repository copy is authoritative and must not be replaced by
  the upstream installer.

### Provenance

- `native` — created for this repository.
- `adopted` — based primarily on one external skill but maintained locally.
- `derived` — synthesized from multiple upstream sources, research,
  experiments or local rules.

The useful combinations are:

| Example | Management | Provenance |
|---|---|---|
| Hand-written local skill | local | native |
| Frozen local fork | local | adopted |
| Multi-source local synthesis | local | derived |
| Framework/product skill replaced by installer | upstream | not required |

Native local skills need no explicit metadata unless ambiguity exists. Their
absence from `skills-lock.json` is sufficient.

## Storage model

### `skills-lock.json`

Keep it exclusively as the technical installation state for skills that are
intentionally upstream-managed.

Do not add semantic ownership, adoption notes, review history or local policy
fields to the generated lockfile.

### Locally adopted or derived skills

Follow the existing Ponytail precedent and keep compact provenance in the
skill's `SKILL.md` frontmatter. Retain a license file beside the skill when the
upstream license or copied material requires it.

Preferred shape:

```yaml
metadata:
  management: local
  provenance: adopted
  origins:
    - repository: https://github.com/example/project
      path: skills/example/SKILL.md
      commit: 0123456789abcdef
      license: MIT
  adopted_at: 2026-09-22
  adaptation: >
    Short explanation of which behaviour is intentionally different.
  last_upstream_review:
    date: 2026-09-22
    commit: fedcba9876543210
    outcome: no-action
```

For a derived skill, use multiple `origins` entries. Do not duplicate the full
license text in frontmatter; keep the required notice in a sibling `LICENSE`
or `LICENSE.<origin>` file.

Do not introduce `ORIGIN.md` and a central registry at the same time. The
repository currently has too few adopted/derived skills to justify another
index and another synchronization obligation.

## Phase 1 — immediate safety and proven adoptions

### Goal

Remove the immediate risk of overwriting the two skills that have already
become locally authoritative, and make the safe update contract visible.

### Expected files

- `README.md`
- `skills-lock.json`
- `.agents/skills/grill-with-docs/SKILL.md`
- `.agents/skills/research/SKILL.md`
- license/notice files for either skill if required after upstream license
  verification
- focused tests for the new invariant, preferably in an existing appropriate
  test file
- optionally `install-global-skills.sh`, but only for narrowly scoped safety
  corrections described below

### Required work

1. Verify the exact upstream repositories, source paths, source commits and
   licenses for `grill-with-docs` and `research` before changing their
   ownership records.
2. Classify both as `management: local`, `provenance: adopted` unless the
   source investigation proves either is multi-source and should be `derived`.
3. Add compact provenance metadata and concise adaptation notes to each skill.
4. Retain the required upstream license/notice material.
5. Remove both entries from `skills-lock.json` so an upstream update cannot
   treat them as replaceable dependencies.
6. Replace the README's blanket update guidance with a reviewed, named update
   workflow:
   - update only skills that remain in `skills-lock.json`;
   - prefer a named skill update rather than a bulk update;
   - start from a clean working tree;
   - inspect the resulting diff;
   - run proportional tests;
   - commit updates separately;
   - never update adopted/derived skills through `npx skills`.
7. Add a small structural test that fails when a skill declaring
   `metadata.management: local` is also present in `skills-lock.json`.
8. If `install-global-skills.sh` is touched, make its purpose explicit as a
   bootstrap/install helper for selected upstream-managed skills. It must not
   claim to be the complete skill inventory. Remove the false-success pattern
   where practical: a failed install must not be followed by an unconditional
   `OK` for that source.

### Acceptance conditions

- `grill-with-docs` is absent from `skills-lock.json`.
- `research` is absent from `skills-lock.json`.
- Both skills contain verifiable upstream provenance and appropriate license
  retention.
- Their locally added behaviour remains unchanged except for provenance and
  ownership documentation.
- The README no longer recommends an unreviewed bulk update.
- The ownership/lockfile invariant is covered by a deterministic test.
- Existing tests, type checking and `git diff --check` pass.
- No unrelated skill is reclassified, merged, rewritten or updated.

### Risks

- Upstream licensing may not permit the initially assumed form of local
  adaptation. Stop and report the finding rather than guessing.
- Removing a lock entry without recording provenance would make future source
  review harder; the two changes must happen together.
- Rewriting either skill while adding metadata would unnecessarily mix
  behavioural changes with ownership migration.
- Editing all updater scripts in the first change would expand the scope beyond
  the demonstrated risk.

## Phase 2 — classify the remaining locked skills

### Goal

Review the remaining lock-managed inventory one skill at a time and decide
whether each remains a dependency or becomes locally authoritative.

This phase is read-only assessment first. Migration requires a subsequent
explicit implementation decision.

### Preliminary recommendations

These are hypotheses to verify, not automatic migration instructions.

#### Likely keep upstream

- `better-auth-best-practices`
- `next-best-practices`
- `react-doctor`
- `shadcn`
- `supabase-postgres-best-practices`
- `ui-ux-pro-max`
- `vercel-composition-patterns`
- `vercel-react-best-practices`
- `vercel-react-view-transitions`
- `web-design-guidelines`
- `webapp-testing`

Reason: their value depends materially on evolving frameworks, products, APIs,
browser capabilities, CLIs or maintained datasets.

#### Likely adopt after provenance and license review

- `diagnosing-bugs`
- `frontend-design`
- `grilling`
- `prototype`
- `tdd`
- `verification-before-completion`

Reason: they primarily encode workflow and behavioural policy whose stability
is valuable locally and whose automatic upstream change can alter agent
behaviour across many projects.

#### Review, repair, adopt or remove

- `code-review`
- `improve-codebase-architecture`
- `to-spec`
- `to-tickets`
- `tailwind-design-system`

Reason: the first four retain assumptions about missing companion skills,
context conventions or issue-tracker setup. `improve-codebase-architecture`
currently references missing `codebase-design` and `domain-modeling` skills.
`tailwind-design-system` mixes stable design-system workflow with
version-sensitive Tailwind knowledge.

### Decision criteria

For every skill, record:

- Does its value depend on current framework/product/API behaviour?
- Is it mostly stable process guidance?
- Has the local copy already diverged?
- Does it assume companion skills or files not present here?
- What is the behavioural blast radius of an upstream replacement?
- Is the upstream license compatible with the intended local use?
- Does the skill overlap another local skill in trigger, responsibility,
  workflow phase and output?
- Would adoption reduce maintenance, or merely transfer the burden of tracking
  fast-changing technical facts?

## Phase 3 — manual upstream review pilot

### Goal

Run one end-to-end upstream review manually before encoding the workflow as a
skill.

### Procedure

1. Select one adopted skill with a known source and last reviewed commit.
2. Resolve current upstream state without modifying local Git refs.
3. Inspect upstream changes since the last reviewed commit.
4. Classify semantic changes rather than reporting only text diffs.
5. Compare useful upstream changes with the current local skill.
6. Produce decisions using:
   - `UPDATE AS-IS`
   - `ADOPT IDEA`
   - `IGNORE`
   - `REVIEW CONFLICT`
   - `NO ACTION`
7. Advance `last_upstream_review.commit` when the range has been reviewed,
   including when every change is intentionally rejected. Record a short
   outcome so the next review does not repeat the same work.
8. Do not modify the local skill during the review. Any accepted change is a
   separate implementation task.

### Acceptance condition

The manual pilot produces a useful decision without needing a central registry
or automatic updater. Repeated mechanical steps are identified from evidence,
not imagined in advance.

## Phase 4 — optional `skills-audit` skill

Implement this phase only if the manual pilot proves that the review is useful
and recurrent.

### Location and activation

- Initial location: `extra/skills/skills-audit/`.
- Explicit-only.
- Read-only by default and by contract.
- Absent from profiles, `src/skill-router.ts` and normal setup flow.

### Invocation contract

Example:

> Check whether there are useful upstream updates for my skills.

Optional filters:

- one skill;
- adopted/derived skills only;
- upstream-managed skills only;
- one source repository;
- changes since a stated date or commit.

### Required behaviour

1. Read `skills-lock.json` for upstream-managed dependencies.
2. Discover local adopted/derived origins from skill metadata.
3. Flag contradictions such as `management: local` plus lockfile membership.
4. Resolve every origin independently for derived skills.
5. Compare the last reviewed commit with current upstream state.
6. Inspect behavioural meaning, not just textual differences.
7. Check whether the local skill already covers the useful upstream idea.
8. Report decisions; never update, edit, stage, commit or push.

### Example output

```text
Skill: research
Management: local
Provenance: adopted
Compared: <last-reviewed>..<upstream-head>

Decision: ADOPT IDEA
Useful upstream change: <summary>
Already covered locally: <yes/no and evidence>
Conflict with local behaviour: <summary or none>
Recommended follow-up: <separate proposed change>
Advance review pointer: yes
```

### Failure handling

- Unavailable repository: report `UNAVAILABLE`; do not erase the last known
  origin.
- Deleted repository: preserve provenance and recommend an archival review.
- Rewritten history: report the mismatch; compare known content and request
  human confirmation before changing the review pointer.
- Rate limit/network failure: report incomplete coverage and do not imply the
  source is current.
- License change: classify as `REVIEW CONFLICT`; do not import changes.
- Large diff: split by upstream commits or semantic areas and state what was
  not reviewed.
- Multiple origins: produce one result per origin, followed by a synthesis for
  the derived skill.

## Composition policy

Do not merge skills because their names or broad topics overlap.

Consider composition only when the candidates share most of the following:

- same trigger;
- same responsibility;
- same workflow phase;
- same expected output;
- substantial behavioural overlap;
- keeping them separate repeatedly produces conflicting or duplicated work.

Keep skills separate when they provide distinct review axes or different
activation costs.

Current guidance:

- Keep `ponytail-review` separate from `code-review`: complexity/YAGNI is a
  distinct optional pass from Standards/Spec review.
- Keep `simplify`, `karpathy-guidelines` and `ponytail-review` separate until
  real usage shows repeated duplication. The Ponytail pilot found both overlap
  and a unique actionable `reuse` finding.
- Treat `humanizer` as a likely derived skill, but first reconstruct and record
  its sources and licensing. Do not infer provenance from its prose alone.
- Do not merge frontend/design skills merely because they all operate on UI;
  their current profiles and documentation distinguish aesthetic direction,
  design systems, implementation, motion and review.

## Research-document policy

Keep the current model.

- `docs/research/` stores evidence, comparisons and rationale.
- Research does not become canonical project truth merely by being committed.
- Decisions belong in plans, ADRs, configuration, code or the relevant
  authoritative document.
- `context-audit` should continue to treat divergence between research and
  current implementation as expected unless an operational document still
  claims the research is authoritative.

For new assessment documents, prefer this small header:

```text
Date: YYYY-MM-DD
Mode: research | assessment
Scope: ...
Verdict: adopt | trial | selectively import | reject   # assessment only
Revisit trigger: ...                                   # when relevant
```

Do not add an index or migrate old research files until navigation or stale
status becomes an observed problem.

## `extra/skills` policy

Keep one directory. Its meaning is distributional, not a maturity state:

> Skills under `extra/skills` are manual/optional and are not distributed by
> normal profiles or `setup.sh`.

A skill there may be experimental, stable, adopted or derived. Record maturity
or provenance in the skill when needed; do not create separate directory trees
for every combination.

`ponytail-review` is the current precedent for a stable, adopted,
explicit-only extra.

## Licensing and attribution policy

Before moving any third-party skill out of `skills-lock.json`:

1. identify the upstream repository and exact source path;
2. record the exact source commit used for adoption;
3. verify the applicable license at that commit;
4. retain the required copyright and license notice;
5. describe material local adaptations;
6. do not claim compatibility or permission when the upstream license is
   missing or unclear.

`ponytail-review` is the repository-level example to follow. `humanizer` is a
known provenance gap to investigate separately.

This is a repository hygiene policy, not legal advice.

## Things not to build

- A database or remote registry.
- A bot that periodically polls upstream repositories.
- Automatic upstream merges.
- Semantic versioning for every local skill.
- A separate workflow engine for skill maintenance.
- Background update notifications.
- A giant ontology of skill kinds.
- Separate directory trees for experimental, optional, adopted and
  explicit-only combinations.
- Mandatory metadata for all 57 skills.
- A research-document CMS or index before the document count warrants one.
- Automatic composition of apparently similar skills.

## Review checklist for the implementation

The reviewer should verify all of the following rather than relying on the
developer's completion statement.

### Scope

- The change implements Phase 1 only unless explicitly authorized otherwise.
- No unrelated skill content was changed.
- No packages were installed and no skill was refreshed from upstream as a
  side effect.

### Ownership correctness

- `grill-with-docs` and `research` are no longer in `skills-lock.json`.
- Their management/provenance metadata is valid and consistent.
- Exact source commits and licenses are supported by primary evidence.
- Required license files/notices are retained.

### Behaviour preservation

- The existing local behaviour of both skills is unchanged.
- Profiles and routing still include both skills exactly as before.
- Explicit/implicit activation policy is unchanged.

### Update safety

- README guidance does not authorize bulk updates of adopted skills.
- The new invariant test detects any future local-managed/lockfile conflict.
- If `install-global-skills.sh` changed, failures are no longer falsely
  reported as success and its incomplete scope is clear.

### Verification

- Inspect `git diff --check`.
- Run the repository's typecheck.
- Run the complete test suite.
- Inspect `git status --short --branch` for unintended files.

## Ordered next actions

1. Implement Phase 1 for `grill-with-docs` and `research`.
2. Review that change against the checklist above.
3. Perform the Phase 2 read-only classification of the remaining locked
   skills, including license and missing-dependency checks.
4. Run one Phase 3 manual upstream-review pilot.
5. Decide from the pilot whether an explicit `skills-audit` extra is worth
   implementing.
