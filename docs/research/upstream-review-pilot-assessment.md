# Phase 3 pilot — manual upstream review of the adopted skills

Date: 2026-09-22
Mode: assessment (Phase 3 manual pilot; the reviewed skills were read-only during the review)
Scope: upstream review of the two locally adopted skills, `grill-with-docs` and `research`, against `mattpocock/skills`
Verdict: no-action — for both skills; `skills-audit` not justified yet, decision deferred with a revisit trigger
Revisit trigger: the third manual upstream review, or the first review after adopting further Phase 2 candidates

## Why these two skills

Phase 3 requires an adopted skill (`metadata.management: local`) with a known
source and a last reviewed commit. An earlier suggestion to pilot on `grilling`
was invalid: `grilling` is still upstream-managed and piloting on it would have
required adopting it first — a migration outside the read-only Phase 2 scope.
The reviews recorded here were performed during Phase 1 provenance
verification (commit `11021f1`) and satisfy the pilot contract as-is.

## Procedure as executed

1. Selected subjects: `grill-with-docs` (origin commit
   `658d53e6ded8cc0eaa26a96e0580bee9381ca0e3`) and `research` (origin
   `0d74d01cbc64ca27778a49b38599f70c534e76a0`).
2. Resolved current upstream state without modifying local git refs: GitHub
   REST/raw fetches only — no clones, no ref updates.
3. Inspected upstream changes since each origin commit:
   - `grill-with-docs`, `658d53e..447ca70` (3 commits: `d28dfdc`, `fcf0071`,
     `447ca70`) — rewording of how the upstream stub invokes sibling skills
     ("call the Skill tool with ...").
   - `research`, `0d74d01..3216582` (1 commit) — repo-wide em-dash removal.
4. Classified semantic change rather than text delta: both ranges are
   presentation-only; neither alters behaviour the local skills implement or
   depend on.
5. Compared against the local skills: local `grill-with-docs` is a full
   rewrite that does not use the upstream invocation phrasing at all; local
   `research` retains the adopted text verbatim with its own punctuation.
6. Decision per skill: `NO ACTION`.
7. Advanced the review pointer: `last_upstream_review.commit` set to
   `447ca70` / `3216582` with `outcome: no-action` in each `SKILL.md`
   frontmatter.
8. No local skill behaviour was modified during the review; the frontmatter
   write was part of the Phase 1 adoption commit, not a review-time edit.

License check at the reviewed commits: MIT, identical text at origin and
reviewed commits; the full text is already retained per skill in each
`LICENSE` file.

## Mechanical steps that emerged

1. Read `metadata.origins` and `metadata.last_upstream_review` from the
   skill's `SKILL.md` frontmatter.
2. `GET /repos/{repo}/commits?path={origin path}` and walk from the recorded
   reviewed commit to list candidate commits.
3. Fetch the raw file per commit and classify the semantic delta.
4. Compare with the local skill's behaviour; decide `UPDATE AS-IS` /
   `ADOPT IDEA` / `IGNORE` / `REVIEW CONFLICT` / `NO ACTION`.
5. Verify the upstream license at the reviewed commits whenever new material
   could be imported.
6. Record date, reviewed-through commit and outcome in
   `metadata.last_upstream_review` as its own commit.
7. Never edit skill behaviour during the review; accepted changes are
   separate implementation tasks.

## Conclusion on `skills-audit` (Phase 4 gate)

The loop above is short — roughly ten minutes per skill using curl and the
folder-hash script — but it has run twice, on two skills, once. That proves
usefulness, not recurrence. Building an explicit-only
`extra/skills/skills-audit` now would amortize poorly against two adopted
skills. Decision: do not build; revisit at the third manual review or after
the next adoption wave.

## Follow-ups deliberately kept out of this pilot

The Vercel lock-hash mismatches, the missing `frontend-design` upstream
license and the `shadcn/ui` → `shadcn-ui/ui` rename remain tracked as
follow-ups in `locked-skills-ownership-assessment.md`; they concern
upstream-managed skills and are not adoption reviews.
