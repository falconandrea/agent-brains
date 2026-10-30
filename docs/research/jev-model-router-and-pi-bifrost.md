# JEV model router and Pi-Bifrost

Date: 2026-10-11
Mode: research

## Assessment

Yes: the general idea was already assessed in the 2026-09-21 report on
free-form Pi and entry routing. The Reddit thread and Pi-Bifrost add a concrete
implementation and two constraints to keep explicit: pinning the main session
better preserves cache locality, while children that load Bifrost can lose an
explicit model assignment. Bifrost can be a classification/routing adapter,
but it does not replace local workflow policy.

## What the thread proposes

The author proposes `prompt → JEV → model`, using JEV to choose among limited
options and deterministic code to apply the choice. The comments suggest the
workflow most relevant to this repository: pin the main model with `/bifrost pin`, route children/subagents separately, and use a more expensive router only
for ambiguous cases. The valid concern is the prompt cache: changing
provider/model every turn can fragment the cache. These are claims from the
discussion, not an independent verification
([thread Reddit](https://www.reddit.com/r/PiCodingAgent/comments/1wlczow/i_think_i_found_the_best_use_case_for_jev_and_pi/)).

## Verified upstream facts

### Bifrost separates classification from selection

Pi-Bifrost is a Pi extension, not a proxy: it configures tiers such as `quick`,
`general`, and `frontier`, filters unhealthy models, and applies a strategy
(`first`, price, context, or `random`) to the tier pool. A classifier chooses
only the tier; it does not see the provider pool or select the exact model. The
source pipeline runs, in order, overrides/direct rules, local cache, direct
classifier, prompt classifier, regex rules, and default
([README](https://github.com/iamaamir/pi-bifrost/blob/main/README.md),
[configuration](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/configuration.md),
[classification-pipeline.ts](https://github.com/iamaamir/pi-bifrost/blob/main/classification-pipeline.ts)).

This confirms the architectural formula already used: probabilistic judgment
proposes a category, while Bifrost and local code preserve eligibility, policy,
and executable selection.

### What JEV receives and returns

The TypeSafe/Jev backend receives the current prompt and tier criteria; it
returns a configured tier, probabilities for the tiers, and a confidence
score. By default, it does not receive history, files, tool output, or the
model pool. It is a hosted TypeSafe endpoint that requires a credential; the
upstream implementation does not expose local transport or a generic OpenRouter
base URL
([classifier guide](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/classifiers.md),
[typesafe-classifier.ts](https://github.com/iamaamir/pi-bifrost/blob/main/typesafe-classifier.ts)).

Confidence measures how concentrated the distribution is, not correctness.
Bifrost documentation reports an exploratory evaluation with stable judgments
on clear prompts, but also high-confidence under-routing for mechanically small
tasks with high consequences. This is a material limitation for a `quick`
policy based only on confidence; criteria should be versioned and tested on
representative cases
([classifier guide, TypeSafe/Jev section](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/classifiers.md)).

### Fallback, timeouts, and circuit breaker

The configuration sets a confidence threshold, typically `0.8`, and a
`prompt` or `regex` fallback. A response below the threshold becomes a “miss,”
and the pipeline can continue to the prompt classifier, rules, and default.
Missing credentials, timeouts, network errors, invalid responses, rate limits,
or an open circuit follow the same fallback path; direct transport uses limited
retries and does not automatically resend the user prompt to another model.
Reliability circuits persist to prevent further attempts against the failed
backend/model
([classifiers guide](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/classifiers.md),
[typesafe-classifier.ts](https://github.com/iamaamir/pi-bifrost/blob/main/typesafe-classifier.ts),
[reliability guide](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/reliability-and-cache.md)).

### Cache: two different mechanisms

Bifrost has a local classification cache: it stores normalized prompt terms and
the selected tier to avoid reclassification. It does not store responses or
report hits, duration, or provider prompt-cache savings; normalized terms may
still be sensitive.

The provider prompt/prefix cache remains managed by Pi and the provider. Each
provider/model pair has an independent history: in the `A → B → A` sequence, A
can reuse the still-valid prefix from its previous request, while content
added during B is an uncached tail. Bifrost does not guarantee cache hits,
savings, or lower latency. Pinning is therefore the right choice for a long,
iterative session where continuity matters more than task fit
([prompt-caching guide](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/prompt-caching.md)).

The documented pattern is exactly the one from the thread: `main session → pinned
model`, unassigned children → their own routing. The pin is local to the session
and does not propagate to children. A child that loads Bifrost starts unpinned,
and Bifrost cannot distinguish its initial model from an explicit role
assignment; if a child model must stay fixed, that child must not load Bifrost
([routing controls](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/routing-controls.md),
[prompt-caching guide](https://github.com/iamaamir/pi-bifrost/blob/main/docs/guide/prompt-caching.md)).

## Local evidence

The previous analysis had already proposed an `EntryDecision` with intent,
scope, risk, ambiguity, and confidence, along with deterministic policy, shadow
mode, an evaluation set, and a `runQuickWorkflow`; Jev was suggested as an
optional adapter after defining policy and test cases
([dynamic harness assessment](./dynamic-harness-and-seo-integration-assessment.md)).

The more recent report also separated entry routing from semantic discovery of
tools: authorization and policy must remain local, while a classifier can only
classify or rank candidates ([web chat package assessment](./web-chat-pi-packages-assessment.md)).
I found no JEV/Bifrost code or dependency in the repository; the lockfile uses
Pi `@earendil-works/pi-coding-agent` `0.84.2`
([package-lock.json](../../package-lock.json#L544)).

This creates an immediate compatibility constraint: Bifrost `0.4.5` declares
Pi `1.0.1` as its minimum, so it cannot be installed for a trial on the current
Pi without a separate upgrade and spike
([pi-bifrost package.json](https://raw.githubusercontent.com/iamaamir/pi-bifrost/main/package.json)).

In addition, `PiAgentRunner` creates isolated child sessions, applies skill and
tool allowlists, and explicitly resolves provider/model by role. An assigned
provider must remain assigned to preserve, among other things, review
independence; the resource loader is built for each child
([pi-agent-runner.ts](../../src/pi/pi-agent-runner.ts#L167)). A Bifrost extension
loaded indiscriminately in children could interfere with that contract, so the
“main pinned, child routed” pattern applies only to children without a fixed
assignment, or requires explicitly excluding Bifrost.

## Alternatives mentioned in the thread

[Von](https://github.com/wfzyx/von) is a local Apache-2.0 decision model,
compatible with the `/v1/systemone` wire protocol, but its README warns that it
is English-only and confidence may degrade outside its distribution. [Laya](https://github.com/NandhaKishorM/laya)
is an Apache-2.0 decision engine described as multilingual, with a router
between checkpoints. These are interesting alternatives for a future
`ClassifierBackend` interface, but Bifrost currently targets the fixed TypeSafe
endpoint: neither is a configuration change the package already supports.

## Project implications

1. The new material reinforces, but does not change, the chosen direction:
   define policy, an evaluation set, and fallback first; then try JEV in shadow
   mode as an optional adapter.
2. Do not use JEV to authorize workflows, tools, writes, approvals, or
   destructive actions. Local policy must block the `quick` tier when risk,
   consequence, or ambiguity is present, even with high confidence.
3. The first useful experiment should measure the main session and children
   separately: effective model, cache reads/writes if available, latency, cost,
   selected route, under-routing, and fallback. Token savings alone are not
   enough.
4. For our specific child roles, keep Bifrost out of roles with a
   provider-specific model (especially independent review) until an integration
   preserves explicit assignments.
5. Treat the Pi upgrade as an independent technical prerequisite, not as a
   hidden part of any JEV trial.

No installation, code change, or live trial was performed.
