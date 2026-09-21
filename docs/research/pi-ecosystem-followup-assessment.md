# Pi ecosystem follow-up assessment

Date: 2026-09-21

Mode: assessment

Scope: `pi-vcc`, `pi-config`, `pi-lens`, the “native async operation” stack discussed on Reddit, `pi-subagents`, `pi-grill-me`, and `SEO-and-Growth-Agent-Plugin`.

This is a follow-up to [pi-plugins-and-context-structure-assessment.md](./pi-plugins-and-context-structure-assessment.md). It records what changed upstream, what is already represented locally, and which ideas are worth trialling or reimplementing. It does not authorize package installation or production integration.

## Executive conclusion

The existing direction is still sound: keep `pi-brain` as the deterministic orchestration core, trial one narrowly scoped extension at a time, and reimplement only small, well-understood patterns where they improve the local design.

The recommended order is:

1. Run the already-planned isolated `pi-vcc` trial, now against v0.8.0.
2. Design a local, explicit-only, read-only-first SEO audit skill from the useful parts of the SEO plugin; do not import its server or credential model.
3. Keep `pi-lens` as a guarded read-only trial after the compaction experiment.
4. Raise `pi-subagents` from “generic alternative” to “candidate Herdr/AgentRunner backend”, but only after a deliberate Pi upgrade and an architecture spike.
5. Treat observational memory as an alternative to `pi-vcc`, never as a simultaneous default compactor.
6. Defer the rest until a measurable local pain justifies the operational surface.

## Decision matrix

| Project | Local decision | Why |
|---|---|---|
| `pi-vcc` | Trial first | Small, deterministic, no model calls, and now licensed clearly; it directly tests the highest-value context hypothesis. |
| `pi-config` | Use as a pattern catalogue | Session analytics and transient prompt snippets are useful; wholesale copying is inappropriate and the repository has no clear root license. |
| `pi-lens` | Guarded trial later | Excellent freshness/read-before-edit ideas, but a very large operational and dependency surface. |
| `pi-async-fork` | Do not adopt | It duplicates local orchestration, requires newer Pi, and has documented/reported orphan and recovery risks. |
| `pi-observational-memory` | Defer as an A/B alternative | Strong semantic-memory design, but it adds background model cost and competes directly with `pi-vcc` for compaction ownership. |
| `pi-codegraph` | Narrow experiment only when needed | Its two-tool contract is good; indexing latency and event-loop failure reports make it unsuitable as a default today. |
| `pi-search-hub` | Do not adopt globally | Broad provider support is attractive, but project-scoped configuration can invoke shell commands while resolving credentials. |
| `pi-wait` | Defer | The durable ledger is a useful pattern, but the current workflow has no concrete need for an in-process timer primitive. |
| `pi-subagents` | Architecture spike at R2 | Recent Herdr APIs and capability ceilings align better with the local roadmap, but it still overlaps the existing state machine heavily. |
| `pi-grill-me` | No package install | Its best ideas have already been implemented locally in the R0.1 grilling repair. |
| SEO/Growth plugin | Reimplement the knowledge layer | A dedicated local skill fills a real gap, while the upstream runtime and security model should not be imported. |

## What changed since the previous assessment

### `pi-vcc`: the first trial is now easier to justify

