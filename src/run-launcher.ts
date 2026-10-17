/**
 * Shared run launcher (U6, F7): the ONE place that owns a run's execution
 * cycle. `/feature` and `/flow resume` both go through `launchRun`; before
 * it existed, the event sink, the outcome emission, the detached runner and
 * the lock release were duplicated across the two commands, so every fix
 * had to be applied twice.
 *
 * The extension does the wiring — lock acquisition, agent runtime, RunLog,
 * Pi-side history, UI — and injects every effect as a plain callback. This
 * module imports no Pi (only the port contract in ports.ts), so the whole
 * execution cycle runs in a unit test with fakes
 * (tests/run-launcher.test.ts).
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
 *  - completion, cancellation (UserDismissedError) and error handling;
 *  - the run lock, released exactly once, when the run settles.
 *
 * Detached execution stays the caller's decision: `launchRun` returns the
 * promise of the run body and the extension ignores it
 * (`void launchRun(...)`) so `/flow status|log|stop` keep answering while
 * the workflow runs. Workflow failures settle as events, never as a
 * rejection — but until U8 a throwing UI effect (notify/bell/status) can
 * still reject that promise, exactly as the former inline runners could
 * (F6).
 *
 * U7 (lock before side effects) and U8 (best-effort UI) will be applied on
 * this single point; until then the call order below is exactly the one the
 * two former inline runners had.
 */

import { UserDismissedError } from "./ports.ts";
import type { WorkflowEvent, WorkflowEventSink } from "./ports.ts";
import type { FlowRunStatus } from "./pi/flow-stop.ts";
import type { FeatureOutcome, UsageByRole } from "./workflows/feature.ts";

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
      deps.notify(renderOutcome(outcome), outcome.status === "completed" ? "info" : "warning");
      deps.bell();
    } catch (err) {
      deps.run.status = err instanceof UserDismissedError ? "cancelled" : "failed";
      const message = (err as Error).message;
      events.emit({ type: "workflow.failed", runId: deps.run.runId, error: message });
      deps.notify(`pi-brain: ${message}`, "error");
    } finally {
      deps.lock.release();
      deps.setStatus(undefined);
    }
  })();
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
        deps.setStatus(`${deps.run.workflow}: ${event.phase}`);
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
