# Pi plugins and context structure assessment

**Mode: assessment**<br>
**Date:** 2026-09-07<br>
**Scope:** suitability for `agent-brains`, especially the experimental `pi-brain` branch.

## Executive summary

There is useful material here, but installing everything would create overlapping
orchestrators, duplicated memory stores and conflicting prompt policies.

The strongest near-term candidates are:

1. **Trial `pi-vcc` in the main interactive Pi session.** It solves a real gap—long-session
   compaction and recall—without replacing `pi-brain`'s workflow.
2. **Trial `pi-lens` in a disposable project with every mutation path disabled.** Its LSP and
   freshness-gated diagnostics are valuable, but its defaults are too invasive for immediate
   adoption.
3. **Import only the review half of Ponytail.** A focused, explicit over-engineering review adds
   value; its always-on coding persona largely duplicates local skills and can conflict with an
   approved specification.
4. **Improve the local grilling and context files using selected ideas from `pi-grill-me` and
   `opencode-lab`.** Do not add a second `memory.md`/`todo.md` hierarchy.
5. **Do not add `pi-async-fork`; defer installing `pi-subagents` into `pi-brain`.** Both overlap
   the local `AgentRunner`; `pi-subagents` is the better future substrate if background,
   parallel or worktree-isolated execution becomes a product requirement.

## Method and evidence

Upstream claims below come from repository README files, manifests, documentation and source at
these inspected commits:

