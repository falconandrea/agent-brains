# Assessment: should pi-brain adopt `@modelcontextprotocol/sdk`?

**Mode:** assessment
**Date:** 2026-08-30
**Status:** report-only decision support — nothing installed, no source changed, nothing committed
**Question:** Should this repository (the `pi-brain` worktree: the Pi package that runs plan → develop → verify → review) adopt [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)?

## Executive summary

The TypeScript MCP SDK is healthy, official and actively maintained — but the exact
package named in the question is now the **v1 legacy line**. pi-brain has **zero runtime
dependencies by explicit design**, an existing written decision (SPEC §26) to stay
MCP-*compatible* without implementing an MCP client/server in the MVP, and no current
requirement that MCP addresses. The one plausible future need (role-scoped external
tools for child sessions) is blocked by a Pi limitation — child sessions built via
`createAgentSession` cannot see other extensions' tools — that an in-repo SDK does not
solve, and is already covered by an ecosystem alternative (`pi-mcp-adapter`) on the
IDEAS.md watchlist. Recommendation: **reject for now**, keep the SPEC §26 abstractions,
revisit on the triggers listed at the end.

---

## 1. Upstream facts (verified against primary sources)

### The named package is the v1 legacy line

- The `modelcontextprotocol/typescript-sdk` **`main` branch is v2**, published as
  **split packages** `@modelcontextprotocol/server` and `@modelcontextprotocol/client`,
  implementing the [2026-07-28 MCP spec](https://modelcontextprotocol.io/specification/2026-07-28).
  Source: [repo README (main)](https://github.com/modelcontextprotocol/typescript-sdk#readme), retrieved 2026-08-30.
- **v1 continues to receive bug fixes and security updates "for at least 6 months
  after v2's release"**; v1 source lives on the long-lived `v1.x` branch and v1 docs
  at [ts.sdk.modelcontextprotocol.io](https://ts.sdk.modelcontextprotocol.io/).
  Same source. v2.0.0 was published 2026-07-27 (npm), so the committed v1 support
  floor ends around **2027-01-27**.
- npm registry (retrieved 2026-08-30):
  - `@modelcontextprotocol/sdk` latest **1.30.0**, published 2026-07-27, MIT,
    **not marked deprecated**, Node ≥ 18.
  - `@modelcontextprotocol/server` latest **2.0.0**, published 2026-07-27;
    dependencies: `zod` + `@modelcontextprotocol/core` only.
- **Dependency weight differs sharply by line.** v1 `@modelcontextprotocol/sdk`
  1.30.0 carries 17 runtime dependencies, including `express@^5`, `hono`,
  `@hono/node-server`, `jose`, `ajv`, `ajv-formats`, `cors`, `raw-body`,
  `cross-spawn`, `eventsource`, `eventsource-parser`, `pkce-challenge`,
  `zod-to-json-schema` (npm registry metadata). v2 splits the web/OAuth machinery
  into optional middleware packages (`@modelcontextprotocol/node`, `/express`,
  `/fastify`, `/hono`) that are "intentionally thin adapters" (repo README).

### What the SDK provides

- MCP **server** libraries (tools/resources/prompts, Streamable HTTP, stdio, auth
  helpers), MCP **client** libraries (transports, high-level helpers, OAuth helpers),
  optional runtime middleware, runnable examples. Runs on Node.js, Bun and Deno
  (repo README).
- Tool and prompt schemas in v2 use
  [Standard Schema](https://standardschema.dev/) — "bring Zod v4, Valibot, ArkType,
  or any compatible library" (repo README).
- The protocol itself: JSON-RPC 2.0 between **hosts** (LLM applications),
  **clients** (connectors in the host) and **servers** (services providing context
  and capabilities); transports are *bindings* — **stdio** (newline-delimited JSON
  over a client-launched subprocess) and **Streamable HTTP** — with identical
  semantics on every transport
  ([spec overview](https://modelcontextprotocol.io/specification/2026-07-28),
  [transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)).

### Repository health

- 13,281 stars, not archived, last push 2026-08-30 (GitHub API). License: Apache-2.0
  for new contributions over an MIT base (README badge + LICENSE note; GitHub's API
  reports the combined file as "Other").
- Caveat: the project is **limiting pull requests to 1 per new contributor "while v2
  settles"** after the 2026-07-28 spec release (README warning banner) — v2 is
  brand-new and explicitly still stabilizing.

### Pi-harness facts (primary Pi sources)

- **Pi intentionally does not include built-in MCP**: "It intentionally does not
  include built-in MCP, sub-agents, permission popups… You can build or install
  those workflows as extensions or packages"
  ([Pi docs, usage.md](https://github.com/earendil-works/pi-coding-agent/blob/main/docs/usage.md)).
  There is therefore no harness-level MCP support to lean on — or to duplicate.
- The Pi ecosystem already has an MCP consumption path:
  [`pi-mcp-adapter`](https://pi.dev/packages/pi-mcp-adapter) (npm, v2.31.0,
  published 2026-08-28, MIT, ~732K downloads/month, 12 deps + 4 peers) — an
  extension that exposes MCP servers to Pi "without burning your context window"
  via ~one proxy tool (~200 tokens) with on-demand discovery. Pi's package page
  carries the standard warning: "Pi packages can execute code and influence agent
  behavior. Review the source before installing third-party packages."

---

## 2. Local evidence (this repository)

- **Zero runtime dependencies is a written invariant.** `package.json` has only
  `peerDependencies` (the three `@earendil-works/*` Pi packages + `typebox`) and one
  devDependency (`typescript`). SPEC.md records the same stance for config:
  "Config is JSON. Zero dependencies." (`docs/pi-brain/SPEC.md`, design decisions).
- **The architecture already isolates the volatile boundary.** "Only `src/pi/` and
  `extensions/` may import Pi… Pi's docs are unversioned and the API moves"
  (`docs/pi-brain/ARCHITECTURE.md`). All agent I/O flows through ports
  (`AgentRunner`, `HumanInput`, `VerifyRunner`, `GitService` — `src/agent.ts`,
  `src/ports.ts`) so the whole workflow unit-tests with fakes
  (`tests/feature-workflow.test.ts`).
- **Child agents are in-process Pi sessions, not protocol peers.** Each role runs
  via `createAgentSession` with typebox `defineTool` custom tools (`submit_review`
  result tool, `ask_user` bridge) and a built-in tool allowlist
  (`src/pi/pi-agent-runner.ts`). Tool "registration" is a function call inside one
  runtime; `src/pi/json-schema.ts` is a 60-line JSON-Schema→TypeBox converter that
  exists precisely to keep workflow code Pi-free.
- **SPEC §26 already decides the MCP question for the MVP** (`docs/pi-brain/SPEC.md:1664`):
  "I want the architecture to remain compatible with MCPs or other external tool
  integrations. Do **not** implement a complete proprietary MCP client in the MVP
  unless Pi currently provides an official primitive that makes it trivial. Instead:
  keep tool registration abstract; allow role tool allowlists; avoid hard-coding
  tool names." Every one of those "instead" items is already implemented
  (`AgentRunRequest.tools`, `readOnly`, `resultTool`, category-based skill routing).
- **MCP appears three times in the spec, all deferred or excluded**: "MCP server
  implementation" is a non-goal (`SPEC.md:2036`); "external/MCP tool capability
  routing" is a **Phase 2** item (`SPEC.md:2061`); "a general-purpose MCP platform"
  is on the never-turn-into list (`SPEC.md:2470`).
- **The ecosystem alternative is already on the watchlist.** IDEAS.md lists
  `pi-mcp-adapter` for "role-scoped tools (especially researcher/developer access),
  child-session propagation, approvals, output limits and credential boundaries",
  gated on "a concrete workflow need" (`docs/pi-brain/IDEAS.md:276`).
- **The real blocker for consuming MCP tools is a Pi limitation, not a missing SDK.**
  ARCHITECTURE.md documents why `pi-ask-user`/`pi-ask` were rejected: children are
  built via `createAgentSession` with explicit `customTools` and **cannot see other
  extensions' tools**; importing extension internals "would couple us to unexported,
  version-sensitive code". An in-repo MCP client would face the same wall — it would
  have to hand-bridge MCP tool schemas into Pi `ToolDefinition`s per child.
- **The project is pre-MVP-completion.** ARCHITECTURE.md known gaps: the
  developer → verify → reviewer half of the pipeline "ha[s] not yet" run against
  real models; `/setup`, `/review`, `/bugfix` do not exist yet; the ask-user bridge
  has open failure modes. Grep across `src/`, `extensions/`, `docs/pi-brain/` finds
  no MCP usage or import anywhere today.

---

## 3. Inferences (clearly labelled — not upstream facts)

- **Inference A: every concrete thing the SDK could do here is either a non-goal,
  a phase-2 item, or architecturally counterproductive.**
  1. *Expose pi-brain as an MCP server* (so Claude/Cursor could drive `/feature`):
     contradicts the written non-goal "MCP server implementation" and the positioning
     "Pi with a workflow supervisor, not like a CI server" (`SPEC.md:2214`).
  2. *Embed an MCP client so child roles can use external MCP servers*: this is
     exactly Phase-2 "external/MCP tool capability routing", and it is blocked by the
     child-session tool-visibility limitation above. The SDK would not remove the
     bridging work (MCP JSON-Schema → typebox `ToolDefinition`, lifecycle, approval
     policy); it would only add the transport layer underneath it.
  3. *Speak MCP between orchestrator and children*: strictly worse than the current
     in-process design. Children would become stdio subprocesses, losing typed
     `defineTool`, `session.subscribe` events (usage capture, `tool_execution_start`
     for `/flow status`), abort propagation and the fake-runner testability that the
     architecture is built around — in exchange for a protocol boundary nobody needs
     inside one process.
- **Inference B: adopting the *named* package would be adopting the wrong line.**
  `@modelcontextprotocol/sdk` is v1: 17 dependencies (express 5, hono, jose, …)
  bundled whether or not the web/OAuth surface is used, on a support floor ending
  ~2027-01-27. A hypothetical future adoption should target v2
  (`@modelcontextprotocol/server`/`client`), which is also young (2.0.0 on
  2026-07-27, PR-throttled "while v2 settles").
- **Inference C: the schema plumbing MCP would normalize is already solved locally,
  smaller.** `src/pi/json-schema.ts` covers exactly what result tools need and throws
  loudly on anything else. The v2 SDK's Standard Schema does not eliminate this
  converter, because Pi's `defineTool` still requires a typebox `TSchema`; the
  converter is the Pi boundary, not a protocol boundary.
- **Inference D: cost asymmetry favours waiting.** The MCP wire protocol is a
  published, stable spec; adopting later behind a port is cheap and reversible by
  construction. Adopting now would add a dependency category the repo has none of,
  during the SDK's own stabilization window, for a requirement that does not exist
  yet — and would have to be re-done on v2 when the need is real.

---

## 4. Comparison with the current implementation

| MCP concept | pi-brain today | Would the SDK replace it? |
| --- | --- | --- |
| Tool registration | `defineTool` + `customTools` per child (`src/pi/pi-agent-runner.ts`) | No — Pi's own API is the target format regardless |
| Tool input schema | JSON-Schema subset → TypeBox (`src/pi/json-schema.ts`) | No — converter is needed for Pi even with the SDK |
| Server/client transports (stdio, Streamable HTTP) | None — all boundaries are in-process ports, `child_process` shell, git CLI | Adds a transport where there is no process boundary |
| Host/client/server roles | Orchestrator (workflow) ↔ child sessions, both in one Node runtime | Not applicable; children are not independent services |
| Capability discovery / routing | Category-based skill routing + per-role tool allowlists (`src/skill-router.ts`) | Different problem (context curation, not wire discovery) |
| Structured results | `resultTool` spec + `validateReviewResult` | No — local pattern, no protocol involved |
| Auth/OAuth helpers | N/A (local tool) | Unused surface → dead dependency weight |

## 5. Realistic alternatives

1. **Status quo + SPEC §26 abstractions (recommended).** Tool registration stays
   abstract; role allowlists and category routing already provide the "capabilities,
   not tools" seam any future MCP layer would plug into.
2. **`pi-mcp-adapter` extension (ecosystem path, Phase 2).** When "external/MCP tool
   capability routing" is scheduled, evaluate it first — it is the Pi-native way to
   consume MCP servers and is already on the IDEAS.md watchlist. Known blockers to
   check first: child-session propagation (children can't see extension tools —
   same limitation that blocked pi-ask), approvals, output limits, credential
   boundaries. Review its source before installing (Pi's own security note).
3. **Hand-rolled minimal MCP client (JSON-RPC over stdio).** Explicitly forbidden by
   SPEC §26 unless Pi makes it trivial; listed only for completeness.
4. **Adopt the SDK behind a port (fallback if 2 fails).** If Phase 2 needs MCP
   semantics the adapter can't provide, wrap `@modelcontextprotocol/client` in a
   `ToolSource`-style port in `src/` with the adapter in `src/pi/` — keeping the
   zero-dep core intact and the choice reversible.

## 6. Evaluation

- **New value:** none for current requirements. Future value (role-scoped external
  tools, exposing the workflow remotely) is real but deferred to Phase 2 by the
  spec, and partially blocked by Pi child-session limitations regardless of SDK.
- **Overlap:** near-total with things Pi already provides (`defineTool`, sessions,
  events) and things pi-brain already solved smaller (schema converter, allowlists,
  routing). MCP's actual subject — cross-process tool interoperability — matches no
  boundary this repo has.
- **Cost:** v1 = 17 runtime deps including express 5/hono/jose (breaks the written
  zero-dependency invariant for unused surface); v2 = lighter but brand-new and
  explicitly stabilizing; either way, real integration cost bridging MCP tools into
  per-child `ToolDefinition`s plus an approval/policy layer the spec demands.
- **Risk:** dependency-line churn (v1 sunsetting floor ~2027-01-27, v2 settling),
  supply-chain surface going from 0 to 12–17 packages, third-party tool output
  entering the reviewer's evidence chain without a provenance policy, and effort
  diverted from an unfinished MVP (developer→verify→reviewer not yet run live).
- **Compatibility:** technically unproblematic (Node ≥ 18; ES2023 ESM; Standard
  Schema vs Pi's bundled typebox would need one verification). Architecturally it
  would cut against the repo's strongest rule — confine volatile third-party APIs
  to `src/pi/` — by adding a second volatile API surface.
- **Reversibility:** rejecting now is fully reversible: the port design means an
  MCP adapter can be added later without touching workflow code. Adopting now would
  be the less reversible move — a new dependency category plus bridging code that
  would need rework on v2 once a real requirement arrives.

## 7. Verdict

**Reject.** Do not adopt `@modelcontextprotocol/sdk` (nor the v2 split packages) in
pi-brain at this time. The repository's own spec already contains the right decision
(SPEC §26: stay compatible, don't implement an MCP client in the MVP), the current
architecture satisfies every "instead" clause of that section, and the only future
use case is a Phase-2 feature whose actual blocker — child sessions not seeing
extension tools — is a Pi limitation an in-repo SDK does not address. This rejection
is a "not now, and not this package": it is tied to this repository's stage and
invariants, not to any doubt about the SDK's quality.

**Revisit triggers** (any one is sufficient):

1. Phase-2 work on "external/MCP tool capability routing" is scheduled and a concrete
   workflow need is named (e.g. a `researcher` role needing a browser/search MCP server).
2. Pi exposes extension tools (or MCP) to child sessions built via `createAgentSession`
   — at that point re-evaluate `pi-mcp-adapter` first, the SDK second.
3. A concrete demand emerges to drive pi-brain workflows from an external MCP client
   (this would require revisiting the "no MCP server implementation" non-goal first).
4. The v2 line stabilizes (post-settling release cadence) **and** trigger 1 or 2 fires —
   any future adoption should target `@modelcontextprotocol/client`/`server` (v2),
   never the v1 `@modelcontextprotocol/sdk` name, whose support floor ends ~2027-01-27.

---

### Sources

- SDK repository (README, main branch): https://github.com/modelcontextprotocol/typescript-sdk
- npm: https://www.npmjs.com/package/@modelcontextprotocol/sdk · https://www.npmjs.com/package/@modelcontextprotocol/server
- MCP specification 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28 · transports: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
- SDK docs site (v2): https://ts.sdk.modelcontextprotocol.io/v2
- Pi docs — usage (no built-in MCP): https://github.com/earendil-works/pi-coding-agent/blob/main/docs/usage.md
- pi-mcp-adapter package page: https://pi.dev/packages/pi-mcp-adapter
- Local: `package.json`, `docs/pi-brain/SPEC.md` (§26 “MCP and external tools”, plus the non-goals, Phase-2 and “do not turn this project into” lists), `docs/pi-brain/ARCHITECTURE.md`, `docs/pi-brain/IDEAS.md` (Pi plugin watchlist), `src/agent.ts`, `src/pi/pi-agent-runner.ts`, `src/pi/json-schema.ts`, `extensions/pi-brain.ts`
