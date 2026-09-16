/** Pi-free lifecycle decisions for `/flow stop` and `/feature` admission. */

export type FlowRunStatus = "running" | "cancelling" | "completed" | "needs_human" | "failed" | "cancelled";

export type FlowStopDecision =
  | { action: "no_run" }
  | { action: "cancellation_requested"; nextStatus: "cancelling" }
  | { action: "cancellation_in_progress" }
  | { action: "already_finished"; status: Exclude<FlowRunStatus, "running" | "cancelling"> };

export function decideFlowStop(status: FlowRunStatus | null): FlowStopDecision {
  if (status === null) return { action: "no_run" };
  if (status === "running") {
    return { action: "cancellation_requested", nextStatus: "cancelling" };
  }
  if (status === "cancelling") return { action: "cancellation_in_progress" };
  return { action: "already_finished", status };
}

/** Apply a cancellation decision and invoke the abort callback at most once. */
export function requestFlowStop(run: { status: FlowRunStatus }, abort: () => void): FlowStopDecision {
  const decision = decideFlowStop(run.status);
  if (decision.action === "cancellation_requested") {
    run.status = decision.nextStatus;
    abort();
  }
  return decision;
}

/** A run still owns the workflow slot until its cancellation has resolved. */
export function blocksFeatureStart(status: FlowRunStatus): boolean {
  return status === "running" || status === "cancelling";
}
