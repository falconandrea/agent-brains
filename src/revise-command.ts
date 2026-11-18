/**
 * The Pi-free `/flow revise` command orchestration (tasks T8, spec.md §6).
 *
 * Owns, in order:
 *  - the §6 precondition stage: the in-session active run (running AND
 *    cancelling, via `blocksFeatureStart`) → the persisted log → lifecycle
 *    routing (corrupt evidence fails closed; both incomplete-launch repair
 *    entry states; the successor pointer) → eligibility with the SHARED
 *    `already_decided` heal — re-evaluated from the healed log — before the
 *    session core's own preconditions and lock (§6 T1);
 *  - the detached revision-session runner: the extension's active slot is
 *    occupied with `workflow: "revision"` so /flow status and /flow stop
 *    answer during the planner; UI effects are best-effort (`safeUi`); the
 *    session signal carries /flow stop's cancellation; settlement NEVER
 *    appends execution-terminal events to the predecessor (the session core
 *    appends only `revision.*` through `appendCritical`, and the launcher is
 *    never wrapped around the session);
 *  - the successor handoff to the REAL `launchSuccessorRun` (T7): after a
 *    persisted approval the only paths are the launch repair and the B8
 *    forced exit (§14) — no ordinary abandonment is offered. The repair's
 *    lock releases exactly once before the handoff; after it, the successor
 *    launcher owns release until successor settlement. The settlement path
 *    therefore neither releases the successor's lock nor clears its active
 *    slot — the successor swap happens at the detached launch, and from then
 *    on `launchRun` drives the slot's own run state.
 *
 * No Pi imports: the extension injects the live UI/runtime constructors and
 * tests inject fakes (tests/revise-command.test.ts), mirroring `startRun`'s
 * injection discipline.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { readRunLog, RunLog } from "./run-log.ts";
import { safeUi } from "./ui-safe.ts";
import { blocksFeatureStart, type FlowRunStatus } from "./pi/flow-stop.ts";
import { roleConfig, type PiBrainConfig } from "./config.ts";
import { selectSkills } from "./skill-router.ts";
import type { AgentRunner } from "./agent.ts";
import type { GitService, HumanInput, VerifyRunner, WorkflowEvent } from "./ports.ts";
import { healAlreadyDecided } from "./workflows/resume.ts";
import {
  launchIncomplete,
  launchSuccessorRun,
  repairRevisionLaunch,
  revisionEligibility,
  revisionLifecycle,
  runRevisionSessionCore,
  type RepairLaunchOutcome,
  type RevisionSessionOutcome,
  type SuccessorLauncher,
} from "./workflows/revise.ts";

/**
 * The active-run record the extension publishes; /flow status folds it and
 * /flow stop mutates `status` and fires `abort`. Structurally the extension's
 * `ActiveRun` — the same object, one writer per lifecycle stage.
 */
export interface ReviseActiveRun {
  runId: string;
  workflow: string;
  phase: string;
  status: FlowRunStatus;
  events: WorkflowEvent[];
  abort: AbortController;
}

export interface FlowReviseDeps {
  /** Repository root (the predecessor's repo). */
  cwd: string;
  /** The predecessor run id from the command arguments. */
  runId: string;
  /** The session's active run, when one exists (null: idle). */
  active: { workflow: string; status: FlowRunStatus } | null;
  /** Publish or clear the extension's active-run slot. */
  setActive(run: ReviseActiveRun | null): void;
  /** UI notification (the module routes its own calls through `safeUi`). */
  notify(message: string, level: "info" | "warning" | "error"): void;
  /** Live human input (session dialogs, §10/§14 confirmations). */
  human: HumanInput;
  /**
   * Build the agent runtime AFTER every refusal — a refused /flow revise
   * never creates a runtime, a log file or an active slot (the /feature
   * `startRun` discipline, adapted to the revise ordering).
   */
  createAgents(): Promise<AgentRunner>;
  /** Fresh AbortController per execution (/flow stop fires the session's). */
  makeAbort(): AbortController;
  config: PiBrainConfig;
  profilesDir: string;
  availableSkills: ReadonlySet<string>;
  verifier: VerifyRunner;
  git: GitService;
  /** Pi-side history append (best-effort by contract). */
  history(event: WorkflowEvent): void;
  /** Status line setter; launchRun clears it when the successor settles. */
  setStatus(text: string | undefined): void;
  /** Terminal bell, already gated on config.notifications by the extension. */
  bell(): void;
  /** Observe the detached session promise (tests await; production drops it). */
  onDetached?: (run: Promise<void>) => void;
}

