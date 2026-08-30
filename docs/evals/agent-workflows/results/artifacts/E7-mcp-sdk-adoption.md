# Should pi-brain adopt `@modelcontextprotocol/sdk`?

Date: 2026-08-30
Status: research report. No dependency was installed, no source file was modified, nothing was committed.

## Verdict (TL;DR)

**Reject — do not add `@modelcontextprotocol/sdk` as a dependency today.** Revisit at
Phase 2 ("external/MCP tool capability routing", SPEC §37) under the triggers listed at
the end. Two findings drive this:

1. **The named package is already the past.** `@modelcontextprotocol/sdk` is the v1
   line of the official TypeScript SDK. The SDK's stable release line is now **v2**,
   published 2026-07-27 as split packages (`@modelcontextprotocol/server`,
   `@modelcontextprotocol/client`) for the 2026-07-28 MCP spec, and v1 only "continues
   to receive bug fixes and security updates for **at least 6 months** after v2's
   release" ([SDK README, `main` branch](https://github.com/modelcontextprotocol/typescript-sdk#readme)).
   Any future adoption should target `@modelcontextprotocol/client` (v2), not `sdk` (v1).
2. **Nothing in the current MVP needs an MCP client or server.** The repo's own spec
   already forbids building one in the MVP (SPEC §26), Pi deliberately ships no
   built-in MCP, and a mature Pi ecosystem adapter (`pi-mcp-adapter`) already exists as
   the first candidate for the Phase 2 use case.

## Question and method

Question: *should this repository adopt `@modelcontextprotocol/sdk`?*

Method: verified facts against primary sources — the official MCP documentation and
spec (modelcontextprotocol.io), the official SDK repository and its v2 documentation
(ts.sdk.modelcontextprotocol.io), the npm registry/downloads APIs, the **installed**
Pi package (`@earendil-works/pi-coding-agent` 0.84.3, the local primary source closest
to the 0.84.2 this repo is typechecked against), and the `pi-mcp-adapter` package page
and README. Local claims are cited by file and line. Claims that go beyond what a
source states are labelled **[Inference]**.

## Verified upstream facts

### The MCP protocol

