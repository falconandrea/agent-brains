/**
 * Shared run launcher (U6, F7): the ONE place that owns a run's execution
 * cycle. `/feature` and `/flow resume` both go through `launchRun`; before
 * it existed, the event sink, the outcome emission, the detached runner and
 * the lock release were duplicated across the two commands, so every fix
 * had to be applied twice.
 *
 * The extension does the wiring — agent runtime, RunLog, Pi-side history,
 * UI — and injects every effect as a plain callback. `startRun` below owns
 * the order in which that wiring runs: the run lock is acquired BEFORE the
 * runtime and the audit log (F5/U7). This module imports no Pi (only the
 * port contract in ports.ts), so both the start sequence and the execution
 * cycle run in unit tests with fakes (tests/run-start.test.ts,
 * tests/run-launcher.test.ts).
 *
 * It owns:
 *  - the event sink: the in-memory buffer `/flow status` folds, the
 *    best-effort Pi-side history, the run log (the audit trail of record)
 *    and the current-phase tracking;
 *  - the `workflow.outcome` event: built in exactly one place, from the
 *    FeatureOutcome the workflow returned, persisted before any TUI
 *    rendering can lose it;
 *  - the run-state transitions (`running` -> `completed` | `needs_human` |
 *    `cancelled` | `failed`) that `/flow stop` and `/feature` admission
 *    read;
 *  - completion, cancellation (UserDismissedError) and error handling, with
 *    best-effort UI effects (U8): a broken notify/bell/status is reported
 *    once on stderr and cannot corrupt the run or leak the lock;
 *  - the run lock, released exactly once, when the run settles.
 *
 * `startRun` is the ordered prologue `launchRun` cannot cover on its own:
 * acquiring the lock before any side effect, releasing it exactly once if
 * the runtime fails to come up, and handing it to `launchRun` when the run
 * really starts.
 *
 * Detached execution stays the caller's decision: `launchRun` returns the
 * promise of the run body and the extension ignores it
 * (`void launchRun(...)`) so `/flow status|log|stop` keep answering while
 * the workflow runs. Workflow failures settle as events, never as a
 * rejection; the UI effects (notify/bell/status) are best-effort (U8, F6):
 * a throw is reported once on stderr (`safeUi`, in the Pi-free
 * `src/ui-safe.ts`) and swallowed, so it cannot change the persisted outcome,
 * emit a `workflow.failed` after `workflow.outcome`, reject that promise, or
 * skip the lock release. The per-agent-event status line the runtime fires
 * during a run is covered by `agentStatus` (same guard) and the workflow's
 * internal `human.notify` calls by `withBestEffortNotify`, so every
 * informational UI path is best-effort. Workflow and persistence failures
 * stay loud.
 */

import { UserDismissedError } from "./ports.ts";
import type { WorkflowEvent, WorkflowEventSink } from "./ports.ts";
import type { AcquireResult } from "./run-lock.ts";
import type { FlowRunStatus } from "./pi/flow-stop.ts";
import type { FeatureOutcome, UsageByRole } from "./workflows/feature.ts";
import { safeUi } from "./ui-safe.ts";

/**
 * The mutable run record the /flow commands read while the run lives. The
 * extension's ActiveRun satisfies this structurally (it additionally holds
 * the AbortController /flow stop fires).
 */
export interface LauncherRunState {
  runId: string;
  workflow: string;
  phase: string;
  status: FlowRunStatus;
  /** In-memory event buffer; the run log is the durable source of truth. */
  events: WorkflowEvent[];
}