/**
 * `/flow revise <runId>`: the ordered refusal stage, then either the detached
 * revision session (new or resumed), the launch repair, or a plain refusal
 * notification. Never throws to the caller for refusals — every outcome is
 * reported through `notify`. The preconditions and the lock beyond the
 * routing stage belong to the session core and the repair, each of which
 * re-derives state from disk under its own lock (§6 T1, §7 step 0).
 */
export async function runFlowRevise(deps: FlowReviseDeps): Promise<void> {
  const { cwd, runId } = deps;
  // Every notification is best-effort (U8): a stale/removed Pi context must
  // never turn a refusal or a settlement into a thrown error.
  const notify = (message: string, level: "info" | "warning" | "error"): void =>
    safeUi("notify", () => deps.notify(message, level));

  // --- §6 ordering, stage 1: the in-session active run — running AND
  // cancelling both block — before any setup or mutation. ---
  if (deps.active && blocksFeatureStart(deps.active.status)) {
    notify(
      `pi-brain: another run is active in this session (${deps.active.workflow}). Use /flow stop first.`,
      "warning",
    );
    return;
  }

  // --- stage 2: persisted evidence, never session.json or process memory. ---
  const events = readRunLog(cwd, runId);
  if (events.length === 0) {
    notify(`pi-brain: unknown run ${runId}`, "warning");
    return;
  }

  // --- stage 3: lifecycle routing. Corrupt evidence fails closed. ---
  const lifecycle = revisionLifecycle(events);
  switch (lifecycle.state) {
    case "invalid":
      notify(
        `pi-brain: cannot revise ${runId} — the revision evidence in this log is corrupt (${lifecycle.reason}); ` +
          `inspect .pi/pi-brain/runs/${runId}.jsonl; the affected paths refuse until resolved`,
        "warning",
      );
      return;
    case "launched":
      if (!launchIncomplete(cwd, lifecycle.successorRunId)) {
        // T12: the successor recorded its first phase and is really running —
        // never open a competing revision or rerun a started successor.
        notify(
          `pi-brain: ${runId} was revised by ${lifecycle.successorRunId} — that successor is running; revise the successor run instead (/flow revise ${lifecycle.successorRunId}).`,
          "warning",
        );
        return;
      }
      // B7a/B7b/B7c: the pointer proves intent, not a running successor.
      await runRepair(deps, "the revision launch is incomplete", notify);
      return;
    case "approved-pending-launch":
      await runRepair(deps, "the revision was approved", notify);
      return;
    case "open":
    case "candidate-pending": {
      // The resumed session routes the PERSISTED stack's planner skills too —
      // the routing must not depend on which entry state reached the session.
      const resumeEligibility = revisionEligibility(events);
      const stackPrimary =
        "eligible" in resumeEligibility && resumeEligibility.eligible
          ? resumeEligibility.stack?.primary
          : undefined;
      startSession(deps, "resume", stackPrimary);
      return;
    }
    case "none":
    case "abandoned":
      break;
  }

  // --- stage 4: eligibility, with the shared already_decided heal first
  // (§5): heal, then re-evaluate the ACTUAL healed status from the log. ---
  let eligibility = revisionEligibility(events);
  if ("healFirst" in eligibility) {
    healAlreadyDecided(cwd, runId, eligibility);
    eligibility = revisionEligibility(readRunLog(cwd, runId));
    if ("healFirst" in eligibility) {
      notify(
        `pi-brain: cannot revise ${runId} — the already-decided outcome could not be recorded; run /flow resume once, then revise again`,
        "warning",
      );
      return;
    }
  }
  if (!eligibility.eligible) {
    notify(`pi-brain: cannot revise ${runId} — ${eligibility.message}`, "warning");
    return;
  }

  // --- stage 5: the §13/§10 preconditions and the lock are the session
  // core's (checked before and under its own lock, §6 T1). It runs detached:
  // planner rounds are unbounded, and /flow status|stop must keep answering. ---
  startSession(deps, "open", eligibility.stack?.primary);
}

