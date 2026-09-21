# Dynamic harness and SEO integration assessment

Date: 2026-09-21

Mode: assessment

Scope: the future free-form Pi experience, Jev/System One, LangChain.js/LangGraph.js, Mastra, Pi upgrades, and the relationship between a shared SEO skill and `~/dev/ga-analytics` (SEOFlux).

This is an architecture assessment only. It does not change the current roadmap, install dependencies, or modify either application.

## Executive answer

The desired experience is a good target and is closer than it appears. The difficult part—the safe implementation pipeline—already exists. `runFeatureWorkflow` owns planning, a human approval gate, development, deterministic verification, independent review, bounded repair, persisted run logs, resume, and a manual final commit boundary. The main missing product layer is a free-form entry router plus a smaller workflow for low-risk work.

Jev is relevant to that entry router. It is not a workflow engine: it makes fast typed decisions from state. LangGraph and Mastra are workflow runtimes, but adopting either now would duplicate the strongest part of `pi-brain`. The immediate opportunity is to add dynamic routing in front of the existing deterministic workflow, not replace the workflow underneath it.

The SEO skill should be shared through `agent-brains` and installed into the `laravel-analytics` profile. SEOFlux should own the product implementation of the same audit method: data acquisition, historical storage, deterministic signals, UI, schedules, and user-facing recommendations. The skill and the application should share a result contract, not a runtime dependency.

## Current problem

The user must currently choose `/feature` before the harness knows whether the request is a conversation, a tiny change, an ambiguous product problem, or a full feature. `/feature` is safe but intentionally applies the same planning ceremony to every implementation request.

## The 10-star experience

The user opens Pi and describes an outcome in normal language. The harness:

1. Distinguishes conversation, diagnosis, research, and requested repository mutation.
2. Assesses ambiguity, scope, reversibility, security/data risk, and confidence.
3. Asks questions only when the answers can materially change the result.
4. Routes low-risk work to a quick implementation flow and larger work to the existing feature flow.
5. Escalates uncertainty rather than silently guessing.
6. Runs the appropriate checks and an independent review.
7. Repairs bounded failures automatically.
8. Returns only when it needs a decision or when a reviewed diff is ready for the user's final validation and manual commit.

The user should not need to know whether the internal route was `quick`, `grill`, `feature`, or `research` unless they want to inspect or override it.

## What already exists

Local evidence:

- `src/workflows/feature.ts` is already a deterministic state machine whose model calls operate inside phases rather than deciding arbitrary phase transitions.
- `src/pi/pi-agent-runner.ts` provides isolated child sessions, role-specific model selection, skill filtering, tool allowlists, structured result tools, cancellation, and human-input bridging.
- Verification runs before reviewer tokens are spent; blocking failures return to the developer.
- The reviewer is read-only and returns a validated structured result.
- The run lock enforces one writer per repository.
- `.pi/pi-brain/runs/*.jsonl` persists events, and `/flow resume` reconstructs the first incomplete develop/verify/review phase with the original baseline.
- Several real `/feature` runs have completed end to end, according to `docs/pi-brain/README.md`.
- The workflow never commits. The reviewed working tree and the human's manual commit are already the final validation boundary requested here.
- `docs/pi-brain/IDEAS.md` already describes a `direct | pipeline | subagent` triage orchestrator; it has not been designed or implemented.

Pi 0.84.2 already exposes the extension `input` event before skill/template expansion. A handler may continue, transform, or fully handle the free-form input. The proposed UX therefore does not require a new Pi capability; it requires careful routing and lifecycle design. Local evidence: `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` and `dist/core/agent-session.js`.

## What is actually missing

### 1. An explicit route contract

Do not ask one model to emit an unconstrained “workflow plan”. Define a small decision object, for example:

```ts
type EntryDecision = {
  intent: "conversation" | "diagnose" | "research" | "change";
  route: "continue" | "quick" | "grill" | "feature" | "delegate";
  scope: "tiny" | "small" | "medium" | "large";
  risk: "read_only" | "low" | "elevated" | "high";
  ambiguity: "low" | "medium" | "high";
  confidence: number;
  reasons: string[];
};
```

