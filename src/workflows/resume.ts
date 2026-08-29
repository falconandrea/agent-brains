/**
 * Resume mode: replay a persisted event log to reconstruct run state and
 * continue an interrupted /feature run from the first incomplete phase.
 *
 * Pure replay + precondition checks. No Pi — testable with hand-written
 * events and fakes, like everything else under src/.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_MAX_REVIEW_ROUNDS } from "../config.ts";
import type { WorkflowEvent, GitBaseline, GitService, HumanInput } from "../ports.ts";
import type { ResumeState, UsageByRole } from "./feature.ts";
import { descriptionMarker, hasValidTaskList } from "./feature.ts";
import type { ReviewIssue, ReviewResult } from "../review.ts";

/**
 * Refusal reasons for resume. Every resume path ends in either a ResumeState
 * (success) or a Refusal (clean message to the user, no agent calls).
 */
export type Refusal =
  | { type: "empty_log" }
  | { type: "not_feature_workflow"; workflow: string }
  | { type: "missing_workflow_started" }
  | { type: "missing_baseline" }
  | { type: "gate_not_approved" }
  | { type: "terminal_outcome"; outcome: string }
  | {
      /**
       * The last completed review already decided the run (approved or
       * needs_human) but the outcome events were never written (crash in the
       * synchronous window after review.completed). Nothing to resume: the
       * caller should reconstruct and persist the terminal outcome instead.
       */
      type: "already_decided";
      status: "completed" | "needs_human";
      review?: ReviewResult;
      files?: string[];
      usage: UsageByRole;
    }
  | { type: "missing_artifacts" }
  | { type: "unresolvable_baseline" };

/**
 * Replay result: either a reconstructed ResumeState or a Refusal.
 */
export type ReplayResult = { ok: true; state: ResumeState } | { ok: false; refusal: Refusal };

export interface ReplayOptions {
  /** Needed to reconstruct a max-round escalation before workflow.completed. */
  maxReviewRounds?: number;
}

const isDeveloperPhase = (phase: string): boolean =>
  phase === "develop" || phase.startsWith("fix #");

const asReviewResult = (
  event: Extract<WorkflowEvent, { type: "review.completed" }>,
): ReviewResult => ({
  // Older logs omitted summary; newer events preserve it for crash recovery.
  verdict: event.verdict as ReviewResult["verdict"],
  summary: event.summary ?? "",
  issues: (event.issues ?? []).map((i) => ({
    id: i.id,
    severity: i.severity as ReviewIssue["severity"],
    category: i.category as ReviewIssue["category"],
    problem: i.problem,
    ...(i.file !== undefined ? { file: i.file } : {}),
    ...(i.line !== undefined ? { line: i.line } : {}),
    ...(i.recommendation !== undefined ? { recommendation: i.recommendation } : {}),
  })),
});

/**
 * Pure replay: derive the re-entry phase, loop counters, fixes, last review,
 * and usage from the event log. Returns a Refusal for any log that cannot be
 * resumed (missing events, terminal outcomes, old format).
 *
 * Counting rules (must mirror how feature.ts consumes them):
 * - `developerRuns` counts COMPLETED developer passes: the last phase.started
 *   in the log is the interruption point, so an interrupted develop/fix is
 *   not counted and is honestly re-run under the same phase name.
 * - `reviewRound` counts review.completed events only: an interrupted review
 *   round never consumed its budget, so it re-runs as the same round.
 * - `verifyRetries` counts retry-consuming failed verification.completed
 *   events; the one re-observation of a failed verify after each resume is
 *   free because that retry was already banked before the crash.
 */
