---
name: long-horizon-brief
description: Triage gate that decides whether a task warrants a full pseudo-formal brief before launching autonomous long-running work. Activate when the user describes a multi-hour or multi-day task, says "work on this while I'm away", asks for a brief before a big effort, launches a subagent on an open-ended problem, or wants to stress-test a plan before committing compute.
---

# Long-Horizon Brief Triage

A bad specification on a short task fails cheaply. A bad specification on an autonomous long run burns hours of compute producing an answer-shaped artifact that does not solve the problem. This skill is the gate that decides which regime you are in, and only loads the heavy brief machinery when it is justified.

## Triage Workflow

Ask the user these three questions together, in one shot. Do not write any brief until they are answered.

1. **Autonomy** — Is this interactive (in the loop today), semi-autonomous (half a day, you check in), or fully autonomous (multi-day, "work while I'm away")?
2. **Cost of a near-miss** — If the agent returns something that *looks* done but isn't, what do you lose? (10 min to retry / hours of debugging / expensive compute or production impact)
3. **Success predicate** — Can you state, in one sentence, what must be true of the returned artifact for it to count as done? Or is the goal still vague?

## Decision Matrix

| Answers | Action |
|---|---|
| Interactive OR cost-of-near-miss is low | **Stop.** This skill is overhead. Use `karpathy-guidelines` + `verification-before-completion` instead. |
| Goal still vague, no predicate in one line | **Stop.** Run scoping first: `grill-with-docs` or `to-spec`. Come back when the predicate is writable. |
| Semi-autonomous + medium cost + predicate clear | **Brief stretto.** Load `references/task-brief-template.md`, fill only: TASK, DOES NOT COUNT, VERIFICATION. Skip the rest. |
| Fully autonomous OR cost-of-near-miss is high | **Brief completo.** Load `references/task-brief-template.md`, fill every applicable block. |

## Rules

- Ask the three questions together, not sequentially. The user needs to see the trade-off before answering.
- If the answer is "stop", do NOT load the template. Suggest the alternative skill by name and exit.
- If the answer is "brief stretto" or "completo", load `references/task-brief-template.md` and walk the user through filling it block by block.
- The brief is never optional once triage says yes: a long autonomous run without a written predicate is the exact failure mode this skill exists to prevent.

## After the Brief Is Written

Run the red-team pass before launching: re-read the brief with the single question "how could an agent satisfy the letter of this brief without solving the problem?" Patch every credible answer. Repeat until the answers stop being credible. Only then launch.

At the end of the run, pair with `verification-before-completion`: the return condition is a predicate over the artifact, and claiming completion requires fresh evidence that the predicate holds.

## What This Skill Does NOT Cover

- Agent topology and coordination protocols (single-agent assumed; opencode has no swarm)
- Runtime-enforced budgets, locked evaluators, sandbox boundaries — those belong in the harness, not the prompt
- Compaction, handoff, and cross-session memory — use `handoff`
- Hard bugs in general — use `diagnosing-bugs`; this skill only applies if the bug hunt is long and autonomous enough to clear the triage