The classifier proposes facts; deterministic policy selects the executable route. Examples:

- Any auth, permissions, migration, dependency, deployment, secret, destructive operation, or cross-cutting change cannot use `quick` solely because a model called it easy.
- Low confidence routes to clarification or the safer feature path.
- A read-only question continues in the parent conversation.
- Only bounded, reversible changes with a known verification command qualify for `quick`.

### 2. A real quick workflow

“Direct” must not mean giving the long-lived parent unrestricted write authority. Add a small deterministic `runQuickWorkflow` that reuses the existing ports and invariants:

```text
baseline + lock
  -> short read-only reconnaissance
  -> bounded developer
  -> targeted verification
  -> lightweight independent review
  -> final summary; no commit
```

It should omit PRD/task artifacts and the full plan-approval gate, but retain the baseline, one-writer rule, developer no-shell policy, checks, review, bounded retry, event log, and manual commit boundary.

For the MVP, the reconnaissance must reject the quick route before writes if the task exceeds its envelope. Automatic mid-flight promotion after partial edits is harder because `/feature` currently takes its own baseline. A later unified run envelope could preserve one baseline while promoting `quick` to `feature`; do not make that a prerequisite for the first useful version.

### 3. A routing evaluation set

The central failure is not a malformed JSON response; it is a plausible but wrong route. Create a small labelled corpus from real requests:

- expected route;
- risk flags;
- whether questions were necessary;
- acceptable alternate route;
- cost of over-routing versus under-routing.

Run the router in shadow mode before it controls execution. Log its proposed route while preserving today's explicit behaviour. Measure at least:

- unsafe under-routing rate;
- unnecessary planning rate;
- unnecessary human-interruption rate;
- route latency and cost;
- overrides by the user;
- quick tasks that later exceeded their envelope.

Under-routing should be weighted much more heavily than over-routing.

### 4. An escape hatch and user override

Every routed run needs a visible route and a cheap override. A compact UI is enough:

```text
Route: quick change (low risk, 1–2 files expected)
Override: feature | grill | keep chatting
```

For high-confidence, low-risk requests that already explicitly authorize a change, this can be a transient notice rather than another mandatory dialog. Elevated-risk or ambiguous work should still require clarification or plan approval.

## Jev/System One

