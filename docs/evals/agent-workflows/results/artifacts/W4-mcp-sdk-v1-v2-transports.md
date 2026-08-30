# Research: MCP TypeScript SDK v1 (`@modelcontextprotocol/sdk`) vs v2 (`@modelcontextprotocol/client`) — client transports and package organization, and how they relate to pi-brain's child-session tooling

**Mode:** research (neutral comparison — no recommendation, ranking, or verdict)
**Date:** 2026-08-30
**Status:** report-only decision support — nothing installed, no source changed, nothing committed
**Method:** every upstream claim below was verified on 2026-08-30 against primary sources: the npm registry API (package manifests for all ten published `@modelcontextprotocol/*` names) and the `modelcontextprotocol/typescript-sdk` repository (`main` = v2, `v1.x` = v1) at file level, plus the official migration guide and versioning policy shipped in that repo. Local claims cite files in this repository at the paths shown. Inferences are labelled as such in §4.

---

## 1. Upstream facts — the two release lines at a glance

| | v1 | v2 |
| --- | --- | --- |
| npm name | `@modelcontextprotocol/sdk` | `@modelcontextprotocol/client` (client role) |
| Latest (2026-08-30) | 1.30.0, published 2026-07-27 | 2.0.0, published 2026-07-27 |
| Deprecated on npm? | No (dist-tag `latest` = 1.30.0) | Current stable line |
| MCP spec revision | earlier line (v1 README links the spec draft) | [2026-07-28 spec](https://modelcontextprotocol.io/specification/2026-07-28) |
| Node engines | `>=18` | `>=20` |
| Runtime dependencies | **17** (incl. `express@^5.2.1`, `hono@^4.11.4`, `@hono/node-server`, `jose`, `ajv`, `ajv-formats`, `cors`, `raw-body`, `express-rate-limit`, `content-type`, `cross-spawn`, `eventsource`, `eventsource-parser`, `pkce-challenge`, `json-schema-typed`, `zod ^3.25||^4.0`, `zod-to-json-schema`) | **7** (`zod ^4.2.0`, `jose ^6.1.3`, `cross-spawn ^7.0.5`, `eventsource ^3.0.2`, `pkce-challenge ^5.0.0`, `eventsource-parser ^3.0.0`, `@modelcontextprotocol/core` 2.0.0) |
| Support statement | "v1.x continues to receive bug fixes and security updates for at least 6 months after v2's release" (v2.0.0 published 2026-07-27 → committed floor ≈ 2027-01-27) | "v2 is the stable release line" ([repo README, main](https://github.com/modelcontextprotocol/typescript-sdk#readme)) |
| Docs site | [ts.sdk.modelcontextprotocol.io](https://ts.sdk.modelcontextprotocol.io/) | [ts.sdk.modelcontextprotocol.io/v2](https://ts.sdk.modelcontextprotocol.io/v2/) |

Sources: [npm `@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) · [npm `@modelcontextprotocol/client`](https://www.npmjs.com/package/@modelcontextprotocol/client) · [repo README (main)](https://github.com/modelcontextprotocol/typescript-sdk#readme), all retrieved 2026-08-30.

---

## 2. Upstream facts — package organization

### 2.1 v1: one monolithic package

- One npm package, `@modelcontextprotocol/sdk`, contains the client, the server, shared protocol code, types, JSON-Schema validation providers and experimental modules. Its `exports` map (verified from the published 1.30.0 manifest) is: `.` (full root barrel at `dist/esm/index.js`), a **`./*` wildcard** (any deep path under `dist/esm/*`), plus `./client`, `./server`, `./validation`, `./validation/ajv`, `./validation/cfworker`, `./experimental`, `./experimental/tasks`. Dual build: `dist/esm` (import) and `dist/cjs` (require) per subpath.
- Web-framework integration (Express, Hono, rate limiting, CORS, raw body parsing, OAuth Authorization-Server helpers) is compiled **into the same package as direct runtime dependencies** — the 17-dependency list in §1 is what any installer of the package receives, including a client-only consumer.
- v1 source layout on the [`v1.x` branch](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x): `src/client/*`, `src/server/*`, `src/shared/*`, one tree, one package.
- Schema style: Zod-centric; v1 has a *required peer dependency* on `zod` (v1 README: "This SDK has a **required peer dependency** on `zod`").

### 2.2 v2: split packages in a pnpm monorepo

The `main` branch is a workspace monorepo (`packages/*`), publishing (all verified on npm, all 2.0.0, published 2026-07-27, Node ≥ 20):

| Package | Role | Dependencies / peers |
| --- | --- | --- |
| `@modelcontextprotocol/client` | client implementation | 7 deps (§1); no peers |
| `@modelcontextprotocol/server` | server implementation | `zod`, `@modelcontextprotocol/core`; no peers |
| `@modelcontextprotocol/core` | public Zod `*Schema` constants | `zod` |
| `@modelcontextprotocol/core-internal` | internal, **private: true, not published** ("do not import from it directly" — migration guide) | — |
| `@modelcontextprotocol/node` | Node `IncomingMessage`/`ServerResponse` Streamable HTTP adapter | dep `@hono/node-server`; **peers** `hono` + `@modelcontextprotocol/server` |
| `@modelcontextprotocol/express` | Express adapter | dep `cors`; **peers** `express` + `server` |
| `@modelcontextprotocol/fastify` | Fastify adapter | no deps; **peers** `fastify` + `server` |
| `@modelcontextprotocol/hono` | Hono adapter | no deps; **peers** `hono` + `server` |
| `@modelcontextprotocol/server-legacy` | frozen v1 copies (e.g. removed SSE **server** transport, AS auth helpers) as migration bridge | v1-style dep set (`cors`, `raw-body`, `express-rate-limit`, …); peer `express` |
| `@modelcontextprotocol/codemod` | automated v1→v2 migration tool | `ts-morph`, `commander`, `fast-glob` |

Key organizational facts, verified from the [migration guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md) and [VERSIONING.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/VERSIONING.md):

- The framework adapters are "intentionally thin adapters: they should not introduce new MCP functionality or business logic" (repo README), and — unlike v1 — **declare their framework as a peer dependency** ("v1 shipped them as direct deps" — migration guide, *Packaging & runtime*).
- `core`, `client`, `server`, `server-legacy`, `codemod` form a **fixed version group** that always releases together with the same version; the middleware packages version alongside them (VERSIONING.md).
- v2 is "ESM-first but ships a CommonJS build alongside ESM", with a flat `dist/` of `.mjs`/`.cjs` siblings (migration guide).
- Tool/prompt schemas moved to [Standard Schema](https://standardschema.dev/) ("bring Zod v4, Valibot, ArkType, or any compatible library" — repo README), with `zod ^4.2.0` as v2's own dependency.
- The client package additionally ships **runtime-conditional builds**: its `exports` map includes a `./_shims` entry with `workerd` / `browser` / `node` conditions (`shimsWorkerd`, `shimsBrowser`, `shimsNode` source files exist under `packages/client/src/`), and `./validators/ajv` + `./validators/cf-worker` subpaths — the v2 client is designed to bundle for browser/edge runtimes, not only Node (verified from `packages/client/package.json` on `main`).

---

## 3. Upstream facts — client transports

### 3.1 v1 client transports (`src/client/` on the `v1.x` branch, all reachable via the `./*` wildcard or the `./client` barrel)

| Transport | File | Status / notes (verified at source) |
| --- | --- | --- |
| `StdioClientTransport` | [`src/client/stdio.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/client/stdio.ts) | Spawns the server (`cross-spawn`); `StdioServerParameters` = `command`, `args`, `env` (defaults from `getDefaultEnvironment()`), `stderr`, `cwd`, `maxBufferSize` (default 10 MB) |
| `StreamableHTTPClientTransport` | [`src/client/streamableHttp.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/client/streamableHttp.ts) | HTTP transport per the modern spec line; resumption tokens (`StartSSEOptions.resumptionToken` / `onresumptiontoken`), reconnection options (initial 1000 ms, max 30000 ms, growth 1.5, 2 retries) |
| `SSEClientTransport` | [`src/client/sse.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/client/sse.ts) | Legacy HTTP+SSE; **JSDoc `@deprecated` in 1.30.0**: "Prefer to use StreamableHTTPClientTransport where possible… some servers are still using SSE, clients may need to support both transports during the migration period" |
| `WebSocketClientTransport` | [`src/client/websocket.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/client/websocket.ts) | Ships in the package (importable via the `./*` wildcard path) but is **not exported from the `client` barrel**; not a spec transport |
| `InMemoryTransport` | `src/inMemory.js` (referenced by the migration guide) | Linked-pair transport for tests, no network/process |

- Client-side fetch middleware lives at `@modelcontextprotocol/sdk/client/middleware.js`; the `FetchLike` type lives at `sdk/shared/transport.js` (migration guide, *Imports & transports*).
- `ClientOptions` (v1 `src/client/index.ts`): `capabilities`, `jsonSchemaValidator` (default `AjvJsonSchemaValidator`), protocol options.

### 3.2 v2 client transports (`packages/client/` on `main`, npm 2.0.0)

| Transport | Import location | Status / notes (verified at source) |
| --- | --- | --- |
| `StreamableHTTPClientTransport` | **root barrel** `@modelcontextprotocol/client` | Remote servers; docs' default example ([`docs/clients/connect.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/connect.md)); exposes `StreamableHTTPClientTransportOptions`, `StreamableHTTPReconnectionOptions`, `ReconnectionScheduler`, `StartSSEOptions` types at root |
| `SSEClientTransport` (+ `SseError`) | **root barrel** | Retained as an explicit fallback for "servers that predate Streamable HTTP": try Streamable HTTP, catch, retry on a fresh `Client` (connect.md, *Fall back to SSE*). "Whichever branch returns, the `Client` behaves the same from here on — nothing downstream depends on the transport." |
| `StdioClientTransport` (+ `StdioServerParameters`, `getDefaultEnvironment`, `DEFAULT_INHERITED_ENV_VARS`) | **`@modelcontextprotocol/client/stdio` subpath only** | "Imported separately from the root entry so that bundling `@modelcontextprotocol/client` for browser or Cloudflare Workers targets does not pull in `node:child_process`, `node:stream`, or `cross-spawn`" (`packages/client/src/stdio.ts` header). The root-barrel omission is deliberate and documented: "The package root barrels do **not** export these (the root entries are runtime-neutral so browser/Workers bundlers can consume them)" (migration guide). Spawn lifecycle: "close stdin, then `SIGTERM`, then `SIGKILL`" (connect.md) |
| `InMemoryTransport` | root barrel of **both** `client` and `server` | Re-exported from each; "The two packages bundle separate copies with private state, so the halves of a linked pair must come from the **same package's** import" (migration guide) |
| `WebSocketClientTransport` | — | **Removed**: "WebSocket is not a spec transport. Use `StreamableHTTPClientTransport` for remote servers or `StdioClientTransport` for local servers; the `Transport` interface is exported if you need a custom implementation" (migration guide) |
| Custom | `Transport` interface exported (from `@modelcontextprotocol/core-internal/public`, re-exported at the client root) | Supported extension point; see [`docs/advanced/custom-transports.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/advanced/custom-transports.md) |

Transport-adjacent v2 client surface at the root barrel (verified from [`packages/client/src/index.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/index.ts)):

- **Client core**: `Client`, `ConnectOptions`, `CallToolRequestOptions`, `McpSubscription`; `getServerVersion()` / `getServerCapabilities()` / `getInstructions()` valid after `connect()` (connect.md).
- **Version negotiation for the 2026-07-28 era**: `ClientOptions.versionNegotiation` — default `'legacy'` (plain 2025 sequence), opt-in `'auto'` probes with `server/discover` (client.ts JSDoc).
- **Cacheable requests**: `CacheableRequestOptions`, `CacheMode`/`CacheScope`, `InMemoryResponseCacheStore`, `MAX_CACHE_TTL_MS`.
- **Multi-round-trip tools** (2026-07-28 revision): `InputRequiredOptions`, `withInputRequired`.
- **Middleware at the root barrel** (moved from v1's `client/middleware.js`): `createMiddleware`, `applyMiddlewares`, `withLogging`, `withOAuth`, `Middleware` — "The call signatures are unchanged from v1 (`Middleware` is still `(next: FetchLike) => FetchLike`) — only the import path changes" (migration guide).
- **Expanded auth surface**: `auth()`, `OAuthClientProvider`, plus new provider classes — `ClientCredentialsProvider`, `PrivateKeyJwtProvider`/`StaticPrivateKeyJwtAuth`, `CrossAppAccessProvider` and JWT-auth-grant helpers (crossAppAccess.ts) — and typed OAuth error classes (`IssuerMismatchError`, `InsufficientScopeError`, …).
- **`fromJsonSchema`**: runtime-aware wrapper producing Standard-Schema-compatible inputs (shadows core's version with an optional validator).
- Import-path deltas codified by the official codemod: `@modelcontextprotocol/sdk/client/stdio.js` → `@modelcontextprotocol/client/stdio`; `sdk/client/middleware.js` → root of `@modelcontextprotocol/client`; `sdk/inMemory.js` → root of `client` or `server`.

Net transport-set difference (v1 → v2): same two spec transports (stdio, Streamable HTTP) plus a retained-but-legacy SSE client and the in-memory pair; the WebSocket client is gone; stdio moved behind a dedicated subpath whose stated purpose is keeping process-spawning Node APIs out of runtime-neutral bundles; the in-memory transport gained a same-package-copy constraint.

---

## 4. Inferences (clearly labelled — not upstream facts)

- **Inference A — the SDK transports and pi-brain's child sessions live at different boundaries.** Every transport in both lines (stdio subprocess, Streamable HTTP, SSE, in-memory linked pair) exists to carry JSON-RPC across a process or network boundary, with an `initialize` handshake and capability negotiation. pi-brain's child sessions are created by an in-process library call — `createAgentSession({ cwd, sessionManager, modelRuntime, resourceLoader, model, customTools, tools })` in `src/pi/pi-agent-runner.ts` — with typed `defineTool` callbacks, `session.subscribe` events, and `AbortSignal` propagation. No transport, handshake, or serialization step exists or is needed on that path today. The one true subprocess boundary in pi-brain is `ShellVerifyRunner` / `RealGitService` (`src/shell.ts`, plain `child_process`), which speaks no protocol at all.
- **Inference B — the packaging split maps differently onto this repo's invariants depending on line.** v1's monolith would bring 17 runtime dependencies — including two HTTP server frameworks (`express@^5`, `hono`) and `ajv` — into a repository whose `package.json` currently has zero runtime dependencies (peerDependencies + one devDependency only), regardless of which surface was used. v2's client package carries 7 dependencies and no HTTP framework, and its `./stdio` subpath exists specifically to keep spawning-related dependencies (`child_process`, `cross-spawn`) out of bundles that don't spawn — a bundling concern that only matters if a consumer actually spawns servers. This is an observation about dependency shape, not a selection.
- **Inference C — the v1 version range already appears in this repo's dependency-graph metadata, uninstalled.** `package-lock.json` records `@modelcontextprotocol/sdk ^1.25.2` solely as an **optional peer dependency of `@google/genai` 1.52.0** (itself an optional peer inside the locked `@earendil-works/pi-coding-agent` 0.84.2 tree); `node_modules/@modelcontextprotocol` does not exist. No v2 package name (`@modelcontextprotocol/client` etc.) appears anywhere in the graph. So today the repo's toolchain *references* the v1 line's name and range while containing neither line's code.
- **Inference D — the version-support window and the repo's timeline interact.** v1's committed bug-fix/security floor (≥ 6 months after 2026-07-27 ≈ 2027-01-27) and v2's "stable release line… while v2 settles" PR-throttling are upstream facts; the repo's own timeline (pre-MVP: developer→verify→reviewer not yet run live, per ARCHITECTURE.md known gaps) is local. Any date-sensitive reading that combines them is an inference, not a fact.
- **Inference E — the child-session tool-visibility limitation, not the SDK's transport set, is the structural join point.** ARCHITECTURE.md documents that children built via `createAgentSession` with explicit `customTools` cannot see other extensions' tools, and that importing extension internals was rejected as "unexported, version-sensitive code". Both SDK lines expose MCP servers' tools *to the process that owns the MCP client transport*; neither line changes what a Pi child session created by `createAgentSession` can see. Under both v1 and v2, an MCP-consumed tool would still have to be re-registered as a Pi `ToolDefinition` (typebox parameters) inside each child — the same bridging shape `src/pi/json-schema.ts` (JSON-Schema→TypeBox) and `AgentRunRequest.resultTool` already implement for local result tools. SPEC §26's "keep tool registration abstract; allow role tool allowlists; avoid hard-coding tool names" is the seam any such bridge would occupy, in either line.
- **Inference F — the transport differences that matter at this repo's boundary are the ones about *where code can run*, not *how it talks*.** v2's root-barrel-is-runtime-neutral design (browser/workerd shims, stdio subpath, validator subpaths) and v1's Node-assumed monolith describe where a client can be bundled. pi-brain's orchestrator is a Node process embedding Pi; it has no browser/edge constraint, so the subpath split's practical effect here would be limited to import paths (`@modelcontextprotocol/client/stdio` vs `…/sdk/client/stdio.js`) and dependency weight — again an observation about fit of mechanisms, not a choice.

---

## 5. Side-by-side summary

### Client transports

| Capability | v1 `@modelcontextprotocol/sdk` 1.30.0 | v2 `@modelcontextprotocol/client` 2.0.0 |
| --- | --- | --- |
| stdio | `StdioClientTransport`, root/client barrel + deep path `sdk/client/stdio.js` | `StdioClientTransport`, **only** via `@modelcontextprotocol/client/stdio` subpath |
| Streamable HTTP | `StreamableHTTPClientTransport` | `StreamableHTTPClientTransport`, root barrel; same class name |
| SSE (legacy) | `SSEClientTransport` (`@deprecated` JSDoc) | `SSEClientTransport` + `SseError`, root barrel; documented fallback pattern |
| WebSocket | `WebSocketClientTransport` in package (not in barrel) | **removed** ("not a spec transport") |
| In-memory pair | `sdk/inMemory.js`, single shared copy | re-exported from **both** `client` and `server`; halves must come from the same package |
| Custom transport | `Transport` interface (`sdk/shared/transport.js`) | `Transport` interface re-exported at client root (via core-internal/public) |
| Fetch middleware | `sdk/client/middleware.js` deep path | root barrel export, unchanged signature `(next: FetchLike) => FetchLike` |
| Client options | `capabilities`, `jsonSchemaValidator` (Ajv default) | adds `versionNegotiation` (`'legacy'` default / `'auto'` probe), `inputRequired` (multi-round-trip), cacheable-request options; runtime-selected validator default |
| Auth on transports | `authProvider?: OAuthClientProvider` on HTTP/SSE transports | widened to `AuthProvider`; new providers (client-credentials, private-key-JWT, cross-app/JWT grants), typed OAuth errors |

### Package organization

| Aspect | v1 | v2 |
| --- | --- | --- |
| Packages | 1 monolith | 10: `client`, `server`, `core`, `core-internal` (private), `node`/`express`/`fastify`/`hono` (middleware), `server-legacy`, `codemod` |
| Client's runtime deps | 17 (incl. express 5, hono, ajv…) | 7 (no HTTP framework, no ajv in client; ajv behind `validators/ajv` subpath) |
| Framework adapters | compiled in, direct deps | optional middleware packages, framework as **peer dep** |
| Exports map | `.` + `./*` wildcard + `./client` `./server` `./validation/*` `./experimental/*` | named subpaths only: `.` `./stdio` `./validators/ajv` `./validators/cf-worker` `./_shims` (workerd/browser/node conditions) |
| Module format | dual `dist/esm` + `dist/cjs` per subpath | ESM-first + CJS, flat `.mjs`/`.cjs` siblings |
| Node engines | ≥ 18 | ≥ 20 |
| Schemas | Zod (required peer, v3.25+ compat) | Standard Schema (Zod v4 bundled) |
| Versioning | single package, `release-X.Y` npm dist-tags for patches (VERSIONING.md) | fixed group (`core`/`client`/`server`/`server-legacy`/`codemod` release together) |

---

## 6. How the differences relate to this repository's Pi child-session tooling (facts + labelled inference)

Verified local facts:

- **The repo depends on no MCP package.** `package.json` (pi-brain) declares only peerDependencies on `@earendil-works/pi-coding-agent` `*`, `@earendil-works/pi-ai` `*`, `@earendil-works/pi-tui` `*`, `typebox` `*`, and a `typescript` devDependency. The lock file's single MCP reference is the optional-peer trail in §4-C. Grep across `src/`, `extensions/`, `spike/`, `tests/` finds no `modelcontextprotocol` import.
- **The Pi harness itself contains no MCP SDK.** The locked `@earendil-works/pi-coding-agent` is 0.84.2 (lock) and the globally installed one is 0.84.3; neither's dependency list contains any `@modelcontextprotocol/*` package. Pi's docs state: "It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode, to-dos, or background bash. You can build or install those workflows as extensions or packages" ([docs/usage.md](https://github.com/earendil-works/pi-coding-agent/blob/main/docs/usage.md), confirmed in the local install at that path).
- **Child-session tooling is in-process and Pi-typed.** `src/pi/pi-agent-runner.ts` (self-described as "THE ONLY FILE THAT TOUCHES THE PI SDK", with `src/pi/human-input.ts` and `extensions/pi-brain.ts`) creates children via `createAgentSession` with typebox `defineTool` custom tools (`submit_review`-style result tools, the `ask_user` bridge), a built-in tool allowlist (`read`, `grep`, `find`, `ls` for read-only roles), per-role skill routing via `DefaultResourceLoader.skillsOverride`, `SessionManager.inMemory`, event subscription for usage/trace, and abort propagation. Workflow code never sees Pi: it talks to the `AgentRunner` port (`src/agent.ts`) — `AgentRunRequest` carries `tools`, `readOnly`, `resultTool` (a JSON-Schema-ish `parameters` object converted to TypeBox by `src/pi/json-schema.ts`).
- **Written decisions already frame MCP for this repo.** SPEC §26 (`docs/pi-brain/SPEC.md:1664`): stay MCP-*compatible*, do **not** implement an MCP client in the MVP unless Pi makes it trivial; keep tool registration abstract; role allowlists; no hard-coded tool names. "MCP server implementation" is a non-goal (`SPEC.md:2036`); "external/MCP tool capability routing" is Phase 2 (`SPEC.md:2061`); "a general-purpose MCP platform" is on the never-list (`SPEC.md:2470`). `docs/pi-brain/IDEAS.md:276` watchlists the ecosystem extension `pi-mcp-adapter` (role-scoped tools, child-session propagation, approvals, output limits, credential boundaries). A prior **assessment** note on the v1 package already exists at `docs/pi-brain/research/mcp-typescript-sdk-assessment.md` (2026-08-30, mode: assessment).

Relation, as inference (extends §4-A/E): the v1↔v2 differences documented above — transport relocation/removal, monolith→split, dep count, Node floor, spec era — all describe how a *process* speaks MCP to another *process*. pi-brain's child-session tooling speaks no protocol: its "transport" is the `AgentRunner` function-call port, its "tool registration" is a `ToolDefinition[]` array passed to `createAgentSession`, and its "capability negotiation" is the deterministic skill router + role allowlists in `src/`/`src/skill-router.ts`. Consequently the observable touchpoints between the two subjects are: (1) the optional-peer metadata reference to v1's package name in the lock file (§4-C); (2) the SPEC §26 abstraction seam, which is where any future MCP client — v1 or v2, or the ecosystem `pi-mcp-adapter` extension — would attach without altering workflow code; and (3) the child-session tool-visibility limitation, which is a Pi-harness property upstream of both SDK lines.

---

### Sources

**Primary (upstream), retrieved 2026-08-30:**
- npm registry manifests: [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (1.30.0), [`client`](https://www.npmjs.com/package/@modelcontextprotocol/client), [`server`](https://www.npmjs.com/package/@modelcontextprotocol/server), [`core`](https://www.npmjs.com/package/@modelcontextprotocol/core), [`node`](https://www.npmjs.com/package/@modelcontextprotocol/node), [`express`](https://www.npmjs.com/package/@modelcontextprotocol/express), [`fastify`](https://www.npmjs.com/package/@modelcontextprotocol/fastify), [`hono`](https://www.npmjs.com/package/@modelcontextprotocol/hono), [`server-legacy`](https://www.npmjs.com/package/@modelcontextprotocol/server-legacy), [`codemod`](https://www.npmjs.com/package/@modelcontextprotocol/codemod) (all 2.0.0, 2026-07-27)
- `modelcontextprotocol/typescript-sdk`: [README (main)](https://github.com/modelcontextprotocol/typescript-sdk#readme) · [README (v1.x)](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/README.md) · v1 client transports: [`stdio.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/client/stdio.ts), [`sse.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/client/sse.ts), [`streamableHttp.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/client/streamableHttp.ts), [`websocket.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/client/websocket.ts), [`index.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/client/index.ts) · v2 client: [`packages/client/src/index.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/index.ts), [`packages/client/src/stdio.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/stdio.ts), [`packages/client/src/client/client.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/client/client.ts), [`packages/client/package.json`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/package.json) · docs: [`docs/clients/connect.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/connect.md), [`docs/migration/upgrade-to-v2.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md), [`VERSIONING.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/VERSIONING.md), [`docs/advanced/custom-transports.md`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/advanced/custom-transports.md)
- MCP specification: [2026-07-28 revision](https://modelcontextprotocol.io/specification/2026-07-28) · [transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- Pi harness: [docs/usage.md](https://github.com/earendil-works/pi-coding-agent/blob/main/docs/usage.md) ("intentionally does not include built-in MCP") · installed `@earendil-works/pi-coding-agent` 0.84.3 manifest (no MCP dependency)

**Local (this repository):** `package.json` · `package-lock.json` (optional-peer trail, locked pi 0.84.2) · `README.md` · `docs/pi-brain/ARCHITECTURE.md` (src/pi isolation rule; child-session tool-visibility limitation) · `docs/pi-brain/SPEC.md` §26 / non-goals / Phase 2 / never-list · `docs/pi-brain/IDEAS.md` (`pi-mcp-adapter` watchlist) · `src/agent.ts` · `src/ports.ts` · `src/pi/pi-agent-runner.ts` · `src/pi/human-input.ts` · `src/pi/json-schema.ts` · `extensions/pi-brain.ts` · prior note `docs/pi-brain/research/mcp-typescript-sdk-assessment.md`