export interface LaunchRunDeps {
  run: LauncherRunState;
  /** Durable audit trail (`RunLog`) — receives every event, history failures notwithstanding. */
  runLog: { append(event: WorkflowEvent): void };
  /**
   * Pi-side history append (`pi.appendEntry`). Best-effort by contract: a
   * throw (replaced/stale Pi context) is swallowed so neither the run log
   * nor the failure handler below loses its event.
   */
  history(event: WorkflowEvent): void;
  /** Status line setter; called with `undefined` to clear it when the run ends. */
  setStatus(text: string | undefined): void;
  /** UI notification of the final outcome / fatal error. */
  notify(message: string, level: "info" | "warning" | "error"): void;
  /** Terminal bell; the wiring gates it on `config.notifications.bell`. */
  bell(): void;
  /** The run lock; released exactly once, when the run settles. */
  lock: { release(): void };
}

export interface LaunchRunOptions {
  /**
   * Resume mode: a `workflow.resumed` event with this phase is emitted —
   * synchronously, before the workflow is invoked — so the marker is
   * already in every sink (and on disk) if the process dies right after
   * launch.
   */
  resumedPhase?: string;
}

/**
 * Run a workflow to completion. The `runWorkflow` callback receives the
 * event sink and returns the workflow's outcome promise; it is invoked
 * inside the run body, so a synchronous throw from the wiring (agent
 * runtime, verifier, git service construction) is handled like a
 * rejection: an observable `workflow.failed` event, not a leaked lock.
 */
export function launchRun(
  deps: LaunchRunDeps,
  runWorkflow: (events: WorkflowEventSink) => Promise<FeatureOutcome>,
  options: LaunchRunOptions = {},
): Promise<void> {
  const events = createEventSink(deps);
  return (async () => {
    try {
      // Inside the body, not before it: a sink callback that throws on
      // this first event (a broken run-log dep) still reaches the finally
      // below, so it cannot leak the lock. The body runs synchronously up
      // to the first await, so the marker is emitted before the workflow
      // is invoked and before launchRun returns.
      if (options.resumedPhase !== undefined) {
        events.emit({ type: "workflow.resumed", runId: deps.run.runId, phase: options.resumedPhase });
      }
      const outcome = await runWorkflow(events);
      deps.run.status = outcome.status;
      // Persist the full outcome — review findings included — before any
      // TUI rendering can lose it (IDEAS.md run-state escalation).
      events.emit(outcomeEvent(deps.run.runId, outcome));
      // U8 (F6): the UI effects are best-effort. A stale/removed Pi context
      // throwing here must not reach the catch below — it would persist a
      // contradictory `workflow.failed` after `workflow.outcome` — nor reject
      // the detached promise the extension ignores with `void launchRun(...)`.
      safeUi("notify", () =>
        deps.notify(renderOutcome(outcome), outcome.status === "completed" ? "info" : "warning"),
      );
      safeUi("bell", () => deps.bell());
    } catch (err) {
      // Reached by workflow failures and persistence failures only: the UI
      // effects above and below go through `safeUi`, so they never land here.
      deps.run.status = err instanceof UserDismissedError ? "cancelled" : "failed";
      const message = (err as Error).message;
      events.emit({ type: "workflow.failed", runId: deps.run.runId, error: message });
      safeUi("notify", () => deps.notify(`pi-brain: ${message}`, "error"));
    } finally {
      deps.lock.release();
      safeUi("status", () => deps.setStatus(undefined));
    }
  })();
}

/** The agent-event shape the runtime passes to `onEvent`. */
export interface AgentStatusEvent {
  role: string;
  type: string;
  detail?: string;
}

/**
 * Build the extension's per-agent-event status line, best-effort (U8, F6).
 * The runtime invokes `onEvent` from its session listener DURING a run —
 * outside the launcher's own body, so the launcher's `safeUi` does not cover
 * it. Without this wrapper a stale `ctx.ui.setStatus` throwing on a
 * tool/agent_end event escapes the listener and can interfere with the
 * workflow. Same contract as `safeUi`: built status is set for every event,
 * a throw is reported once on stderr and swallowed. Both `/feature` and
 * `/flow resume` build their `onEvent` through here, so the guard lives in
 * one place.
 */