/**
 * The detached revision-session runner: occupy the active slot, bring the
 * runtime up, run the session core with /flow stop's signal, then settle —
 * repair after a persisted approval, recovery notices otherwise. UI effects
 * are best-effort; the predecessor's execution history is never synthesized
 * (no workflow.outcome/failed/completed from this runner — only the session
 * core's `revision.*` appends and, before the session, the shared heal).
 */
function startSession(deps: FlowReviseDeps, mode: "open" | "resume", stackPrimary?: string): void {
  const { cwd, runId } = deps;
  const abort = deps.makeAbort();
  const run: ReviseActiveRun = {
    runId,
    workflow: "revision",
    phase: "revising",
    status: "running",
    events: [],
    abort,
  };
  deps.setActive(run);

  // Every effect AFTER the activation — the runtime construction, the
  // dependency wiring (profile resolution included: a profile that includes
  // a missing one throws), the session core and its settlement — is covered
  // by one guard. Any failure frees the slot (only while the SESSION still
  // owns it: a handed-off successor's slot is never touched) and reports the
  // failure best-effort. The detached promise then settles instead of
  // rejecting: the extension drops this promise, and an unhandled rejection
  // must never be the way a setup fault surfaces — a stuck revision/running
  // slot would block every later start.
  let slotReassigned = false;
  const markSlotReassigned = (): void => {
    slotReassigned = true;
  };

  const detached = (async () => {
    try {
      const agents = await deps.createAgents();
      // Skills route by the predecessor's persisted stack — only when that
      // profile file actually exists. A legacy log without a stack (the
      // core's prompt falls back to "unknown") gets no routed skills rather
      // than a missing top-level profile: skills are enrichment, never a
      // refusal. A profile that EXISTS but includes a missing one still
      // throws — the guard below settles the session instead.
      const plannerSkills =
        stackPrimary !== undefined && existsSync(join(deps.profilesDir, `${stackPrimary}.list`))
          ? selectSkills(deps.profilesDir, stackPrimary, "planner", deps.availableSkills).skills
          : undefined;
      const outcome = await runRevisionSessionCore({
        cwd,
        runId,
        agents,
        human: deps.human,
        git: deps.git,
        events: RunLog.open(cwd, runId),
        signal: abort.signal,
        mode,
        plannerModel: roleConfig(deps.config, "planner"),
        plannerSkills,
      });
      await settleSession(deps, run, outcome, agents, markSlotReassigned);
    } catch (err) {
      if (!slotReassigned) deps.setActive(null);
      safeUi("notify", () =>
        deps.notify(`pi-brain: could not start the revision session — ${(err as Error).message}`, "error"),
      );
    }
  })();

  if (deps.onDetached !== undefined) deps.onDetached(detached);
}