The current release is v0.8.0. The earlier licensing concern is resolved by an MIT license, and the project now includes CI and a lockfile. Recent additions include provider-specific compaction skipping and custom-message-type skipping, which reduce conflicts with other extensions. Its core remains intentionally deterministic: transcript-derived summaries, structured sections, and local recall without an LLM call. Sources: [README at assessed commit](https://github.com/sting8k/pi-vcc/blob/303e89db00ce816c81e6857ef02a2feb23e1412c/README.md), [package manifest](https://github.com/sting8k/pi-vcc/blob/303e89db00ce816c81e6857ef02a2feb23e1412c/package.json), and [changelog](https://github.com/sting8k/pi-vcc/blob/303e89db00ce816c81e6857ef02a2feb23e1412c/CHANGELOG.md).

The trial should still be external and reversible. Measure summary quality, recall precision, context saved, compaction latency, and branch behaviour. Do not combine it with observational memory during the same run: both can participate in Pi’s compaction lifecycle, where extension ordering can determine the effective result.

### `pi-config`: useful small patterns, not a base configuration

The repository explicitly presents itself as a personal setup whose pieces should be copied selectively. The strongest additive ideas for this project are its standard-library session-analysis scripts and one-shot prompt snippets. The ask-user overlay and bash guard are informative, but local child sessions do not automatically inherit interactive Pi extension tools, and `pi-brain` already enforces stricter tool boundaries. The repository does not expose a clear root license, so use it as behavioural reference rather than copying code. Sources: [README at assessed commit](https://github.com/amosblomqvist/pi-config/blob/f82da563623132966049506099e0a233e222b077/README.md), [extensions](https://github.com/amosblomqvist/pi-config/tree/f82da563623132966049506099e0a233e222b077/extensions), and [skills](https://github.com/amosblomqvist/pi-config/tree/f82da563623132966049506099e0a233e222b077/skills).

### `pi-lens`: strong contracts, still too broad for default adoption

At v4.2.1, `pi-lens` covers LSP diagnostics, linting, formatters, tree-sitter/ast-grep, dependency impact, read-before-edit, commit guards, health telemetry, and an experimental MCP server across many languages and external tools. The most reusable ideas are its honesty contract—`partial`, `stale`, `cold`, or `degraded` must never be presented as clean—and its hash-backed read-before-edit guard. The package is actively maintained, but its auto-installing toolchain, background analysis, autofix behaviour, and cross-platform surface make a direct import disproportionate for this repository. Sources: [README at assessed commit](https://github.com/apmantza/pi-lens/blob/a6b4d4c5e78017248e457932c5049409645e9c81/README.md), [manifest](https://github.com/apmantza/pi-lens/blob/a6b4d4c5e78017248e457932c5049409645e9c81/package.json), and [dependency documentation](https://github.com/apmantza/pi-lens/blob/a6b4d4c5e78017248e457932c5049409645e9c81/docs/dependencies.md).

## The Reddit “native async operation” stack

The post’s actual proposition is “endless conversation + native async operation”: observational memory preserves facts and decisions across compactions, async forks move noisy work out of the parent context, CodeGraph supplies dense repository navigation, Search Hub abstracts web providers, and Wait wakes the agent after an external delay. The parent remains the owner of decisions; this is explicitly not presented as an autonomous swarm. [Reddit post and discussion](https://www.reddit.com/r/PiCodingAgent/comments/1w9e6zo/my_pi_agent_setup_part_2_native_async_operation/).

The author also gives the most important caveat: there are no before/after benchmarks, customisation is a “rabbit hole”, updates sometimes break the setup, and the author cannot attribute a large productivity gain to it. A commenter reports CodeGraph indexing hangs/event-loop starvation and orphaned async workers after the parent exits; the author acknowledges pending fixes. The setup is therefore an interesting architecture report, not empirical evidence for adoption.

The shared system prompt is also a poor fit for this project: it is roughly 51 KB and defaults aggressively to forking. The local architecture deliberately uses small role prompts, progressive context, and deterministic workflow gates. Sources: [system prompt gist](https://gist.github.com/elpapi42/e3fda2cefaabd84a1c188375a32466f5) and [settings gist](https://gist.github.com/elpapi42/9ab1cd195ffeba9a56bdf59f83162692).

### `pi-observational-memory`

V3.1.4 builds a branch-local append-only ledger of observations, reflections, dropped items, and source IDs. Background observer/reflector workers prepare semantic memory before compaction; final rendering can then be deterministic, and a passive mode lets forks read memory without starting their own workers. This is the strongest option when the dominant requirement is multi-week semantic continuity in one Pi conversation. Sources: [README at assessed commit](https://github.com/elpapi42/pi-observational-memory/blob/e7d77dcfca66efdc1e3e383d22dd18f890e2f388/README.md) and [manifest](https://github.com/elpapi42/pi-observational-memory/blob/e7d77dcfca66efdc1e3e383d22dd18f890e2f388/package.json).

It is not the first choice here. `pi-brain` children are short-lived and isolated, while durable project knowledge already belongs in `.ai`, workflow logs, and reviewed artifacts. The background models add cost, latency, failure modes, and possible synthesis drift. V3 also has a breaking memory migration. A/B test it only if `pi-vcc` proves unable to preserve long-running parent-session coherence.

### `pi-async-fork`

This extension offers durable non-blocking forks, progress steering, branch-local ledgers, effort profiles, and at-least-once result delivery through `pi-fleet`. Those are thoughtful primitives, but the specification also documents best-effort snapshots, crash windows, stale records, and the absence of a public destroy operation. It requires Pi 0.85+, while this repository currently pins 0.84.2. Sources: [README at assessed commit](https://github.com/elpapi42/pi-async-fork/blob/3c21bd4426b588a1995e81b76cb5021957c8ffed/README.md), [specification](https://github.com/elpapi42/pi-async-fork/blob/3c21bd4426b588a1995e81b76cb5021957c8ffed/SPECIFICATION.md), and [manifest](https://github.com/elpapi42/pi-async-fork/blob/3c21bd4426b588a1995e81b76cb5021957c8ffed/package.json).

Adopting it would create a second orchestration state machine beside `runFeatureWorkflow`. Keep its ledger, idempotent-delivery, public-ID/worker-ID separation, and passive-child ideas as references; do not add the package.

### `pi-codegraph`

`pi-codegraph` deliberately exposes only two bounded operations: `explore_code` for source and relationship retrieval, and `analyze_code` for impact/path analysis. It initializes and synchronises a `.codegraph` index and fails closed when freshness cannot be established. This two-tool surface and explicit “static evidence is not runtime proof” contract are worth emulating. Sources: [README at assessed commit](https://github.com/elpapi42/pi-codegraph/blob/08b91bd87fe94f86773783518065c951a46aab8d/README.md), [runtime](https://github.com/elpapi42/pi-codegraph/blob/08b91bd87fe94f86773783518065c951a46aab8d/src/runtime.ts), and [manifest](https://github.com/elpapi42/pi-codegraph/blob/08b91bd87fe94f86773783518065c951a46aab8d/package.json).

The first index can be slow, crash recovery and cancellation are best effort, and the Reddit report suggests in-process indexing can starve the event loop. The current repository remains small enough for `rg` and targeted reads. Only benchmark CodeGraph in a disposable copy of a genuinely large repository, preferably pre-indexed outside the active Pi process.

### `pi-search-hub`

The project offers a clean `web_search`/`web_read` interface across many providers, automatic fallback, and optional Reciprocal Rank Fusion. The provider registry and search/read separation are good design references. Sources: [README at assessed commit](https://github.com/ronnieops/pi-search-hub/blob/6dd5188d65a104492020e15859d9086961e366ec/README.md), [configuration code](https://github.com/ronnieops/pi-search-hub/tree/6dd5188d65a104492020e15859d9086961e366ec/src), and [manifest](https://github.com/ronnieops/pi-search-hub/blob/6dd5188d65a104492020e15859d9086961e366ec/package.json).

It should not be installed globally in its current trust model. A project-local `.pi/search.json` can override configuration, while an API-key value prefixed with `!` is resolved through a synchronous shell command. Opening an untrusted repository can therefore place command execution in the credential-resolution path. In addition, extension tools are not automatically visible to the programmatic children used by `pi-brain`. Prefer the existing simpler web-access direction, or revisit Search Hub only after project-scoped shell credential execution is removed or explicitly trust-gated.

### `pi-wait`

`pi-wait` is a small, durable, branch-aware timer with stable IDs, append-only events, restart recovery, and at-least-once delivery. The ownership and replay semantics are a useful model for future deployment/canary monitoring. It has no cancellation, listing, groups, or external scheduler, and requires Pi 0.85+. Sources: [README at assessed commit](https://github.com/elpapi42/pi-wait/blob/6997b995f8c3ae2209abc838624f49279138dfc2/README.md) and [manifest](https://github.com/elpapi42/pi-wait/blob/6997b995f8c3ae2209abc838624f49279138dfc2/package.json).

There is no current requirement that justifies adding a timer runtime. Reuse its session-owner, branch-scope, generation-ID, deduplication, and replay concepts only if external monitoring becomes a concrete feature.

## `pi-subagents`: more relevant, but not a drop-in replacement

Version 0.70.1 has moved materially since the earlier review. It now includes a standalone background runner aligned with Pi 0.86.1, public Herdr integration/project panes, capability ceilings, required child extensions, structured outputs, worktrees, workflow lanes, watchdog/reviewer loops, and persistent recovery. Those public integration points align with the future Herdr direction recorded in [IDEAS.md](../pi-brain/IDEAS.md). Sources: [README at assessed commit](https://github.com/nicobailon/pi-subagents/blob/1ac7b5e845fb54143bc16e973b38af1ed7f4670a/README.md), [changelog](https://github.com/nicobailon/pi-subagents/blob/1ac7b5e845fb54143bc16e973b38af1ed7f4670a/CHANGELOG.md), and [manifest](https://github.com/nicobailon/pi-subagents/blob/1ac7b5e845fb54143bc16e973b38af1ed7f4670a/package.json).

It is still a broad orchestration framework that overlaps `AgentRunner`, the deterministic workflow state machine, review gates, artifact handling, and tool allowlists. Its rapid release cadence and reliance on newer Pi APIs raise migration risk. At R2, evaluate one bounded architecture: use `pi-subagents` as an optional `AgentRunner` backend while retaining `runFeatureWorkflow` as the policy/state owner. That spike must first upgrade and verify Pi deliberately; do not make both systems competing workflow owners.

## `pi-grill-me`: already harvested

The upstream package’s best contribution is its operational gate: one focused question at a time, a persistent decision/checkpoint ledger, explicit output selection, and mutation blocked until planning is approved. Sources: [README at assessed commit](https://github.com/majorgilles/pi-grill-me/blob/e9d60ee74eb2dca130057d65179a1255eed66b95/README.md) and [design](https://github.com/majorgilles/pi-grill-me/blob/e9d60ee74eb2dca130057d65179a1255eed66b95/DESIGN.md).

Those ideas have already informed the local R0.1 grilling repair. Installing the package would add a second planning protocol. Keep only an optional behavioural comparison in the later trial phase.

## SEO/Growth plugin: yes to a local skill, no to the upstream runtime

There is a genuine local gap between framework-specific metadata advice and the existing performance-focused PageSpeed skill: no skill currently orchestrates Search Console, analytics, crawl findings, search performance, and business-prioritised SEO opportunities. A dedicated skill is therefore worthwhile.

The upstream repository is useful as a playbook catalogue, but not as an implementation base. It is an Antigravity plugin, not a Pi-native component, and its runtime starts three unpinned packages through `npx -y`. It centralises a service-account private key and other API keys in one credentials file. Its crawler and competitor tools accept arbitrary HTTP(S) targets and follow redirects without an adequate private-network/metadata SSRF boundary. It also exposes external mutations such as IndexNow submission without a sufficiently strong approval boundary. Sources: [repository at assessed commit](https://github.com/CheckSim/SEO-and-Growth-Agent-Plugin/tree/7b08bfbd593071c16a6619596367ba71f9a04c23), [runner](https://github.com/CheckSim/SEO-and-Growth-Agent-Plugin/blob/7b08bfbd593071c16a6619596367ba71f9a04c23/.agents/plugins/seo-growth-specialist/runner.js), [custom MCP tools](https://github.com/CheckSim/SEO-and-Growth-Agent-Plugin/tree/7b08bfbd593071c16a6619596367ba71f9a04c23/.agents/plugins/seo-growth-specialist/mcp-servers/seo-growth-tools), and [skill](https://github.com/CheckSim/SEO-and-Growth-Agent-Plugin/blob/7b08bfbd593071c16a6619596367ba71f9a04c23/.agents/plugins/seo-growth-specialist/skills/seo-growth/SKILL.md).

Some guidance also needs updating. Google has restricted FAQ rich results and deprecated HowTo rich results, so these should not be presented as broadly available growth tactics. `llms.txt` remains a community proposal, not an established search standard or demonstrated ranking factor. IndexNow acknowledges receipt, not indexing. Sources: [Google’s FAQ/HowTo change](https://developers.google.com/search/blog/2023/08/howto-faq-changes), [llms.txt proposal](https://llmstxt.org/), and [IndexNow documentation](https://www.indexnow.org/documentation).

### Proposed local skill boundary

Create an explicit-only skill under `extra/skills`, tentatively named `seo-audit`:

- Default to read-only evidence collection.
- Establish target site/property, comparison period, and business metric before analysis.
- Feature-detect available GSC, GA4, CrUX/PageSpeed, browser, or local-code tools; never assume credentials or connector availability.
- Combine search performance, analytics, technical crawl/code evidence, and PageSpeed findings into a prioritised table with impact, confidence, effort, evidence, and owner.
- Delegate performance-specific diagnosis to the existing PageSpeed skill instead of duplicating it.
- Treat GEO and `llms.txt` as experimental and label evidence quality explicitly.
- Never read repository credential files or store service-account keys in the skill.
- Require a separate explicit user request before IndexNow/sitemap submission, content publication, or any other external mutation.
- Cite current primary guidance, especially Google Search Central, for volatile recommendations.

Start with the skill instructions and reference playbooks only. Add tool integrations later, individually, with trust boundaries and tests. If mutation becomes valuable, split it into a separate action-oriented skill rather than weakening the audit skill’s default.

## Suggested roadmap delta

Do not rewrite the current roadmap merely to reflect this research. At the next deliberate roadmap edit:

- Keep R1.1 as the first experiment, updating its target from `pi-vcc` v0.7.x to v0.8.0 and recording that the earlier license concern is resolved.
- Add a small SEO-skill design/pilot item after the compaction trial; it is independent of the orchestration experiments and provides direct user value.
- Make observational memory a mutually exclusive alternative experiment triggered only by a failed `pi-vcc` coherence metric.
- Add CodeGraph only behind a measured large-repository navigation problem.
- Update R2’s `pi-subagents` note to test the Herdr/public-extension adapter shape after a deliberate Pi upgrade.
- Park `pi-async-fork`, `pi-search-hub`, and `pi-wait` until a concrete requirement changes the cost/benefit balance.

## Verdict

**selectively import**
