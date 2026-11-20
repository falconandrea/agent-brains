/**
 * Rendering helpers for the revision run pointers (spec.md §16 rule 6):
 * `revised-by=<successorRunId>` on a predecessor whose revision launched and
 * `revises=<predecessorRunId>` on a successor run. Rendering only, no
 * semantics: the pointers are derived tolerantly from the persisted events
 * themselves, so an unexpected log shape degrades the rendered line — it never
 * makes `/flow log-all` fail. The successor reference renders from the
 * predecessor's `revision.launched` event alone and can be visible while the
 * successor's launch is still incomplete (§9 B7a: the pointer proves intent,
 * not a running successor).
 */
import type { WorkflowEvent } from "./ports.ts";

/** Both pointers of one run; each absent for logs without revision linkage. */
export type RevisionPointers = {
  /** The predecessor this run revises, from `workflow.started.revision` (§8). */
  revises?: string;
  /** The successor that superseded this run, from `revision.launched` (§8). */
  revisedBy?: string;
};

/**
 * The persisted pointers of one run's events — the `/flow log-all` input.
 * Only the run's OWN log is read: a middle run of a chain carries both
 * pointers, a plain log carries none.
 */
export function revisionPointersOf(events: WorkflowEvent[]): RevisionPointers {
  const pointers: RevisionPointers = {};
  for (const event of events) {
    if (event.type === "workflow.started" && event.revision) {
      pointers.revises = event.revision.predecessorRunId;
    } else if (event.type === "revision.launched") {
      pointers.revisedBy = event.successorRunId;
    }
  }
  return pointers;
}

/**
 * The `describe` line (`/flow log`) for the pointer-carrying events, or
 * undefined for every other event — including a plain `workflow.started`,
 * whose rendering stays exactly the generic line it has always been.
 */
export function describeRevisionPointer(event: WorkflowEvent): string | undefined {
  if (event.type === "workflow.started") {
    return event.revision ? `  workflow.started — revises=${event.revision.predecessorRunId}` : undefined;
  }
  if (event.type === "revision.launched") {
    return `  revision.launched — revised-by=${event.successorRunId}`;
  }
  return undefined;
}

/**
 * The `/flow log-all` line fragment for a run's pointers — empty for logs
 * without revision metadata, so ordinary runs keep today's output verbatim.
 */
export function formatRevisionPointers(pointers: RevisionPointers): string {
  return [pointers.revisedBy && `revised-by=${pointers.revisedBy}`, pointers.revises && `revises=${pointers.revises}`]
    .filter(Boolean)
    .join(" ");
}
