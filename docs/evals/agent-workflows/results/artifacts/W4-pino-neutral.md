# Pino structured logging — capabilities and neutral comparison

**Mode:** research
**Date:** 2026-08-30
**Status:** reference research; neutral comparison only — no adoption decision,
no recommendation, no ranking, no verdict. Nothing was installed, no source was
modified, nothing was committed.

## Scope and method

Question: what structured-logging capabilities does Pino provide, how does this
repository log today, and how do the realistic alternatives differ — without
choosing among them.

Primary sources used for Pino (fetched 2026-08-30 from the `pinojs/pino`
repository, `main` branch, whose docs are also served at
[getpino.io](https://getpino.io)):

- [README](https://github.com/pinojs/pino/blob/main/README.md) and
  [`package.json`](https://github.com/pinojs/pino/blob/main/package.json)
- [docs/api.md](https://github.com/pinojs/pino/blob/main/docs/api.md),
  [docs/child-loggers.md](https://github.com/pinojs/pino/blob/main/docs/child-loggers.md),
  [docs/redaction.md](https://github.com/pinojs/pino/blob/main/docs/redaction.md),
  [docs/transports.md](https://github.com/pinojs/pino/blob/main/docs/transports.md),
  [docs/asynchronous.md](https://github.com/pinojs/pino/blob/main/docs/asynchronous.md),
  [docs/benchmarks.md](https://github.com/pinojs/pino/blob/main/docs/benchmarks.md),
  [docs/lts.md](https://github.com/pinojs/pino/blob/main/docs/lts.md)

Alternatives were checked against their own canonical repositories (linked in
§4). Local evidence comes from this repository's `package.json`, `tsconfig.json`,
`.gitignore`, `README.md`, `docs/pi-brain/*`, `src/run-log.ts`, `src/ports.ts`,
`src/pi/human-input.ts`, `extensions/pi-brain.ts` and `tests/run-log.test.ts`.

---

## 1. Pino — verified upstream facts

Unless noted, every claim below is taken from the documents listed above.
Pino's `package.json` on `main` reports version **10.3.1**, MIT license,
`"type": "commonjs"`, with a `browser` field pointing at `./browser.js`.

### 1.1 Structured output model

- Every log call emits **one line of JSON**. The README's example output:
  `{"level":30,"time":1531171074631,"msg":"hello world","pid":657,"hostname":"…"}`
  — numeric `level`, epoch-milliseconds `time`, `msg`, `pid`, `hostname`
  (README, *Usage*).
- Default destination is `pino.destination(1)` — **stdout**; a file path,
  fd (e.g. `2` for stderr), `SonicBoomOpts` object, or any `WritableStream` can
  be passed instead (api.md, *`destination`*).
- Key names are configurable: `messageKey` (default `'msg'`), `errorKey`
  (default `'err'`), `nestedKey` (default `null`; when set, logged objects are
  placed under that key so their fields cannot collide with Pino's own)
  (api.md, options).
- `timestamp` is `true` by default (epoch-ms partial JSON string) and accepts a
  custom function, e.g. `stdTimeFunctions.isoTime`; the docs caution that
  formatting time in-process "will significantly impact logging performance"
  (api.md).
- `base` controls the always-present keys (the default includes pid/hostname
  per the README output), and `formatters` (`level`, `bindings`, `log`) reshape
  output keys; `serializers` (default `{err: pino.stdSerializers.err}`)
  transform specific keys; `hooks` (`logMethod`, `streamWrite`) intercept calls
  and writes; `mixin`/`mixinMergeStrategy` add per-log dynamic context
  (api.md, options).

### 1.2 Levels

- Default levels: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, plus
  `silent`. Default minimum level: `'info'`. Custom levels via `customLevels`
  (with `useOnlyCustomLevels` and `levelComparison` to control ordering)
  (api.md, *`level`* / *`customLevels`*).
- Levels appear as numbers in output (`info` = 30 in the README example);
  `logger.level` is a getter/setter, `logger.isLevelEnabled(level)` exists
  (api.md, Logger Instance).

### 1.3 Errors and interpolation

- An `Error` passed as first argument (or as `err` on the merging object) is
  serialized with `stack` and `type`:
  `logger.info(new Error("test"))` → `{"level":30,…,"msg":"test","stack":"…","type":"Error",…}`
  (api.md, *Errors*).
- printf-style interpolation is supported:
  `pino.info('hello %s %j %d', 'world', {obj: true}, 4, {another: 'obj'})`
  (benchmarks.md, api.md *interpolationValues*).

### 1.4 Child loggers and context

- `logger.child({ a: 'property' })` adds the bindings as **top-level fields on
  every line** the child emits (README; child-loggers.md).
- Child creation is benchmarked as cheap; nested children add "negligible
  overhead" (child-loggers.md, *Cost of child logging*).
- Documented caveats: parent/child key conflicts produce **duplicate JSON keys**
  (Pino builds strings rather than objects; last value wins on `JSON.parse`,
  matching Bunyan's behavior), and child loggers "should not" be built from
  externally supplied objects or user-controlled key names for security reasons
  (child-loggers.md).

### 1.5 Redaction

- `redact: { paths: [...] }` supports dot/bracket paths, wildcards (`a[*].b`,
  `a.b.*`), custom `censor` strings, and `remove: true` to drop key+value
  (redaction.md).
- Overhead is documented as ~2% over `JSON.stringify` for wildcard-free paths
  (attributed to [`fast-redact`](https://github.com/davidmarkclements/fast-redact)),
  with a non-trivial relative cost for wildcards (redaction.md, *Overhead*).
- Safety note: paths are an **initialization-time** option and "must not
  originate from user input" because `fast-redact` syntax-checks paths in a VM
  context (redaction.md, *Safety*).

### 1.6 Destinations, asynchrony, durability semantics

- `pino.destination()` returns a `SonicBoom` stream "with significantly more
  throughput than a standard Node.js stream"; `sync: false` (default) enables
  **asynchronous buffered logging**, `sync: true` writes with a blocking
  operation per message (api.md, *`pino.destination`*; asynchronous.md).
- Documented async caveats: no one-to-one relationship between log calls and
  writes, and "a possibility of the most recently buffered log messages being
  lost in case of a system failure" (asynchronous.md, *Caveats*); AWS Lambda
  guidance is to use `sync: true` (asynchronous.md).
- `logger.flush([cb])` exists (api.md, Logger Instance); the docs note flush
  does **not** propagate through the worker thread when `pino-pretty` runs as a
  transport (asynchronous.md, *Flush Limitations*).

### 1.7 Transports and ecosystem

- Since v7, transports ("log processors") run in a **worker thread** created by
  `pino.transport({ target, options })`; multiple `targets` can be configured
  with per-target level filtering; pipelines can be chained; the transport
  module may be ESM even in a CJS project (transports.md).
- Built-in/notable: `pino/file` (file or fd; `mkdir: true`, `append: false`
  options; runs `pino.destination` **in a worker thread**, unlike
  `pino.destination` in the main thread) and `pino-pretty` (development
  formatting; "must be installed separately") (transports.md, api.md).
- The documented "Known Transports" list includes cloud/service destinations
  such as `pino-elasticsearch`, `pino-loki`, `pino-opentelemetry-transport`,
  `pino-datadog`, `pino-cloudwatch`, `pino-kafka`, `pino-papertrail`, `pino-pg`,
  and others (transports.md).
- Transport **startup is asynchronous**: calling `process.exit()` before the
  transport is ready loses logs; `transport.on('ready', …)` is the documented
  pattern (transports.md, *Asynchronous startup*).
- Pre-v7 "legacy" transports (separate process) are still documented
  (transports.md, *Legacy Transports*).
- Web-framework integration is documented in [docs/web.md](https://github.com/pinojs/pino/blob/main/docs/web.md)
  (Fastify, Express, Hapi, Restify, Koa, core `http`, Nest, Hono — README).
- A **browser build** exists (`docs/browser.md`; `browser.js` in package.json),
  and bundling with webpack/esbuild is documented (README, *Bundling support*).

### 1.8 TypeScript / ESM compatibility (transport authoring)

- Transports written in TypeScript are supported. With Node 22.6.0–22.17.x they
  require `--experimental-strip-types`; on Node 22.18.0+ and 24+ type stripping
  is on by default. The docs recommend `.mts`, or `.ts` when the package has
  `"type": "module"`, and note type stripping is unavailable on Node ≤ 20
  (transports.md, *TypeScript compatibility*). For production they still
  recommend transpiling transport code (same section).

### 1.9 Performance claims and benchmarks

- README claim (Pino's own): "In many cases, Pino is over 5x faster than
  alternatives."
- The published benchmarks (generated by Pino's own harness,
  `docs/benchmarks.md`, `bench-basic` averages for `pino.info('hello world')`):
  Pino 114.801 ms, PinoMinLength 70.968 ms, PinoNodeStream 159.192 ms,
  Bole 172.690 ms, Debug 220.527 ms, LogLevel 222.802 ms, Winston 270.249 ms,
  Bunyan 377.434 ms. In the **deep-object** benchmark the same page shows
  BunyanDeepObj 1.839 ms vs PinoDeepObj 2.256 ms (Bunyan faster on that case).
  These numbers are Pino's own measurements, run on Pino's harness; the doc
  also notes adjustments made to LogLevel/bole "for a fair comparison".
- Redaction overhead: see §1.5.

### 1.10 Maintenance, support, footprint

- Runtime dependencies of `pino@10.3.1` (its `package.json`): 11 packages —
  `@pinojs/redact`, `atomic-sleep`, `on-exit-leak-free`, `pino-abstract-transport`,
  `pino-std-serializers`, `process-warning`, `quick-format-unescaped`,
  `real-require`, `safe-stable-stringify`, `sonic-boom`, `thread-stream`.
- LTS policy: each major is supported ≥ 6 months, security fixes for 6 further
  months; a Pino line is tested against every Node line in current/active/maintenance
  LTS at release time; Node support is only dropped in a new major (lts.md).
  The published schedule table's newest row is `9.x` (2024-04-26, Node 18/20/22)
  — **no 10.x row is present** in the table even though 10.3.1 is current on
  `main`, so the minimum Node for 10.x is not stated in the fetched documents.
- Maintainers: Matteo Collina, David Mark Clements, James Sumners, Thomas
  Watson Steen (README). Open-source project under OPEN Open Source governance;
  sponsored by nearForm/Platformatic (README).
- Runs on Node.js; on Bare/Pear runtimes via the `pino-bare` compatibility
  module (README, *Runtimes*).

---

## 2. Local evidence — how this repository logs today

### 2.1 Package posture

- `package.json`: `pi-brain`, private, `"type": "module"`, **zero runtime npm
  dependencies** — only `peerDependencies` on the `@earendil-works/pi-*`
  packages plus `typebox`, and one devDependency (`typescript`). Test script:
  `node --test 'tests/**/*.test.ts'`; `docs/pi-brain/README.md` describes this
  as "node --test with Node's type stripping". `tsconfig.json` uses
  `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`,
  `noEmit` — i.e. the source is executed directly by Node without a build step.
- Architecture rule (docs/pi-brain/ARCHITECTURE.md): **only `src/pi/` and
  `extensions/` may import Pi**; everything else stays Pi-free and testable
  with fakes. A stated decision: "Config is JSON. Zero Dependencies."

### 2.2 The logging surfaces

The repository has **three distinct logging-ish surfaces**:

1. **`RunLog` — a typed, append-only JSONL event log**
   (`src/run-log.ts`, port `WorkflowEventSink` in `src/ports.ts`).
   - File location: `.pi/pi-brain/runs/<runId>.jsonl`; the directory
     `.pi/pi-brain/` is in `.gitignore` (run logs are local, unversioned).
   - Events are members of a **discriminated union** `WorkflowEvent`
     (`workflow.started` with `runId`, `workflow`, optional `description` and
     `stack`; `phase.started`; `agent.completed`; `workflow.outcome`; etc.),
     appended via `JSON.stringify(event) + "\n"` with `appendFileSync` (utf8).
   - Crash tolerance: `open()` **heals a torn final line** by appending a
     missing newline before the next write (confining loss to the event that
     was already being lost); `readRunLog()` skips empty and unparsable lines
     rather than failing; `listRunIds()` orders runs by log mtime.
   - Failure contract: "Writes are best-effort appendFileSync: a run must
     never die because its audit trail hit a filesystem error. Such errors are
     reported once on stderr and the sink degrades to no-op." (`#broken` flag).
   - Readers: `replayRunLog`/resume mode (`src/workflows/resume.ts`),
     `/flow log` and `/flow log-all` in the extension; tests in
     `tests/run-log.test.ts` cover append/read/torn-line/old-format behavior.
2. **Human-facing status** — `ctx.ui.notify(...)` and `ctx.ui.setStatus(...)`
   via `src/pi/human-input.ts` (gated on `ctx.hasUI`), plus
   `pi.appendEntry("pi-brain.event", event)` for pi-side history, wrapped in
   try/catch and commented "pi-side history (unreliable — see run-log.ts)"
   (`extensions/pi-brain.ts`).
3. **Operational diagnostics on stderr** — exactly **two `console.error` call
   sites** in the whole source tree (`src/run-log.ts:60`,
   `src/run-lock.ts:221`), both plain strings with a `pi-brain:` prefix, no
   levels, no timestamps, no JSON.

### 2.3 Documented history and rationale

- ARCHITECTURE.md: the run log "exists BECAUSE `pi.appendEntry` proved
  unreliable — two incidents (2026-08-21/22) of completed runs leaving no
  session trace and a lost needs_human outcome with all its review findings";
  properties listed are best-effort writes that never kill a run and
  torn-final-line tolerance.
- Subprocess output (verify commands) is captured in-band: `src/shell.ts`
  returns `{command, exitCode, output}` with stdout+stderr concatenated and
  routes it through events/results rather than a global logger.

---

## 3. Inferences (clearly labelled; not verified upstream)

- **Inference A — the repo has no operational logger.** What exists is a
  domain event/audit log (`RunLog`) with a typed schema and replay semantics
  (closer to event sourcing than to level-based logging), plus two ad-hoc
  `console.error` calls. There is no leveled, timestamped, filterable
  diagnostics facility today.
- **Inference B — overlap with Pino is partial.** The shared ground is "one
  JSON object per line, appended to a file". Pino's levels, child loggers,
  redaction, serializers, transports and pretty printing have no counterpart in
  the repo; conversely, `RunLog`'s typed event union, replay reader,
  torn-line healing and "refuse nothing, degrade to no-op" contract have no
  counterpart in Pino's documented API.
- **Inference C — durability postures differ.** Pino's default async mode
  documents possible loss of buffered messages on system failure;
  `RunLog`'s contract is synchronous, best-effort, never-fatal writes born
  from two real data-loss incidents. Pino's `sync: true` destination and
  `pino/file` `append` behavior are the closest documented analogues; whether
  they satisfy the local contract would need empirical verification.
- **Inference D — runtime compatibility appears consistent but is unverified
  for pino 10.x.** The repo runs Node with type stripping on `"type": "module"`
  `.ts` sources; Pino documents Node 22+ type-stripping support for TS
  transport files and ESM transport modules, and a CJS package importable from
  ESM. However, Pino's fetched LTS table stops at 9.x, so the minimum Node for
  10.3.1 could not be confirmed from primary sources (§5).
- **Inference E — dependency footprint would change.** Pino brings 11 direct
  runtime dependencies (fact, §1.10) into a package that currently ships none
  (fact, §2.1). Any weight that carries is a judgment this report does not
  make.
- **Inference F — process-lifetime interactions exist.** Worker-thread
  transports boot asynchronously (`process.exit` before `ready` loses logs)
  and `logger.flush()` does not propagate to a `pino-pretty` worker
  (§1.6–1.7). A workflow harness that already worries about exit-time log
  loss (§2.3) would need to account for these documented behaviors. This is an
  observation of interaction, not a disqualification.
- **Inference G — Bunyan's cadence signal.** Bunyan's own README says 1.x is
  still "latest" in npm while `master` holds unreleased 2.x work; read as a
  release-cadence signal from the project's own text, nothing more.

---

## 4. Neutral comparison

### 4.1 Options and their self-descriptions (each from its own primary source)

| Option | Self-description / role | Source |
| --- | --- | --- |
| Status quo (`RunLog` + `console.error` + `ctx.ui.*`) | Typed JSONL audit/event log with replay; two plain stderr diagnostics; UI status lines | `src/run-log.ts`, `src/ports.ts`, §2 |
| [Pino](https://github.com/pinojs/pino) | "Very low overhead JavaScript logger"; JSON lines; levels; child loggers; redaction; worker-thread transports | §1 |
| [Winston](https://github.com/winstonjs/winston) | "A logger for just about everything"; multiple transports per logger at different levels; decoupled formats; child loggers (`logger.child({requestId})`, with a documented caution); streaming logs back from transports | [winston README](https://github.com/winstonjs/winston#readme) |
| [Bunyan](https://github.com/trentm/node-bunyan) | "A simple and fast JSON logging library" plus a CLI for pretty-viewing logs; `log.child`; serializers; stream types incl. rotating-file; "Stable"; supports node 0.10+ | [bunyan README](https://github.com/trentm/node-bunyan#readme) |
| [loglevel](https://github.com/pimterry/loglevel) | "Minimal lightweight simple logging" for browsers/node; extends `console.*` with level filtering; "Single file, no dependencies, 1.4 KB minified+gzipped"; TypeScript types included | [loglevel README](https://github.com/pimterry/loglevel#readme) |
| [consola](https://github.com/unjs/consola) | "Elegant Console Wrapper"; pluggable reporters, tags, console/stdout redirect, pause/resume, throttling, prompts, browser support, smaller core builds | [consola README](https://github.com/unjs/consola#readme) |
| Node core `console` | Built into Node; `console.log/info/warn/error/debug/trace` write to stdout/stderr; no dependency, no levels-filtering or persistence of its own | [Node docs — console](https://nodejs.org/api/console.html) |

### 4.2 Capability matrix (facts from each project's own docs; repo column from §2)

| Dimension | Status quo (this repo) | Pino | Winston | Bunyan | loglevel | consola |
| --- | --- | --- | --- | --- | --- | --- |
| Output | JSONL, typed event union | JSONL (keys configurable) | Configurable format incl. JSON | JSONL | console passthrough (plain text) | Formatted text (reporters) |
| Levels | none (event `type` discriminant) | 6 + silent, custom levels | configurable levels | 6 + trace, custom | 5 + silent | defaults + custom types |
| Context binding | event fields (typed) | child loggers, `base`, `mixin` | child loggers (cautioned), `defaultMeta` | `log.child` | none | tags, `createConsola({ defaults })` |
| Timestamps | none on events (mtime for ordering) | epoch ms default, ISO option | format-dependent | ISO by default | none | format-dependent |
| Error serialization | as event fields | `err` key w/ stack+type (default serializer) | format-dependent | `err` serializer (std) | none | boxes/errors rendering |
| Redaction | none | built-in `redact` paths | not built-in (format-level) | none documented in README | none | none |
| Destinations | one JSONL file, sync append | fd/path/SonicBoom; worker-thread transports; many ecosystem targets | multiple transports per logger | multiple streams; rotating-file | console only | console + redirect |
| Sync/async | synchronous best-effort | async default, `sync: true` option | async | sync + streams | sync | sync |
| Browser | n/a (CLI/TUI tool) | browser build | n/a (node-focused) | n/a | yes | yes |
| Self-reported size/deps | 0 runtime deps | 11 runtime deps | multiple (per its README design) | not stated in README | 0 deps, 1.4 KB | core builds "~80% smaller" |
| Maintenance signals | part of this repo | active org, LTS policy (table lags at 9.x) | active org (winstonjs) | "Stable"; 2.x unreleased per README | active | active (unjs) |

(Pino's benchmark numbers comparing several of these libraries are in §1.9;
they are Pino's own measurements on its own harness.)

### 4.3 Dimension notes, neutrally stated

- **Structured data.** Pino, Winston (with JSON format) and Bunyan all produce
  machine-parseable structured output; loglevel and consola are console-shaped;
  the status quo produces structured event lines but only for workflow events,
  not for diagnostics.
- **Context propagation.** Pino and Bunyan make child-logger context a
  first-class, benchmarked feature; Winston documents the same feature with an
  implementation caution; the repo achieves per-event context through its typed
  event fields instead.
- **Durability vs throughput.** Pino documents an explicit throughput/durability
  trade (async buffering with possible loss; sync mode for loss-sensitive
  environments such as Lambda). The repo's `RunLog` is synchronous by design
  and written after two documented durability incidents. Winston/Bunyan/loglevel/
  consola document throughput-oriented designs without Pino's async-buffer
  caveats.
- **Sensitive data.** Pino is the only option in the table with built-in path
  redaction documented; the others defer redaction to formats/plugins or leave
  it to the application.
- **Delivery to external systems.** Pino (worker transports, large documented
  ecosystem) and Winston (multiple simultaneous transports) are delivery
  platforms; Bunyan streams cover a similar role; loglevel/consola and the
  status quo do not address it.
- **TypeScript usage.** The repo executes `.ts` directly under Node type
  stripping; Pino documents that exact runtime for TS transport authoring
  (§1.8); winston/bunyan ship their own typings; loglevel bundles types;
  consola is written in TS. Only Pino's docs discuss the type-stripping path
  explicitly.
- **Footprint.** The status quo and loglevel are dependency-free by their own
  descriptions; Pino lists 11 runtime deps; Winston and consola sit between
  (their own docs don't state a comparable count).

### 4.4 Fit observations against pi-brain's stated invariants (observations, not judgments)

- The architecture's "zero dependencies" note (§2.1) and Pino's dependency
  list (§1.10) are in different positions; no weighting is assigned here.
- The "best-effort, never-fatal, sync, torn-line-tolerant" `RunLog` contract
  (§2.2) and Pino's documented async-loss and async-startup caveats (§1.6–1.7)
  describe the same failure domain from different starting points; Pino's
  `sync: true` and `pino/file` options are the documented dials relevant to it.
- The repo's logging split (audit events vs UI status vs stderr diagnostics)
  means a leveled logger would primarily address the stderr-diagnostics slice
  (two call sites today, per §2.2), while `RunLog`'s replay contract is defined
  over its own typed schema (§2.2) — the two coexist without documented
  conflict in either direction.

---

## 5. Open questions (could not be verified from fetched primary sources)

1. Minimum Node.js version supported by pino 10.x — the LTS schedule table on
   `main` still ends at 9.x (§1.10).
2. Whether `pino.destination({ sync: true })` / `pino/file` behavior under
   kill -9 / power loss matches `RunLog`'s torn-line expectations — upstream
   documents the caveat in general terms only; this would need empirical
   testing (out of scope and not performed).
3. Behavior of Pino's worker-thread transports inside a Pi extension host
   process (detached workflow + TUI) — no upstream or local documentation
   covers that composition.

## Sources

Pino (primary): [README](https://github.com/pinojs/pino/blob/main/README.md) ·
[api.md](https://github.com/pinojs/pino/blob/main/docs/api.md) ·
[child-loggers.md](https://github.com/pinojs/pino/blob/main/docs/child-loggers.md) ·
[redaction.md](https://github.com/pinojs/pino/blob/main/docs/redaction.md) ·
[transports.md](https://github.com/pinojs/pino/blob/main/docs/transports.md) ·
[asynchronous.md](https://github.com/pinojs/pino/blob/main/docs/asynchronous.md) ·
[benchmarks.md](https://github.com/pinojs/pino/blob/main/docs/benchmarks.md) ·
[lts.md](https://github.com/pinojs/pino/blob/main/docs/lts.md) ·
[web.md](https://github.com/pinojs/pino/blob/main/docs/web.md) ·
[browser.md](https://github.com/pinojs/pino/blob/main/docs/browser.md) ·
[package.json](https://github.com/pinojs/pino/blob/main/package.json) ·
[fast-redact](https://github.com/davidmarkclements/fast-redact) ·
[sonic-boom](https://github.com/mcollina/sonic-boom)

Alternatives (primary): [winston README](https://github.com/winstonjs/winston#readme) ·
[bunyan README](https://github.com/trentm/node-bunyan#readme) ·
[loglevel README](https://github.com/pimterry/loglevel#readme) ·
[consola README](https://github.com/unjs/consola#readme) ·
[Node.js console API](https://nodejs.org/api/console.html)

Local: `package.json`, `tsconfig.json`, `.gitignore`, `README.md`,
`docs/pi-brain/README.md`, `docs/pi-brain/ARCHITECTURE.md`,
`src/run-log.ts`, `src/ports.ts`, `src/pi/human-input.ts`,
`extensions/pi-brain.ts`, `src/shell.ts`, `tests/run-log.test.ts`
(all on branch `pi-brain`, commit dated 2026-08-29).