| Source | Inspected commit |
|---|---|
| `pi-vcc` | [`b1b8b3a`](https://github.com/sting8k/pi-vcc/commit/b1b8b3ad748e2c77e8a1da26dc384e58a5bb771f) |
| `pi-config` | [`f82da56`](https://github.com/amosblomqvist/pi-config/commit/f82da563ab05d66729492d64c7ed4e96db3663f3) |
| `pi-lens` | [`e7f3bd4`](https://github.com/apmantza/pi-lens/commit/e7f3bd4367e3c261e8560c1666800f5dcb839d24) |
| `pi-async-fork` | [`3c21bd4`](https://github.com/elpapi42/pi-async-fork/commit/3c21bd476ae54b938f5fd591651309ecf423b7c8) |
| `pi-subagents` | [`56f247a`](https://github.com/nicobailon/pi-subagents/commit/56f247ac86169cfffa1af9a4c07997c33804bf9a) |
| `ponytail` | [`356918e`](https://github.com/DietrichGebert/ponytail/commit/356918eba965ee1eac64bd3a7f0dd02108350de5) |
| `pi-grill-me` | [`e9d60e7`](https://github.com/majorgilles/pi-grill-me/commit/e9d60e79156ffc2c298bfc73c3657d406eb71c69) |
| `opencode-lab` | [`bf92165`](https://github.com/criterium/opencode-lab/commit/bf92165972dc6a6d5308f698da057bc2c9f55669) |

Local evidence comes from the current repository implementation and templates. Recommendations
are explicitly identified as local assessments rather than upstream facts.

## Local baseline

Before comparing candidates, the project already has several of the capabilities they advertise:

- `pi-brain` owns a deterministic `plan → approve → develop → verify → review` state machine,
  with bounded retries and no LLM manager. See the [architecture](../pi-brain/ARCHITECTURE.md) and
  [feature workflow](../../src/workflows/feature.ts).
- Child runs use separate in-memory Pi sessions, role-specific skills, curated context and strict
  tool allowlists. The developer has only `read`, `grep`, `find`, `ls`, `edit`, and `write`; the
  reviewer is forced read-only. See [PiAgentRunner](../../src/pi/pi-agent-runner.ts),
  [skill routing](../../src/skill-router.ts) and [context routing](../../src/context-router.ts).
- Workflow state and outcomes already have an owned JSONL run log and resume path.
- The lockfile pins the Pi family at `0.84.2`; candidates that require `0.85+` are not drop-in
  compatible without a deliberate SDK upgrade and regression run. See
  [package-lock.json](../../package-lock.json).
- Every profile already includes `karpathy-guidelines`, `product-thinking`, `simplify`,
  `code-review`, `grilling` and `grill-with-docs`. See
  [profiles/common.list](../../profiles/common.list).

This means the bar is not “does the candidate work?” but “does it add a capability without
weakening the existing invariants or creating a second source of truth?”

## Candidate assessment

### 1. `pi-vcc` — trial now

**Upstream facts.** `pi-vcc` replaces LLM-generated compaction with deterministic extraction and
formatting. It retains a short transcript plus goal, changed files, commits, outstanding context
and user preferences. `vcc_recall` searches the raw session JSONL by keyword or regex, respects
active lineage, supports an all-lineages scope, and can drill into touched files. It is version
`0.7.2`, has benchmarks and a substantial test suite, and declares Pi compatibility from `0.74`
to `<1.0`. Sources: [README](https://github.com/sting8k/pi-vcc/blob/b1b8b3ad748e2c77e8a1da26dc384e58a5bb771f/README.md),
[manifest](https://github.com/sting8k/pi-vcc/blob/b1b8b3ad748e2c77e8a1da26dc384e58a5bb771f/package.json),
[compaction hook](https://github.com/sting8k/pi-vcc/blob/b1b8b3ad748e2c77e8a1da26dc384e58a5bb771f/src/hooks/before-compact.ts),
[tests](https://github.com/sting8k/pi-vcc/tree/b1b8b3ad748e2c77e8a1da26dc384e58a5bb771f/tests).

**Local fit.** This complements, rather than replaces, local state:

- `pi-vcc` recalls the current interactive session;
- `pi-brain` persists workflow events and outcomes;
- `.ai/memory` carries curated cross-session project knowledge.

It will mostly benefit the **parent Pi session**. The current child sessions are in-memory and
one-shot, so VCC recall should not be assumed to work inside them.

**Risks.** Compaction hooks are coupled to Pi session internals. Its changelog contains
version-specific behavior for Pi `0.84.4+`; on the locally pinned `0.84.2`, its compatibility
auto-continue path must be tested. The entrypoint retains one legacy type-only import name while
runtime modules use the Earendil package names. The README says MIT, but the inspected tree has no
full `LICENSE` file and the manifest has no `license` field, so source vendoring should wait for
license clarification.

**Action.** Trial as an external Pi package, not copied into this repository. Accept only if a
long disposable session demonstrates:

- manual and threshold compaction both resume exactly once;
- current goal, unresolved failure and last working tail survive compaction;
- recall finds an earlier decision and a touched file;
- uninstalling it restores Pi default behavior without touching project state.

### 2. `pi-config` — use as a pattern catalogue only

**Upstream facts.** The author explicitly describes this as a personal configuration from which
individual pieces should be selected, not a package to install wholesale. It contains an
ask-user overlay, bash guard, browser, web fetch/search, temporary prompt snippets and session
analysis utilities. Sources: [README](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/README.md),
[extensions](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/extensions),
[skills](https://github.com/amosblomqvist/pi-config/tree/f82da563ab05d66729492d64c7ed4e96db3663f3/skills).

**Local fit.** Most components overlap existing facilities:

- `ask-user-question` overlaps the local `ask_user` bridge;
- bash safety overlaps host permissions, and the pipeline developer has no shell at all;
- browser/web/PDF functions already exist as skills or connected tools;
- temporary prompt snippets are useful, but primarily for interactive Pi work;
- `analyze-sessions` is the genuinely additive idea: cost rollups, prompt-pattern mining and
  transcript search are broader than `/flow log-all`.

**Risks.** The repository has only two commits, mixes legacy `@mariozechner` imports with newer
`@earendil-works` imports, and has no visible license. Code should therefore not be copied into
this MIT repository without explicit permission or a license being added upstream.

**Action.** Reimplement only proven ideas—especially session analytics or ephemeral prompt
snippets—from the behavior contract, not from unlicensed source.

### 3. `pi-lens` — guarded trial

**Upstream facts.** `pi-lens` combines an edit-time pipeline and an LSP lane. It provides
language diagnostics, impact-cascade analysis, format/autofix, linters and tests after writes,
AST and tree-sitter rules, identifier search, review graphs, read-before-edit protection,
finding dispositions and freshness gates. It is MIT, version `4.1.4`, requires Node `>=22.19.0`,
and has a large test and documentation surface. Sources:
[README and architecture](https://github.com/apmantza/pi-lens/blob/e7f3bd4367e3c261e8560c1666800f5dcb839d24/README.md),
[manifest](https://github.com/apmantza/pi-lens/blob/e7f3bd4367e3c261e8560c1666800f5dcb839d24/package.json),
[settings](https://github.com/apmantza/pi-lens/blob/e7f3bd4367e3c261e8560c1666800f5dcb839d24/docs/settings.md),
[configuration](https://github.com/apmantza/pi-lens/blob/e7f3bd4367e3c261e8560c1666800f5dcb839d24/docs/globalconfig.md),
[dependencies](https://github.com/apmantza/pi-lens/blob/e7f3bd4367e3c261e8560c1666800f5dcb839d24/docs/dependencies.md).

**Local fit.** This addresses the largest real feedback gap in `pi-brain`: the developer edits
without shell access and receives deterministic verification only after its pass. Fast,
language-aware diagnostics could shorten the fix loop. The most transferable design ideas are:

- one central post-write dispatch point;
- freshness labels before delivering cached diagnostics;
- explicit dispositions (`false-positive`, `defer`, `fix`);
- a degradation ledger when a tool silently falls back or times out.

**Risks.** The package is operationally heavy and its defaults include mutation: formatting and
autofix are enabled. It can install or invoke external analyzers and language servers. Project
configuration can re-enable mutation controls that a user disabled globally. Context injection
can also disturb prompt caching. Finally, the pipeline's explicit child tool allowlists exclude
Lens tools, and it is not yet proven that Lens lifecycle hooks load and behave correctly inside
sessions created programmatically by `PiAgentRunner`.

**Action.** Trial in a disposable repository with formatting, autofix, LSP quick-fixes, automatic
tests, security scanners, git guard and context injection disabled. Start with read-only LSP
diagnostics and measure latency/noise. Only then test a child developer session. Do not add Lens
output to the blocking verify gate until its freshness and failure semantics are deterministic.

### 4. `pi-async-fork` — do not adopt

**Upstream facts.** It exposes `create_fork`, `steer_fork` and `fork_status`, backed by durable
`pi-fleet` agents, retained Pi sessions and a branch-scoped ledger. Delivery is explicitly
at-least-once, not exactly-once. It is MIT, version `0.1.0`, depends on
`@elpapi42/pi-fleet-sdk`, and requires Pi `>=0.85.0`. Sources:
[README](https://github.com/elpapi42/pi-async-fork/blob/3c21bd476ae54b938f5fd591651309ecf423b7c8/README.md),
[specification](https://github.com/elpapi42/pi-async-fork/blob/3c21bd476ae54b938f5fd591651309ecf423b7c8/SPECIFICATION.md),
[manifest](https://github.com/elpapi42/pi-async-fork/blob/3c21bd476ae54b938f5fd591651309ecf423b7c8/package.json).

**Local assessment.** Durable branch ownership, redacted bounded status and the distinction
between non-waking progress and terminal notifications are good design references. The package
itself is a poor fit now: it needs a Pi upgrade, adds another state directory/runtime and shares
the parent's working directory, so concurrent writes are explicitly unsafe. `pi-subagents` is a
more complete future option and running both would create two delegation protocols.

### 5. `pi-subagents` — study as a future execution substrate, not a second workflow owner

**Upstream facts.** `pi-subagents` provides foreground and background child sessions, fresh/forked
context, built-in scout/researcher/worker/reviewer/oracle roles, parallel and scripted workflows,
steering, budgets, worktree isolation, lifecycle artifacts, a fleet UI and recursion controls.
It is MIT and version `0.66.0`. Background children require Pi installed as an npm package.
Sources: [README](https://github.com/nicobailon/pi-subagents/blob/56f247ac86169cfffa1af9a4c07997c33804bf9a/README.md),
[manifest](https://github.com/nicobailon/pi-subagents/blob/56f247ac86169cfffa1af9a4c07997c33804bf9a/package.json),
[workflows](https://github.com/nicobailon/pi-subagents/blob/56f247ac86169cfffa1af9a4c07997c33804bf9a/docs/workflows.md),
[observability](https://github.com/nicobailon/pi-subagents/blob/56f247ac86169cfffa1af9a4c07997c33804bf9a/docs/observability.md),
[configuration](https://github.com/nicobailon/pi-subagents/blob/56f247ac86169cfffa1af9a4c07997c33804bf9a/docs/configuration.md).

**Local fit.** It is the strongest package in this category, but it overlaps nearly every major
`pi-brain` responsibility: child creation, role prompts, tool policies, workflows, retries,
results, artifacts and observation. Installing it beside the current workflow would make
ownership ambiguous. The local repository had already recorded the same caution in the
[Pi ecosystem assessment](../pi-brain/research/atomic-and-pi-ecosystem.md).

Useful ideas to retain:

- machine-readable child lifecycle artifacts;
- separate run, tool and usage budgets;
- runtime acknowledgment that an intended extension actually loaded in a child;
- worktree isolation before parallel mutating work;
- bounded child depth and cumulative spawn budgets.

**Action.** Revisit only when one of these becomes a concrete requirement: parallel read-only
review lanes, background work after the parent goes idle, interactive steering, or concurrent
mutating workers in isolated worktrees. At that point, spike `pi-subagents` as the implementation
of `AgentRunner`; do not let it replace the deterministic `runFeatureWorkflow` state machine.

### 6. `ponytail` — import the explicit review skills, not the always-on mode

**Upstream facts.** Ponytail applies a minimalism ladder: do nothing if unnecessary, reuse local
code, prefer stdlib, prefer native platform features, use an existing dependency, and only then
write the minimum new code. It explicitly protects security, validation, accessibility and
necessary error handling. Its package contains normal, diff-review and whole-repository audit
skills. The Pi extension defaults to `full` mode and injects its rules before every agent start.
It is MIT and version `4.9.0`. Sources:
[core skill](https://github.com/DietrichGebert/ponytail/blob/356918eba965ee1eac64bd3a7f0dd02108350de5/skills/ponytail/SKILL.md),
[review skill](https://github.com/DietrichGebert/ponytail/blob/356918eba965ee1eac64bd3a7f0dd02108350de5/skills/ponytail-review/SKILL.md),
[Pi extension](https://github.com/DietrichGebert/ponytail/blob/356918eba965ee1eac64bd3a7f0dd02108350de5/pi-extension/index.js),
[manifest](https://github.com/DietrichGebert/ponytail/blob/356918eba965ee1eac64bd3a7f0dd02108350de5/package.json).

**Local fit.** There is no local `ponytail` skill, but most of the base behavior already exists in
[`karpathy-guidelines`](../../.agents/skills/karpathy-guidelines/SKILL.md),
[`product-thinking`](../../.agents/skills/product-thinking/SKILL.md) and
[`simplify`](../../.agents/skills/simplify/SKILL.md). Adding the always-on mode would duplicate
instructions and could bias the developer toward shrinking an already approved feature.

The genuinely new piece is the narrow review contract: inspect a diff only for things to delete,
replace with stdlib/native features, or defer under YAGNI, without mixing in correctness findings.

**Action.** Put `ponytail-review` and optionally `ponytail-audit` in `extra/skills` as explicit,
opt-in tools first. Do not add the base skill to `common.list` and do not install the always-on Pi
extension. After real use, either keep the upstream skill with attribution or merge the best
checks into the local two-axis review as a separately reported third axis.

Ponytail's published benchmarks are useful evidence but are maintained by the same project and
should be treated as self-reported until reproduced locally.

### 7. `pi-grill-me` — import its state model; trial the extension only for generic planning

**Upstream facts.** `pi-grill-me` conducts one-question-at-a-time Socratic interviews, maintains a
shared-understanding checkpoint, tracks coverage and decision branches, offers selectable answer
alternatives, requires an explicit output-selection phase, and blocks mutating tools until the
user approves the output plan. State is stored in the Pi session branch. It is MIT and version
`0.3.0`, but has no npm test script and its main extension is monolithic. Sources:
[README](https://github.com/majorgilles/pi-grill-me/blob/e9d60e79156ffc2c298bfc73c3657d406eb71c69/README.md),
[design](https://github.com/majorgilles/pi-grill-me/blob/e9d60e79156ffc2c298bfc73c3657d406eb71c69/DESIGN.md),
[implementation](https://github.com/majorgilles/pi-grill-me/blob/e9d60e79156ffc2c298bfc73c3657d406eb71c69/index.ts),
[manifest](https://github.com/majorgilles/pi-grill-me/blob/e9d60e79156ffc2c298bfc73c3657d406eb71c69/package.json).

**Local fit.** The local [`grilling`](../../.agents/skills/grilling/SKILL.md) skill is only a short
behavioral prompt. `pi-grill-me` adds a better checkpoint and hard phase transitions. However,
the `/feature` planner already asks one material question at a time, produces PRD/tasks and has a
human approval gate, so installing Grill Me inside that path would duplicate orchestration.

A concrete local defect was also found: [`grill-with-docs`](../../.agents/skills/grill-with-docs/SKILL.md)
instructs the agent to run `domain-modeling`, but that skill does not exist in this repository or
its profiles. The workflow is therefore incomplete today.

**Action.** First repair the local skill pair. Import the checkpoint schema—known facts, open
decisions, assumptions, coverage, decision branches and approved outputs—and the explicit
`interview → output selection → output` phase. Trial the extension separately only for broad
planning conversations outside `/feature`. Do not copy its heuristic bash blocker into the core
workflow without tests.

## Assessment of the three structure proposals

### `memory-system`

**Upstream facts.** The proposal uses flat, user-controlled Markdown: `memory.md`, `todo.md`, a
scratch-note file and `memory/*.md`, loaded and maintained through explicit `>>`/`<<` commands.
Nothing is loaded automatically and writes require human confirmation. Its admission rule is:
store only what an agent would lose without help, especially decisions, reasons, preferences and
costly discoveries—not code facts that can be rediscovered. Sources:
[research](https://github.com/criterium/opencode-lab/blob/bf92165972dc6a6d5308f698da057bc2c9f55669/research/memory-system/README.md),
[skill](https://github.com/criterium/opencode-lab/blob/bf92165972dc6a6d5308f698da057bc2c9f55669/research/memory-system/SKILL.md).

**What to use.** Adopt the admission criterion, human approval for persistent memory, on-demand
deep dives, explicit contradiction/freshness checks and periodic compression.

**What not to use.** Do not create root `memory.md` and `todo.md`: they would duplicate
`.ai/context`, `.ai/memory/progress.md`, `.ai/memory/lessons.md`, `.ai/features` and ADRs. Do not
add global cross-project memory, which would weaken project isolation.

The best local implementation is to evolve `lessons-gardener` into a broader context audit (or
add a sibling skill) that checks freshness, duplicate authority, missing references and stale
progress while preserving the existing file topology.

### `prompt/shared`

**Upstream facts.** These OpenCode prompts add adaptive depth levels, explicit certainty labels
(`[C]` verified, `[I]` inferred, `[S]` assumed), a pre-delivery self-check, safe-edit checks and
separate prompts for exploration, general execution and compaction. They were developed for
DeepSeek V4 and assume Linux tools. Sources:
[overview](https://github.com/criterium/opencode-lab/blob/bf92165972dc6a6d5308f698da057bc2c9f55669/prompt/shared/README.md),
[main prompt](https://github.com/criterium/opencode-lab/blob/bf92165972dc6a6d5308f698da057bc2c9f55669/prompt/shared/default.md),
[explorer](https://github.com/criterium/opencode-lab/blob/bf92165972dc6a6d5308f698da057bc2c9f55669/prompt/shared/explore.md),
[executor](https://github.com/criterium/opencode-lab/blob/bf92165972dc6a6d5308f698da057bc2c9f55669/prompt/shared/general.md),
[compaction](https://github.com/criterium/opencode-lab/blob/bf92165972dc6a6d5308f698da057bc2c9f55669/prompt/shared/compaction.md).

**What to use.** Certainty labels are valuable in research and architecture reports; the
pre-delivery completeness check is useful for planner/reviewer output; failed-tool escalation
and explicit source references are good general reliability rules.

**What not to use.** Do not copy the full main prompt. It is long, tool- and OS-specific, contains
rules that conflict with the current host, and would undermine `pi-brain`'s deliberate rule that
role prompts stay small while domain knowledge lives in skills. Do not combine its LLM compaction
prompt with `pi-vcc` until the VCC trial decides which compaction strategy wins.

### `agents_md-danger`

**Upstream facts.** The paper documents OpenCode-specific global, project and subdirectory
instruction loading and identifies context pollution, stale rules, authority conflicts, prompt
injection, accidental secret exposure, debugging opacity and cache/latency cost. Its loader flags
and exact cache behavior are OpenCode-specific. Source:
[research](https://github.com/criterium/opencode-lab/blob/bf92165972dc6a6d5308f698da057bc2c9f55669/research/agents_md-danger/README.md).

**What to use.** Keep `AGENTS.md` small, stable and free of volatile status or secrets. Give each
kind of fact one owner. Review generated/nested instruction files. Move catalogs and detailed
processes behind explicit skills or context routes.

**Local finding.** The current [AGENTS template](../../templates/AGENTS.md) is 105 lines / 7.2 KB.
It repeats general rules, context routing, workflow steps and a long frontend-skill catalog. Much
of that catalog already exists in skill descriptions and profiles. The file is not catastrophic,
but it can be materially reduced without losing policy.

Do not adopt the paper's blanket “manual loading” recommendation for Pi or Codex without verifying
their loaders. The local context router already implements task-based loading for child roles;
that is a better fit than disabling project instructions wholesale.

## Recommended local document topology

Keep the existing topology and tighten ownership:

| Location | Owns | Must not own |
|---|---|---|
| `AGENTS.md` | Stable safety rules, language, routing pointers, authority order | Skill catalog, session status, changelog, detailed workflow tutorials |
| `.ai/context/` | Current product, architecture, domain terms, stack and ADRs | Temporary tasks or past session narrative |
| `.ai/features/<feature>/` | Approved PRD and ordered tasks for one feature | Global conventions |
| `.ai/memory/lessons.md` | Non-obvious, project-specific mistakes with live references | Framework trivia, transient failures, code facts |
| `.ai/memory/progress.md` | Current phase, active task, blockers and next actions | Full completed-task history or duplicate handoff prose |
| Pi session JSONL / VCC | Searchable conversational history | Canonical project decisions |

Specific cleanup opportunities discovered locally:

- Reduce `templates/AGENTS.md` to stable directives plus context/skill routing; move the frontend
  catalog to documentation or let profiles/descriptions provide it.
- Simplify [progress.md](../../templates/.ai/memory/progress.md). It currently duplicates status,
  completed history, “next session” guidance and handoff behavior; it also references a missing
  `blockers.md` and contains a malformed heading character.
- Keep the current [lessons admission rules](../../templates/.ai/memory/lessons.md); they already
  match the strongest part of `memory-system`. Extend the gardener to detect contradictions with
  current code/ADRs and duplicate authority across context files.
- Add an explicit precedence statement: current user request and approved feature spec → project
  `AGENTS.md` → scoped context/ADR → curated lessons → session history. Code/database remain the
  source of truth for implementation facts.
- Never store credentials, temporary URLs or personal data in auto-loaded instruction files.

## Prioritized follow-up

### P0 — local fixes, no dependency

1. Repair `grill-with-docs` so it no longer depends on the absent `domain-modeling` skill.
2. Refactor the AGENTS/progress templates around the ownership table above.
3. Add a read-only context audit covering staleness, contradictions, duplicate authority, broken
   references and file-size growth; require approval before any rewrite.
4. Add an explicit over-engineering review skill, initially under `extra/skills`.

### P1 — isolated trials

1. Run the `pi-vcc` acceptance trial on the pinned Pi version.
2. Run `pi-lens` read-only in a disposable repository, then separately prove whether its hooks
   work in a `PiAgentRunner` child session.
3. Trial `pi-grill-me` only outside `/feature`, comparing its checkpoint against the repaired local
   grilling skill.

### P2 — revisit only on demand

Evaluate `pi-subagents` as an `AgentRunner` backend when background execution, steering, parallel
lanes or isolated worker worktrees are required. If selected, keep `runFeatureWorkflow` as the
single orchestration owner and do not install `pi-async-fork` alongside it.

## Revisit triggers

- **`pi-vcc`:** reject after the trial if it causes duplicate turns, loses active-tail context or
  cannot recall lineage correctly on Pi `0.84.2`.
- **`pi-lens`:** reconsider broader use only if read-only diagnostics have low false-positive and
  latency rates and child-session behavior is proven.
- **`pi-subagents`:** revisit when the product needs background/parallel/worktree execution, or
  maintaining the local child-session layer costs more than adapting its API.
- **Ponytail base mode:** revisit only if local implementations repeatedly overbuild despite
  `karpathy-guidelines` and the explicit review skill.
- **New memory hierarchy:** revisit only if the existing `.ai` topology cannot express a concrete
  retrieval need after the context-audit improvements.

## Verdict

**selectively import**

Adopt the smallest additive pieces: trial `pi-vcc`; trial `pi-lens` read-only; import Ponytail's
explicit complexity review, Grill Me's checkpoint/phase model, and OpenCode Lab's memory hygiene.
Do not add a second delegation runtime or a parallel Markdown memory system to `pi-brain` today.