/** Settlement of the detached session; never synthesizes predecessor events. */
async function settleSession(
  deps: FlowReviseDeps,
  run: ReviseActiveRun,
  outcome: RevisionSessionOutcome,
  agents: AgentRunner,
  markSlotReassigned: () => void,
): Promise<void> {
  const { runId } = deps;
  switch (outcome.kind) {
    case "not-opened":
      // Dismissed before revision.started: nothing appended, nothing recovered.
      deps.setActive(null);
      return;
    case "open":
    case "candidate-pending": {
      deps.setActive(null);
      const cancelled = run.status === "cancelling";
      safeUi("notify", () =>
        deps.notify(
          cancelled
            ? `pi-brain: revision session cancelled — the revision of ${runId} stays recoverable via /flow revise ${runId}.`
            : `pi-brain: revision ${outcome.revision} of ${runId} stays ${outcome.kind === "open" ? "open" : "candidate-pending"} — continue it with /flow revise ${runId}.`,
          "info",
        ),
      );
      return;
    }
    case "abandoned":
      deps.setActive(null);
      safeUi("notify", () =>
        deps.notify(
          `pi-brain: revision ${outcome.revision} of ${runId} abandoned — its sidecar was removed; partial code was never touched.`,
          "info",
        ),
      );
      return;
    case "approved": {
      // After a persisted approval there is NO ordinary abandonment (§14):
      // the only paths are the launch repair and the B8 forced exit, both
      // inside repairRevisionLaunch. Awaited here so the detached promise
      // covers the session AND its handoff; the successor execution itself
      // detaches inside launchSuccessorRun.
      // Cancellation gate: a /flow stop that arrived while the approval was
      // being persisted is respected BEFORE the launch — the approval stays
      // on disk (authoritative, recoverable) but no successor starts.
      if (run.status === "cancelling" || run.abort.signal.aborted) {
        deps.setActive(null);
        safeUi("notify", () =>
          deps.notify(
            `pi-brain: revision session cancelled after the approval — the successor launch was NOT started; ` +
              `the approved revision stays recoverable via /flow revise ${runId}.`,
            "warning",
          ),
        );
        return;
      }
      let repair: RepairLaunchOutcome;
      try {
        repair = await repairRevisionLaunch({
          cwd: deps.cwd,
          runId,
          human: deps.human,
          events: RunLog.open(deps.cwd, runId),
          launch: successorLauncher(deps, agents, run, markSlotReassigned),
        });
      } catch (err) {
        deps.setActive(null);
        safeUi("notify", () =>
          deps.notify(
            `pi-brain: the approved revision launch failed unexpectedly — ${(err as Error).message} ` +
              `The approved state stays recoverable via /flow revise ${runId}.`,
            "error",
          ),
        );
        return;
      }
      settleRepair(deps, repair, true);
      return;
    }
    case "refused":
      deps.setActive(null);
      safeUi("notify", () =>
        deps.notify(`pi-brain: cannot revise ${runId} — ${outcome.reason}`, "warning"),
      );
      return;
    case "failed":
      deps.setActive(null);
      safeUi("notify", () =>
        deps.notify(
          `pi-brain: revision session failed — ${outcome.error}; the revision state stays recoverable via /flow revise ${runId}.`,
          "error",
        ),
      );
      return;
  }
}

/**
 * The launch repair run in the foreground when entered directly from the
 * command (approved-pending-launch, or launched with an incomplete launch):
 * its dialogs are user interactions like resume's §10 confirmation, and the
 * successor execution itself detaches inside `launchSuccessorRun`.
 */
async function runRepair(deps: FlowReviseDeps, why: string, notify: (message: string, level: "info" | "warning" | "error") => void): Promise<void> {
  notify(`pi-brain: ${why} — completing the launch of ${deps.runId}.`, "info");
  let agents: AgentRunner;
  try {
    agents = await deps.createAgents();
  } catch (err) {
    notify(`pi-brain: could not start the launch repair — ${(err as Error).message}`, "error");
    return;
  }
  try {
    const outcome = await repairRevisionLaunch({
      cwd: deps.cwd,
      runId: deps.runId,
      human: deps.human,
      events: RunLog.open(deps.cwd, deps.runId),
      launch: successorLauncher(deps, agents),
    });
    settleRepair(deps, outcome, false);
  } catch (err) {
    notify(`pi-brain: the launch repair failed — ${(err as Error).message}`, "error");
  }
}

/**
 * Repair settlement. `ownsSlot` is true when the repair follows the detached
 * session (the slot holds the settled revision run and must be cleared on a
 * non-launched outcome) and false for the direct command entry (the slot may
 * hold an unrelated settled run and is left untouched on refusals — only a
 * real launch replaces it, via the adapter's detached-launch swap).
 */