export function agentStatus(
  setStatus: (text: string | undefined) => void,
): (event: AgentStatusEvent) => void {
  return (event) =>
    safeUi("status", () =>
      setStatus(`${event.role}: ${event.type}${event.detail ? ` ${event.detail}` : ""}`),
    );
}

/**
 * Why the ordered start stopped before the run launched. The extension owns
 * the wording (a UI concern); the shape carries what it needs.
 */
export type StartRunFailure =
  | { kind: "lock_error"; error: unknown }
  | { kind: "lock_refused"; lock: Extract<AcquireResult, { ok: false }> }
  | { kind: "runtime_error"; error: unknown };

export interface StartRunDeps<R extends LauncherRunState, Agents, Log> {
  /** The run record to publish as active before the runtime is created. */
  run: R;
  /**
   * Publish (or clear) the active run — `/feature` admission and `/flow stop`
   * read it. Cleared on every failure, so a refused start leaves no ghost run.
   */
  setActive(run: R | null): void;
  /** Acquire the repository run lock; may throw on a filesystem error. */
  acquireLock(): AcquireResult;
  /** Build the agent runtime (`PiAgentRunner.create` in production). */
  createAgents(): Promise<Agents>;
  /** Open the durable audit trail (`RunLog.open`); only after lock + runtime. */
  openRunLog(): Log;
  /** Report a failure to run. The active state is already restored. */
  onFailure(failure: StartRunFailure): void;
  /** Every effect succeeded: hand the lock to the launcher, which releases it. */
  launch(input: { run: R; lock: { release(): void }; agents: Agents; runLog: Log }): void;
}

/**
 * U7 (F5): the ordered prologue `/feature` runs before the detached launcher
 * can take over. The run lock is acquired BEFORE any side effect — the agent
 * runtime and the audit log — so a refused lock creates no
 * `.pi/pi-brain/runs/<runId>.jsonl` (which `/flow log-all` would list as
 * `in-progress-or-interrupted`) and no runtime to tear down. If the runtime
 * fails to come up once the lock is held, the lock is released exactly once
 * and the run stops being active. When every effect has succeeded, the lock's
 * ownership passes to `launch`, whose `launchRun` releases it when the run
 * settles: the two paths are disjoint, so no run can release twice.
 *
 * Every effect is injected, so the ordering is unit-tested with fakes and no
 * Pi session or model (tests/run-start.test.ts). `/flow resume` keeps its own
 * already lock-first sequence.
 */
export async function startRun<R extends LauncherRunState, Agents, Log>(
  deps: StartRunDeps<R, Agents, Log>,
): Promise<void> {
  let lock: Extract<AcquireResult, { ok: true }>;
  try {
    const acquired = deps.acquireLock();
    if (!acquired.ok) {
      // No "run anyway": the refusal happens before any side effect, so
      // there is nothing to roll back and the run never becomes active.
      deps.setActive(null);
      deps.onFailure({ kind: "lock_refused", lock: acquired });
      return;
    }
    lock = acquired;
  } catch (error) {
    deps.setActive(null);
    deps.onFailure({ kind: "lock_error", error });
    return;
  }

  // The lock is held: only now does the run become active and the runtime
  // get built. A failure here releases the lock exactly once.
  deps.setActive(deps.run);
  let agents: Agents;
  try {
    agents = await deps.createAgents();
  } catch (error) {
    lock.release();
    deps.setActive(null);
    deps.onFailure({ kind: "runtime_error", error });
    return;
  }

  // Every refusal is past: opening the log touches the file, so it is the
  // last side effect before the run is handed to the launcher.
  const runLog = deps.openRunLog();
  deps.launch({ run: deps.run, lock, agents, runLog });
}

/**
 * The event sink both command paths share: buffer, Pi-side history
 * (best-effort), run log (durable), phase tracking. The order — history
 * attempt before the run-log append — is the one the audit trail grew up
 * with and is part of the observable behavior.
 */
