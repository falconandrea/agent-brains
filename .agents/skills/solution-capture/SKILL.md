---
name: solution-capture
description: Propose and, only after approval, record a verified reusable solution in project memory. Invoke explicitly after solving a difficult problem; skip obvious fixes and unverified diagnoses.
metadata:
  management: local
  opencode/autoinvoke: false
---

# Solution Capture

Turn a verified, reusable diagnosis into one detailed solution document and one
index line. Invocation starts an assessment, not a write authorization.

## Qualify the solution

First identify the verification that proved the problem was solved. Positive
verification is a hard precondition. Then confirm that at least three of these
five conditions hold:

- the cause is not evident from the final diff;
- the problem plausibly recurs;
- the solution has been verified by an appropriate check;
- the knowledge is not already documented;
- the work involved hidden coupling, failed attempts, or expensive diagnostics.

Search `.ai/memory/lessons.md` and `.ai/memory/solutions/` with targeted symptom,
subsystem, and error-text terms before counting the fourth condition. If the
precondition or threshold fails, report why the candidate does not qualify and
stop with the working tree unchanged. Obvious fixes and generic framework
knowledge take this fast path.

## Prepare the proposal

Before writing, present a proposal containing:

1. the title, lowercase category, lowercase hyphenated slug, and proposed
   one-line `lessons.md` entry;
2. the verification command or observation and its relevant result;
3. the five-condition checklist plus the separate positive-verification result;
4. the file, test, issue, PR, or ADR references supporting the root cause and
   applied solution; and
5. every remaining hypothesis, which must be removed from factual sections or
   retained only as a clearly marked explanation under `Failed attempts`.

Correct unsupported claims before presenting the proposal. Ask the user to
approve or reject this exact capture. End the turn at this gate. Invocation of
the skill, approval of the original fix, or silence does not approve the capture.

## Write after approval

Approval authorizes only these two changes:

1. Create `.ai/memory/solutions/<category>/<problem-slug>.md` from
   `.ai/memory/solutions/_TEMPLATE.md` when the template exists, preserving this
   canonical shape:

   ```markdown
   ---
   title: Short problem title
   category: lowercase-category
   tags: [symptom-term, subsystem-term]
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   ---

   # Short problem title

   ## Symptoms (observed)

   ## Root cause (verified)

   ## Failed attempts

   ## Applied solution

   ## Verification

   ## Prevention

   ## References
   ```

   Record only observed symptoms, a root cause supported by evidence, attempts
   actually made, the smallest applied solution, its positive verification, and
   concrete prevention. Label any explanation retained under `Failed attempts`
   as `Hypothesis (not verified)`.

2. Add exactly one index entry to `.ai/memory/lessons.md`:

   ```text
   - [YYYY-MM-DD] [Category] One-line retrieval cue. Refs: [problem-slug.md](solutions/category/problem-slug.md)
   ```

   Keep the detail in the solution document. If the same solution already has
   an index entry, update that line instead of adding another.

Use ISO-8601 calendar dates. `category` must match the directory. Keep `created`
unchanged on later edits and use `updated` only as a maintenance signal, not a
validity claim. A solution older than 180 days becomes a review candidate when
retrieved; age alone does not invalidate or delete it. The threshold is a
maintenance policy, not a claim that the pilot validated that exact interval.

## Verify the capture

Before reporting completion, confirm all of the following:

- every local reference resolves;
- the category, slug, dates, tags, and relative index link are consistent;
- the index has one line and one `Refs:` link for this solution;
- factual sections contain no unsupported claim;
- the verification result is recorded without overstating what it proves; and
- the diff contains only the approved solution and index changes.

Report the created path, index change, qualifying conditions, and verification.
Commit, push, PR creation, and unrelated cleanup require separate authorization.
