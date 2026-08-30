# Pino adoption evaluation

**Date:** 2026-08-30
**Status:** dependency evaluation; verdict **reject** (revisit triggers listed at the end)

## Executive summary

[pino](https://github.com/pinojs/pino) is an excellent logger — for services we
don't have. It is built for high-throughput JSON logging in long-running
processes (web servers, daemons), where its async buffering, worker-thread
transports and request-log integrations pay off. pi-brain is a TUI-resident
workflow orchestrator that persists at most a few dozen domain events per run,
already has a purpose-built, field-validated, crash-durable JSONL audit trail
(`src/run-log.ts`), and has an explicit, documented zero-runtime-dependency
design rule. Adopting pino would add the repo's first runtime dependency and
ten transitive ones to every consuming project, in exchange for capabilities
(levels, redaction, child loggers, throughput) that nothing here needs — while
pino's async-by-default buffering reintroduces exactly the crash-time data-loss
failure mode that motivated our own audit trail in the first place (two real
incidents, 2026-08-21/22, see `docs/pi-brain/IDEAS.md`). Verdict: **reject**.

## Method

Primary sources first: the pino GitHub repository (`main` branch), its docs
(`docs/asynchronous.md`, `docs/api.md`, `docs/lts.md`, README), npm registry
metadata and download counts, and the GitHub API for repository health. Local
evidence from `package.json`, `README.md`, `docs/pi-brain/ARCHITECTURE.md`,
`docs/pi-brain/IDEAS.md`, `src/run-log.ts`, `src/ports.ts`,
`src/run-lock.ts`, `extensions/pi-brain.ts` and `tests/run-log.test.ts`.
Nothing was installed and no source file was modified.

## Upstream facts (verified)

All facts below were checked against the linked primary sources on 2026-08-30.

| Fact | Value | Source |
|---|---|---|
| Self-description | "super fast, all natural json logger" | [repo package.json](https://github.com/pinojs/pino/blob/main/package.json) |
| Current version | 10.3.1 | [npm registry `/pino/latest`](https://registry.npmjs.org/pino/latest) |
| License | MIT | repo package.json / npm |
| Module format | CommonJS (`"type": "commonjs"`), ships `pino.d.ts` | repo package.json |
| Runtime dependencies | 10: `thread-stream`, `sonic-boom`, `pino-abstract-transport`, `pino-std-serializers`, `quick-format-unescaped`, `safe-stable-stringify`, `@pinojs/redact`, `process-warning`, `on-exit-leak-free`, `real-require`, `atomic-sleep` | npm `/pino/latest` |
| Weekly downloads | ~47.5 M (week ending 2026-08-29) | [api.npmjs.org](https://api.npmjs.org/downloads/point/last-week/pino) |
| Repository health | 18,171 stars, actively pushed (2026-08-25), not archived | [GitHub API](https://api.github.com/repos/pinojs/pino) |
| Node support | Follows the Node.js LTS schedule; a Node line is only dropped in a new pino major | [docs/lts.md](https://github.com/pinojs/pino/blob/main/docs/lts.md) |
| Semver discipline | Security fixes may ship as breaking **minor** releases | docs/lts.md |

Verified behaviours that matter for this evaluation:

1. **Default output is JSON lines to stdout.** `pino()` logs
   `{"level":30,"time":...,"msg":"hello world","pid":...,"hostname":...}`;
   child loggers pin key-value bindings to every line.
   ([README](https://github.com/pinojs/pino/blob/main/README.md))
2. **Performance is the headline feature.** "In many cases, Pino is over 5x
   faster than alternatives", backed by its own benchmark suite
   ([docs/benchmarks.md](https://github.com/pinojs/pino/blob/main/docs/benchmarks.md)).
3. **Transports run in worker threads.** Log processing (formatting, shipping,
   alerting) is recommended to run off the event loop via `pino.transport`
   ([README](https://github.com/pinojs/pino/blob/main/README.md),
   [docs/transports.md](https://github.com/pinojs/pino/blob/main/docs/transports.md)).
4. **Async buffering can lose the most recent messages on failure.** The
   minimum-overhead mode (`pino.destination({ sync: false })`) buffers and
   writes in chunks; the docs state "There is a possibility of the most
   recently buffered log messages being lost in case of a system failure" and
   that there is "not a one-to-one relationship between calls to logging
   methods and writes to a log file". The Lambda guidance for the same reason
   says "always use a destination with `sync: true`" there.
   ([docs/asynchronous.md](https://github.com/pinojs/pino/blob/main/docs/asynchronous.md))
5. **Synchronous mode exists.** `sync: true` writes "with a _blocking_
   operation" as messages are generated; `logger.fatal` always sync-flushes
   because fatal messages are expected right before a crash.
   ([docs/asynchronous.md](https://github.com/pinojs/pino/blob/main/docs/asynchronous.md),
   [docs/api.md](https://github.com/pinojs/pino/blob/main/docs/api.md))
6. **The ecosystem is service-oriented.** First-class integrations with
   Fastify, Express, Koa, Hapi, Restify, Nest, Hono and core `http`
   ([README](https://github.com/pinojs/pino/blob/main/README.md),
   [docs/web.md](https://github.com/pinojs/pino/blob/main/docs/web.md)).
   Pretty-printing is a separate module used by piping:
   `node app.js | pino-pretty`
   ([pino-pretty Readme](https://github.com/pinojs/pino-pretty)).

## Local evidence (verified)

1. **Zero runtime dependencies is a written design rule, not an accident.**
   `package.json` has no `dependencies` key at all — only `peerDependencies`
   (the Pi packages, `typebox`) and a `typescript` devDependency.
   `docs/pi-brain/ARCHITECTURE.md` states it explicitly: "Config is JSON.
   **Zero dependencies.** Swap `loadFile()` in `src/config.ts` if YAML ever
   becomes worth a dep."
2. **The "logging" here is a domain event stream, not diagnostic logging.**
   `WorkflowEvent` (`src/ports.ts`) is a discriminated union of workflow
   state-machine events (`workflow.started`, `phase.started`,
   `agent.completed`, `review.completed`, `workflow.outcome`…) that
   `replayRunLog` consumes for crash resume. This is application state
   persistence, not log lines.
3. **The audit trail already exists and was built for crash durability.**
   `RunLog` (`src/run-log.ts`) appends one JSON per line to
   `.pi/pi-brain/runs/<runId>.jsonl` with `appendFileSync` (synchronous,
   blocking), degrades to a no-op after one stderr report if the filesystem
   fails ("a run must never die because its audit trail hit a filesystem
   error"), and heals a torn final line on open so the next append survives.
   It exists **because** the previous async path (`pi.appendEntry`) lost data:
   two incidents of completed runs leaving no session trace
   (`docs/pi-brain/IDEAS.md`, correction of 2026-08-21; incidents 2026-08-21/22).
4. **It is tested and field-validated.** `tests/run-log.test.ts` has 8 tests
   covering JSONL round-trip, torn-line skip and heal, broken-filesystem
   degradation, newest-first listing and location under `.pi/`. IDEAS.md
   (2026-08-23): "The owned audit trail works; the two-incident data-loss gap
   is closed."
5. **The diagnostic-logging surface is two lines.** A repo-wide search finds
   exactly two `console.error` fallbacks (`src/run-log.ts:60`,
   `src/run-lock.ts:221`), both reporting a broken audit path exactly once.
   User-facing output goes through Pi's own TUI channels (`ctx.ui.notify`,
   `ctx.ui.setStatus`), and pi-side history through `pi.appendEntry`, which is
   deliberately treated as unreliable.
6. **Runtime shape:** `"type": "module"`, `.ts` sources run directly by
   `node --test` (no build step; Node 24.12 locally), distributed as a
   `pi-package` whose `peerDependencies` are resolved by the Pi host.
7. **No prior consideration:** no occurrence of `pino`, `winston`, `bunyan`,
   `loglevel` or `logger` anywhere in the repo's docs or source.

## Inferences (clearly labelled)

These are reasoned judgements, not verified facts:

- **pino's headline value does not transfer here.** *Inference:* the value
  prop (throughput, async buffering, transports, request logging) is realized
  in long-running, high-volume services. pi-brain emits at most a few dozen
  events per `/feature` run; per-line cost is irrelevant at that volume.
- **The failure mode pino optimizes for is the one we already paid for.**
  *Inference:* adopting pino in its recommended async configuration would
  reintroduce buffered-loss-on-crash — the exact class of incident (unflushed
  session data, lost `needs_human` outcome) that motivated `RunLog`. Using it
  in `sync: true` mode is safe but then pino degenerates to roughly what
  `RunLog` already is: `JSON.stringify` + blocking file append.
- **Default stdout output would fight the TUI.** *Inference:* JSON lines on
  stdout would corrupt Pi's terminal UI; every adoption would need a file
  destination configured from day one, i.e. non-default usage.
- **The schema mismatch is real.** *Inference:* pino's line shape
  (`level`/`time`/`msg`) does not match `WorkflowEvent`; we would either
  shove domain events into `msg`-carrying bindings (losing the typed union on
  read-back) or run pino purely for diagnostics alongside RunLog — the latter
  being the only coherent split.
- **Interop friction is small but nonzero.** *Inference from
  `"type": "commonjs"` and Node ESM-CJS interop:* `import pino from "pino"`
  works in our ESM, no-build setup, and `pino.d.ts` provides types; but the
  worker-thread transports' dynamic module loading is the kind of machinery
  that surfaces environment quirks, which matters more in a package installed
  into arbitrary consumer projects than in one app we control.
- **Cost amplification via the package model.** *Inference:* as a
  `pi-package` consumed by other projects, a runtime dep ships to every
  consumer (10 transitive packages), expanding supply-chain and
  audit surface for zero consumer-visible benefit.

## Comparison

### Current implementation vs pino

| Axis | Current (RunLog + console.error + ctx.ui) | pino (sync: true file dest) | pino (default async / transports) |
|---|---|---|---|
| Crash durability of last events | Yes — synchronous appends, torn-line healing; field-validated | Yes — blocking writes | **No** — buffered tail can be lost on failure (upstream-documented) |
| Dependency cost | 0 | 1 direct + 10 transitive | same + heavier runtime machinery |
| Output schema | Typed `WorkflowEvent` JSONL, replayable | pino line schema; domain data via bindings | same |
| Levels / redaction / child loggers | No (not needed so far) | Yes | Yes |
| Throughput | Irrelevant at ~10² events/run | Excellent | Excellent |
| TUI compatibility | Native (ctx.ui) | Needs file destination to avoid corrupting the TUI | Same |
| Testability | Pure fs, faked in tests (`tests/run-log.test.ts`) | Mockable via destinations | Worker threads complicate unit tests |

### Realistic alternatives

1. **Status quo (recommended).** Zero deps, 8 passing tests, two closed
   real-world data-loss incidents behind it. The only thing it lacks — leveled
   diagnostic verbosity — is not currently a felt need (`.pi/pi-brain.json`
   already has a `verbosity` knob for output detail).
2. **Plain `jq` for viewing.** `/flow log` already reads JSONL; human-readable
   filtering/formatting of `.pi/pi-brain/runs/*.jsonl` is a `jq` one-liner and
   requires zero code. (If pino-schema output existed,
   [`pino-pretty`](https://github.com/pinojs/pino-pretty) would be the
   dev-time viewer — but our lines are domain events, not pino lines, so it
   would not parse them usefully. *Inference.*)
3. **`loglevel` or a hand-rolled ~30-line leveled console wrapper**, if
   diagnostic verbosity ever becomes a need: tiny, dependency-light, TUI-safe
   (stderr only).
4. **`winston`**: heavier than pino, same service-orientation, no
   crash-durability advantage — dominated by the alternatives for this repo.
5. **`pi.appendEntry` alone**: already rejected as a durability mechanism by
   documented incident; kept only as secondary, pi-side history.

## Verdict: **reject**

Scored against the required axes:

- **New value — negligible.** Levels, redaction, child loggers and throughput
  have no consumer here; the audit-trail job is already done, better matched
  to the domain, and field-validated.
- **Overlap — near total.** RunLog already emits structured JSONL events that
  survive crashes and scrolling; pino would duplicate that surface without
  replacing its domain semantics.
- **Cost — real and asymmetric.** First runtime dependency in a package whose
  architecture doc commits to zero; 10 transitive deps inherited by every
  consuming project; a migration touching tested invariants (torn-line
  healing, best-effort degradation) for no functional gain.
- **Risk — material.** The recommended async mode carries an
  upstream-documented "most recently buffered messages may be lost on
  failure" semantics — the precise incident class this repo already paid for
  twice. Default stdout output additionally risks corrupting the host TUI.
- **Compatibility — workable but frictioned.** CJS-in-ESM works on Node 24;
  the friction is the worker-thread transport machinery inside a no-build,
  distributed-as-package context, plus LTS policy that allows breaking
  changes in minor releases for security fixes.
- **Reversibility — high, and it does not help.** Logging is isolated;
  removing pino later would be easy. But reversibility only lowers the cost of
  a mistake — it is not a reason to make one.

### Revisit triggers

Re-evaluate (likely as a **trial** with `pino.destination({ sync: true })`
into `.pi/pi-brain/`) if any of these materialize:

- pi-brain grows a long-running daemon/server mode (e.g. the Herdr execution
  and observability adapter floated in IDEAS.md) with high-volume diagnostic
  or request logging;
- diagnostic verbosity needs (per-phase trace levels, redaction of secrets in
  logs) outgrow what `console.error` + `ctx.ui` sensibly express;
- run volumes grow to the point where per-event write cost of synchronous
  appends is measurable in practice.

## Sources

- pino repository: https://github.com/pinojs/pino (README, `package.json`)
- pino docs (repo `main`): [asynchronous.md](https://github.com/pinojs/pino/blob/main/docs/asynchronous.md),
  [api.md](https://github.com/pinojs/pino/blob/main/docs/api.md),
  [lts.md](https://github.com/pinojs/pino/blob/main/docs/lts.md),
  [benchmarks.md](https://github.com/pinojs/pino/blob/main/docs/benchmarks.md),
  [transports.md](https://github.com/pinojs/pino/blob/main/docs/transports.md),
  [web.md](https://github.com/pinojs/pino/blob/main/docs/web.md)
- npm metadata: https://registry.npmjs.org/pino/latest ·
  https://api.npmjs.org/downloads/point/last-week/pino
- pino-pretty: https://github.com/pinojs/pino-pretty
- Local: `package.json`, `README.md`, `docs/pi-brain/ARCHITECTURE.md`,
  `docs/pi-brain/IDEAS.md`, `src/run-log.ts`, `src/ports.ts`,
  `src/run-lock.ts`, `extensions/pi-brain.ts`, `tests/run-log.test.ts`