Jev consumes state plus typed atomic questions and returns `Choice`, `Score`, or `Noul` results with probability information; Choice and Score also expose confidence. Questions are evaluated independently and in parallel. TypeSafe explicitly recommends decomposing complex judgments into atomic questions and composing the result in code. Sources: [TypeSafe introduction](https://docs.typesafe.ai/introduction), [confidence guidance](https://docs.typesafe.ai/confidence), and [patterns](https://docs.typesafe.ai/patterns).

That shape is a strong fit for entry triage:

```text
free-form request + repository signals
  -> Jev atomic judgments
     - is mutation requested?
     - likely scope?
     - ambiguity?
     - security/data/migration risk?
     - best candidate route?
  -> deterministic local policy
  -> continue / quick / grill / feature / delegate
```

Jev does not execute workflows, generate plans, persist state, resume jobs, or manage human-in-the-loop. It also cannot guarantee a semantically correct decision: schema conformance prevents invented output shapes, not selection of the wrong valid option. TypeSafe's own guidance says thresholds must be calibrated on the specific use case and scaled with risk. The public model is new and early access, and the launch performance claims are vendor results. Sources: [launch article](https://typesafe.ai/blog/introducing-system-one-models-and-jev) and [official TypeScript SDK](https://github.com/typesafe-ai/typesafe-sdk-js).

Recommended use:

- Make it an optional `EntryClassifier` adapter behind a local interface.
- Start in shadow mode against a deterministic/LLM baseline.
- Batch several atomic routing judgments into one call.
- Use conservative confidence thresholds learned from local requests.
- Fall back to clarification or the feature pipeline when unavailable or uncertain.
- Never let it waive approval, tool, Git, or destructive-action policies.

Jev could be excellent here, but only after the route policy and evaluation set exist. Otherwise it makes an unmeasured routing decision faster.

## LangChain.js, LangGraph.js, and Mastra

These tools address a different layer from Jev.

| Technology | What it provides | Fit here |
|---|---|---|
| Jev | Typed probabilistic judgments and routing signals | Optional entry-classifier adapter |
| LangChain.js | Model/tool integrations and prebuilt agent loops | Mostly duplicates Pi's runtime role |
| LangGraph.js | Low-level state graph, persistence, durable execution, interrupts, streaming, human-in-loop | Strong concepts, but substantial overlap with `runFeatureWorkflow`, run logs, and resume |
| Mastra | TypeScript agents plus schema-backed workflows, branching, suspend/resume, storage, Studio and observability | Useful for an AI application/service; too broad for the next harness increment |

LangGraph is explicitly a low-level orchestration runtime that mixes deterministic and agentic nodes and supplies persistence and human-in-the-loop. Its state/checkpoint/error model is worth studying, especially the rule that raw state should be persisted and prompts formatted inside nodes. It can be used without LangChain. Sources: [LangGraph overview](https://docs.langchain.com/oss/javascript/langgraph/overview) and [workflow design guide](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph).

Mastra workflows define schema-backed steps and composed control flow, with suspension, resumption, streaming, shared state, nested workflows, and visual run inspection. These are real capabilities, not merely agent wrappers. Source: [Mastra workflow documentation](https://mastra.ai/docs/workflows/overview). Mastra's core is primarily Apache-2.0, with separate enterprise terms for `ee/` directories, which adds a license boundary that would need care if adopted. Source: [Mastra license](https://github.com/mastra-ai/mastra/blob/main/LICENSE.md).

Neither framework supplies the product policy that is currently missing: what qualifies as small, when ambiguity warrants grilling, which risks force a plan, and when the human must be interrupted. Porting now would replace tested local machinery without solving that decision problem.

Revisit LangGraph if multiple distinct durable workflows make the home-grown event/replay system the dominant maintenance cost. Revisit Mastra if `agent-brains` becomes a hosted or multi-user AI application needing its own storage, server, visual studio, telemetry, and deployment surface. Until then, import their design patterns, not their runtimes.

## Pi upgrade policy

Updating Pi is not an architectural blocker and should no longer count as a negative adoption criterion by itself. It is a compatibility tranche:

1. Choose a target version required by the candidate, rather than upgrading blindly.
2. Update the lock and typecheck the isolated Pi adapter surface.
3. Rerun the Pi capability spike, especially input interception, child sessions, tool allowlists, dialogs, cancellation, result tools, and compaction hooks.
4. Run the unit suite and one real end-to-end feature.
5. Record behavioural changes before enabling a new extension.

The isolation rule—only `src/pi/` and `extensions/` import Pi—makes this intentionally manageable. The upgrade enables newer `pi-subagents`, `pi-wait`, and `pi-async-fork`; it does not remove their overlap, safety, or product-need concerns. Version compatibility becomes a gate and test cost, not a reason to reject an otherwise useful design.

## SEO skill and SEOFlux (`ga-analytics`)

### Why integration makes sense

SEOFlux already owns almost every data source the proposed skill would want:

- GSC page/query snapshots and period comparisons;
- GA4 page, channel, and site metrics;
- sitemap and live page crawling;
- Core Web Vitals history and regression logic;
- deterministic proactive alerts;
- cannibalisation analysis;
- queued AI site-health and CTR reports;
- stored results, scheduling, and a user interface.

Local evidence includes `GoogleSearchConsoleService`, `GA4Service`, `GscPerformanceService`, `PageCrawlerService`, `SitemapCrawlerService`, `CoreWebVitalsService`, `AlertEngineService`, `SEOIntelligenceService`, `GeminiService`, and `GenerateSiteHealthReport` in `~/dev/ga-analytics`.

It would be wasteful for the skill to reproduce those services through ad hoc API calls. Conversely, putting all SEO methodology only inside SEOFlux would make the audit unavailable when working on another repository or a site not yet connected to the product.

### Correct ownership split

| Shared `seo-audit` skill | SEOFlux application |
|---|---|
| Audit procedure and evidence hierarchy | OAuth, GSC/GA4 ingestion and persistence |
| Current Search Central guidance | Historical comparisons and deterministic metrics |
| Questions needed to establish target and goal | Crawl jobs and Core Web Vitals jobs |
| Tool capability detection | Site/page UI and scheduled execution |
| Common prioritisation rubric | Product-specific scoring and alert thresholds |
| Output schema and mutation approval rules | Stored audit runs, dismissals, ownership, localisation |
| Repository/code inspection instructions | APIs/MCP/tools exposing trusted first-party data |

The shared boundary should be a versioned result contract rather than shared executable business logic. A minimal audit result could contain:

- finding ID and category;
- affected site/page/query;
- observed evidence and period;
- impact, confidence, and effort;
- recommendation and acceptance check;
- source freshness/availability;
- whether the recommendation is read-only or requires an external mutation.

The skill can emit this shape during interactive audits. SEOFlux can later implement the same shape as a native DTO/service and persist it. If SEOFlux exposes a read-only MCP or CLI surface in the future, the skill can use that trusted interface instead of handling Google credentials itself.

### Distribution

Keep one canonical `seo-audit` skill in `agent-brains`, explicit-only initially, and add it to `profiles/laravel-analytics.list` so it is installed for SEOFlux alongside the existing PageSpeed capability. It should remain reusable from other profiles/projects when deliberately enabled.

Do not embed the entire skill prompt in SEOFlux's runtime or make application behaviour depend on a locally installed agent skill. Product behaviour belongs in tested Laravel services; agent operating procedure belongs in `agent-brains`.

## The MVP fix

Build the smallest slice that proves the desired interaction without replacing the runtime:

1. Upgrade Pi in a separate compatibility change and rerun the existing spike/tests.
2. Define `EntryDecision`, deterministic route policy, and a labelled evaluation corpus.
3. Attach a shadow-mode handler to Pi's `input` event; log recommendations without changing execution.
4. Implement `runQuickWorkflow` by reusing the existing lock, baseline, agent, verify, review, event, and result ports.
5. Enable free-form routing only after shadow results meet conservative under-routing criteria; preserve explicit `/feature` and `/quick` overrides.
6. Add Jev as one optional classifier implementation and compare it against a small conventional model and deterministic heuristics.
7. Create the shared explicit-only `seo-audit` skill and add it to `laravel-analytics`; separately design SEOFlux's native audit-result contract.

This produces the visible value: the user stops choosing a workflow manually for obvious requests, while the existing safety boundaries remain authoritative.

## Risks

- A fast typed classifier can still choose the wrong valid route.
- Intercepting every prompt can make ordinary conversation feel controlled or surprising; `continue` must be a first-class route.
- A “quick” path that quietly grows into feature work is the largest safety risk; enforce a narrow envelope before writes.
- Two orchestration runtimes create ambiguous ownership of state, retries, cancellation, and approval.
- Automatic questions can become more annoying than `/feature`; measure interruption rate.
- Adding automatic commit would weaken the current final human boundary. Keep no-commit as the default.
- The SEO skill and SEOFlux can drift unless their result vocabulary and evidence rules are versioned deliberately.

## Distance to the target

The execution core is already most of the way there. Planning, human approval, implementation, verification, review, repair, persistence, resume, and final manual commit are real and exercised. The missing work is concentrated in two substantial slices:

1. a tested entry router plus policy;
2. a quick workflow that retains safety without producing a full PRD.

After those, Herdr/`pi-subagents` can improve visibility and execution backends, and Jev can improve routing latency/cost. They are refinements, not prerequisites for the core experience.

## Revisit triggers for an external workflow runtime

Reconsider LangGraph or Mastra only when at least one is true:

- three or more distinct durable workflows duplicate checkpoint/retry/resume code;
- workflows routinely suspend for hours or days on external events;
- state migrations and replay become a major maintenance burden;
- a hosted, multi-user control plane is required;
- visual graph authoring/inspection is a product requirement rather than a development convenience.

Before those triggers, the migration cost is larger than the missing value.

## Verdict

**selectively import**

