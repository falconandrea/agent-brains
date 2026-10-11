# Spotify `shunt` / Portal assessment

Date: 2026-10-11

Mode: assessment

Question: whether the delegation pattern described by Spotify should be adopted
in `agent-brains`, and which part (if any) adds value to the existing Pi
workflow.

## Executive conclusion

Spotify's useful idea is narrower than "make the agent cheaper": move a
bounded, exploratory read to a cheaper read-only worker and return a compact
answer, while keeping exact reads, edits, debugging and architectural decisions
with the main agent. That is relevant to `pi-brain`, but the published 90% is a
benchmark for four reading/generation scenarios, not evidence of a 90% reduction
in the cost or latency of a complete coding workflow.

The previous analysis is directionally right to defer Portal and the code
writer. Before a worker experiment, however, fix the context duplication found
in the current runner and add accounting that includes every worker call. The
first useful experiment should be an explicit, read-only bulk-reader capability
implemented behind the existing `AgentRunner` boundary. An automatic hook can
follow only if real runs show a net benefit.

## Upstream facts (verified)

Spotify's article describes two AiKA modes: `bulk-reader` for multi-file,
read-heavy questions and `code-writer` for predictable boilerplate. The
`shunt` plugin enforces the first with `PreToolUse` hooks: full-file reads above
350 lines are blocked, while targeted reads with an offset or limit pass through.
It also catches a small set of shell readers (`cat`, `head`, `tail`, `less`, and
`more`). The threshold is configurable. Sources: [Spotify Engineering
article](https://engineering.atspotify.com/2026/9/portal-by-spotify-cut-my-claude-code-token-usage-by-90)
and [`check-file-size`](https://raw.githubusercontent.com/spotify/portal-ai-plugins/main/plugins/shunt/hooks/check-file-size).

The worker invocation is a one-shot Portal action. The bulk-read script checks
that paths exist and are readable, wraps files in XML boundaries, and sends the
question plus corpus to the worker. The code-writer requires a reference file,
can write its output directly to a target, and has no equivalent hook
enforcement. Sources: [`bulk-read`](https://raw.githubusercontent.com/spotify/portal-ai-plugins/main/plugins/shunt/scripts/bulk-read),
[`code-write`](https://raw.githubusercontent.com/spotify/portal-ai-plugins/main/plugins/shunt/scripts/code-write),
and [`shunt` README](https://github.com/spotify/portal-ai-plugins/blob/main/plugins/shunt/README.md).

The reported benchmark uses a 162K-line Java monorepo and estimates tokens as
characters divided by four. The four cases report 82%, 94%, 94%, and no
comparable percentage for code generation; the stated mean for bulk reads is
90%. The article also reports 10–30 seconds of delegation latency and explicitly
excludes editing, debugging, and architectural decisions. The repository adds
request-size and timeout limits because its CLI transport puts the payload in an
argument. Sources: [benchmark definition](https://raw.githubusercontent.com/spotify/portal-ai-plugins/main/plugins/shunt/evals/benchmarks.json),
[`aika.sh`](https://raw.githubusercontent.com/spotify/portal-ai-plugins/main/plugins/shunt/scripts/lib/aika.sh),
and the [article's limitations and benchmark sections](https://engineering.atspotify.com/2026/9/portal-by-spotify-cut-my-claude-code-token-usage-by-90#what-doesnt-work).

These data support "large, low-reasoning reads can be cheaper". They do not
establish end-to-end task success, total cost including worker tokens, or a
threshold that transfers to this repository.

## Local evidence

`agent-brains` already performs progressive context selection. `routeContext`
loads a small always-on set, earns aspect-specific documents from task text,
deduplicates requested paths, and caps the loaded characters. Developer and
reviewer roles are denied product documents that are already present in the
approved plan. See [`src/context-router.ts`](../../src/context-router.ts#L1) and
[`src/workflows/feature.ts`](../../src/workflows/feature.ts#L363).

The workflow creates isolated, one-shot child sessions through `AgentRunner`.
The planner, developer and reviewer receive different models, prompts, skills,
context and tool allowlists. The developer can read and write through its
allowlist but has no shell; deterministic verification runs before reviewer
tokens are spent. See [`src/agent.ts`](../../src/agent.ts#L17),
[`src/pi/pi-agent-runner.ts`](../../src/pi/pi-agent-runner.ts#L95), and
[`src/workflows/feature.ts`](../../src/workflows/feature.ts#L442).

The current runner captures input and output tokens from Pi's `agent_end` event,
and the workflow aggregates them by role into its run log. `cost` is optional in
the runner result and is currently omitted from the persisted `agent.completed`
event. The runner also omits Pi's cache-read/cache-write usage and exposed cost
fields. A reader experiment therefore needs an explicit worker identity and
accounting path; otherwise the parent appears cheaper while the total run is
unknown. See [`src/pi/pi-agent-runner.ts`](../../src/pi/pi-agent-runner.ts#L112),
[`src/agent.ts`](../../src/agent.ts#L45), and
[`src/ports.ts`](../../src/ports.ts#L102).

There is a real context waste to remove first. Pi's SDK documentation says
`DefaultResourceLoader` discovers `AGENTS.md` and that
`agentsFilesOverride` receives the discovered list. The runner appends every
`request.contextFiles` entry to that list. A local temporary-project
reproduction with Pi 0.84.2 and the runner-identical override returned both the
absolute discovered `AGENTS.md` and the relative injected `AGENTS.md` when the
root file existed. Pi's system-prompt assembly does not deduplicate those
entries. This is conditional on a consuming project having `AGENTS.md`; it was
reproduced at loader level, not measured as a billed live model call. Sources:
[Pi SDK context-file documentation](https://github.com/pi-packages/earendil-works-pi/blob/main/packages/coding-agent/docs/sdk.md#context-files),
[`#buildLoader`](../../src/pi/pi-agent-runner.ts#L167), and
[`routeContext`](../../src/context-router.ts#L33).

The package is pinned to Pi 0.84.2 in the lockfile and the existing role union
contains only `planner`, `developer`, `reviewer`, `security-reviewer`, and
`tester`. A `reader` is therefore not a configuration-only addition: it would
need a role policy, prompt/context policy, tool policy, and workflow accounting.
See [`package-lock.json`](../../package-lock.json#L544) and
[`src/skill-router.ts`](../../src/skill-router.ts#L17).

## Assessment against alternatives

| Option | Value here | Main cost or risk | Decision |
|---|---|---|---|
| Existing targeted reads and `routeContext` | Exact, deterministic, no extra model call | Main model still pays for exploratory bulk reads | Keep as default |
| Explicit local bulk-reader | Can move multi-file orientation out of the main context and reuse Pi model routing | Worker tokens, latency, summary omissions, new accounting and policy surface | Trial after baseline |
| Portal/`shunt` integration | Mature reference implementation and reusable external worker modes | Portal/CLI dependency, credentials/data egress, different hook model, and no fit with Pi child sessions | Do not adopt as runtime dependency |
| `code-writer` or direct worker writes | May reduce boilerplate output tokens | Direct import adds a second writer outside the existing ownership policy; preserving locks and verification/review needs explicit integration | Defer |
| Automatic read hook | Makes routing reliable once proven | Can block a useful exact read, misclassify shell commands, and add latency to small tasks | Consider only after trial |

The local worker should be deliberately smaller than `shunt`: explicit tool or
capability call, read-only, bounded paths and bytes, no human-input tool, no
extensions that can add writes, no recursive delegation, and a structured
answer containing file paths plus symbols or line ranges where available. A
summary is orientation evidence, never authority for an edit; the developer
must reread the exact range before changing code.

Path validation is a material safety difference. `shunt`'s script checks
existence and readability but does not define a repository-root boundary or a
secret/ignored-file policy. A local capability should reject traversal and
symlink escapes, cap file count and payload size, and avoid `.env`, credentials,
ignored files and binary data unless explicitly allowed. It should fail closed
when a requested file cannot be read.

## Recommended trial and acceptance criteria

First remove the duplicate discovered/injected `AGENTS.md` entry by canonical
path (preserving genuinely distinct scoped files), then record a baseline on
real tasks that involve multi-file exploration. For each task, capture:

- parent input/output tokens and latency;
- worker input/output tokens, model and latency;
- actual cost when the provider exposes it, plus total tokens even when it does
  not;
- files and approximate bytes requested, summary length, and whether the parent
  needed a follow-up exact read;
- verification result, reviewer findings, and whether the task completed with
  the same quality.

Run the same tasks with direct reads and with an explicit reader. Use a
data-derived threshold rather than copying 350 lines. The trial is successful
only if total cost falls while verification/review quality remains unchanged
and the added latency is acceptable for exploratory work. If the reader loses a
fact needed for an edit or safety decision, the main agent must be able to
discard the summary and read the source directly.

## Verdict: selectively import

Import the pattern, not Portal or the `shunt` plugin: fix context duplication,
then trial an explicit local bulk-reader behind a read-only capability and full
usage accounting. Revisit automatic hooks only after the trial shows a stable
net benefit across representative repositories. Revisit code-writing delegation
only if the workflow gains an independently verified artifact handoff with the
same lock, verification, review, and rollback guarantees as the current single
developer.
