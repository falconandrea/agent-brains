/**
 * Post-stop plan revision (`/flow revise`, spec.md): eligibility, lifecycle,
 * successor id, launch completeness, the Pi-free revision session core, the
 * ordinary-resume interplay refusals, and the T6 promotion sequence —
 * approval binding verification, archive-then-overwrite promotion, the
 * deterministic successor seed with prefix-verified recovery, the idempotent
 * pointer, and the B2b–B8 launch repair behind an injected launch port.
 *
 * Same discipline as `replayRunLog` (workflows/resume.ts): pure, Pi-free,
 * state always reconstructed from persisted evidence (events + files), never
 * from session liveness. Every decision consumes only what the predecessor
 * log and the sidecar directory can prove on disk.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import type { GitBaseline, GitService, HumanInput, WorkflowEvent } from "../ports.ts";
import { UserDismissedError } from "../ports.ts";
import type { AgentRunResult, AgentRunner, ModelSelection } from "../agent.ts";
import {
  RunLog,
  CriticalAppendError,
  canonicalEventJson,
  deriveEventId,
  readRunLog,
  runLogPath,
  stableJson,
  withEventId,
} from "../run-log.ts";
import type { AcquireResult } from "../run-lock.ts";
import { acquireRunLock, describeLock } from "../run-lock.ts";
import { changedScriptKeys, type VerifyFreeze } from "../verify.ts";
import { foldCallUsage, hasUsageData, type UsageByRole } from "../usage.ts";
import type { ReviewResult } from "../review.ts";
import { replayRunLog, replayVerifyFreeze, type Refusal } from "./resume.ts";
import {
  MAX_PLAN_REVISIONS,
  descriptionMarker,
  findExistingFeatureSlug,
  persistRejectedPlannerOutput,
  validatePlannerOutput,
} from "./feature.ts";
import { POST_STOP_REVISION_PROMPT } from "./feature-prompts.ts";

// ---------------------------------------------------------------------------
// Event aliases
// ---------------------------------------------------------------------------

export type RevisionStartedEvent = Extract<WorkflowEvent, { type: "revision.started" }>;
export type RevisionCandidateEvent = Extract<WorkflowEvent, { type: "revision.candidate" }>;
export type RevisionCandidateRejectedEvent = Extract<WorkflowEvent, { type: "revision.candidate.rejected" }>;
export type RevisionApprovedEvent = Extract<WorkflowEvent, { type: "revision.approved" }>;
export type RevisionAbandonedEvent = Extract<WorkflowEvent, { type: "revision.abandoned" }>;
export type RevisionLaunchedEvent = Extract<WorkflowEvent, { type: "revision.launched" }>;

// ---------------------------------------------------------------------------
// Eligibility (spec.md §5)
// ---------------------------------------------------------------------------

/** Why a predecessor cannot be revised. */
export type RevisionRefusalReason =
  | "empty_log"
  | "missing_workflow_started"
  | "not_feature_workflow"
  | "missing_evidence"
  | "corrupt_verify_freeze"
  | "gate_not_approved"
  | "missing_spec_approval"
  | "terminal_completed"
  | "unknown_terminal_status"
  | "replay_refused";

export type RevisionEligibility =
  | {
      eligible: true;
      /** The predecessor status driving dialogs and the approval event. */
      status: "cancelled" | "needs_human" | "interrupted" | "failed";
      description: string;
      baselineCommit: string;
      stack?: { primary: string; frameworks: string[] };
      /** Frozen verify inputs; absent means a legacy log (degraded guards). */
      verify?: VerifyFreeze;
      repoStateDigest?: string;
      ignoreRulesDigest?: string;
      /** Hashes of the still-approved artifacts — the revision's baseContract. */
      spec: { prdSha: string; tasksSha: string };
      /** Predecessor usage folded from agent.completed events (chain accounting). */
      usage: UsageByRole;
      /** Legacy log: absent verify freeze and/or absent repository-state digest. */
      degradedGuards: boolean;
    }
  | { eligible: false; reason: RevisionRefusalReason; message: string }
  | {
      /** `already_decided`: the caller heals first (§5), then re-runs eligibility. */
      healFirst: true;
      status: "needs_human" | "completed";
      review?: ReviewResult;
      files?: string[];
      usage: UsageByRole;
    };

const sha256Hex = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

/** Usage folded exactly like replayRunLog does — the one accounting rule. */
function foldLogUsage(events: WorkflowEvent[]): UsageByRole {
  const usage: UsageByRole = {};
  for (const event of events) {
    if (event.type === "agent.completed" && hasUsageData(event.usage)) {
      usage[event.role] = foldCallUsage(usage[event.role], event.usage);
    }
  }
  return usage;
}

/**
 * The §5 verdict table. Event-derivable rows only: the in-session rows
 * (running/cancelling, lock held) are the command layer's concern, and the
 * lifecycle redirect is composed with `revisionLifecycle` by the caller.
 */
export function revisionEligibility(events: WorkflowEvent[]): RevisionEligibility {
  if (events.length === 0) {
    return { eligible: false, reason: "empty_log", message: "the run log is empty" };
  }
  const started = events[0];
  if (started?.type !== "workflow.started") {
    return {
      eligible: false,
      reason: "missing_workflow_started",
      message: "the log does not start with workflow.started",
    };
  }
  if (started.workflow !== "feature") {
    return {
      eligible: false,
      reason: "not_feature_workflow",
      message: `not a feature workflow (${started.workflow})`,
    };
  }
  // Legacy minimum evidence: artifacts lookup and original-baseline diffing
  // are impossible without both — same floor ordinary resume requires.
  if (!started.description || !started.baseline) {
    return {
      eligible: false,
      reason: "missing_evidence",
      message: "the log predates the minimum evidence revision requires (description + baseline)",
    };
  }
  // Corrupt freeze fails closed (same as corrupt_verify_freeze in replay);
  // ABSENT freeze is legacy compatibility, not corruption.
  const freezeReplay = replayVerifyFreeze(started);
  if (freezeReplay.kind === "corrupt") {
    return {
      eligible: false,
      reason: "corrupt_verify_freeze",
      message: "the persisted verify freeze is corrupt — restore the scripts or start a new run",
    };
  }

  const spec = lastSpecApproval(events);
  const usage = foldLogUsage(events);
  const degradedGuards = started.verify === undefined || started.repoStateDigest === undefined;

  // Terminal status reading precedes replay: cancelled/needs_human ARE
  // eligible although replay would refuse them as terminal outcomes.
  const terminal = events.find(
    (event): event is Extract<WorkflowEvent, { type: "workflow.outcome" | "workflow.completed" }> =>
      event.type === "workflow.outcome" || event.type === "workflow.completed",
  );
  if (terminal) {
    if (terminal.status === "cancelled") {
      return eligibleVerdict(started, spec, usage, "cancelled", degradedGuards);
    }
    if (terminal.status === "needs_human") {
      return eligibleVerdict(started, spec, usage, "needs_human", degradedGuards);
    }
    if (terminal.status === "completed") {
      return {
        eligible: false,
        reason: "terminal_completed",
        message: "the run completed — a new requirement on a completed feature is a new /feature, not a revision",
      };
    }
    return {
      eligible: false,
      reason: "unknown_terminal_status",
      message: `unknown terminal status "${terminal.status}" — refusing to revise`,
    };
  }

  // No outcome: follow replay — interrupted mid-loop or workflow.failed after
  // provider death are eligible; already_decided forwards to the healer.
  const replay = replayRunLog(events);
  if (replay.ok) {
    const failed = events.some((event) => event.type === "workflow.failed");
    return eligibleVerdict(started, spec, usage, failed ? "failed" : "interrupted", degradedGuards);
  }
  const refusal = replay.refusal;
  if (refusal.type === "already_decided") {
    return {
      healFirst: true,
      status: refusal.status,
      usage: refusal.usage,
      ...(refusal.review !== undefined ? { review: refusal.review } : {}),
      ...(refusal.files !== undefined ? { files: refusal.files } : {}),
    };
  }
  if (refusal.type === "gate_not_approved") {
    return {
      eligible: false,
      reason: "gate_not_approved",
      message: "nothing approved exists to revise — the run never passed the spec gate",
    };
  }
  return {
    eligible: false,
    reason: "replay_refused",
    message: `the predecessor log cannot be revised: ${refusal.type}`,
  };
}

function eligibleVerdict(
  started: Extract<WorkflowEvent, { type: "workflow.started" }>,
  spec: { prdSha: string; tasksSha: string } | undefined,
  usage: UsageByRole,
  status: "cancelled" | "needs_human" | "interrupted" | "failed",
  degradedGuards: boolean,
): RevisionEligibility {
  // Without a replayed spec.approved there is no verifiable baseContract:
  // opening a revision would bless unverifiable artifacts as the approved
  // plan. Fail closed (documented residual: pre-spec-freeze logs).
  if (!spec) {
    return {
      eligible: false,
      reason: "missing_spec_approval",
      message: "the log has no spec.approved event — the approved contract cannot be verified for revision",
    };
  }
  const { description, baseline } = started;
  return {
    eligible: true,
    status,
    // The guards above established both fields.
    description: description as string,
    baselineCommit: baseline as string,
    ...(started.stack !== undefined ? { stack: started.stack } : {}),
    ...(started.verify !== undefined ? { verify: started.verify } : {}),
    ...(started.repoStateDigest !== undefined ? { repoStateDigest: started.repoStateDigest } : {}),
    ...(started.ignoreRulesDigest !== undefined ? { ignoreRulesDigest: started.ignoreRulesDigest } : {}),
    spec,
    usage,
    degradedGuards,
  };
}

/** Hashes of the still-approved artifacts: the LAST spec.approved in the log. */
function lastSpecApproval(
  events: WorkflowEvent[],
): { prdSha: string; tasksSha: string } | undefined {
  let spec: { prdSha: string; tasksSha: string } | undefined;
  for (const event of events) {
    if (event.type === "spec.approved") spec = { prdSha: event.prdSha, tasksSha: event.tasksSha };
  }
  return spec;
}

// ---------------------------------------------------------------------------
// Revision event parsing, dedup and lifecycle (spec.md §8, §6)
// ---------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const isRound = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;
const isShaPair = (value: unknown): value is { prdSha: string; tasksSha: string } =>
  isRecord(value) && isNonEmptyString(value.prdSha) && isNonEmptyString(value.tasksSha) &&
  HEX64.test(value.prdSha) && HEX64.test(value.tasksSha);

type ParsedRevisionEvent =
  | { kind: "started"; event: RevisionStartedEvent }
  | { kind: "candidate"; event: RevisionCandidateEvent }
  | { kind: "candidate-rejected"; event: RevisionCandidateRejectedEvent }
  | { kind: "approved"; event: RevisionApprovedEvent }
  | { kind: "abandoned"; event: RevisionAbandonedEvent }
  | { kind: "launched"; event: RevisionLaunchedEvent };

/** The six known revision lifecycle event types. */
const KNOWN_REVISION_TYPES = new Set([
  "revision.started",
  "revision.candidate",
  "revision.candidate.rejected",
  "revision.approved",
  "revision.abandoned",
  "revision.launched",
]);

/**
 * Validate one KNOWN revision event's shape (§16 rule 5: missing fields or a
 * sha that matches no recoverable content refuse the affected paths). The log
 * is untrusted input. Returns an error message, or the parsed event. Unknown
 * `revision.*` types return "" and are skipped by the caller (forward
 * compatibility, §16 rule 1) — BEFORE common-field validation, so a future
 * event shape never fails this reader.
 */
