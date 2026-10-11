# Assessment of the web ChatGPT Pi-package proposal

Date: 2026-10-11

Mode: assessment

Local baseline: `main`, `73acb85`; working tree clean before this report.

Scope: the supplied conversation, current implementation, existing specifications,
execution roadmaps, and relevant upstream sources. This report does not change
the roadmap or authorize installations. No package trial or live SDK validation
was performed.

## Judgment

The proposal is sound as a conservative package shortlist. It correctly keeps
`pi-brain` authoritative over workflow transitions and treats upstream packages
as optional capabilities. It is incomplete as a development priority list for
the whole repository: it underweights known verification defects and overlooks
the free-form entry router, quick workflow, Herdr visibility, and shared-skill
work already assessed locally.

## Local evidence

### Implemented capabilities

- [`src/workflows/feature.ts`](../../src/workflows/feature.ts) owns planning,
  validated PRD/tasks, approval and bounded revisions, development, verification,
  independent structured review, bounded fixes, and approved-spec hash checks.
- [`src/pi/pi-agent-runner.ts`](../../src/pi/pi-agent-runner.ts) creates an
  in-memory session for each call, applies role models, filters skills, supplies
  result/question tools, passes tool allowlists, and disposes the session afterward.
- [`src/workflows/resume.ts`](../../src/workflows/resume.ts) reconstructs workflow
  state from persisted events. It does not restore the previous child transcript.
- [`src/run-lock.ts`](../../src/run-lock.ts) and
  [`src/shell.ts`](../../src/shell.ts) provide the workflow's one-writer lock and
  snapshot-based diff accounting. These are workflow protections, not a sandbox
  for arbitrary third-party extension code.
- [`docs/plans/agent-workflow-improvements.md`](../plans/agent-workflow-improvements.md)
  records promoted research assessment (W4) and explicit solution capture with
  fresh-session retrieval (W1). W2 specialist review and W3 graduated planning
  remain deferred on evidence. R0 context hygiene, grilling repair, context audit,
  and the optional complexity-review pilot are recorded in the
  [plugin roadmap](../plans/pi-plugin-adoption-roadmap.md).
- [`README.md`](../../README.md) describes the shared canonical skill store,
  stack profiles and consumer setup. The repository's value extends beyond Pi;
  Pi-only extensions do not automatically improve Codex/OpenCode workflows.

The web chat's description of the core is substantially supported. Its phrase
“test” should be read as deterministic configured/resolved verification, rather
than a separately invoked tester role. Current runtime claims here are based on
code inspection and recorded evidence, not a fresh execution of the harness.

### Current defects should precede optional engine integration

The [code-review follow-up task list](../../.ai/features/code-review-follow-ups/tasks-code-review-follow-ups.md)
records T1–T3 complete and T4–T10 pending. Two pending requirements are directly
visible in current code:

1. `resolveStack()` in `feature.ts` replaces detected metadata with empty arrays
   when a primary stack is configured. `resolveVerifyCommands()` in
   [`src/verify.ts`](../../src/verify.ts) uses capabilities and package managers,
   so an override can lose automatic Pint/PHPStan checks or select npm.
2. `ShellVerifyRunner` in `shell.ts` has cancellation but no finite command
   timeout. A hanging check can keep the run and repository lock occupied.
   The follow-up requires process-tree cleanup evidence, not just shell killing.

T9 also calls for verified dependency/runtime compatibility. All Pi/typebox peer
ranges in [`package.json`](../../package.json) are `*`, while the lockfile and
recorded spike use Pi `0.84.2`. Lockfile pinning is therefore not a general
consumer compatibility guarantee.

### Previously assessed future product work

The [dynamic harness assessment](./dynamic-harness-and-seo-integration-assessment.md)
already identifies the free-form experience as the missing product layer:

```text
user request
  -> typed classification signals
  -> deterministic route policy
  -> continue / research / diagnose / quick / feature
```

It proposes a labelled evaluation corpus, shadow routing, a bounded quick
workflow reusing lock/baseline/verify/review, user overrides, and optional Jev
classification. These are research recommendations, not approved execution
tasks. Their product value should nevertheless be considered when prioritizing
new work: compaction and diagnostics do not remove the need to choose `/feature`
or the planning ceremony for a tiny change.

[`IDEAS.md`](../pi-brain/IDEAS.md) records the Herdr direction: visible role panes,
agent state and activity across projects, with `AgentRunner` as the backend seam
and `runFeatureWorkflow` retaining policy/state ownership. Current SDK children
are in-memory; installing a terminal UI does not make them visible automatically.

The [ecosystem follow-up assessment](./pi-ecosystem-followup-assessment.md) already
prefers the simpler web-access direction and proposes a shared SEO audit skill.
`IDEAS.md` explicitly watchlists `pi-web-access` and `pi-mcp-adapter`. Web access
is therefore a useful reaffirmation, rather than a new local discovery.

## Upstream facts and verification limits

