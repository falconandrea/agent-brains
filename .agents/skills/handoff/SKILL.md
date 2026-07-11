---
name: handoff
description: Compact the current conversation into a handoff document so a fresh agent can pick up the work in a new session. Invoke explicitly as /handoff when you are about to close or pause a long session. Never auto-invoke. Do NOT use for short sessions where the work is already done and committed.
argument-hint: "[optional focus of the next session, e.g. 'implement the auth layer']"
disable-model-invocation: true
---

# Handoff

Compact the current conversation into a handoff document so a fresh agent (or future-you) can continue the work without replaying the whole session.

**Announce at start:** "I'm using the handoff skill to compact this session."

## When To Use

Invoke `/handoff` explicitly when:
- You are about to close a long session mid-task
- You are switching machines / contexts and will resume elsewhere
- You want a fresh agent to continue from a clean state
- You are handing off to a teammate's agent

Do NOT invoke for short sessions where the work is already done and committed — the commit history is the handoff.

## Where To Save

**Default: OS temp dir, outside the workspace** — handoffs are working artifacts, not committed history:

```
$TMPDIR/opencode/handoffs/YYYY-MM-DD-HHMM-<topic>.md
```

**`--keep` flag:** if the user passes `--keep` (or explicitly asks to keep it in the repo), save to `docs/handoffs/YYYY-MM-DD-HHMM-<topic>.md` inside the workspace instead. Let the user decide whether to commit it.

Print the absolute path of the saved file at the end so the user (or next agent) knows where to find it.

## What To Include

- **Goal of the session** — one sentence, what were we trying to accomplish
- **Where we are now** — concrete state: which tasks done, which in progress, which blocked. Reference the plan/spec by path if one exists.
- **What's next** — the immediate next action(s), in order. If the user passed an argument (focus of the next session), use it to frame this section.
- **Key decisions made** — only the non-obvious ones not already captured in an ADR, spec, or commit message. One line each, with rationale.
- **Open questions / unknowns** — things we noticed but didn't resolve, that the next agent should be aware of.
- **Gotchas / traps** — anything that wasted time or that the next agent will likely trip on (a flaky test, an undocumented env var, a hidden coupling).
- **Suggested skills** — see section below.
- **Pointers** — paths/URLs to artifacts the next agent should read first: spec, plan, PRD, relevant ADRs, relevant GLOSSARY entries, the current branch, uncommitted diff summary.

## What NOT To Include

Do not duplicate content already captured elsewhere. Reference it by absolute path or URL instead:

- ❌ Don't paste the full spec — link `docs/specs/YYYY-MM-DD-<topic>-design.md`
- ❌ Don't paste the full plan — link `docs/plans/YYYY-MM-DD-<feature>.md` and say which task is next
- ❌ Don't paste the PRD — link the tracker issue
- ❌ Don't paste the diff — say `git diff --stat` output and let the next agent run it
- ❌ Don't paste ADRs — link `.ai/context/adr/NNNN-<topic>.md`
- ❌ Don't paste GLOSSARY entries — link `.ai/context/GLOSSARY.md#<term>`

The handoff is the **delta** between what's already documented and what's only in this session's head.

## Suggested Skills Section

End the document with a `## Suggested skills` section listing which skills the next agent should invoke, based on where the work is:

- Mid-design, spec not yet approved → `brainstorming`
- Spec approved, no implementation plan yet → `writing-plans`
- Plan exists, mid-implementation → `tdd`
- Debugging a regression → `diagnosing-bugs`
- Spec needs validation against domain language → `grill-with-docs`
- Plan needs to be split into tracker issues → `to-tickets`
- Wrapping up, need a formal product doc → `to-spec`
- About to claim work is done → `verification-before-completion`

Pick only the relevant ones — don't list all of them. One line each explaining *why* that skill is relevant to the next step.

## Redaction

Before saving, scan the document for and remove/mask:

- API keys, tokens, passwords, connection strings
- Personal data (emails, phone numbers, real names if not already in the repo)
- Anything from `.env`, `secrets.*`, or vault files you may have read

If redaction removes information the next agent actually needs, replace with a pointer ("the API key is in `.env` as `FOO_API_KEY` — read it from there").

## Template

```markdown
# Handoff — <topic>

**Date:** YYYY-MM-DD HH:MM
**Branch:** <current git branch>
**Session goal:** <one sentence>

## Where we are

<concrete state — done / in progress / blocked, with task references>

## Next actions

1. <first concrete action>
2. <second concrete action>

## Key decisions (not already in ADRs)

- <decision> — <rationale>

## Open questions / traps

- <thing to watch out for>

## Pointers

- Spec: docs/specs/...
- Plan: docs/plans/... (next task: Task N)
- ADRs: .ai/context/adr/...
- Glossary: .ai/context/GLOSSARY.md
- Uncommitted changes: <git diff --stat summary>

## Suggested skills

- `tdd` — <why>
- `verification-before-completion` — <why>
```

Adapt sections to the actual session — drop empty ones, add others if needed. Keep it short: this is a bridge, not a report.