function parseRevisionEvent(event: unknown): ParsedRevisionEvent | string {
  if (!isRecord(event)) return "revision event is not an object";
  if (!isNonEmptyString(event.type) || !event.type.startsWith("revision.")) return "not a revision event";
  if (!KNOWN_REVISION_TYPES.has(event.type)) return "";
  if (!isNonEmptyString(event.eventId) || !isNonEmptyString(event.runId)) {
    return `${event.type} is missing eventId/runId`;
  }
  // revision.approved carries its timestamp inside approvedBy.at (§8).
  if (event.type !== "revision.approved" && typeof event.at !== "string") {
    return `${event.type} is missing the at timestamp`;
  }
  // §8: the stable id must BIND the canonical content. A present eventId that
  // does not derive from the event itself is corrupt evidence (arbitrary or
  // mismatched sha) — never a validatable event, whatever the other fields say.
  if (event.eventId !== deriveEventId(event)) {
    return `${event.type} eventId does not bind its canonical content`;
  }
  switch (event.type) {
    case "revision.started": {
      if (!isRound(event.revision)) return "revision.started has an invalid revision number";
      if (!isNonEmptyString(event.correction)) return "revision.started has an empty correction";
      if (!isNonEmptyString(event.correctionSha) || event.correctionSha !== sha256Hex(event.correction)) {
        return "revision.started correctionSha does not bind the correction";
      }
      if (!isShaPair(event.baseContract)) return "revision.started has a malformed baseContract";
      if (event.partialPatchSha !== undefined && !(isNonEmptyString(event.partialPatchSha) && HEX64.test(event.partialPatchSha))) {
        return "revision.started has a malformed partialPatchSha";
      }
      if (
        event.partialFiles !== undefined &&
        (!Array.isArray(event.partialFiles) || event.partialFiles.some((f) => !isNonEmptyString(f)))
      ) {
        return "revision.started has a malformed partialFiles list";
      }
      return { kind: "started", event: event as unknown as RevisionStartedEvent };
    }
    case "revision.candidate": {
      if (!isRound(event.revision) || !isRound(event.round)) return "revision.candidate has invalid revision/round";
      if (!isShaPair(event)) return "revision.candidate has malformed prd/tasks shas";
      return { kind: "candidate", event: event as unknown as RevisionCandidateEvent };
    }
    case "revision.candidate.rejected": {
      if (!isRound(event.revision) || !isRound(event.round)) return "revision.candidate.rejected has invalid revision/round";
      if (!isNonEmptyString(event.reason) || !isNonEmptyString(event.artifactPath)) {
        return "revision.candidate.rejected is missing reason/artifactPath";
      }
      if (event.notes !== undefined && !isNonEmptyString(event.notes)) {
        return "revision.candidate.rejected has malformed notes";
      }
      return { kind: "candidate-rejected", event: event as unknown as RevisionCandidateRejectedEvent };
    }
    case "revision.approved": {
      if (!isRound(event.revision) || !isRound(event.round)) return "revision.approved has invalid revision/round";
      if (!isNonEmptyString(event.correction)) return "revision.approved has an empty correction";
      if (!isNonEmptyString(event.correctionSha) || event.correctionSha !== sha256Hex(event.correction)) {
        return "revision.approved correctionSha does not bind the correction";
      }
      if (!isShaPair(event.candidate) || !isShaPair(event.contract)) {
        return "revision.approved has malformed candidate/contract hashes";
      }
      if (!isNonEmptyString(event.predecessorStatus)) return "revision.approved is missing predecessorStatus";
      if (
        !isRecord(event.approvedBy) ||
        !isNonEmptyString(event.approvedBy.via) ||
        typeof event.approvedBy.pid !== "number" ||
        typeof event.approvedBy.at !== "string"
      ) {
        return "revision.approved has malformed approval identity";
      }
      return { kind: "approved", event: event as unknown as RevisionApprovedEvent };
    }
    case "revision.abandoned": {
      if (!isRound(event.revision)) return "revision.abandoned has an invalid revision number";
      if (!isNonEmptyString(event.reason)) return "revision.abandoned is missing its reason";
      return { kind: "abandoned", event: event as unknown as RevisionAbandonedEvent };
    }
    case "revision.launched": {
      if (!isRound(event.revision)) return "revision.launched has an invalid revision number";
      if (!isNonEmptyString(event.successorRunId)) return "revision.launched is missing successorRunId";
      return { kind: "launched", event: event as unknown as RevisionLaunchedEvent };
    }
    default:
      // A revision.* type this binary does not know: skipped, exactly like
      // replayRunLog skips unknown event types (forward compatibility).
      return "";
  }
}

/**
 * Collect and dedupe the revision events of a log (§8): lines with the same
 * `eventId` and equal canonical projections collapse to one regardless of
 * their timestamps; the same `eventId` with differing projections is a
 * fail-closed refusal, never resolved by picking one. Unknown `revision.*`
 * types are skipped (forward compatibility). Returns an error message on
 * malformed known events or conflicting duplicates.
 */
function collectRevisionEvents(
  events: WorkflowEvent[],
): { ok: true; items: ParsedRevisionEvent[] } | { ok: false; reason: string } {
  const items: ParsedRevisionEvent[] = [];
  const seen = new Map<string, string>();
  for (const event of events) {
    if (!isRecord(event) || !isNonEmptyString(event.type) || !event.type.startsWith("revision.")) continue;
    const parsed = parseRevisionEvent(event);
    if (typeof parsed === "string" && parsed !== "") return { ok: false, reason: parsed };
    if (parsed === "") continue;
    const canonical = canonicalEventJson(event);
    const previous = seen.get((event as { eventId: string }).eventId);
    if (previous !== undefined) {
      if (previous !== canonical) {
        return {
          ok: false,
          reason: `conflicting duplicates for eventId ${(event as { eventId: string }).eventId}`,
        };
      }
      continue; // same logical event retried: collapse
    }
    seen.set((event as { eventId: string }).eventId, canonical);
    items.push(parsed);
  }
  return { ok: true, items };
}

/**
 * The revision lifecycle of a predecessor log (spec.md §6): which revision is
 * active, if any. `abandoned` closes the revision — the run's lifecycle block
 * is lifted and a NEW revise opens a fresh revision number. Out-of-order or
 * truncated sequences that cannot come from the session state machine are
 * `invalid` (fail-closed; §16 rule 5).
 */
export type RevisionLifecycleState =
  | { state: "none" }
  | { state: "open"; revision: number; correction: string; started: RevisionStartedEvent }
  | {
      state: "candidate-pending";
      revision: number;
      round: number;
      candidate: { prdSha: string; tasksSha: string };
      correction: string;
      started: RevisionStartedEvent;
    }
  | { state: "approved-pending-launch"; approval: RevisionApprovedEvent }
  | { state: "launched"; successorRunId: string; approval: RevisionApprovedEvent }
  | { state: "abandoned"; revision: number }
  | { state: "invalid"; reason: string };

export function revisionLifecycle(events: WorkflowEvent[]): RevisionLifecycleState {
  const collected = collectRevisionEvents(events);
  if (!collected.ok) return { state: "invalid", reason: collected.reason };

  // Coherence reference: the active run. The log's workflow.started names it
  // when present; without one (bare revision-event sequences), the first known
  // revision event establishes it — every event must then agree.
  const logStarted = events.find(
    (event): event is Extract<WorkflowEvent, { type: "workflow.started" }> =>
      event.type === "workflow.started",
  );
  let expectedRunId: string | undefined = logStarted?.runId;
  const runCoherenceError = (eventRunId: string): string | undefined => {
    if (expectedRunId === undefined) {
      expectedRunId = eventRunId;
      return undefined;
    }
    return eventRunId !== expectedRunId
      ? `revision event refers to run "${eventRunId}" while the active run is "${expectedRunId}"`
      : undefined;
  };

  // Round progression of the active revision (§11): the round a new candidate
  // or rejection may carry is exactly the next one the event-recounted budget
  // permits — an unconsumed rejected round is retried at the SAME number,
  // consumed rounds advance by one, and nothing may skip a round or exceed
  // the budget.
  let consumedRounds = new Set<number>();
  let lastRejectedRound: number | undefined;
  const expectedNextRound = (): number =>
    lastRejectedRound !== undefined && !consumedRounds.has(lastRejectedRound)
      ? lastRejectedRound
      : consumedRounds.size === 0
        ? 1
        : Math.max(...consumedRounds) + 1;

  let current: RevisionLifecycleState = { state: "none" };
  let startsSeen = 0; // coherence: chain-wide numbering counts EVERY distinct started (§11)
  for (const { kind, event } of collected.items) {
    const runError = runCoherenceError(event.runId);
    if (runError !== undefined) return { state: "invalid", reason: runError };
    switch (kind) {
      case "started": {
        if (current.state === "none" || current.state === "abandoned") {
          // The revision number is the chain-wide count of started revisions
          // (abandoned included): the next open must carry exactly the next
          // number, or the log's numbering is corrupt.
          if (event.revision !== startsSeen + 1) {
            return {
              state: "invalid",
              reason: `revision.started carries revision ${event.revision} but the chain has ${startsSeen} earlier started revision(s)`,
            };
          }
          startsSeen += 1;
          consumedRounds = new Set();
          lastRejectedRound = undefined;
          current = { state: "open", revision: event.revision, correction: event.correction, started: event };
        } else {
          return { state: "invalid", reason: `revision.started while lifecycle is ${current.state}` };
        }
        break;
      }
      case "candidate": {
        if (current.state === "open") {
          if (event.revision !== current.revision) {
            return {
              state: "invalid",
              reason: `revision.candidate refers to revision ${event.revision} while the active revision is ${current.revision}`,
            };
          }
          if (event.round > MAX_PLAN_REVISIONS) {
            return {
              state: "invalid",
              reason: `revision.candidate round ${event.round} is beyond the revision budget (${MAX_PLAN_REVISIONS})`,
            };
          }
          if (event.round !== expectedNextRound()) {
            return {
              state: "invalid",
              reason: `revision.candidate round ${event.round} breaks the round progression (expected ${expectedNextRound()})`,
            };
          }
          consumedRounds.add(event.round);
          current = {
            state: "candidate-pending",
            revision: current.revision,
            round: event.round,
            candidate: { prdSha: event.prdSha, tasksSha: event.tasksSha },
            correction: current.correction,
            started: current.started,
          };
        } else {
          return { state: "invalid", reason: `revision.candidate while lifecycle is ${current.state}` };
        }
        break;
      }
      case "candidate-rejected": {
        if (current.state === "open") {
          // A planner-validation rejection attempts the round the budget
          // permits next, consuming nothing; repeated invalid output retries
          // the same number.
          if (event.revision !== current.revision) {
            return {
              state: "invalid",
              reason: `revision.candidate.rejected refers to revision ${event.revision} while the active revision is ${current.revision}`,
            };
          }
          if (event.round > MAX_PLAN_REVISIONS) {
            return {
              state: "invalid",
              reason: `revision.candidate.rejected round ${event.round} is beyond the revision budget (${MAX_PLAN_REVISIONS})`,
            };
          }
          if (event.round !== expectedNextRound()) {
            return {
              state: "invalid",
              reason: `revision.candidate.rejected round ${event.round} breaks the round progression (expected ${expectedNextRound()})`,
            };
          }
          lastRejectedRound = event.round;
          // User notes recorded on a rejection replace the correction going forward.
          if (event.notes !== undefined) {
            current = {
              state: "open",
              revision: current.revision,
              correction: event.notes,
              started: current.started,
            };
          }
        } else if (current.state === "candidate-pending") {
          // A user rejection (or regeneration) supersedes the PENDING
          // candidate: the same revision, the pending candidate's round.
          if (event.revision !== current.revision) {
            return {
              state: "invalid",
              reason: `revision.candidate.rejected refers to revision ${event.revision} while the active revision is ${current.revision}`,
            };
          }
          if (event.round !== current.round) {
            return {
              state: "invalid",
              reason: `revision.candidate.rejected round ${event.round} does not match the pending candidate round ${current.round}`,
            };
          }
          current = {
            state: "open",
            revision: current.revision,
            correction: event.notes !== undefined ? event.notes : current.correction,
            started: current.started,
          };
        } else {
          return { state: "invalid", reason: `revision.candidate.rejected while lifecycle is ${current.state}` };
        }
        break;
      }
      case "approved": {
        if (current.state === "candidate-pending") {
          if (event.revision !== current.revision) {
            return {
              state: "invalid",
              reason: `revision.approved refers to revision ${event.revision} while the active revision is ${current.revision}`,
            };
          }
          // Coherence: the approval binds the PENDING candidate — the same
          // contents by hash and the same round — or the log is corrupt
          // (an approval must never complete a candidate it does not name).
          if (
            event.round !== current.round ||
            event.candidate.prdSha !== current.candidate.prdSha ||
            event.candidate.tasksSha !== current.candidate.tasksSha
          ) {
            return {
              state: "invalid",
              reason: `revision.approved does not bind the pending candidate (round ${current.round}, ${current.candidate.prdSha.slice(0, 8)}…/${current.candidate.tasksSha.slice(0, 8)}…)`,
            };
          }
          current = { state: "approved-pending-launch", approval: event };
        } else {
          return { state: "invalid", reason: `revision.approved while lifecycle is ${current.state}` };
        }
        break;
      }
      case "launched": {
        if (current.state === "approved-pending-launch") {
          if (event.revision !== current.approval.revision) {
            return {
              state: "invalid",
              reason: `revision.launched refers to revision ${event.revision} while the approved revision is ${current.approval.revision}`,
            };
          }
          current = { state: "launched", successorRunId: event.successorRunId, approval: current.approval };
        } else {
          return { state: "invalid", reason: `revision.launched while lifecycle is ${current.state}` };
        }
        break;
      }
      case "abandoned": {
        if (
          current.state === "open" ||
          current.state === "candidate-pending" ||
          current.state === "approved-pending-launch" ||
          current.state === "launched"
        ) {
          const activeRevision: number =
            current.state === "approved-pending-launch"
              ? current.approval.revision
              : current.state === "launched"
                ? current.approval.revision
                : current.revision;
          if (event.revision !== activeRevision) {
            return {
              state: "invalid",
              reason: `revision.abandoned refers to revision ${event.revision} while the active revision is ${activeRevision}`,
            };
          }
          current = { state: "abandoned", revision: event.revision };
        } else {
          return { state: "invalid", reason: `revision.abandoned while lifecycle is ${current.state}` };
        }
        break;
      }
    }
  }
  return current;
}