function settleRepair(deps: FlowReviseDeps, outcome: RepairLaunchOutcome, ownsSlot: boolean): void {
  const { runId } = deps;
  switch (outcome.kind) {
    case "launched":
      // The successor now owns the active slot (swapped at the detached
      // launch) and the lock (handed off exactly once, released when the
      // successor settles). Neither is touched here.
      safeUi("notify", () =>
        deps.notify(
          [
            `pi-brain: successor ${outcome.successorRunId} launched from the approved revision of ${runId}` +
              (outcome.resumedPhase !== undefined ? ` (resumed at ${outcome.resumedPhase})` : "") +
              " — /flow status, /flow log, /flow stop.",
            ...outcome.archiveLosses.map((loss) => `pi-brain: ${loss}`),
          ].join("\n"),
          "info",
        ),
      );
      return;
    case "refused":
      if (ownsSlot) deps.setActive(null);
      safeUi("notify", () =>
        deps.notify(
          `pi-brain: the approved revision launch was refused — ${outcome.reason} The approved state stays recoverable via /flow revise ${runId}.`,
          "warning",
        ),
      );
      return;
    case "failed":
      if (ownsSlot) deps.setActive(null);
      // A cancellation at the handoff (stop during the launcher's dialogs) is
      // a warning, not a failure: the approval is persisted and the
      // pointer-plus-incomplete state stays recoverable.
      if (outcome.error.includes("launch cancelled")) {
        safeUi("notify", () =>
          deps.notify(
            `pi-brain: the successor launch was cancelled before the handoff — the approved revision stays recoverable via /flow revise ${runId}.`,
            "warning",
          ),
        );
        return;
      }
      safeUi("notify", () =>
        deps.notify(
          `pi-brain: the approved revision launch failed — ${outcome.error} The approved state stays recoverable via /flow revise ${runId}.`,
          "error",
        ),
      );
      return;
    case "abandoned-forced":
      if (ownsSlot) deps.setActive(null);
      safeUi("notify", () =>
        deps.notify(
          `pi-brain: forced abandonment recorded for revision ${outcome.revision} of ${runId} — ${outcome.report}`,
          "warning",
        ),
      );
      return;
  }
}

/**
 * The T7 launch adapter: wires `launchSuccessorRun` with the injected
 * workflow dependencies and the extension's successor slot. The successor's
 * active-run record is built from the repair's own request id (never a
 * locally re-derived guess), its AbortController becomes the successor's
 * cancellation signal, and the slot swap happens at the DETACHED launch —
 * after every preflight and §10 refusal, so a refused launch leaves no ghost
 * slot and, on handoff failure, the repair keeps its lock and reports.
 */
function successorLauncher(
  deps: FlowReviseDeps,
  agents: AgentRunner,
  sessionRun?: ReviseActiveRun,
  onSwap?: () => void,
): SuccessorLauncher {
  return (request, context) => {
    const abort = deps.makeAbort();
    // Until the handoff, the successor inherits the session's cancellation:
    // a /flow stop landing during the launcher's dialogs must reach the
    // launcher's final cancellation gate, so the successor controller is
    // chained to the session's signal. After the slot swap, /flow stop
    // targets the successor's own controller and the session signal never
    // aborts — the listener is inert from then on.
    if (sessionRun !== undefined) {
      sessionRun.abort.signal.addEventListener("abort", () => abort.abort(), { once: true });
    }
    const successorRun: ReviseActiveRun = {
      runId: request.successorRunId,
      workflow: "feature",
      phase: "develop",
      status: "running",
      events: [],
      abort,
    };
    return launchSuccessorRun(
      {
        cwd: deps.cwd,
        config: deps.config,
        profilesDir: deps.profilesDir,
        availableSkills: deps.availableSkills,
        agents,
        human: deps.human,
        verifier: deps.verifier,
        git: deps.git,
        signal: abort.signal,
        history: (event) => deps.history(event),
        setStatus: (text) => deps.setStatus(text),
        notify: (message, level) => deps.notify(message, level),
        bell: () => deps.bell(),
        run: successorRun,
        onDetached: () => {
          // The session slot is handed over: from this moment the runner's
          // guard must never clear the slot on a late failure.
          onSwap?.();
          deps.setActive(successorRun);
        },
      },
      request,
      context,
    );
  };
}