- MCP is an open standard for connecting AI applications to external systems
  ("USB-C port for AI applications"), with a **client-host-server architecture**: a
  host runs multiple clients; clients connect to servers that expose tools, resources
  and prompts over JSON-RPC 2.0. Sources:
  [What is MCP?](https://modelcontextprotocol.io/docs/getting-started/intro),
  [Architecture (2026-07-28 spec)](https://modelcontextprotocol.io/specification/2026-07-28/architecture).
- Two transports: **stdio** (local child process) and **Streamable HTTP** (remote,
  OAuth-recommended). Same JSON-RPC message format over both
  ([architecture, transport layer](https://modelcontextprotocol.io/specification/2026-07-28/architecture#transport-layer)).
- The latest spec revision is **2026-07-28**; prior revisions 2025-11-25, 2025-06-18,
  2025-03-26, 2024-11-05 (visible in the
  [docs index](https://modelcontextprotocol.io/llms.txt)). **Sampling is deprecated as
  of 2026-07-28**; elicitation is the retained mid-call client feature
  ([architecture, data layer](https://modelcontextprotocol.io/specification/2026-07-28/architecture#data-layer)).
  The protocol is still revising roughly every 6–12 months.

### The official TypeScript SDK

- Repository: [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)
  — "The official TypeScript SDK for Model Context Protocol servers and clients".
  MIT-licensed (npm package metadata), 13,281 stars, last push 2026-08-30: actively
  maintained (GitHub API, 2026-08-30).
- **v1 = `@modelcontextprotocol/sdk`** (the package named in the question). Latest
  1.30.0, published 2026-07-27; first 1.x release 2024-11-25; 74 1.x versions; ~52.1M
  downloads/week (npm registry + downloads API, 2026-08-30). Single package with **16
  runtime dependencies** — including `express`, `hono`, `cors`, `raw-body`, `jose`,
  `ajv`, `zod` — because it bundles both client and server machinery; deep file
  imports (`@modelcontextprotocol/sdk/server/mcp.js`), Node `>=18`
  ([npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk);
  [packages page, "Coming from v1?"](https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages)).
- **v2 is the stable line** (README, cited above): split into nine npm packages; the
  two starting points are [`@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server)
  (expose tools/resources/prompts) and [`@modelcontextprotocol/client`](https://www.npmjs.com/package/@modelcontextprotocol/client)
  (connect to servers and call them), both 2.0.0 published 2026-07-27. Adoptions after
  one month: ~5.0M/wk (server) and ~3.8M/wk) (npm downloads API, 2026-08-30).
- The v2 **client** is a `Client` + one transport (e.g. `StdioClientTransport`):
  `connect()` spawns the server, does the initialize handshake and owns the process
  lifetime; then `listTools()` / `callTool()`. Schema validation uses Standard Schema
  (Zod v4 / Valibot / ArkType). Node-only code is isolated behind a `./stdio` subpath
  export; the root entry is runtime-neutral. Source:
  [Build your first client](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client),
  [Packages and subpath exports](https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages).
- `@modelcontextprotocol/client` 2.0.0 has **7 runtime dependencies** (`zod ^4.2.0`,
  `jose`, `cross-spawn`, `eventsource`, `pkce-challenge`, `eventsource-parser`,
  `@modelcontextprotocol/core`), Node `>=20` (npm registry, 2026-08-30).

### The host: Pi has no built-in MCP — by design

- Pi's usage documentation, Design Principles: "It intentionally does not include
  built-in MCP, sub-agents, permission popups, plan mode, to-dos, or background bash.
  You can build or install those workflows as extensions or packages"
  (installed `@earendil-works/pi-coding-agent` 0.84.3, `docs/usage.md` ≈ line 308;
  same text at [pi.dev usage docs](https://pi.dev/docs/latest/usage)).
- Confirmed mechanically in the installed package: no `@modelcontextprotocol/*` in its
  dependency tree; the only `mcpServers` symbols in its bundle come from the Google
  GenAI SDK's Gemini converter (server-side Gemini MCP URL passthrough), not a client
  (inspection of `dist/bundle/chunks/chunk-GPPBJGBU.js`, 2026-08-30).
- How tools reach sessions (installed 0.84.3 `.d.ts`/`.js`, the API this repo builds
  on): `createAgentSession` loads **extensions through the `DefaultResourceLoader`**
  (`dist/core/sdk.js` line 268) and `AgentSession` binds their registered tools
  (`dist/core/agent-session.js`, `_applyExtensionBindings`). `DefaultResourceLoader`
  accepts `noExtensions` and `extensionsOverride` (`dist/core/resource-loader.d.ts`
  lines 77/84) — per-child extension visibility is a supported control point. An
  explicit `tools` allowlist ("only the listed tool names are enabled",
  `dist/core/sdk.d.ts` lines 35–43) filters **all** tools, including extension tools.

### The ecosystem alternative: `pi-mcp-adapter`

- [`pi-mcp-adapter`](https://pi.dev/packages/pi-mcp-adapter) ([GitHub](https://github.com/nicobailon/pi-mcp-adapter)):
  a third-party Pi extension (MIT, author nicopreme/nicobailon), v2.31.0 published
  2026-08-28, ~732K downloads/month, 12 dependencies + 4 peers, 2.7 MB (package page +
  registry, 2026-08-30).
- What it does: exposes MCP servers to Pi through **one proxy tool (~200 tokens)**
  instead of dumping every tool schema into context; servers start **lazily**; an
  opt-in `directTools` mode registers tools individually; OAuth tokens live in the OS
  credential store, URL-bound; approvals and output limits apply per call; it
  negotiates the MCP 2026-07-28 handshake with legacy fallback; other extensions can
  register servers at runtime through Pi's shared event bus without importing the
  adapter (README, cited links).
- It explicitly contemplates restricted children: "For a tool-restricted subagent,
  launch the child Pi with its tool allowlist set to `["mcpScript"]` … The adapter's
  ordinary lazy connection, authentication, output guard, abort handling, and approval
  gates still apply to every call", plus a `mcp:server-name` frontmatter syntax for
  the subagent extension (README, "Tool scripting" and "Subagent integration"
  sections). **[Inference]** that mechanism is documented for `pi`-CLI child
  processes, not for in-process `createAgentSession` children like pi-brain's; how
  approvals and auth dialogs surface inside pi-brain's in-memory, print-mode child
  sessions is untested — exactly the open questions this repo's own research note
  already lists (see Local evidence).
- Its README also records why MCP is not free: a single MCP server can cost 10k+
  tokens of tool definitions, citing
  [Mario Zechner's "why you might not need MCP"](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/).

## Local evidence (this repository)

- **What the repo is**: `pi-brain`, branch `pi-brain` — a Pi *package* (`package.json`
  `keywords: ["pi-package"]`) that orchestrates plan → develop → verify → independent
  review as `/feature`, with zero runtime dependencies: only `peerDependencies`
  (Pi packages + `typebox`) and `typescript` as devDependency (`package.json`).
  `docs/pi-brain/ARCHITECTURE.md:88`: "Config is JSON. **Zero dependencies.**"
- **The architecture rule**: "only `src/pi/` and `extensions/` may import Pi"
  (`docs/pi-brain/ARCHITECTURE.md:3`); the workflow core depends on ports
  (`AgentRunner`, `HumanInput`, `VerifyRunner`, `GitService`, `WorkflowEventSink`,
  `src/agent.ts`, `src/ports.ts`) and is fully testable with fakes
  (`tests/feature-workflow.test.ts`, `node --test`, no network).
- **The spec already answered this question for the MVP** — SPEC §26 "MCP and external
  tools" (`docs/pi-brain/SPEC.md:1664`): stay MCP-*compatible* but "Do **not**
  implement a complete proprietary MCP client in the MVP unless Pi currently provides
  an official primitive that makes it trivial. Instead: keep tool registration
  abstract; allow Pi extensions/tools installed by me to be visible to roles when
  explicitly allowed; allow role tool allowlists; avoid hard-coding tool names."
  §36 lists "MCP server implementation" as a **non-goal** (`SPEC.md:2036`); §37 puts
  "external/MCP tool capability routing" in **Phase 2** (`SPEC.md:2061`); §45 rules
  out becoming "a general-purpose MCP platform" (`SPEC.md:2470`).
- **Tool plumbing already fits MCP-shaped tools**: `AgentRunRequest.tools` is an
  allowlist and `resultTool`/custom tools are first-class (`src/agent.ts`);
  `PiAgentRunner` applies a read-only allowlist `["read","grep","find","ls"]` plus
  custom tools per child (`src/pi/pi-agent-runner.ts:42`, `resolveTools`). Extension
  tools are excluded from children **by pi-brain's own allowlist policy**, not by a
  Pi mechanism — `#buildLoader` builds a plain `DefaultResourceLoader` without
  `noExtensions` (`src/pi/pi-agent-runner.ts:158`), and the installed Pi loads and
  binds extension tools in such sessions (verified above).
- **The evaluation was already scheduled**: `docs/pi-brain/IDEAS.md:276` and
  `docs/pi-brain/research/atomic-and-pi-ecosystem.md:119` list `pi-mcp-adapter` with
  the open questions "role-scoped MCP visibility, child-session propagation, approval
  behavior, output limits and credential boundaries **before adoption**".
- **Maturity checkpoint**: the pipeline itself is mid-MVP — "developer → verify →
  reviewer have not yet [run against real models]" (`docs/pi-brain/ARCHITECTURE.md`,
  Known gaps). MCP routing is Phase 2 work behind features that don't exist yet
  (no `/setup`, `/review`, `/bugfix`; resume UX still missing).

## Inferences (clearly labelled)

- **[Inference]** *New value today ≈ zero.* The SDK's two capabilities map to (a)
  building an MCP **server** — a SPEC non-goal (§36); (b) building an MCP **client**
  to route external tools into role-scoped children — explicitly deferred to Phase 2
  (§26/§37). No current workflow phase, test or port requires either.
- **[Inference]** *Overlap is high.* As a client, the SDK would overlap with
  `pi-mcp-adapter`, which already solves the hard 80% (OAuth + OS credential store,
  lazy lifecycle, approvals, output guards, protocol-era negotiation, proxy-tool
  token economics) and is already this repo's scheduled first evaluation. As a
  server, it would overlap with what pi-brain already is: a Pi package exposing
  commands through Pi's extension API.
- **[Inference]** *Cost is real and immediate.* v1 would become the repo's **first
  runtime dependency**, dragging 16 packages (express, hono, cors, …) into a
  deliberately zero-dep engine, on a maintenance-capped line (~2027-01-27 at the
  latest guaranteed window), with deep-import paths that the v2 codemod exists to
  migrate away. v2 client is leaner (7 deps, Node ≥ 20 — satisfied wherever Pi runs,
  since Pi itself requires Node ≥ 22.19) but still buys nothing the MVP uses.
- **[Inference]** *Risk is modest but pointless to take now.* The SDK itself is
  official, MIT, massively adopted — low supply-chain risk. The real risks are
  (1) churn: the spec revises every ~6–12 months, v1→v2 proves APIs move, sampling
  is already deprecated; (2) credential/approval boundaries for MCP servers inside
  headless child sessions — the exact questions the repo's research note says must be
  answered *before* adoption; (3) context-window cost of tool schemas in children
  (10k+ tokens/server per `pi-mcp-adapter`'s README).
- **[Inference]** *Compatibility is good, and stays good by not adopting.* The ports
  architecture means a future MCP adapter would live in one `src/pi/`-style file
  behind a port (e.g. an `McpToolSource` feeding `customTools`), faked in tests.
  SPEC §26's "keep tool registration abstract" is precisely what preserves that
  option cheaply. Nothing in the SDK's design conflicts with the repo.
- **[Inference]** *Reversibility is highest before adoption, and the decision itself
  is reversible later.* Not adopting costs nothing (no code depends on MCP);
  adopting-then-reverting means removing a dependency tree, config surface and any
  MCP-shaped concepts that leaked into role prompts/allowlists. Deferring keeps all
  doors open; the Phase 2 trigger list below makes the revisit cheap to execute.

## Comparison with the current implementation

| Capability | Current implementation | With `@modelcontextprotocol/sdk` |
| --- | --- | --- |
| Tool protocol for children | Pi's `ToolDefinition`/`customTools` + allowlists (`src/agent.ts`, `src/pi/pi-agent-runner.ts`) | Unchanged — MCP tools would still be wrapped into `ToolDefinition`s by glue code |
| External tools (databases, browsers, APIs) | None in MVP; Phase 2 per SPEC §37 | Client SDK could fetch them, but `pi-mcp-adapter` already does this at the Pi layer with auth, approvals and lazy lifecycle |
| Structured results | `resultTool` capture (`buildResultTool`) | Unchanged |
| Server surface | `/feature`, `/flow` Pi commands (`extensions/pi-brain.ts`) | An MCP server would duplicate this for other hosts — a stated non-goal (§36/§45) |
| Dependencies | Zero runtime deps | +16 (v1) or +7 (v2 client) packages, first runtime dep of the engine |
| Tests | Deterministic, no network (`node --test`) | Adds a real-transport surface needing fakes/mocks, like `PiAgentRunner` needed `FakeAgentRunner` |

## Alternatives (realistic, in order)

1. **Status quo + keep the abstraction honest (recommended now).** Stay on SPEC §26:
   abstract tool registration, per-role allowlists, no hard-coded tool names. Cost:
   zero. This *is* the MCP-compatibility strategy.
2. **Trial `pi-mcp-adapter` at Phase 2 (first candidate).** Spike: install it as a Pi
   package, admit its proxy tool name to a research-capable role's allowlist, answer
   the five open questions from `atomic-and-pi-ecosystem.md:119` (role-scoped
   visibility, child-session propagation, approvals, output limits, credential
   boundaries) against a read-only server. It reuses Pi-level auth/approval machinery
   instead of re-implementing it inside pi-brain.
3. **Adopt `@modelcontextprotocol/client` (v2) as a port adapter (fallback).** Only if
   the adapter cannot serve `createAgentSession` children cleanly. Confine it to a
   `src/mcp/` adapter behind a port, faked in tests, per the existing architecture
   rule. Never start new integration code on the v1 `sdk` package.
4. **Hand-rolled minimal MCP client (rejected).** SPEC §26 explicitly forbids this in
   the MVP; JSON-RPC-over-stdio looks small but OAuth, protocol-version negotiation
   and cancellation are exactly the parts that rot.
5. **No MCP at all — CLI tools (credible null option).** Pi's own design stance and
   Mario Zechner's argument (cited by `pi-mcp-adapter`'s README) are that plain CLI
   tools often beat MCP for local, single-developer workflows; pi-brain's children
   already have `bash`. **[Inference]** for database/browser-class integrations MCP
   still wins on ecosystem breadth, which is why option 2 remains the Phase 2 default.

## Verdict motivation

| Axis | Assessment |
| --- | --- |
| **New value** | None for the current MVP (both use cases are non-goal/Phase 2). High only in a future where external tools must reach role-scoped children — and that value is obtainable via `pi-mcp-adapter` without owning the client. |
| **Overlap** | High: server role duplicates pi-brain-as-a-Pi-package; client role duplicates `pi-mcp-adapter` (which the repo already queued for evaluation). |
| **Cost** | Immediate and structural: first runtime dependency of a zero-dep engine; v1 = 16 deps + a maintenance window that ends ≈ 2027-01-27 + a known v1→v2 migration (codemod exists); v2 = 7 deps, Node ≥ 20. Plus ongoing cost of owning auth/approval/lifecycle for servers in child sessions. |
| **Risk** | SDK supply-chain risk is low (official, MIT, 52M/wk). Protocol churn is demonstrated (5 spec revisions in ~21 months; v1→v2 split; sampling deprecated). Child-session credential/approval semantics are unresolved. All risk is avoidable by deferring. |
| **Compatibility** | Technically excellent either way: ports architecture confines an adapter to one file; v2 client's Node ≥ 20 is satisfied under Pi's Node ≥ 22.19. Deferring does not erode compatibility — SPEC §26's abstractions are the compatibility guarantee. |
| **Reversibility** | Rejecting now is fully reversible (revisit anytime, `pi-mcp-adapter` trial or v2 client port adapter are both small, contained builds). Adopting v1 now creates guaranteed migration work later; even adopting v2 now would couple role prompts/allowlists/config to MCP concepts before any requirement exists. |

**Reject** is the only option whose worst case is "we lost nothing"; every other
option's worst case costs the zero-dependency property, migration work, or both, for
value no current phase can use.

## Revisit triggers (any one fires the Phase 2 evaluation)

1. Phase 2 "external/MCP tool capability routing" (SPEC §37) is scheduled into work.
2. A concrete role needs a tool only an MCP server provides (e.g. a browser or
   database server for the developer/researcher role) — not satisfiable by a CLI tool.
3. Pi ships an official MCP primitive (it currently and deliberately does not), which
   would per SPEC §26 change the calculus directly.
4. `pi-mcp-adapter`'s child-session story is validated (or invalidated) by the planned
   spike — that result decides between alternatives 2 and 3.

## Sources

- MCP docs and spec: <https://modelcontextprotocol.io/docs/getting-started/intro>,
  <https://modelcontextprotocol.io/specification/2026-07-28/architecture>,
  <https://modelcontextprotocol.io/llms.txt>
- Official TypeScript SDK: <https://github.com/modelcontextprotocol/typescript-sdk>
  (README, `main`), <https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages>,
  <https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client>
- npm registry/downloads (checked 2026-08-30):
  <https://www.npmjs.com/package/@modelcontextprotocol/sdk> (1.30.0, 52.1M/wk),
  <https://www.npmjs.com/package/@modelcontextprotocol/client> (2.0.0, 3.8M/wk),
  <https://www.npmjs.com/package/@modelcontextprotocol/server> (2.0.0, 5.0M/wk)
- Pi (installed 0.84.3 primary source): `docs/usage.md` (Design Principles),
  `dist/core/sdk.d.ts`, `dist/core/sdk.js`, `dist/core/resource-loader.d.ts`,
  `dist/core/agent-session.js`; <https://pi.dev/docs/latest/usage>
- pi-mcp-adapter: <https://pi.dev/packages/pi-mcp-adapter>,
  <https://github.com/nicobailon/pi-mcp-adapter> (README, `main`)
- Local: `package.json`, `docs/pi-brain/SPEC.md` (§26/§36/§37/§45),
  `docs/pi-brain/ARCHITECTURE.md`, `docs/pi-brain/IDEAS.md`,
  `docs/pi-brain/research/atomic-and-pi-ecosystem.md`, `src/agent.ts`,
  `src/pi/pi-agent-runner.ts`, `extensions/pi-brain.ts`