/**
 * Chain-wide revision number for the NEXT revision: counts every
 * revision.started ever appended in the chain, abandoned included (§11), so a
 * re-opened revision always gets a fresh number — and with it a fresh
 * content-derived eventId. Returns 0 when the evidence is corrupt; callers
 * must have refused via `revisionLifecycle` first.
 */
export function nextRevisionNumber(events: WorkflowEvent[]): number {
  const collected = collectRevisionEvents(events);
  if (!collected.ok) return 0;
  return collected.items.filter((item) => item.kind === "started").length + 1;
}

/**
 * Planner candidate rounds consumed by `revision` (§11): the number of
 * DISTINCT rounds in its revision.candidate events. Invalid planner output
 * and provider failures consume no round — recovery recounts from these
 * events, so a crash can neither consume a round twice nor loop unbounded.
 */
export function plannerRoundsUsed(events: WorkflowEvent[], revision: number): number {
  const collected = collectRevisionEvents(events);
  if (!collected.ok) return 0;
  const rounds = new Set<number>();
  for (const item of collected.items) {
    if (item.kind === "candidate" && item.event.revision === revision) rounds.add(item.event.round);
  }
  return rounds.size;
}

/**
 * The round the next planner call may use for `revision`: an unconsumed
 * rejected round is retried at the SAME number (invalid output consumed
 * nothing); otherwise the next number after the consumed rounds (a user
 * rejection moves to round+1, §6 row T6).
 */
export function nextPlannerRound(events: WorkflowEvent[], revision: number): number {
  const collected = collectRevisionEvents(events);
  if (!collected.ok) return 1;
  const consumed = new Set<number>();
  let lastRejectedRound: number | undefined;
  for (const item of collected.items) {
    if (item.event.revision !== revision) continue;
    if (item.kind === "candidate") consumed.add(item.event.round);
    if (item.kind === "candidate-rejected") lastRejectedRound = item.event.round;
  }
  if (lastRejectedRound !== undefined && !consumed.has(lastRejectedRound)) return lastRejectedRound;
  return consumed.size === 0 ? 1 : Math.max(...consumed) + 1;
}

// ---------------------------------------------------------------------------
// Successor id rule and launch completeness (spec.md §7, §9)
// ---------------------------------------------------------------------------

/** Chain root: the run id with any trailing `-r<N>` suffix stripped. */
export function chainRootOf(runId: string): string {
  const match = /^(.*?)-r(\d+)$/.exec(runId);
  return match ? match[1]! : runId;
}

/**
 * `<chainRoot>-r<N+1>` where N is the current run's own suffix (0 for a root
 * run): revising a revised run produces the next link on the same chain root.
 */
export function successorRunId(runId: string): string {
  const match = /^(.*?)-r(\d+)$/.exec(runId);
  const root = match ? match[1]! : runId;
  const suffix = match ? Number(match[2]) : 0;
  return `${root}-r${suffix + 1}`;
}

/**
 * The §9 repair reachability rule: the successor log is absent, or present
 * without any phase.started. The `revision.launched` pointer alone proves
 * intent, not a running successor — `launched` stays repairable until the
 * successor's first phase event is on disk.
 */
export function launchIncomplete(repoRoot: string, successorRunId: string): boolean {
  const events = readRunLog(repoRoot, successorRunId);
  return !events.some((event) => event.type === "phase.started");
}

// ---------------------------------------------------------------------------
// Ordinary-resume interplay refusals (spec.md §16 rule 3, tasks T5)
// ---------------------------------------------------------------------------

/**
 * The one ordinary-resume change: a fail-closed refusal while a revision
 * lifecycle blocks the run. Everything else about ordinary resume is
 * unchanged. Returns undefined when the log carries no blocking lifecycle.
 */