- The [VCC manifest](https://github.com/sting8k/pi-vcc/blob/master/package.json)
  confirms `0.10.0`, MIT, algorithmic summaries without model calls, and a declared
  Pi range `>=0.74.0 <2.0.0`. Its
  [compaction hook](https://github.com/sting8k/pi-vcc/blob/master/src/hooks/before-compact.ts)
  distinguishes Pi's self-resume behavior at `0.84.4`. Declared compatibility
  does not substitute for the local continuation/recall trial.
- [Lens](https://github.com/apmantza/pi-lens) provides diagnostics as well as
  formatters, autofix and broader analysis. Upstream revisions and catalog/cache
  snapshots differ; choose an exact revision for the trial rather than treating
  the chat's `4.4.2` as a stable target. Its support for secondary sessions does
  not establish that the local runner loads and enables the extension correctly.
- The [web-access README](https://github.com/nicobailon/pi-web-access/blob/main/README.md)
  confirms search/fetch capabilities and provider configuration. Dynamic tool
  activation requires Pi `0.86.0+`; older Pi exposes enabled tools eagerly. That
  is an additional compatibility detail for the current `0.84.2` environment.
- The adapter's
  [semantic search](https://github.com/nicobailon/pi-mcp-adapter/blob/main/semantic-search.ts)
  and [Jev client](https://github.com/nicobailon/pi-mcp-adapter/blob/main/jev-client.ts)
  implement optional semantic ranking after candidate filtering, abstention, and
  lexical fallback for service failures. Semantic mode must be enabled; Jev is
  not the ordinary lexical search path.
- [Official Pi MCP documentation](https://pi.dev/docs/latest/mcp) confirms native
  MCP, codemode and deferred discovery. It also explicitly states that SDK
  sessions do not load built-in extensions: MCP, codemode and tool-search must
  be added to the resource loader as needed. An extension registering `/mcp`
  replaces built-in session MCP support. Compare native SDK integration first.

These upstream checks support the conversation's main technical argument. No
runtime propagation, package performance or end-to-end compatibility claim is
established by inspecting documentation/source alone.

## Inferences and recommendations

### Compaction: preserve the first trial, scope the benefit correctly

Keep R1.1 first within the existing plugin track. Evaluate the main interactive
session separately from a long-running child invocation. Fresh per-role child
sessions already prevent the whole parent transcript from accumulating across
workflow stages, although a single child may still become long enough to compact.

`/flow resume` and transcript recall solve different problems. A trial should
prove preservation of approved scope, unresolved failures, evidence references,
branch boundaries, recall accessibility and exactly one continuation. It should
also demonstrate that installing the extension preserves the workflow's resume
behavior; it should not imply the compactor supplies resume itself.

Measure actual context reduction, task success, latency and usage against a
baseline. Deterministic summary construction does not guarantee that every
semantically important decision survives.

### Diagnostics: valuable hypothesis, integration needs proof

The developer's no-shell policy makes early diagnostics attractive. However,
`resolveTools()` combines an explicit role allowlist with locally constructed
custom tools. Discovering an extension is distinct from enabling its tools for a
child, and receiving hook output is another integration concern. A successful
parent-session demonstration does not establish child-session usefulness.

Keep the existing read-only trial: prove child hook loading, fresh diagnostic
delivery, no mutations, and at least one shorter real fix loop. If all that is
needed is bounded read-only diagnostics, compare a narrow diagnostics tool with
the complete Lens package. Never bypass the developer's no-shell policy to make
the integration convenient.

### Jev: distinguish entry routing from tool discovery

Jev was already considered for entry classification. Its use for semantic MCP
tool ranking is a separate, relevant implementation reference. Both should
follow the same boundary: local code authorizes candidates, semantic judgment
ranks or classifies them, and local policy chooses what can execute.

Do not add a generalized semantic discovery layer before there is a concrete
authorized tool set that is hard to navigate. For entry routing, define the
policy and evaluation set first, then compare Jev with deterministic heuristics
and a small conventional model. Probability output alone does not establish
calibrated correctness.

### Plan annotation: a possible adapter, not necessarily a competing workflow

The current gate already supports approval, revision notes and cancellation.
Visual annotation would improve the interaction rather than fill a missing
revision capability. Upstream offers standalone document annotation as well as
its own planning mode ([README](https://github.com/backnotprop/plannotator)).
The [Pi extension](https://github.com/backnotprop/plannotator/blob/main/apps/pi-extension/index.ts)
also controls planning/execution phases and tool scope; its plan-review fallback
can auto-approve when UI/assets are unavailable. That behavior must not replace
the current headless Cancel default.

A future narrow adapter could map visual feedback onto the existing
`HumanInput` decision and revision notes, leaving validation and hash freezing
in `runFeatureWorkflow`. Two workflow owners are a risk of adopting the complete
planning mode, not an unavoidable property of visual annotation.

### Priority proposal

This is a proposed order, not a roadmap edit:

1. Finish concrete verification repairs T4 and T5–T6; address verified
   compatibility T9 alongside the decision about the SDK target.
2. Keep R1.1 as the first isolated plugin trial. Before running it, pin an
   explicit upstream revision and compatible Pi version.
3. For the next product tranche, decide whether the dominant pain is choosing
   workflows/planning small changes or observing active agents. The former
   points to entry-policy/shadow-routing and a quick workflow; the latter to the
   first Herdr observability slice. Neither requires replacing the engine.
4. Trial web access independently if Pi research is a recurring need; trial Lens
   when child diagnostic feedback has a clear measurable target.
5. Keep Jev optional, visual annotation optional, and broad delegation packages
   conditional on their recorded revisit triggers.

Revisit this ordering if measurements show that compaction loss or diagnostic
delay dominates actual work, or if visibility/steering needs trigger the
`AgentRunner` backend experiment. Preserve one active item per execution track
and do not turn the shortlist into a bundled installation.

## Verdict

**selectively import**

Retain the proposal's workflow ownership rule, isolated trial discipline and
semantic-ranking reference. Reconcile its priority list with the known defects
and the already-assessed product direction before changing the execution roadmap.