function createEventSink(deps: LaunchRunDeps): WorkflowEventSink {
  return {
    emit(event: WorkflowEvent): void {
      deps.run.events.push(event);
      try {
        deps.history(event); // pi-side history (unreliable — see run-log.ts)
      } catch {
        // Best-effort by contract: a replaced/stale Pi context must not
        // stop OUR audit trail, nor make the failure handler above lose
        // its workflow.failed event by throwing again.
      }
      deps.runLog.append(event); // OUR audit trail: survives crashes and scrolling
      if (event.type === "phase.started") {
        deps.run.phase = event.phase;
        // UI effect (U8/F6): a throwing status line must not abort the
        // workflow's emit call, which would turn a UI hiccup into a workflow
        // failure and a contradictory workflow.failed.
        safeUi("status", () => deps.setStatus(`${deps.run.workflow}: ${event.phase}`));
      }
    },
  };
}

type OutcomeEvent = Extract<WorkflowEvent, { type: "workflow.outcome" }>;

/** The persisted outcome event, built from the workflow's return value. */
function outcomeEvent(runId: string, outcome: FeatureOutcome): OutcomeEvent {
  return {
    type: "workflow.outcome",
    runId,
    status: outcome.status,
    ...("reason" in outcome && outcome.reason !== undefined ? { reason: outcome.reason } : {}),
    ...("summary" in outcome && outcome.summary !== undefined ? { summary: outcome.summary } : {}),
    ...("files" in outcome && outcome.files !== undefined ? { files: outcome.files } : {}),
    ...("review" in outcome && outcome.review !== undefined
      ? {
          review: {
            verdict: outcome.review.verdict,
            summary: outcome.review.summary,
            issues: outcome.review.issues.map((i) => ({
              id: i.id,
              severity: i.severity,
              category: i.category,
              problem: i.problem,
              ...(i.file !== undefined ? { file: i.file } : {}),
              ...(i.line !== undefined ? { line: i.line } : {}),
              ...(i.recommendation !== undefined ? { recommendation: i.recommendation } : {}),
            })),
          },
        }
      : {}),
    usage: Object.fromEntries(
      Object.entries(outcome.usage).map(([role, u]) => [
        role,
        { input: u?.input ?? 0, output: u?.output ?? 0 },
      ]),
    ),
  };
}

/** "planner 1.2k/0.4k · developer 8.9k/2.1k · total 10.1k/2.5k" (in/out). */
export function renderUsage(usage: UsageByRole): string {
  const roles = Object.entries(usage);
  if (roles.length === 0) return "";
  const parts = roles.map(([role, u]) => `${role} ${fmtTokens(u!.input)}/${fmtTokens(u!.output)}`);
  const total = roles.reduce(
    (acc, [, u]) => ({ input: acc.input + u!.input, output: acc.output + u!.output }),
    { input: 0, output: 0 },
  );
  parts.push(`total ${fmtTokens(total.input)}/${fmtTokens(total.output)}`);
  return `tokens in/out: ${parts.join(" · ")}`;
}

/** 1234 → "1.2k", 250 → "250" — compact enough for a status line. */
export function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function renderOutcome(outcome: FeatureOutcome): string {
  const usageLine = renderUsage(outcome.usage);
  switch (outcome.status) {
    case "completed":
      return [
        `✓ FEATURE COMPLETE (automated review) — ${outcome.files.length} files changed, no commit created. ` +
          `Inspect git diff before committing: the human commit IS the final gate.`,
        outcome.summary,
        outcome.review.issues.length > 0
          ? `${outcome.review.issues.length} non-blocking note(s) left by the reviewer.`
          : "",
        usageLine,
        "Inspect with: git diff",
      ]
        .filter(Boolean)
        .join("\n");
    case "needs_human":
      return ["⚠ NEEDS HUMAN — " + outcome.reason, usageLine, "Full findings: /flow log", "Past runs: /flow log-all"]
        .filter(Boolean)
        .join("\n");
    default:
      return `cancelled at ${outcome.at}`;
  }
}
