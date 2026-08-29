# Atomic and Pi ecosystem research

**Date:** 2026-08-29  
**Status:** reference research; no dependency or adoption decision

## Executive summary

[Atomic](https://github.com/bastani-inc/atomic) is a Pi-derived coding-agent
runtime built around explicit TypeScript workflow graphs. Its most relevant
lesson is not a particular API: reliable multi-agent work is an information
flow system with contracts, typed handoffs, artifacts, checks, gates and
durable run state. We should compare those patterns with pi-brain, but keep
Pi + Herdr as our chosen runtime and preserve pi-brain's stricter safety
invariants.

## Atomic observations

### Workflow and stage contracts

Atomic defines workflows as reusable multi-stage execution with tracked stages,
parallel branches, human input, artifacts, verification and resumable runs.
Its documentation describes the run contract as the objective plus acceptance
criteria, with the rule that only the user may change it and every amended
contract must reach downstream stages.

Sources: [Atomic overview](https://docs.bastani.ai/),
[Workflows](https://docs.bastani.ai/workflows#workflows),
[The Run Contract](https://docs.bastani.ai/workflows#the-run-contract).

**Implication for pi-brain:** keep the existing human-approved PRD/tasks as
the immutable contract for a run. Add explicit amendments only through a
human-controlled path, and make every downstream prompt carry the current
contract or its canonical artifact path.

### Context modes and handoffs

Atomic distinguishes `fresh` child context from `fork` context. Fresh context
is recommended for research and adversarial review so earlier implementation
conversation does not bias the specialist; forked context is reserved for a
writer that genuinely needs the parent's conversation. Its guidance favors
stage-local prompts, precise schemas, and files/artifacts when context becomes
large.

Sources: [Atomic subagents](https://docs.bastani.ai/subagents#context-and-execution-modes),
[Context engineering](https://docs.bastani.ai/workflows#context-engineering),
[Filesystem context](https://docs.bastani.ai/workflows#filesystem-context).

**Implication for pi-brain:** this validates the current context router and
fresh reviewer design. Future workflows should define, for each stage, the
question it answers, the exact inputs it receives, the output schema, and the
artifacts it leaves behind. Do not pass a full parent transcript by default.

### Structured outputs and artifacts

Atomic recommends precise TypeBox output schemas so runtime validation and
TypeScript types agree. Large research and review material is stored in named
files, with concise summaries and paths passed to later stages.

Sources: [Workflow outputs](https://docs.bastani.ai/workflows#prefer-precise-schemas),
[Filesystem context](https://docs.bastani.ai/workflows#filesystem-context).

**Implication for pi-brain:** retain the structured reviewer result tool and
extend the same pattern to future researcher/planner/worker handoffs. A child
should return a bounded result plus artifact paths, not an unbounded narrative
that the parent must reinterpret.

### Isolation and inter-agent communication

Atomic supports worktree-isolated parallel edits and groups for scoped
inter-agent communication. Its intercom handoff can preserve structured
questions and answers while keeping the child/session boundary explicit.

Sources: [Atomic subagents](https://docs.bastani.ai/subagents#context-and-execution-modes),
[Atomic intercom](https://docs.bastani.ai/intercom),
[Atomic workflow handoffs](https://docs.bastani.ai/workflows#intercom-run-notifications).

**Implication for pi-brain:** the current one-writer lock is the correct safe
default. If parallel writing is added, it needs explicit worktree ownership,
branch identity, merge responsibility and recovery rules. Human questions
should have stable IDs and return through the workflow bridge, not be answered
implicitly in a child's prose.

### Verification, gates and durability

Atomic treats executable checks, review stages, human approval gates,
checkpointing and resume as first-class workflow behavior. It also exposes
tracked stage/run status and live control rather than treating the model's
final message as proof of completion.

Source: [Atomic workflows](https://docs.bastani.ai/workflows#workflows).

**Implication for pi-brain:** this aligns with the existing deterministic
verify-before-review loop and owned JSONL run log. New workflows should define
their evidence and stop conditions before adding autonomy.

### Security caveat

Atomic's README explicitly warns that its runtime has no built-in sandbox or
command-level shell permission gate and recommends a devcontainer, VM or
remote development machine for autonomous work.

Source: [Atomic README security warning](https://github.com/bastani-inc/atomic#how-atomic-works).

**Implication for pi-brain:** do not infer safety from workflow structure alone.
Tool visibility, runtime permission policy, Git isolation and human gates must
remain independently enforced. This reinforces the existing developer tool
allowlist and reviewer read-only invariant.

## Pi plugin watchlist

These are candidates to evaluate against a concrete need, not a recommendation
to install all of them globally.

| Package | Useful capability | Evaluation focus |
|---|---|---|
| [`pi-web-access`](https://pi.dev/packages/pi-web-access) | Search, URL/content extraction and optional curator/browser-assisted access. | Expose only to research-capable roles; preserve source URLs, bound network use, and keep credentials/config out of child prompts. |
| [`@earendil-works/pi-tui`](https://pi.dev/docs/latest/tui) | Official Pi TUI component library. `pi-tui` is primarily a library/API, not a workflow engine. | Build a compact context/usage bar, phase widget, activity panel or structured gate UI in the orchestrator tab. Test width, refresh, focus and cancellation behavior. |
| [`pi-subagents`](https://pi.dev/packages/pi-subagents) | Child Pi sessions, foreground/background delegation, bundled roles, parallel work and saved workflows. | Compare fresh/fork context, tool allowlists, result delivery, lifecycle, worktrees and recursion controls with pi-brain's `AgentRunner`; avoid a second `/feature` orchestrator. |
| [`pi-mcp-adapter`](https://pi.dev/packages/pi-mcp-adapter) | MCP server config, package-provided servers and runtime registration. | Define role-scoped MCP visibility, child-session propagation, approval behavior, output limits and credential boundaries before adoption. |
| [`pi-herdr-agents`](https://pi.dev/packages/pi-herdr-agents) | Visible asynchronous Pi child panes, supervision and managed worktrees in Herdr. | Evaluate as a possible execution/UI layer underneath pi-brain, not as the owner of pi-brain's deterministic state machine. |

## Proposed evaluation method

Before adding a plugin or workflow abstraction:

1. Write the concrete problem and the desired evidence.
2. Read the primary source and inspect the package implementation.
3. Run a small spike with a read-only scout/reviewer task.
4. Test malformed output, cancellation, blocked human input, stale context,
   provider failure and resume behavior.
5. Compare token/context cost and reliability with the existing implementation.
6. Adopt only the smallest useful primitive; record rejected alternatives.

The first useful artifact should be a reliability matrix mapping each failure
mode to deterministic prevention, detection or human escalation. Atomic's
patterns are a strong reference for that matrix, not a reason to replace the
current pi-brain architecture.