export function replayRunLog(events: WorkflowEvent[], options: ReplayOptions = {}): ReplayResult {
  if (events.length === 0) {
    return { ok: false, refusal: { type: "empty_log" } };
  }

  // First event must be workflow.started with workflow="feature".
  const started = events[0];
  if (started?.type !== "workflow.started") {
    return { ok: false, refusal: { type: "missing_workflow_started" } };
  }
  if (started.workflow !== "feature") {
    return { ok: false, refusal: { type: "not_feature_workflow", workflow: started.workflow } };
  }

  // Resume requires the persisted baseline (written since the resume feature);
  // old logs without it cannot reconstruct the original diff base.
  if (!started.baseline) {
    return { ok: false, refusal: { type: "missing_baseline" } };
  }
  const maxReviewRounds = options.maxReviewRounds ?? DEFAULT_MAX_REVIEW_ROUNDS;

  // Terminal outcomes are not resumable — except workflow.failed, which is
  // the very state resume exists for (provider crash, quota, Ctrl-C). A log
  // may contain a workflow.failed followed by an earlier resume attempt's
  // events; any COMPLETED outcome still refuses.
  const terminal = events.find(
    (e): e is Extract<WorkflowEvent, { type: "workflow.outcome" | "workflow.completed" }> =>
      e.type === "workflow.outcome" || e.type === "workflow.completed",
  );
  if (terminal) {
    return { ok: false, refusal: { type: "terminal_outcome", outcome: terminal.type } };
  }

  // Gate approval: any loop phase (develop/fix/verify/review) or a prior
  // resume proves the spec gate was approved. Runs interrupted before the
  // gate are not resumable — the planner must re-ask anyway, so a fresh
  // /feature is the honest path.
  const gateApproved = events.some(
    (e) =>
      (e.type === "phase.started" &&
        (isDeveloperPhase(e.phase) || e.phase === "verify" || e.phase.startsWith("review #"))) ||
      e.type === "workflow.resumed" ||
      e.type === "spec.approved",
  );
  if (!gateApproved) {
    return { ok: false, refusal: { type: "gate_not_approved" } };
  }

  // The last phase.started is the interruption point; every phase before it
  // completed.
  let lastPhaseIdx = -1;
  events.forEach((e, i) => {
    if (e.type === "phase.started") lastPhaseIdx = i;
  });
  const lastPhase = lastPhaseIdx >= 0 ? (events[lastPhaseIdx] as Extract<WorkflowEvent, { type: "phase.started" }>).phase : null;
  if (lastPhase === null) {
    return { ok: false, refusal: { type: "gate_not_approved" } };
  }

  let reviewRound = 0;
  let verifyRetries = 0;
  let developerRuns = 0;
  let lastReviewCompleted = false;
  // A developer pass (develop or fix #N) is COMPLETE only when a verify or
  // review phase follows it. Consecutive developer phase.started events are
  // the SAME logical pass re-run by an earlier resume — counting both would
  // skip a fix round and mislabel the next one.
  let pendingDeveloperPass = false;
  const fixes: ReviewIssue[] = [];
  const previousBlockingIds = new Set<string>();
  let lastReview: ReviewResult | undefined;
  let lastReviewFiles: string[] | undefined;
  let currentReviewPatchSha: string | undefined;
  let previousCompletedReviewPatchSha: string | undefined;
  let lastReviewNoProgress = false;
  let interruptedPatchSha: string | undefined;
  let spec: ResumeState["spec"];
  let activePhase: string | undefined;
  let verifyObservation: "passed" | "failed" | undefined;
  // A resumed run re-observes a failed verify phase once before continuing to
  // its already-bankrolled fix. That observation is persisted as a normal
  // verification.completed event, but must not consume another retry when the
  // concatenated log is replayed later (including after a second crash).
  let freeVerifyObservation = false;
  const usage: UsageByRole = {};

  events.forEach((event, i) => {
    switch (event.type) {
      case "agent.completed": {
        if (event.usage) {
          const current = usage[event.role] ?? { input: 0, output: 0 };
          current.input += event.usage.input;
          current.output += event.usage.output;
          usage[event.role] = current;
        }
        break;
      }
      case "phase.started": {
        activePhase = event.phase;
        lastReviewCompleted = false;
        if (event.phase === "verify") verifyObservation = undefined;
        if (event.phase !== "verify") freeVerifyObservation = false;
        if (event.phase.startsWith("review #")) {
          currentReviewPatchSha = event.patchSha;
        } else {
          currentReviewPatchSha = undefined;
        }
        if (isDeveloperPhase(event.phase)) {
          pendingDeveloperPass = true;
        } else if (event.phase === "verify" || event.phase.startsWith("review #")) {
          if (pendingDeveloperPass) {
            developerRuns += 1;
            pendingDeveloperPass = false;
          }
        }
        if (event.phase.startsWith("review #") && i === lastPhaseIdx) {
          interruptedPatchSha = event.patchSha;
        }
        break;
      }
      case "verification.completed": {
        if (activePhase === "verify") verifyObservation = event.passed ? "passed" : "failed";
        if (!event.passed) {
          if (freeVerifyObservation) {
            freeVerifyObservation = false;
          } else {
            verifyRetries += 1;
          }
        } else {
          freeVerifyObservation = false;
        }
        break;
      }
      case "spec.approved": {
        spec = { prdSha: event.prdSha, tasksSha: event.tasksSha };
        break;
      }
      case "review.completed": {
        lastReviewCompleted = true;
        interruptedPatchSha = undefined;
        lastReview = asReviewResult(event);
        lastReviewFiles = event.files;
        const blocking = (event.issues ?? []).filter((issue) => issue.severity === "blocking");
        const repeatedBlocking =
          blocking.length > 0 &&
          previousBlockingIds.size > 0 &&
          blocking.every((issue) => previousBlockingIds.has(issue.id));
        lastReviewNoProgress =
          repeatedBlocking &&
          currentReviewPatchSha !== undefined &&
          previousCompletedReviewPatchSha !== undefined &&
          currentReviewPatchSha === previousCompletedReviewPatchSha;
        previousCompletedReviewPatchSha = currentReviewPatchSha;
        previousBlockingIds.clear();
        fixes.length = 0;
        for (const issue of blocking) {
          previousBlockingIds.add(issue.id);
          fixes.push({
            id: issue.id,
            severity: issue.severity as ReviewIssue["severity"],
            category: issue.category as ReviewIssue["category"],
            problem: issue.problem,
            ...(issue.file !== undefined ? { file: issue.file } : {}),
            ...(issue.line !== undefined ? { line: issue.line } : {}),
            ...(issue.recommendation !== undefined ? { recommendation: issue.recommendation } : {}),
          });
        }
        reviewRound += 1;
        break;
      }
      case "workflow.resumed": {
        // Mirror feature.ts: a new live run resets previousPatch, so the
        // first review after a resume cannot be classified as no-progress
        // against a review from the interrupted run.
        previousCompletedReviewPatchSha = undefined;
        // Only a resume from a persisted failed verify gets a free
        // re-observation. A crash during verify before its result exists must
        // charge the failure normally.
        freeVerifyObservation = event.phase === "verify" && verifyObservation === "failed";
        break;
      }
    }
  });

  // Reconstruct the same terminal decision as decideNextRound. In particular,
  // "approved" with blocking issues is NOT terminal: it must resume at the
  // fix round (or escalate when the review budget is exhausted).
  if (lastReviewCompleted && lastReview !== undefined) {
    const hasBlocking = lastReview.issues.some((issue) => issue.severity === "blocking");
    const decidedStatus =
      lastReview.verdict === "needs_human" ||
      (hasBlocking && (reviewRound >= maxReviewRounds || lastReviewNoProgress))
        ? "needs_human"
        : !hasBlocking
          ? "completed"
          : undefined;
    if (decidedStatus !== undefined) {
      return {
        ok: false,
        refusal: {
          type: "already_decided",
          status: decidedStatus,
          review: lastReview,
          ...(lastReviewFiles !== undefined ? { files: lastReviewFiles } : {}),
          usage,
        },
      };
    }
  }

  // Derive the re-entry phase from the interruption point.
  let phase: string;
  if (isDeveloperPhase(lastPhase)) {
    // Interrupted mid-developer: re-run it (an interrupted develop keeps the
    // name "develop" because it never completed; developerRuns excludes it).
    phase = developerRuns === 0 ? "develop" : `fix #${developerRuns}`;
  } else if (lastPhase === "verify") {
    phase = "verify";
  } else if (lastPhase === "spec" && spec !== undefined) {
    // The human gate was approved, but the process died before the first loop
    // phase was emitted.
    phase = "develop";
  } else if (lastPhase.startsWith("review #")) {
    phase = lastReviewCompleted
      ? // The review completed and its fix round is due — the developer runs.
        developerRuns === 0
        ? "develop"
        : `fix #${developerRuns}`
      : // The review round itself was interrupted: re-run the same round.
        lastPhase;
  } else {
    // discover/spec interruptions are pre-gate: refused above in practice.
    return { ok: false, refusal: { type: "gate_not_approved" } };
  }

  return {
    ok: true,
    state: {
      phase,
      verifyRetryBanked: lastPhase === "verify" && verifyObservation === "failed",
      reviewRound,
      verifyRetries,
      developerRuns,
      fixes,
      previousBlockingIds,
      lastReview,
      usage,
      interruptedPatchSha,
      ...(spec !== undefined ? { spec } : {}),
    },
  };
}

