---
name: to-spec
description: "Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed."
disable-model-invocation: true
license: MIT
metadata:
  management: local
  provenance: adopted
  origins:
    - repository: https://github.com/mattpocock/skills
      path: skills/engineering/to-spec/SKILL.md
      commit: 5c89081d4bbeb3d039a42093653f90bb698d780e
      license: MIT — full text in LICENSE in this folder
  adopted_at: 2026-10-30
  adaptation: >
    The tracker convention reads from `.ai/agents/issue-tracker.md` (the
    upstream default was replaced when the `.ai/` remap was applied). M1
    (2026-10-30) adds the existing-spec guard: when `spec.md` already exists,
    never overwrite it silently, and update an approved planning document in
    its own contract instead of converting it to the template below.
    Declared management: local so upstream updates can no longer silently
    overwrite this guard.
---

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

The issue tracker is described in `.ai/agents/issue-tracker.md`: issues and specs live as markdown files under `.ai/features/<feature-slug>/`. If that file is missing, ask the user where issues live and record it there.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Write the spec using the template below, then publish it as `.ai/features/<feature-slug>/spec.md` (per `.ai/agents/issue-tracker.md`).

<existing-spec-guard>

If `spec.md` already exists in the target directory, do NOT overwrite it silently:

- Ask the user: update the existing spec in place, or publish this one separately (e.g. alongside it under a distinct name).
- When updating in place, preserve the document's own structure and every approved acceptance criterion, decision and residual assumption it already records — refine and extend, never rewrite them away. If the existing spec follows the planning contract (`spec-and-tasks`: Goal/Behavior/Boundaries/Constraints/Edge cases/Decisions/Observable acceptance criteria/Residual assumptions), keep that contract; do not convert it to the template below.
- The template below is for creating a NEW spec, not for rewriting an existing one.
- An approved spec is not regenerated from a later conversation unless the user explicitly asks for that replacement.

</existing-spec-guard>

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