export function resumeRevisionRefusal(
  events: WorkflowEvent[],
  repoRoot: string,
): Extract<Refusal, { message: string }> | undefined {
  const lifecycle = revisionLifecycle(events);
  const started = events.find(
    (event): event is Extract<WorkflowEvent, { type: "workflow.started" }> =>
      event.type === "workflow.started",
  );
  const runId = started?.runId ?? "unknown";
  switch (lifecycle.state) {
    case "invalid":
      return {
        type: "revision_evidence_corrupt",
        runId,
        message:
          `the revision evidence in this log is corrupt (${lifecycle.reason}) — ` +
          `inspect .pi/pi-brain/runs/${runId}.jsonl; the affected paths refuse until resolved`,
      };
    case "open":
    case "candidate-pending":
      return {
        type: "revision_in_progress",
        runId,
        message: `a plan revision is in progress — continue or abandon it with /flow revise ${runId}`,
      };
    case "approved-pending-launch":
      return {
        type: "revision_approved_pending_launch",
        runId,
        message: `the revision was approved — complete the launch with /flow revise ${runId}`,
      };
    case "launched": {
      const successor = lifecycle.successorRunId;
      if (launchIncomplete(repoRoot, successor)) {
        return {
          type: "revision_launch_incomplete",
          runId,
          successorRunId: successor,
          message: `the revision launch is incomplete — complete it with /flow revise ${runId}`,
        };
      }
      return {
        type: "revised_by_successor",
        runId,
        successorRunId: successor,
        message: `revised by ${successor} — revise the successor run instead`,
      };
    }
    case "none":
    case "abandoned":
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Evidence helpers (spec.md §10)
// ---------------------------------------------------------------------------

const PARTIAL_PATCH_CAP = 48_000;

/**
 * Cap the partial-work patch at 48,000 characters for planner evidence,
 * truncating the OLDEST hunks first (the newest work survives) with an
 * explicit `[truncated]` marker after the diff header. The cap holds for ANY
 * shape: a patch with no hunk boundaries (nothing before `@@ `) or one whose
 * header alone exceeds the budget is hard-tailed whole, so the result is
 * never longer than the cap.
 */
export function capPartialPatch(patch: string, maxChars: number = PARTIAL_PATCH_CAP): string {
  if (patch.length <= maxChars) return patch;
  const marker = "\n[truncated] — oldest hunks omitted to fit the evidence budget\n";
  const lines = patch.split("\n");
  let headerEnd = 0;
  while (headerEnd < lines.length && !lines[headerEnd]!.startsWith("@@ ")) headerEnd += 1;
  const header = lines.slice(0, headerEnd).join("\n");
  const hunks: string[] = [];
  let current: string[] = [];
  for (let i = headerEnd; i < lines.length; i += 1) {
    if (lines[i]!.startsWith("@@ ") && current.length > 0) {
      hunks.push(current.join("\n"));
      current = [];
    }
    current.push(lines[i]!);
  }
  if (current.length > 0) hunks.push(current.join("\n"));

  // No hunk boundary to cut at, or the header alone busts the budget: hard-tail
  // the whole patch (newest content survives) so the cap always holds.
  if (hunks.length === 0 || header.length + marker.length >= maxChars) {
    const tailLength = Math.max(0, maxChars - marker.length);
    return `${marker}${patch.slice(-tailLength)}`;
  }
  const budget = Math.max(0, maxChars - header.length - marker.length);
  const kept: string[] = [];
  let used = 0;
  for (let i = hunks.length - 1; i >= 0; i -= 1) {
    const length = hunks[i]!.length + 1;
    if (used + length > budget) break;
    kept.unshift(hunks[i]!);
    used += length;
  }
  if (kept.length === 0 && hunks.length > 0) {
    // A single oversized hunk: hard-tail it so evidence is never empty.
    return `${header}${marker}${hunks[hunks.length - 1]!.slice(-budget)}`;
  }
  return `${header}${marker}${kept.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Sidecar storage (spec.md §7)
// ---------------------------------------------------------------------------

/** `.pi/pi-brain/revision/<predecessorRunId>/` — engine state beside the run logs. */
export const revisionSidecarDir = (repoRoot: string, runId: string): string =>
  join(repoRoot, ".pi", "pi-brain", "revision", runId);

const candidatePrdPath = (dir: string): string => join(dir, "candidate-prd.md");
const candidateTasksPath = (dir: string): string => join(dir, "candidate-tasks.md");

export interface RevisionSessionCache {
  correction: string;
  round: number;
  partialPatchSha?: string;
  partialFiles?: string[];
  lastError?: string;
  updatedAt: string;
}

/** Best-effort cache write. Never authoritative: state reconstructs from events + files. */
function writeSessionCache(dir: string, cache: RevisionSessionCache): void {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "session.json"), `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  } catch {
    // Cache only — a failed cache write must never abort the session.
  }
}

const readTextFile = (path: string): string | undefined => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// Revision session core (tasks T4, spec.md §6 rows T2–T5, §10, §11)
// ---------------------------------------------------------------------------

export interface RevisionSessionDeps {
  /** Repository root (the predecessor's repo). */
  cwd: string;
  /** The predecessor run id. */
  runId: string;
  agents: AgentRunner;
  human: HumanInput;
  git: GitService;
  /** The predecessor's log — the CRITICAL sink for revision.* events. */
  events: RunLog;
  /** Session abort signal (provider cancellation mirrors the run launcher). */
  signal?: AbortSignal;
  /** Resolved planner model selection from config (extension-supplied). */
  plannerModel?: ModelSelection;
  /** Skill names routed to the planner (extension-supplied). */
  plannerSkills?: string[];
}

export type RevisionSessionOutcome =
  /** Dismissed before revision.started: nothing was appended, nothing to recover. */
  | { kind: "not-opened" }
  /** Recoverable stop with the revision open and no candidate yet (§6 T10). */
  | { kind: "open"; revision: number }
  /** Recoverable stop with a candidate awaiting the user's decision. */
  | {
      kind: "candidate-pending";
      revision: number;
      round: number;
      candidate: { prdSha: string; tasksSha: string };
    }
  /** T5: the authoritative approval is verified-persisted; promotion follows (T6). */
  | {
      kind: "approved";
      revision: number;
      approval: RevisionApprovedEvent;
      candidatePaths: { prd: string; tasks: string };
    }
  /** T7: explicit pre-promotion abandonment. */
  | { kind: "abandoned"; revision: number }
  | { kind: "refused"; reason: string }
  /** appendCritical/filesystem failure: the session aborts before anything irreversible. */
  | { kind: "failed"; error: string };

function describeLockRefusal(lock: Exclude<AcquireResult, { ok: true }>): string {
  switch (lock.reason) {
    case "held":
      return `the run lock is held by ${describeLock(lock.heldBy)}`;
    case "held_stale":
      return `the run lock looks hung — ${describeLock(lock.heldBy)}; remove ${lock.lockFile} if you are sure nobody is running`;
    case "takeover_in_progress":
      return `another process is taking over the run lock (${lock.markerPath}) — retry shortly`;
  }
}

/**
 * One fresh revision session: lock → evidence → open → planner rounds →
 * candidate → approve/reject/abandon. Implements §6 rows T2–T5; promotion is
 * T6 and runs only after the approval this session verifies-persists.
 *
 * Disciplines mirrored from the run launcher: the lock is released exactly
 * once in `finally`; state is re-derived from the log at every step (the
 * round budget is recounted from events, §11); only `revision.*` events are
 * appended, always through `appendCritical` — any failure aborts the session
 * before an irreversible step (B2b). The session never appends loop, outcome
 * or failure events of the execution workflow (§6), so the predecessor's
 * replay verdict is unchanged by its presence.
 */
export async function runRevisionSessionCore(deps: RevisionSessionDeps): Promise<RevisionSessionOutcome> {
  const { cwd, runId, human, git } = deps;
  try {
    // --- 1. Fresh eligibility + lifecycle reads (never trust caller memory) ---
    const events = readRunLog(cwd, runId);
    const eligibility = revisionEligibility(events);
    if ("healFirst" in eligibility) {
      return {
        kind: "refused",
        reason:
          "the last completed review already decided this run — run /flow resume once to record the healed outcome, then revise again",
      };
    }
    if (!eligibility.eligible) return { kind: "refused", reason: eligibility.message };
    let lifecycle = revisionLifecycle(events);
    if (lifecycle.state === "invalid") {
      return { kind: "refused", reason: `revision evidence is corrupt (${lifecycle.reason})` };
    }
    if (lifecycle.state !== "none" && lifecycle.state !== "abandoned") {
      return {
        kind: "refused",
        reason: `a revision lifecycle is already ${lifecycle.state} on this run — continue, repair or abandon it instead of opening a second revision`,
      };
    }

    // --- 2. Locate artifacts and verify baseContract on disk (§10, §12) ---
    const slug = findExistingFeatureSlug(cwd, eligibility.description);
    if (!slug) {
      return { kind: "refused", reason: "cannot find the approved PRD/tasks files with the description marker" };
    }
    const featureDir = join(cwd, ".ai", "features", slug);
    const prdPath = join(featureDir, `prd-${slug}.md`);
    const tasksPath = join(featureDir, `tasks-${slug}.md`);
    const marker = descriptionMarker(eligibility.description);
    const currentPrd = readTextFile(prdPath);
    const currentTasks = readTextFile(tasksPath);
    if (currentPrd === undefined || currentTasks === undefined) {
      return { kind: "refused", reason: "the approved PRD/tasks files cannot be read" };
    }
    if (sha256Hex(currentPrd) !== eligibility.spec.prdSha || sha256Hex(currentTasks) !== eligibility.spec.tasksSha) {
      return {
        kind: "refused",
        reason:
          "the approved PRD/tasks no longer hash to the replayed spec.approved (tamper guard) — restore them or start a new run",
      };
    }

    // --- 3. Take the lock (§6 T1), then re-derive state under it ---
    const lock = acquireRunLock(cwd, { runId, workflow: "revision" });
    if (!lock.ok) return { kind: "refused", reason: describeLockRefusal(lock) };
    try {
      const eventsUnderLock = readRunLog(cwd, runId);
      const eligibilityUnderLock = revisionEligibility(eventsUnderLock);
      if ("healFirst" in eligibilityUnderLock) {
        return { kind: "refused", reason: "an already-decided review must be healed before revising" };
      }
      if (!eligibilityUnderLock.eligible) {
        return { kind: "refused", reason: `the run became ineligible before the lock: ${eligibilityUnderLock.message}` };
      }
      lifecycle = revisionLifecycle(eventsUnderLock);
      if (lifecycle.state === "invalid") {
        return { kind: "refused", reason: `revision evidence is corrupt (${lifecycle.reason})` };
      }
      if (lifecycle.state !== "none" && lifecycle.state !== "abandoned") {
        return {
          kind: "refused",
          reason: `a revision lifecycle became ${lifecycle.state} before the lock — continue, repair or abandon it instead`,
        };
      }
      const revision = nextRevisionNumber(eventsUnderLock);
      if (revision === 0) return { kind: "refused", reason: "revision evidence is corrupt" };

      // §13 revalidation at revise entry: frozen inputs must still hold.
      if (eligibilityUnderLock.verify) {
        const changed = changedScriptKeys(cwd, eligibilityUnderLock.verify);
        if (changed.length > 0) {
          return {
            kind: "refused",
            reason: `verify scripts changed since the run started (${changed.join(", ")}) — restore the scripts or start a new run`,
          };
        }
      }
      if (eligibilityUnderLock.repoStateDigest !== undefined) {
        let currentDigest: string | undefined;
        try {
          currentDigest = await git.repoStateDigest(cwd);
        } catch {
          currentDigest = undefined; // unreadable is changed, never unchanged (fail-closed)
        }
        if (currentDigest !== eligibilityUnderLock.repoStateDigest) {
          return {
            kind: "refused",
            reason: "the git repository state changed since the run started — restore it or start a new run",
          };
        }
      }

      // --- 4. Evidence capture (§10): evidence, not a baseline; nothing is
      // committed or snapshotted. An unresolvable baseline refuses (§13). ---
      const baseline: GitBaseline = {
        repoRoot: cwd,
        branch: "revision",
        headSha: "unknown",
        baseCommit: eligibilityUnderLock.baselineCommit,
        ...(eligibilityUnderLock.ignoreRulesDigest !== undefined
          ? { ignoreRulesDigest: eligibilityUnderLock.ignoreRulesDigest }
          : {}),
        ...(eligibilityUnderLock.repoStateDigest !== undefined
          ? { repoStateDigest: eligibilityUnderLock.repoStateDigest }
          : {}),
      };
      let diff: Awaited<ReturnType<GitService["diffSince"]>>;
      try {
        diff = await git.diffSince(baseline);
      } catch (err) {
        return {
          kind: "refused",
          reason: `the original baseline is no longer resolvable for diffing (${(err as Error).message})`,
        };
      }
      const partialPatchSha = sha256Hex(diff.patch);
      const partialFiles = [...diff.files];

      // --- 5. Correction capture (T2): non-empty before anything is appended;
      // empty notes consume no planner call, no round and no event. ---
      let correction: string;
      for (;;) {
        let answer: string;
        try {
          answer = (
            await human.input({
              message: `Describe the correction the revised plan must apply (${runId}, revision ${revision}):`,
              placeholder: "One free-form note; the planner preserves everything not mentioned.",
            })
          ).trim();
        } catch (err) {
          if (err instanceof UserDismissedError) return { kind: "not-opened" };
          throw err;
        }
        if (answer !== "") {
          correction = answer;
          break;
        }
        human.notify("pi-brain: empty revision notes — no planner call made and no revision round consumed.");
      }

      // --- 6. Open the revision (T1): revision.started via appendCritical. ---
      const startedEvent = withEventId({
        type: "revision.started" as const,
        runId,
        revision,
        correction,
        correctionSha: sha256Hex(correction),
        baseContract: eligibilityUnderLock.spec,
        ...(partialPatchSha !== undefined ? { partialPatchSha } : {}),
        ...(partialFiles.length > 0 ? { partialFiles } : {}),
        at: new Date().toISOString(),
      });
      deps.events.appendCritical(startedEvent);
      const sidecarDir = revisionSidecarDir(cwd, runId);
      writeSessionCache(sidecarDir, {
        correction,
        round: 0,
        partialPatchSha,
        partialFiles,
        updatedAt: new Date().toISOString(),
      });
      human.notify(`pi-brain: revision ${revision} of ${runId} opened — planner will apply only the correction.`);

      // The candidate TITLE the planner must keep stable. The approved
      // artifacts carry the description marker and the section bodies, not the
      // gate's TITLE, so the slug words are the best persisted recovery; the
      // artifact directory stays marker-driven either way (findExistingFeatureSlug).
      const plannerTitle = slug.split("-").join(" ");
      const stack = eligibilityUnderLock.stack ?? { primary: "unknown", frameworks: [] };

      // The planner evidence starts from the open-time capture. Rounds AFTER
      // the first planner call refresh it from a fresh diff: a later round
      // runs after user interaction, and the tree may have moved — the second
      // prompt must never carry stale partial-work evidence. `partialPatchSha`
      // stays bound to the OPEN capture: it is what revision.started recorded
      // and what the §10 approval dialog compares against.
      let currentEvidence: { patch: string; files: string[] } = { patch: diff.patch, files: partialFiles };
      let plannerCallsMade = 0;
      const refreshEvidence = async (): Promise<void> => {
        try {
          const fresh = await git.diffSince(baseline);
          currentEvidence = { patch: fresh.patch, files: [...fresh.files] };
        } catch {
          // A refresh hiccup keeps the previous evidence rather than aborting:
          // prompt evidence is advisory; the approval-time §10 check is the
          // enforcing one.
        }
      };

      const runPlannerRound = (notes: string): Promise<AgentRunResult> =>
        deps.agents.run({
          runId,
          role: "planner",
          cwd,
          prompt: POST_STOP_REVISION_PROMPT({
            description: eligibilityUnderLock.description,
            stack,
            title: plannerTitle,
            currentPrd,
            currentTasks,
            correction: notes,
            partialFiles: currentEvidence.files,
            partialPatchCapped: capPartialPatch(currentEvidence.patch),
          }),
          ...(deps.plannerModel !== undefined ? { model: deps.plannerModel } : {}),
          ...(deps.plannerSkills !== undefined && deps.plannerSkills.length > 0
            ? { skills: deps.plannerSkills }
            : {}),
          tools: ["read", "grep", "find", "ls"],
          allowHumanInput: false,
          signal: deps.signal,
        });

      const abandonRevision = (reason: string): RevisionSessionOutcome => {
        deps.events.appendCritical(
          withEventId({
            type: "revision.abandoned" as const,
            runId,
            revision,
            reason,
            at: new Date().toISOString(),
          }),
        );
        rmSync(sidecarDir, { recursive: true, force: true });
        return { kind: "abandoned", revision };
      };

      const abandonDescription =
        eligibilityUnderLock.status === "cancelled" || eligibilityUnderLock.status === "needs_human"
          ? `After abandoning, this ${eligibilityUnderLock.status} run stays terminal: /flow resume will refuse it exactly as it did before the revision.`
          : "After abandoning, this interrupted/failed run becomes ordinarily resumable again under the old contract.";

      // --- 7. Planner rounds and the candidate decision loop (T3/T4/T5/T6/T7). ---
      let candidate: { round: number; prdSha: string; tasksSha: string } | undefined;
      try {
        let mode: "plan" | "decide" = "plan";
        for (;;) {
          if (mode === "plan") {
            const eventsNow = readRunLog(cwd, runId);
            const pending = pendingCandidate(eventsNow, revision);
            if (pending) {
              candidate = pending;
              mode = "decide";
              continue;
            }
            const nextRound = nextPlannerRound(eventsNow, revision);
            if (nextRound > MAX_PLAN_REVISIONS) {
              // §11: at the limit only Approve/Abandon remain — with no valid
              // candidate, only Abandon (or leaving it pending) is honest.
              const choice = await human.select({
                message: `The revision round budget is exhausted (${MAX_PLAN_REVISIONS}/${MAX_PLAN_REVISIONS}) and no valid candidate exists.`,
                options: [
                  { label: "Abandon revision", value: "abandon", description: abandonDescription },
                  { label: "Decide later", value: "leave", description: "Leave the revision open; resume it with /flow revise." },
                ],
                defaultValue: "leave",
              });
              if (choice === "abandon") return abandonRevision("user choice");
              return { kind: "open", revision };
            }

            // Rounds after the first planner call re-observe the tree first,
            // so the prompt never carries stale partial-work evidence.
            if (plannerCallsMade > 0) await refreshEvidence();
            const result = await runPlannerRound(correction);
            plannerCallsMade += 1;
            if (result.aborted || deps.signal?.aborted) {
              // Provider failure/abort consumes no round; state stays recoverable (§6 T10).
              return { kind: "open", revision };
            }
            const validation = validatePlannerOutput(result.text);
            if (!validation.valid) {
              // T4: rejected output persisted beside the run log, rejected
              // event appended, round NOT consumed; retry reuses the round.
              const rejected = persistRejectedPlannerOutput(cwd, runId, result.text);
              deps.events.appendCritical(
                withEventId({
                  type: "revision.candidate.rejected" as const,
                  runId,
                  revision,
                  round: nextRound,
                  reason: validation.message,
                  artifactPath: rejected.path,
                  at: new Date().toISOString(),
                }),
              );
              writeSessionCache(sidecarDir, {
                correction,
                round: nextRound,
                partialPatchSha,
                partialFiles,
                lastError: validation.message,
                updatedAt: new Date().toISOString(),
              });
              human.notify(
                `pi-brain: revision planner output rejected (round ${nextRound} not consumed): ${validation.message}`,
              );
              const choice = await human.select({
                message: "The planner output was invalid. Retry the same round or abandon?",
                options: [
                  { label: "Retry planner", value: "retry", description: "Re-run the planner for the same (unconsumed) round." },
                  { label: "Abandon revision", value: "abandon", description: abandonDescription },
                ],
                defaultValue: "retry",
              });
              if (choice === "abandon") return abandonRevision("user choice");
              continue;
            }

            // T3: candidate written to the sidecar FIRST, then the event that
            // binds its exact contents. Approved artifacts stay untouched.
            const prdSha = sha256Hex(validation.value.prd);
            const tasksSha = sha256Hex(validation.value.tasks);
            try {
              mkdirSync(sidecarDir, { recursive: true });
              writeFileSync(candidatePrdPath(sidecarDir), validation.value.prd, "utf8");
              writeFileSync(candidateTasksPath(sidecarDir), validation.value.tasks, "utf8");
            } catch (err) {
              return { kind: "failed", error: `could not write the candidate sidecar files: ${(err as Error).message}` };
            }
            deps.events.appendCritical(
              withEventId({
                type: "revision.candidate" as const,
                runId,
                revision,
                round: nextRound,
                prdSha,
                tasksSha,
                at: new Date().toISOString(),
              }),
            );
            writeSessionCache(sidecarDir, {
              correction,
              round: nextRound,
              partialPatchSha,
              partialFiles,
              updatedAt: new Date().toISOString(),
            });
            candidate = { round: nextRound, prdSha, tasksSha };
            mode = "decide";
            continue;
          }

          // mode === "decide": candidate-pending (§6 T5/T6/T7).
          const current = candidate;
          if (!current) {
            mode = "plan";
            continue;
          }
          const eventsNow = readRunLog(cwd, runId);
          const roundsUsed = plannerRoundsUsed(eventsNow, revision);
          const atLimit = roundsUsed >= MAX_PLAN_REVISIONS;
          const choice = await human.select({
            message: `Revision ${revision} candidate ready (round ${current.round} of ${MAX_PLAN_REVISIONS}). Choose an action.`,
            options: [
              { label: "Approve candidate", value: "approve", description: "Bind this candidate by hash as the authoritative approval." },
              ...(atLimit
                ? []
                : [
                    {
                      label: "Reject with new notes",
                      value: "reject",
                      description: `Replace the correction; the next candidate uses round ${current.round + 1}.`,
                    },
                  ]),
              { label: "Abandon revision", value: "abandon", description: abandonDescription },
            ],
            defaultValue: "abandon",
          });

          if (choice === "abandon") return abandonRevision("user choice");

          if (choice === "reject") {
            let notes: string;
            for (;;) {
              try {
                notes = (
                  await human.input({
                    message: "Replacement notes — the next candidate applies these instead:",
                    placeholder: "One free-form note; the planner preserves everything not mentioned.",
                  })
                ).trim();
              } catch (err) {
                if (err instanceof UserDismissedError) return candidatePending(revision, current);
                throw err;
              }
              if (notes !== "") break;
              human.notify("pi-brain: empty revision notes — no planner call made and no revision round consumed.");
            }
            deps.events.appendCritical(
              withEventId({
                type: "revision.candidate.rejected" as const,
                runId,
                revision,
                round: current.round,
                reason: "rejected by user",
                artifactPath: candidatePrdPath(sidecarDir),
                notes,
                at: new Date().toISOString(),
              }),
            );
            // §6 row T6: the replacement notes become the correction the next
            // candidate (round+1) applies and the eventual approval binds.
            correction = notes;
            mode = "plan";
            continue;
          }

          // choice === "approve": §10 change detection at the approval dialog.
          let freshPatch: string | undefined;
          try {
            freshPatch = (await git.diffSince(baseline)).patch;
          } catch {
            freshPatch = undefined;
          }
          if (freshPatch !== undefined && sha256Hex(freshPatch) !== partialPatchSha) {
            const canRegenerate = !atLimit;
            const changeChoice = await human.select({
              message: "The partial work changed since the revision opened. The approval binds the candidate CONTENT, not the partial-work state.",
              options: [
                ...(canRegenerate
                  ? [{ label: "Regenerate candidate", value: "regenerate", description: "Re-run the planner with fresh evidence (round permitting)." }]
                  : []),
                { label: "Approve anyway", value: "approve", description: "Approve the candidate with the fresh evidence in view." },
                { label: "Go back", value: "back", description: "Return to the candidate decision." },
              ],
              defaultValue: "back",
            });
            if (changeChoice === "regenerate") {
              // §10 regenerate: the superseded candidate is recorded as
              // rejected (reason preserved), which returns the lifecycle to
              // open and lets the planner produce the next round — round
              // permitting (the option is only offered when !atLimit).
              deps.events.appendCritical(
                withEventId({
                  type: "revision.candidate.rejected" as const,
                  runId,
                  revision,
                  round: current.round,
                  reason: "regenerated — the partial work changed since the candidate",
                  artifactPath: candidatePrdPath(sidecarDir),
                  notes: correction,
                  at: new Date().toISOString(),
                }),
              );
              mode = "plan";
              continue;
            }
            if (changeChoice === "back") continue;
          }

          // Fail-closed before binding: the sidecar contents must hash to the
          // persisted candidate event, or nothing may be approved (§16 rule 5).
          const prdBody = readTextFile(candidatePrdPath(sidecarDir));
          const tasksBody = readTextFile(candidateTasksPath(sidecarDir));
          if (
            prdBody === undefined ||
            tasksBody === undefined ||
            sha256Hex(prdBody) !== current.prdSha ||
            sha256Hex(tasksBody) !== current.tasksSha
          ) {
            human.notify(
              "pi-brain: the candidate sidecar files no longer match the persisted candidate event — refusing to approve unverifiable contents.",
            );
            const salvage = await human.select({
              message: "The candidate contents are unverifiable. Abandon the revision or leave it pending?",
              options: [
                { label: "Abandon revision", value: "abandon", description: abandonDescription },
                { label: "Leave pending", value: "leave", description: "Keep the revision open; decide later with /flow revise." },
              ],
              defaultValue: "leave",
            });
            if (salvage === "abandon") return abandonRevision("user choice");
            return candidatePending(revision, current);
          }

          // T5: the authoritative, hash-bound approval — verified-persisted
          // via appendCritical. Nothing else changes until promotion (T6).
          const approval = withEventId({
            type: "revision.approved" as const,
            runId,
            revision,
            round: current.round,
            correction,
            correctionSha: sha256Hex(correction),
            candidate: { prdSha: current.prdSha, tasksSha: current.tasksSha },
            contract: {
              prdSha: sha256Hex(`${marker}\n${prdBody}`),
              tasksSha: sha256Hex(`${marker}\n${tasksBody}`),
            },
            predecessorStatus: eligibilityUnderLock.status,
            approvedBy: { via: "/flow revise", pid: process.pid, at: new Date().toISOString() },
          });
          deps.events.appendCritical(approval);
          writeSessionCache(sidecarDir, {
            correction,
            round: current.round,
            partialPatchSha,
            partialFiles,
            updatedAt: new Date().toISOString(),
          });
          return {
            kind: "approved",
            revision,
            approval,
            candidatePaths: { prd: candidatePrdPath(sidecarDir), tasks: candidateTasksPath(sidecarDir) },
          };
        }
      } catch (err) {
        // A dismissed dialog mid-session is control flow, not failure: the
        // revision stays recoverable exactly as §6 T10 requires.
        if (err instanceof UserDismissedError) {
          if (revision > 0 && candidate) return candidatePending(revision, candidate);
          if (revision > 0) return { kind: "open", revision };
          return { kind: "not-opened" };
        }
        throw err;
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    if (err instanceof CriticalAppendError) {
      return { kind: "failed", error: `critical append failed: ${err.message}` };
    }
    return { kind: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

function candidatePending(
  revision: number,
  candidate: { round: number; prdSha: string; tasksSha: string },
): RevisionSessionOutcome {
  return {
    kind: "candidate-pending",
    revision,
    round: candidate.round,
    candidate: { prdSha: candidate.prdSha, tasksSha: candidate.tasksSha },
  };
}

/**
 * The candidate STILL AWAITING a decision for `revision`, derived from the
 * lifecycle state machine — a candidate already superseded by a rejection or
 * a regeneration is not pending, so the planner round loop must not march back
 * to its decision dialog.
 */
function pendingCandidate(
  events: WorkflowEvent[],
  revision: number,
): { round: number; prdSha: string; tasksSha: string } | undefined {
  const lifecycle = revisionLifecycle(events);
  if (lifecycle.state === "candidate-pending" && lifecycle.revision === revision) {
    return { round: lifecycle.round, prdSha: lifecycle.candidate.prdSha, tasksSha: lifecycle.candidate.tasksSha };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Promotion, successor seed and launch repair (tasks T6, spec.md §7/§9/§14)
// ---------------------------------------------------------------------------

type ShaPair = { prdSha: string; tasksSha: string };

/** The predecessor-side and sidecar paths one promotion touches. */
interface PromotionPaths {
  sidecarDir: string;
  prd: string;
  tasks: string;
  archivePrd: string;
  archiveTasks: string;
}

/**
 * §7 step 0: the approval authorizes promotion only as a VERIFIED-PERSISTED
 * event. The caller re-reads P's log FILE from disk (never caller memory and
 * never session.json), and this check locates the well-formed
 * `revision.approved` for `revision` in it — shape, eventId binding and
 * candidate/contract hash forms included (§8 parsing). An absent or corrupt
 * approval refuses before any archive, artifact write, seed, pointer or
 * launch: no promotion without a persisted approval, ever.
 */
export function persistedApproval(
  events: WorkflowEvent[],
  revision: number,
): { ok: true; approval: RevisionApprovedEvent } | { ok: false; reason: string } {
  const collected = collectRevisionEvents(events);
  if (!collected.ok) return { ok: false, reason: collected.reason };
  const found = collected.items.find(
    (item): item is Extract<ParsedRevisionEvent, { kind: "approved" }> =>
      item.kind === "approved" && item.event.revision === revision,
  );
  if (found === undefined) {
    return {
      ok: false,
      reason: `no verified-persisted revision.approved for revision ${revision} exists in the predecessor log — promotion requires a persisted approval`,
    };
  }
  return { ok: true, approval: found.event };
}

/** The revision.started event of `revision` — the archive tree's baseContract authority. */
function revisionStartedOf(events: WorkflowEvent[], revision: number): RevisionStartedEvent | undefined {
  const collected = collectRevisionEvents(events);
  if (!collected.ok) return undefined;
  const found = collected.items.find(
    (item): item is Extract<ParsedRevisionEvent, { kind: "started" }> =>
      item.kind === "started" && item.event.revision === revision,
  );
  return found?.event;
}

/**
 * The deterministic successor seed (§7 step 5): re-derived from the approval
 * event and the predecessor's `workflow.started` — no timestamps, so a
 * partial seed recovers by PREFIX VERIFICATION. The successor inherits the
 * ORIGINAL description, stack, baseline commit, ignore-rules digest,
 * repository-state digest and verify freeze — their ABSENCE in legacy logs
 * included: the successor's `workflow.started` omits what the predecessor
 * omitted, so its behavior converges with a legacy resume. `carriedUsage`
 * carries the predecessor's replayed usage totals (omitted when none were
 * reported), and `revision` links the chain with the verbatim correction.
 * It never re-snapshots a baseline and never re-resolves a frozen input.
 */
export function canonicalSuccessorSeed(
  predecessorStarted: Extract<WorkflowEvent, { type: "workflow.started" }>,
  approval: RevisionApprovedEvent,
  carriedUsage: UsageByRole,
): {
  started: Extract<WorkflowEvent, { type: "workflow.started" }>;
  spec: Extract<WorkflowEvent, { type: "spec.approved" }>;
} {
  const successorId = successorRunId(predecessorStarted.runId);
  const usageEntries = Object.entries(carriedUsage);
  return {
    started: {
      type: "workflow.started",
      runId: successorId,
      workflow: "feature",
      ...(predecessorStarted.description !== undefined
        ? { description: predecessorStarted.description }
        : {}),
      ...(predecessorStarted.stack !== undefined ? { stack: predecessorStarted.stack } : {}),
      ...(predecessorStarted.baseline !== undefined ? { baseline: predecessorStarted.baseline } : {}),
      ...(predecessorStarted.ignoreRulesDigest !== undefined
        ? { ignoreRulesDigest: predecessorStarted.ignoreRulesDigest }
        : {}),
      ...(predecessorStarted.repoStateDigest !== undefined
        ? { repoStateDigest: predecessorStarted.repoStateDigest }
        : {}),
      ...(predecessorStarted.verify !== undefined ? { verify: predecessorStarted.verify } : {}),
      ...(usageEntries.length > 0
        ? { carriedUsage: Object.fromEntries(usageEntries) as UsageByRole }
        : {}),
      revision: {
        predecessorRunId: predecessorStarted.runId,
        revision: approval.revision,
        correction: approval.correction,
      },
    },
    spec: {
      type: "spec.approved",
      runId: successorId,
      prdSha: approval.contract.prdSha,
      tasksSha: approval.contract.tasksSha,
    },
  };
}

export type SeedVerification =
  | { status: "empty" }
  | { status: "missing-spec" }
  | { status: "complete" }
  | { status: "divergent"; reason: string };

/**
 * B5a prefix verification (§7 step 5, §9 B5a): compare the successor log's
 * seed PREFIX against the canonical seed, field by field. Trailing events
 * after the seed are not part of the prefix: a legitimate `workflow.resumed`
 * (B7c repair) or `phase.started` never counts as a collision. Any
 * divergence — a different value in ANY field of the prefix (optional fields
 * included), `spec.approved` without a preceding `workflow.started` (the
 * impossible order), an unrelated log — is fail-closed: the log is never
 * rewritten.
 */
export function verifySuccessorSeed(
  events: WorkflowEvent[],
  seed: {
    started: Extract<WorkflowEvent, { type: "workflow.started" }>;
    spec: Extract<WorkflowEvent, { type: "spec.approved" }>;
  },
): SeedVerification {
  if (events.length === 0) return { status: "empty" };
  const first = events[0]!;
  if (first.type !== "workflow.started") {
    return {
      status: "divergent",
      reason:
        first.type === "spec.approved"
          ? "the log starts with spec.approved — an impossible order (workflow.started must come first)"
          : `the log starts with ${first.type} instead of the canonical workflow.started`,
    };
  }
  const startedDiff = firstDifference("workflow.started", first, seed.started);
  if (startedDiff !== undefined) {
    return {
      status: "divergent",
      reason: `the persisted workflow.started diverges from the canonical seed at ${startedDiff}`,
    };
  }
  if (events.length === 1) return { status: "missing-spec" };
  const second = events[1]!;
  if (second.type !== "spec.approved") {
    return {
      status: "divergent",
      reason: `the log holds ${second.type} where the canonical seed expects spec.approved — an impossible order`,
    };
  }
  const specDiff = firstDifference("spec.approved", second, seed.spec);
  if (specDiff !== undefined) {
    return {
      status: "divergent",
      reason: `the persisted spec.approved diverges from the canonical seed at ${specDiff}`,
    };
  }
  return { status: "complete" };
}

/**
 * Path of the first field where `a` and `b` differ (stable-json equality per
 * node), or undefined when identical. Powers the field-by-field seed
 * divergence messages; not a general deep-equality utility.
 */
function firstDifference(path: string, a: unknown, b: unknown): string | undefined {
  if (stableJson(a) === stableJson(b)) return undefined;
  if (isRecord(a) && isRecord(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      const diff = firstDifference(`${path}.${key}`, a[key], b[key]);
      if (diff !== undefined) return diff;
    }
    return path;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const diff = firstDifference(`${path}[${i}]`, a[i], b[i]);
      if (diff !== undefined) return diff;
    }
    return path;
  }
  return path;
}

/**
 * The §7 step 2 archive decision tree, per artifact file. `previous-*` is
 * WRITE-ONCE and verified against `revision.started.baseContract`:
 * - a verified existing copy is skipped and NEVER rewritten (an archive
 *   damaged after a crash refuses without being modified, byte-identical);
 * - an absent copy is written from the on-disk artifact hashing to
 *   `baseContract` and hash-verified after the write (the normal path), or
 *   — in verify-only mode (the step-1→5 skip) — left alone, since no
 *   archiving write is possible on that path;
 * - an absent copy with already-promoted artifacts (hashing to `contract`)
 *   reports the old-contract copy as explicitly LOST and proceeds: promoted
 *   contents are never archived as if they were the original contract.
 * A crash between the two archive writes leaves a partial archive; the
 * per-file rule repairs it without overwriting the surviving copy.
 */
function ensureArchived(
  archivePath: string,
  artifactPath: string,
  baseSha: string,
  contractSha: string,
  label: string,
  writeMode: boolean,
): { ok: true; loss?: string } | { ok: false; reason: string } {
  // ABSENT (ENOENT) and UNREADABLE are different facts (§7 step 2): an
  // existing-but-unreadable archive cannot be verified against baseContract,
  // and treating it as absent would bypass the written-once rule (a loss
  // report, a later overwrite) — fail-closed refuse instead, in BOTH modes.
  let archived: string | undefined;
  try {
    archived = readFileSync(archivePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        ok: false,
        reason:
          `the ${label} archive exists but cannot be read (${(err as Error).message}) — ` +
          "refusing repair: an existing archive must be verified against revision.started.baseContract, never bypassed as absent",
      };
    }
    archived = undefined;
  }
  if (archived !== undefined) {
    const archivedSha = sha256Hex(archived);
    if (archivedSha === baseSha) return { ok: true }; // written once; never rewritten
    return {
      ok: false,
      reason:
        `the ${label} archive does not hash to revision.started.baseContract ` +
        `(expected ${baseSha.slice(0, 12)}…, found ${archivedSha.slice(0, 12)}…) — ` +
        "a mismatch is damage or tampering; refusing repair without overwriting the only content copy of the old contract",
    };
  }
  const onDisk = readTextFile(artifactPath);
  if (onDisk === undefined) {
    return { ok: false, reason: `the approved artifact ${artifactPath} cannot be read to build the ${label} archive` };
  }
  const artifactSha = sha256Hex(onDisk);
  if (artifactSha === baseSha) {
    if (!writeMode) return { ok: true }; // verify-only: the original still exists under its approved hash
    try {
      mkdirSync(dirname(archivePath), { recursive: true });
      writeFileSync(archivePath, onDisk, "utf8");
    } catch (err) {
      return { ok: false, reason: `could not write the ${label} archive: ${(err as Error).message}` };
    }
    const written = readTextFile(archivePath);
    if (written === undefined || sha256Hex(written) !== baseSha) {
      return { ok: false, reason: `the ${label} archive could not be verified after writing — refusing` };
    }
    return { ok: true };
  }
  if (artifactSha === contractSha) {
    return {
      ok: true,
      loss:
        `the ${label} archive is absent and the original contract content was already promoted — ` +
        "the old-contract file copy is unrecoverable (it survives in the log as hashes only); " +
        "the approved launch is not blocked by the lost convenience copy",
    };
  }
  return {
    ok: false,
    reason: `the approved artifact ${artifactPath} hashes to neither baseContract nor the approved contract — refusing`,
  };
}

/** True when both on-disk artifacts hash to the approval's contract. */
function promotedArtifactsVerify(paths: PromotionPaths, contract: ShaPair): boolean {
  const prd = readTextFile(paths.prd);
  const tasks = readTextFile(paths.tasks);
  return (
    prd !== undefined &&
    tasks !== undefined &&
    sha256Hex(prd) === contract.prdSha &&
    sha256Hex(tasks) === contract.tasksSha
  );
}

/** Expected-vs-actual hash report for the B8 messages (§14 honesty). */
function artifactShaReport(paths: PromotionPaths, expected: ShaPair): string {
  const prd = readTextFile(paths.prd);
  const tasks = readTextFile(paths.tasks);
  const actualPrd = prd === undefined ? "unreadable" : sha256Hex(prd);
  const actualTasks = tasks === undefined ? "unreadable" : sha256Hex(tasks);
  return (
    `expected prd ${expected.prdSha.slice(0, 12)}…, tasks ${expected.tasksSha.slice(0, 12)}…; ` +
    `found prd ${actualPrd.slice(0, 12)}…, tasks ${actualTasks.slice(0, 12)}…`
  );
}

/**
 * Locate the feature artifact directory for a REPAIR. Identity must be
 * marker-VERIFIABLE and UNIQUE: the gate writes the run's description
 * marker into BOTH artifacts of exactly one directory, so the repair
 * counts the description-marker matches across every directory — on the
 * PRD (the gate rule) and on the tasks artifact (which may be the only
 * intact file when a mid-promotion crash truncated the PRD) — and:
 * - exactly one directory with marker evidence → found (a single match is
 *   enough: every crash point of the promotion sequence leaves at least
 *   one artifact intact under our marker);
 * - MORE THAN ONE directory with marker evidence (same-marker PRDs
 *   included — `findExistingFeatureSlug` would silently pick the first
 *   match) → ambiguous identity, fail-closed refuse, never "first match";
 * - no marker evidence at all → the location is unprovable — refuse
 *   without ANY write. There is deliberately NO name-based fallback: a
 *   directory name is not feature identity (the gate can name directories
 *   from the planner TITLE, and an unrelated feature's directory can share
 *   the description's slug shape).
 */
function locateRepairSlug(
  cwd: string,
  description: string,
): { found: string } | { ambiguous: true } | { missing: true } {
  const root = join(cwd, ".ai", "features");
  if (!existsSync(root)) return { missing: true };
  const marker = descriptionMarker(description);
  const evidence = new Map<string, { prd: boolean; tasks: boolean }>();
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    if (!statSync(dir).isDirectory()) continue;
    const prd = join(dir, `prd-${entry}.md`);
    const tasks = join(dir, `tasks-${entry}.md`);
    const prdMatches = existsSync(prd) && readFileSync(prd, "utf8").startsWith(marker);
    const tasksMatches = existsSync(tasks) && readFileSync(tasks, "utf8").startsWith(marker);
    if (prdMatches || tasksMatches) evidence.set(entry, { prd: prdMatches, tasks: tasksMatches });
  }
  if (evidence.size === 0) return { missing: true };
  if (evidence.size > 1) return { ambiguous: true };
  const [slug] = evidence.keys();
  return { found: slug! };
}

/**
 * Classify the malformed (unparseable) lines of the successor log's RAW
 * content (B5a/AC-13). `readRunLog` silently skips unparseable lines — the
 * right discipline for torn append tails, but it would also let internal
 * corruption pass as an approved seed. The distinction:
 * - a malformed line is a TORN APPEND only when it is a strict byte-prefix
 *   of one of the canonical seed lines (exactly the shape a crash
 *   mid-append leaves, and what torn-line healing preserves), AND it sits
 *   in an append window its prefix can belong to: the seed is appended
 *   workflow.started → spec.approved, so a started-prefix is possible only
 *   BEFORE the complete started line, and a spec-prefix only between the
 *   two. A SHORT prefix below the canonical lines' common head
 *   (`{"type":"`) is a prefix of BOTH and names no event by itself — it is
 *   classified by the window open at its position, so it never refuses a
 *   reachable state. A torn prefix for which NO window is open is an
 *   IMPOSSIBLE seed order (B5a) — refuse;
 * - malformed lines AFTER the canonical seed is complete are the successor's
 *   ordinary execution tail, where the existing torn-line discipline applies;
 * - ANY other malformed line is internal corruption: refuse with its line
 *   number, without altering the log.
 */
export function successorSeedCorruption(
  raw: string,
  seed: {
    started: Extract<WorkflowEvent, { type: "workflow.started" }>;
    spec: Extract<WorkflowEvent, { type: "spec.approved" }>;
  },
): string | undefined {
  const startedLine = JSON.stringify(seed.started);
  const specLine = JSON.stringify(seed.spec);
  const lines = raw.split("\n");
  let startedSeen = false;
  let seedComplete = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim() === "") continue;
    let parses = true;
    try {
      JSON.parse(line);
    } catch {
      parses = false;
    }
    if (parses) {
      if (line === startedLine) startedSeen = true;
      if (line === specLine) seedComplete = true;
      continue;
    }
    if (seedComplete) continue; // post-seed execution tail: existing discipline
    // Prefix identity. A prefix SHORTER than the canonical lines' common
    // head (`{"type":"`) matches BOTH lines and names no event by itself:
    // resolve it by the append window open at its position — before the
    // complete started line it can only be a torn started append, between
    // the two lines only a torn spec append. An unambiguous prefix outside
    // its own window (and a shared prefix can never be outside every
    // window) is an impossible seed order; anything matching neither line
    // is corruption.
    const isStartedPrefix = startedLine.startsWith(line);
    const isSpecPrefix = specLine.startsWith(line);
    if (!isStartedPrefix && !isSpecPrefix) {
      return (
        `line ${index + 1} is corrupt and is not a torn append of the canonical seed — ` +
        "inspect and repair the successor log manually; the repair refuses to run over it"
      );
    }
    const startedFits = isStartedPrefix && !startedSeen;
    const specFits = isSpecPrefix && startedSeen;
    if (!startedFits && !specFits) {
      const claimed = isStartedPrefix ? "workflow.started" : "spec.approved";
      return (
        `line ${index + 1} holds a torn append of the canonical ${claimed} line in an impossible seed order — ` +
        "the seed is appended workflow.started→spec.approved; refusing without rewriting the log"
      );
    }
  }
  return undefined;
}

/**
 * The launch request the repair hands to the injected launcher (§7 step 7).
 * `resumedPhase: "develop"` is carried ONLY when the successor stub does not
 * yet hold `workflow.resumed` — the launcher emits the marker synchronously
 * before the workflow body. It is OMITTED when the stub already carries the
 * marker (B7c): at most one `workflow.resumed` ever lands on disk, so the
 * repair and the launcher are never two competing writers of it.
 */
export interface SuccessorLaunchRequest {
  successorRunId: string;
  resumedPhase?: "develop";
}

/**
 * The injected launch port. T6 verifies the repair's launch decisions
 * (`resumedPhase` present vs omitted) against a fake; T7 wires the real
 * `launchRun` with the constructed `ResumeState` behind it. The repair never
 * builds the baseline/ResumeState itself and never launches a real run.
 */
export type SuccessorLauncher = (request: SuccessorLaunchRequest) => Promise<void> | void;

export interface RepairLaunchDeps {
  /** Repository root (the predecessor's repo). */
  cwd: string;
  /** The predecessor run id. */
  runId: string;
  /** User decisions (B8 forced abandonment). */
  human: HumanInput;
  /** The predecessor's log — the CRITICAL sink for revision.launched/revision.abandoned. */
  events: RunLog;
  /** The injected launch port (§7 step 7). */
  launch: SuccessorLauncher;
}

export type RepairLaunchOutcome =
  | {
      kind: "launched";
      successorRunId: string;
      /** "develop" when the launch request carried it; absent when the marker already existed (B7c). */
      resumedPhase?: "develop";
      /** Non-empty when an original-contract archive copy was reported lost (§7 step 2). */
      archiveLosses: string[];
    }
  | { kind: "refused"; reason: string }
  | { kind: "failed"; error: string }
  | {
      /** B8 forced abandonment: the only exit that lifts the block (§14). */
      kind: "abandoned-forced";
      revision: number;
      artifactState: "untouched" | "indeterminate";
      report: string;
    };

/**
 * The §9 launch-repair entry, doubling as the §7 promotion executor after the
 * session's approval. Reachable from lifecycle `approved-pending-launch` AND
 * from `launched` while `launchIncomplete` holds; a successor that already
 * recorded its first `phase.started` is really running and refuses with a
 * pointer to it (T12). Every step re-derives its authority from a DISK
 * re-read inside the held lock; nothing runs without the step-0 persisted
 * approval; the sequence is deterministic and verified — never atomic, never
 * rolled back.
 */
export async function repairRevisionLaunch(deps: RepairLaunchDeps): Promise<RepairLaunchOutcome> {
  const { cwd, runId } = deps;
  try {
    const gate = launchRepairGate(readRunLog(cwd, runId), cwd);
    if (gate !== undefined) return { kind: "refused", reason: gate };
    const lock = acquireRunLock(cwd, { runId, workflow: "revision" });
    if (!lock.ok) return { kind: "refused", reason: describeLockRefusal(lock) };
    try {
      return await repairUnderLock(deps);
    } finally {
      lock.release();
    }
  } catch (err) {
    if (err instanceof UserDismissedError) {
      return { kind: "refused", reason: "decision dismissed — the revision stays blocked; run /flow revise again" };
    }
    if (err instanceof CriticalAppendError) {
      return { kind: "failed", error: `critical append failed: ${err.message}` };
    }
    return { kind: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The §9 reachability rule as a gate: `approved-pending-launch`, or
 * `launched` with an incomplete launch, pass; everything else refuses with
 * the reason. Undefined means "proceed".
 */
function launchRepairGate(events: WorkflowEvent[], cwd: string): string | undefined {
  const lifecycle = revisionLifecycle(events);
  switch (lifecycle.state) {
    case "invalid":
      return `revision evidence is corrupt (${lifecycle.reason}) — the affected paths refuse until resolved`;
    case "approved-pending-launch":
      return undefined;
    case "launched":
      return launchIncomplete(cwd, lifecycle.successorRunId)
        ? undefined
        : `the successor ${lifecycle.successorRunId} already recorded its first phase and is running — revise the successor run instead`;
    case "open":
    case "candidate-pending":
      return "the revision has no persisted approval yet — approve the candidate first; nothing can be promoted";
    case "none":
    case "abandoned":
      return "no approved revision launch to repair on this run";
  }
}

async function repairUnderLock(deps: RepairLaunchDeps): Promise<RepairLaunchOutcome> {
  const { cwd, runId } = deps;

  // --- Fresh state under the lock: authority is always a disk re-read. ---
  const events = readRunLog(cwd, runId);
  const gate = launchRepairGate(events, cwd);
  if (gate !== undefined) return { kind: "refused", reason: gate };
  const lifecycle = revisionLifecycle(events);
  if (lifecycle.state !== "approved-pending-launch" && lifecycle.state !== "launched") {
    return { kind: "refused", reason: gate ?? "no repairable launch state" };
  }
  const revision = lifecycle.approval.revision;
  const pointerExists = lifecycle.state === "launched";

  // --- §7 step 0: the persisted approval is the promotion precondition. ---
  const persisted = persistedApproval(events, revision);
  if (!persisted.ok) return { kind: "refused", reason: persisted.reason };
  const approval = persisted.approval;

  const startedEvent = events.find(
    (event): event is Extract<WorkflowEvent, { type: "workflow.started" }> =>
      event.type === "workflow.started",
  );
  if (startedEvent === undefined || startedEvent.description === undefined || startedEvent.baseline === undefined) {
    return {
      kind: "refused",
      reason: "the predecessor log lacks description/baseline — the successor seed cannot inherit the original inputs",
    };
  }
  const startedRevision = revisionStartedOf(events, revision);
  if (startedRevision === undefined) {
    return {
      kind: "refused",
      reason: `revision.started for revision ${revision} is missing — the archive baseContract cannot be verified`,
    };
  }

  // --- Artifact and sidecar locations. B4: the slug locator survives a
  // PRD the crash truncated past its marker (see locateRepairSlug). ---
  const located = locateRepairSlug(cwd, startedEvent.description);
  if (!("found" in located)) {
    return {
      kind: "refused",
      reason:
        "ambiguous" in located
          ? "the feature artifact directory is ambiguous — several directories verify the description marker (PRD and/or tasks); refusing to promote into the wrong one"
          : "cannot locate the approved PRD/tasks files — the description marker verifies in no artifact, and the repair never guesses a directory by its name; refusing without any writes",
    };
  }
  const slug = located.found;
  const sidecarDir = revisionSidecarDir(cwd, runId);
  const paths: PromotionPaths = {
    sidecarDir,
    prd: join(cwd, ".ai", "features", slug, `prd-${slug}.md`),
    tasks: join(cwd, ".ai", "features", slug, `tasks-${slug}.md`),
    archivePrd: join(sidecarDir, "previous-prd.md"),
    archiveTasks: join(sidecarDir, "previous-tasks.md"),
  };
  const marker = descriptionMarker(startedEvent.description);

  // --- §7 step 1: verify the candidate; fall back to already-promoted
  // artifacts before refusing. B8 only when NEITHER source verifies. ---
  const candidatePrd = readTextFile(candidatePrdPath(sidecarDir));
  const candidateTasks = readTextFile(candidateTasksPath(sidecarDir));
  const candidateVerifies =
    candidatePrd !== undefined &&
    candidateTasks !== undefined &&
    sha256Hex(candidatePrd) === approval.candidate.prdSha &&
    sha256Hex(candidateTasks) === approval.candidate.tasksSha;

  let writeMode = candidateVerifies;
  const archiveLosses: string[] = [];

  if (!candidateVerifies) {
    if (!promotedArtifactsVerify(paths, approval.contract)) {
      // B8: fail-closed — no repair, no execution, no implicit restore.
      return await forcedAbandonmentOrRefusal(deps, startedRevision, paths, {
        candidate:
          `candidate sidecar prd ${candidatePrd === undefined ? "missing" : sha256Hex(candidatePrd).slice(0, 12)}…, ` +
          `tasks ${candidateTasks === undefined ? "missing" : sha256Hex(candidateTasks).slice(0, 12)}… ` +
          `(expected ${approval.candidate.prdSha.slice(0, 12)}…/${approval.candidate.tasksSha.slice(0, 12)}…)`,
        artifacts: artifactShaReport(paths, approval.contract),
      });
    }
    // §7 step 1 skip: the artifacts already verify against the contract —
    // do NOT skip the archive decision; run it in VERIFY-ONLY mode (no
    // archiving write is possible on this path), then jump to the seed.
    writeMode = false;
  }

  // --- §7 step 2: the archive decision tree (both files, before any overwrite). ---
  const base = startedRevision.baseContract;
  const archivePrd = ensureArchived(paths.archivePrd, paths.prd, base.prdSha, approval.contract.prdSha, "previous-prd.md", writeMode);
  if (!archivePrd.ok) return { kind: "refused", reason: archivePrd.reason };
  if (archivePrd.loss !== undefined) archiveLosses.push(archivePrd.loss);
  const archiveTasks = ensureArchived(paths.archiveTasks, paths.tasks, base.tasksSha, approval.contract.tasksSha, "previous-tasks.md", writeMode);
  if (!archiveTasks.ok) return { kind: "refused", reason: archiveTasks.reason };
  if (archiveTasks.loss !== undefined) archiveLosses.push(archiveTasks.loss);

  // --- §7 steps 3–4: promote with the description marker rule, then verify
  // BOTH final hashes. Never launch an unverified contract; no rollback. ---
  if (writeMode) {
    if (candidatePrd === undefined || candidateTasks === undefined) {
      return { kind: "failed", error: "the candidate sidecar contents vanished mid-promotion" };
    }
    try {
      mkdirSync(dirname(paths.prd), { recursive: true });
      writeFileSync(paths.prd, `${marker}\n${candidatePrd}`, "utf8");
      writeFileSync(paths.tasks, `${marker}\n${candidateTasks}`, "utf8");
    } catch (err) {
      return { kind: "failed", error: `could not write the promoted artifacts: ${(err as Error).message}` };
    }
    const writtenPrd = readTextFile(paths.prd);
    const writtenTasks = readTextFile(paths.tasks);
    if (
      writtenPrd === undefined ||
      writtenTasks === undefined ||
      sha256Hex(writtenPrd) !== approval.contract.prdSha ||
      sha256Hex(writtenTasks) !== approval.contract.tasksSha
    ) {
      return {
        kind: "failed",
        error:
          "the promoted artifacts do not hash to the approved contract — refusing to seed, point or launch an unverified contract",
      };
    }
  }

  // --- §7 step 5: the deterministic successor seed with B5a prefix recovery.
  // Corruption readRunLog would silently skip is classified first (AC-13):
  // only torn appends of canonical seed lines (and the post-seed execution
  // tail) are allowed; anything else refuses without rewriting the log. ---
  const successorId = successorRunId(runId);
  const seed = canonicalSuccessorSeed(startedEvent, approval, foldLogUsage(events));
  const scanSeedCorruption = (): string | undefined => {
    const raw = readTextFile(runLogPath(cwd, successorId));
    return raw === undefined ? undefined : successorSeedCorruption(raw, seed);
  };
  const corruption = scanSeedCorruption();
  if (corruption !== undefined) {
    return {
      kind: "refused",
      reason: `the successor log ${successorId} is corrupt — refusing without rewriting: ${corruption}`,
    };
  }
  const seedCheck = verifySuccessorSeed(readRunLog(cwd, successorId), seed);
  if (seedCheck.status === "divergent") {
    return {
      kind: "refused",
      reason: `the successor log ${successorId} diverges from the canonical seed — refusing without rewriting: ${seedCheck.reason}`,
    };
  }
  if (seedCheck.status !== "complete") {
    const successorLog = RunLog.open(cwd, successorId);
    if (seedCheck.status === "empty") successorLog.append(seed.started);
    successorLog.append(seed.spec);
    const after = verifySuccessorSeed(readRunLog(cwd, successorId), seed);
    const afterCorruption = scanSeedCorruption();
    if (after.status !== "complete" || afterCorruption !== undefined) {
      return {
        kind: "failed",
        error: `the successor seed could not be verified after writing (${after.status === "divergent" ? after.reason : afterCorruption !== undefined ? afterCorruption : after.status})`,
      };
    }
  }

  // --- §7 step 6: the pointer, idempotent through appendCritical. ---
  if (!pointerExists) {
    deps.events.appendCritical(
      withEventId({
        type: "revision.launched" as const,
        runId,
        revision,
        successorRunId: successorId,
        at: new Date().toISOString(),
      }),
    );
  }

  // --- §7 step 7: launch through the injected port. The resumedPhase
  // decision is observable: "develop" when the stub lacks the marker,
  // omitted when it already holds one (B7c). ---
  const successorEvents = readRunLog(cwd, successorId);
  const resumedPresent = successorEvents.some((event) => event.type === "workflow.resumed");
  const request: SuccessorLaunchRequest = {
    successorRunId: successorId,
    ...(resumedPresent ? {} : { resumedPhase: "develop" as const }),
  };
  await deps.launch(request);
  return {
    kind: "launched",
    successorRunId: successorId,
    ...(request.resumedPhase !== undefined ? { resumedPhase: request.resumedPhase } : {}),
    archiveLosses,
  };
}

/**
 * B8 exit (§14): neither the candidate nor the promoted artifacts verify
 * against the persisted approval. Execution is refused unconditionally; the
 * revision block lifts ONLY through the explicit forced abandonment with
 * reason "approval contents unrecoverable", whose report states the ACTUAL
 * on-disk state — untouched (artifacts still hash to the old contract) or
 * indeterminate with both sha sets — and never promises a restore or claims
 * the predecessor is automatically resumable. The sidecar is kept: its
 * archive may be the only restorable old-contract copy.
 */
async function forcedAbandonmentOrRefusal(
  deps: RepairLaunchDeps,
  started: RevisionStartedEvent,
  paths: PromotionPaths,
  evidence: { candidate: string; artifacts: string },
): Promise<RepairLaunchOutcome> {
  const b8Reason =
    "neither the candidate sidecar nor the promoted artifacts verify against the persisted approval " +
    `(B8: ${evidence.candidate}; ${evidence.artifacts})`;
  const choice = await deps.human.select({
    message:
      "The approved contents are unrecoverable: candidate and promoted artifacts both fail the persisted approval's hashes. " +
      "Execution is refused. Only an explicit forced abandonment lifts the revision block.",
    options: [
      {
        label: "Force abandonment",
        value: "force",
        description:
          "Record revision.abandoned (approval contents unrecoverable), report the on-disk state honestly, keep the sidecar archive.",
      },
      {
        label: "Leave blocked",
        value: "leave",
        description: "Keep the revision block; inspect the artifacts manually first.",
      },
    ],
    defaultValue: "leave",
  });
  if (choice !== "force") return { kind: "refused", reason: b8Reason };

  const actualPrd = readTextFile(paths.prd);
  const actualTasks = readTextFile(paths.tasks);
  const actualPrdSha = actualPrd === undefined ? "unreadable" : sha256Hex(actualPrd);
  const actualTasksSha = actualTasks === undefined ? "unreadable" : sha256Hex(actualTasks);
  const untouched = actualPrdSha === started.baseContract.prdSha && actualTasksSha === started.baseContract.tasksSha;
  const archiveAvailable =
    readTextFile(paths.archivePrd) !== undefined && readTextFile(paths.archiveTasks) !== undefined;
  const report = untouched
    ? "Untouched: the approved artifacts still hash to the predecessor's old contract. " +
      "The revision block is lifted; whether /flow resume works again depends on the predecessor's own status " +
      "(a cancelled/needs_human run stays terminal). Partial code was never touched."
    : "Indeterminate: the approved artifacts do NOT hash to the predecessor's old contract and are NOT known-good. " +
      `Expected prd ${started.baseContract.prdSha}, tasks ${started.baseContract.tasksSha}; ` +
      `found prd ${actualPrdSha}, tasks ${actualTasksSha}. ` +
      (archiveAvailable
        ? "Restore manually from the sidecar archive, or open a new revision. "
        : "The sidecar archive is also unavailable — manual restoration needs another source; or open a new revision. ") +
      "The revision block is lifted; whether /flow resume works again depends on the predecessor's own status. " +
      "Partial code was never touched. No rollback was attempted.";
  deps.events.appendCritical(
    withEventId({
      type: "revision.abandoned" as const,
      runId: deps.runId,
      revision: started.revision,
      reason: "approval contents unrecoverable",
      at: new Date().toISOString(),
    }),
  );
  return {
    kind: "abandoned-forced",
    revision: started.revision,
    artifactState: untouched ? "untouched" : "indeterminate",
    report,
  };
}
