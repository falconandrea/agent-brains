# pino adoption assessment

**Date:** 2026-08-30
**Mode:** assessment
**Status:** decision recorded; no dependency installed, no source modified

## Verdict

**Reject.** pino is an excellent library that solves a problem pi-brain does
not have. Its headline value — extremely high-throughput JSON logging for
services — is irrelevant at pi-brain's event volume (dozens of structured
events per run), its defaults (stdout destination, async buffering) are mildly
hostile to a TUI-hosted extension whose audit trail exists precisely to never
lose a line, and adopting it would break the repo's zero-runtime-dependency
design value for no new capability. Revisit triggers are listed at the end.

## Upstream facts (verified against primary sources)

All facts below were checked against the pinojs/pino repository and the npm
registry on 2026-08-30.

- **What it is:** "Very low overhead JavaScript logger", outputting
  newline-delimited JSON with `level`, `time`, `pid`, `hostname`, `msg` and
  child-logger bindings by default.
  Sources: [pino README](https://github.com/pinojs/pino),
  [usage example](https://github.com/pinojs/pino#usage).
- **Version / maintenance:** latest is **10.3.1** (published 2026-02-09;
  registry metadata updated 2026-08-15). First published 2016. Actively
  maintained.
  Source: [npm registry](https://www.npmjs.com/package/pino).
- **License:** MIT. Source: pino `package.json`.
- **Package shape:** `"type": "commonjs"`; importable from ESM (`import pino
  from 'pino'`); ships its own TypeScript types (`pino.d.ts`). Transport
  modules may be ESM even in CJS projects.
  Sources: pino `package.json`, [transports docs](https://github.com/pinojs/pino/blob/main/docs/transports.md).
- **Dependency footprint:** 11 runtime dependencies, including `sonic-boom`
  (writes), `thread-stream` (worker transports), `pino-abstract-transport`,
  `@pinojs/redact`, `safe-stable-stringify`, `quick-format-unescaped`,
  `pino-std-serializers`, `process-warning`, `on-exit-leak-free`,
  `atomic-sleep`, `real-require`. Source: npm registry (latest version).
- **Performance:** the project's own benchmarks show pino at roughly half of
  winston's and a third of bunyan's average time for basic `info()` calls
  (114.8 ms vs 270.2 ms vs 377.4 ms in the current BASIC benchmark table) —
  a throughput advantage that matters at high log volume.
  Source: [benchmarks](https://github.com/pinojs/pino/blob/main/docs/benchmarks.md).
- **Write model:** default destination is **fd 1 (stdout)**; logging is
  asynchronous and buffered (`minLength`, sonic-boom). Documented caveat: "a
  possibility of the most recently buffered log messages being lost in case of
  a system failure". `sync: true` gives blocking per-call writes and is the
  documented recommendation where lost tail messages are unacceptable (e.g.
  AWS Lambda).
  Sources: [asynchronous logging](https://github.com/pinojs/pino/blob/main/docs/asynchronous.md),
  [API `pino.destination`](https://github.com/pinojs/pino/blob/main/docs/api.md).
- **Transports:** v7+ transports run in a **worker thread** in-process
  (legacy transports ran in child processes). Recommended for any
  transformation/transmission of logs.
  Source: [transports docs](https://github.com/pinojs/pino/blob/main/docs/transports.md).
- **Feature set:** child loggers with bindings, `redact` paths (path syntax
  with censor functions), `customLevels`/`useOnlyCustomLevels`, `formatters`,
  `base` (suppress pid/hostname), `timestamp` control, `pino-pretty` for
  development output, and a large ecosystem (file rotation, Elasticsearch,
  etc.).
  Sources: [API](https://github.com/pinojs/pino/blob/main/docs/api.md),
  [redaction](https://github.com/pinojs/pino/blob/main/docs/redaction.md),
  [ecosystem](https://github.com/pinojs/pino/blob/main/docs/ecosystem.md).
- **Support policy:** each major is supported ≥ 6 months, security fixes for
  6 further months; tested against Node.js lines in current/active/maintenance
  LTS at release. Node support only drops in new majors.
  Source: [LTS policy](https://github.com/pinojs/pino/blob/main/docs/lts.md).
- **Known limitation:** on Windows terminals, sonic-boom's direct `fs.write`
  to a file descriptor can render Unicode incorrectly (workaround: `chcp
  65001`).
  Source: [help docs](https://github.com/pinojs/pino/blob/main/docs/help.md).

## Local evidence

- **Runtime footprint today is zero.** `package.json` has no `dependencies`:
  only `peerDependencies` (the three Pi packages, typebox) and one dev
  dependency (typescript). The architecture doc makes this a stated value,
  not an accident: "Config is JSON. Zero dependencies. Swap `loadFile()` … if
  YAML ever becomes worth a dep" (`docs/pi-brain/ARCHITECTURE.md`). The
  run-lock is similarly built from raw fs primitives because "Node's fs
  exposes no `flock`" — this repo consistently prefers stdlib-first.
- **The "logging" system is a domain audit trail, not a diagnostics logger.**
  `src/run-log.ts` (`RunLog`) appends typed `WorkflowEvent` records (a
  discriminated union in `src/ports.ts`) as JSONL to
  `.pi/pi-brain/runs/<runId>.jsonl`, using **synchronous**
  `appendFileSync`, best-effort (a failed sink degrades to no-op after one
  stderr report, never killing a run), with torn-final-line healing on open
  and tolerant reading. It exists because `pi.appendEntry` proved unreliable —
  two documented incidents (2026-08-21/22) of lost session traces
  (`docs/pi-brain/ARCHITECTURE.md`, IDEAS.md).
- **Diagnostics logging is nearly absent by design.** Exactly two
  `console.error` calls exist in `src/` (run-log, run-lock failure paths).
  User-facing output goes through Pi's `ctx.ui` (`setStatus`, dialogs) plus
  one deliberate `process.stdout.write("\x07")` for the terminal bell in
  `extensions/pi-brain.ts` — i.e. the process's stdout belongs to the TUI
  host, and pi-brain already treats writing to it as a careful, explicit act.
- **Event volume is tiny.** A `/feature` run emits on the order of tens of
  events (workflow/phase/agent/command/verification/review lifecycle), each
  already structured (usage totals, review issues with file/line). There is
  no request traffic, no per-request logging, no service to observe.
- **IDEAS.md records no logging-library need.** Future work is resume UX on
  top of the existing run log and Herdr-based observability — neither implies
  a general-purpose logger.
- **The repo recommends pino — for other projects.** The only `pino`
  occurrences in the tree are in the `nodejs-backend-patterns` skill
  (`pino` + `pino-pretty` sample config for Fastify/Express apps). That is
  guidance this repo distributes to consuming projects, not a statement about
  pi-brain's own runtime.
- **Testing relies on fakes over ports.** Tests run with `node --test` and no
  network; `RunLog` and the `WorkflowEventSink` port are trivially fakeable.
  A logger that spawns worker threads would add machinery to fake for no
  test benefit.

## Inferences (clearly labelled)

- **Inference — pino would default to corrupting the TUI.** pino's default
  destination is fd 1; pi-brain runs inside the Pi TUI, which owns stdout.
  Any adoption would be forced into `pino.destination({ dest: <file>, sync:
  true })` — which is, functionally, a re-implementation of `RunLog` with
  extra steps.
- **Inference — async buffering is the exact failure class pi-brain guards
  against.** The run log was built because silent loss of final events
  destroyed a `needs_human` outcome. pino's documented async-mode caveat
  ("most recently buffered log messages being lost") is tolerable for
  high-volume service logs and unacceptable for a run's last word; `sync:
  true` would therefore be mandatory, eliminating pino's throughput
  rationale.
- **Inference — pid/hostname bindings and numeric levels are noise here.**
  The audit trail's identity key is `runId`; the event vocabulary is the
  `WorkflowEvent` union with backward-compatible optional fields. Pino's
  generic envelope (`level`/`time`/`pid`/`hostname`) adds fields nothing
  reads, while `/flow log` already reads the current schema directly.
- **Inference — the zero-dep invariant is load-bearing for this package.**
  As a `pi-package` consumed via peer dependencies and symlinked skill
  stores, every runtime dep pi-brain adds is transitively imposed on its
  consumers' installs. 11 transitive dependencies for a solved problem is a
  poor trade.
- **Inference — worker-thread transports are a poor fit for a TUI host.**
  `thread-stream` plus `on-exit-leak-free` flush handling exists to keep
  high-volume pipelines draining; inside an interactive extension process it
  is a new lifecycle surface (and a Windows Unicode caveat inherited from
  sonic-boom's fd writes) with nothing to drain.

## Comparison with the current implementation

| Need | pi-brain today | pino |
| --- | --- | --- |
| Durable per-run audit JSONL | `RunLog`: sync writes, torn-line healing, best-effort, typed events | `pino.destination({ sync: true })` + serialization of untyped objects; healing/resume semantics would still be hand-written |
| Crash survivability of the final event | Guaranteed (blocking append per event) | Only with `sync: true`; default async mode may lose the tail |
| Human-facing progress | Pi `ctx.ui.setStatus`, dialogs, `/flow status`, `/flow log` | Not applicable; `pino-pretty` targets service dev output |
| Diagnostics beyond failure paths | Two `console.error` calls | Levels, child loggers, redaction — but there is no current diagnostics surface that wants them |
| Throughput | Irrelevant at ~10² events/run | The entire point of pino |
| Dependencies | 0 runtime | 11 runtime |
| Schema control | `WorkflowEvent` union, versioned optional fields, consumed by resume mode | Generic JSON envelope; custom formatters would be needed to approximate it |

## Realistic alternatives

- **Status quo (RunLog + console.error + ctx.ui).** Meets every current
  requirement; costs nothing; already field-validated (2026-08-23, IDEAS.md).
- **winston.** More dependencies, slower (its own benchmark shows ~2× pino's
  basic latency), in-process transports. Strictly worse fit than pino here.
  Source: [benchmarks](https://github.com/pinojs/pino/blob/main/docs/benchmarks.md).
- **loglevel / debug.** Tiny and dependency-free, but they solve env-gated
  human diagnostics, which pi-brain doesn't have; the JSONL audit writer would
  still be `RunLog`. Adding one now would be speculative.
- **consola.** Nice formatted CLI output, but writes to stdout/stderr — same
  TUI-conflict as pino's default, without even the JSON-durability story.
- **Node stdlib.** What the codebase already uses (`console.error`,
  `appendFileSync`). For any future diagnostics need, a ~20-line level-gated
  stderr helper remains the proportionate first step.

## Evaluation

- **New value:** ≈ none today. Levels, redaction, child loggers and pretty
  printing address needs pi-brain has not expressed; the durability problem
  pino could theoretically own is already solved more tightly by `RunLog`.
- **Overlap:** near-total with `RunLog` for the audit trail (JSONL to file,
  sync writes) and near-zero with the rest (no service, no request logs).
- **Cost:** 11 runtime dependencies in a currently zero-dep package consumed
  by other projects; a worker-thread/flush lifecycle inside the TUI host;
  envelope/schema translation to keep `/flow log` and resume mode reading
  `WorkflowEvent`.
- **Risk:** default stdout destination conflicts with the TUI's ownership of
  fd 1; async buffering risks the exact tail-loss incidents that motivated
  the run log; new supply-chain surface (sonic-boom, thread-stream, …) in a
  security-sensitive tool that orchestrates git and shells.
- **Compatibility:** technically fine — MIT, CJS importable from pi-brain's
  ESM, own types, supports current Node LTS lines, LTS policy is healthy.
  Nothing in the integration is blocked; it is simply not worth it.
- **Reversibility:** high in both directions. Removing pino later is easy —
  which also means there is no option value in adopting it now. The decision
  can be deferred at zero cost.

## Verdict: `reject`

Rejecting is not a judgement about pino — it is the reference JSON logger
for high-volume Node services and this repo's own `nodejs-backend-patterns`
skill rightly recommends it there. For pi-brain specifically: no unmet need,
near-total overlap with a purpose-built, field-validated audit trail, a
dependency-footprint regression against a stated architecture value, and a
write-model/destination mismatch with a TUI-hosted extension.

### Revisit triggers

Re-evaluate (likely toward `trial`) if any of these materialize:

1. pi-brain grows a long-running component — daemon, scheduler, server —
   producing sustained log volume where throughput and rotation matter.
2. A real diagnostics surface emerges (e.g. verbose workflow tracing beyond
   `/flow status`) that outgrows `console.error` and a trivial level-gated
   helper.
3. Multi-process or multi-machine log aggregation is needed (pino's
   transport ecosystem becomes the differentiator).
4. Log-side secret redaction becomes a requirement that outgrows the current
   approach of never letting ignored file content reach models or logs.
5. pi-brain is extracted as a library consumed by services that already
   standardize on pino, making log-shape uniformity worth the dependency.