/**
 * Check whether a run is resumable based on its events.
 * This is a lighter check than full replay — used for argument completions.
 */
export function isResumable(events: WorkflowEvent[]): boolean {
  const result = replayRunLog(events);
  return result.ok;
}

/**
 * Validate resume preconditions:
 * - PRD and tasks files exist with the description marker
 * - Baseline commit is still resolvable via diffSince
 *
 * Returns a Refusal if validation fails, undefined if all checks pass.
 */
export async function validateResumePreconditions(
  deps: {
    cwd: string;
    description: string;
    git: GitService;
    baseline: GitBaseline;
  },
): Promise<Refusal | undefined> {
  const { cwd, description, git, baseline } = deps;

  // The PRD carries the description marker on its first line; the tasks file
  // lives beside it (written together by the original run) and must survive
  // too — a resume that re-enters the loop without tasks would hand every
  // agent an empty plan.
  const marker = descriptionMarker(description);
  const featureDir = join(cwd, ".ai", "features");
  if (!existsSync(featureDir)) {
    return { type: "missing_artifacts" };
  }

  let found = false;
  for (const entry of readdirSync(featureDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const prdPath = join(featureDir, entry.name, `prd-${entry.name}.md`);
    const tasksPath = join(featureDir, entry.name, `tasks-${entry.name}.md`);
    if (
      existsSync(prdPath) &&
      existsSync(tasksPath) &&
      readFileSync(prdPath, "utf8").startsWith(marker) &&
      readFileSync(tasksPath, "utf8").startsWith(marker) &&
      hasValidTaskList(readFileSync(tasksPath, "utf8"))
    ) {
      found = true;
      break;
    }
  }
  if (!found) {
    return { type: "missing_artifacts" };
  }

  // The baseline snapshot must still be resolvable (git gc on a repo that
  // dropped the dangling snapshot commit would break every diffSince).
  try {
    await git.diffSince(baseline);
  } catch {
    return { type: "unresolvable_baseline" };
  }

  return undefined;
}

/**
 * Compare the current patch sha with the interrupted patch sha.
 * Returns true if the patch has changed, false if unchanged.
 * If no interruptedPatchSha is available (old format or non-review interruption),
 * returns false (assume unchanged).
 */
export function hasPatchChanged(currentPatch: string, interruptedPatchSha: string | undefined): boolean {
  if (!interruptedPatchSha) return false;
  const currentSha = createHash("sha256").update(currentPatch).digest("hex");
  return currentSha !== interruptedPatchSha;
}

/**
 * Ask the user whether to resume with a changed diff or abort.
 * Returns true if the user chooses to resume, false to abort.
 */
export async function askResumeWithChangedDiff(
  human: HumanInput,
): Promise<boolean> {
  const choice = await human.select({
    message: "The working diff has changed since the interruption. How would you like to proceed?",
    options: [
      {
        label: "Resume with current diff",
        value: "resume",
        description: "Continue the review with the current (changed) diff",
      },
      {
        label: "Abort",
        value: "abort",
        description: "Stop the resume. You can manually run /feature to start fresh",
      },
    ],
  });
  return choice === "resume";
}
