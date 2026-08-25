/**
 * Ports the workflow engine talks to. Every one of them has a Pi-backed
 * implementation under `src/pi/` and a fake under `tests/`, so workflows can
 * be run end-to-end with no models and no Pi.
 */

import type { VerifyCommand } from "./verify.ts";

export interface ConfirmQuestion {
  message: string;
  detail?: string;
  defaultValue?: boolean;
}
export interface SelectQuestion {
  message: string;
  options: Array<{ label: string; value: string; description?: string }>;
}
export interface InputQuestion {
  message: string;
  placeholder?: string;
  defaultValue?: string;
}

/** Spec §15 — human-in-the-loop is a first-class primitive. */
export interface HumanInput {
  confirm(q: ConfirmQuestion): Promise<boolean>;
  select(q: SelectQuestion): Promise<string>;
  input(q: InputQuestion): Promise<string>;
  editor(q: { message: string; content: string }): Promise<string>;
  /** Non-blocking status line / operational trace. */
  notify(message: string): void;
}

export interface CommandResult {
  command: string;
  exitCode: number;
  output: string;
}

export interface VerifyRunner {
  run(commands: VerifyCommand[], signal?: AbortSignal): Promise<CommandResult[]>;
}

export interface GitBaseline {
  repoRoot: string;
  branch: string;
  headSha: string;
  /**
   * Commit object capturing the entire working tree at baseline, untracked
   * files included. The diff is snapshot-to-snapshot, so pre-existing dirt
   * cancels out on both sides and only the run's own changes remain.
   */
  baseCommit: string;
}

export interface GitService {
  baseline(cwd: string): Promise<GitBaseline>;
  diffSince(baseline: GitBaseline): Promise<{
    patch: string;
    files: string[];
    /** Submodules with modified contents — their inner diff is NOT in `patch`. */
    dirtySubmodules: string[];
  }>;
}

export interface WorkflowEventSink {
  emit(event: WorkflowEvent): void;
}

export type WorkflowEvent =
  | {
      type: "workflow.started";
      runId: string;
      workflow: string;
      /** User's original request (for resume mode). Optional for backward compatibility. */
      description?: string;
      /** Detected or configured stack at workflow start (for resume mode). Optional for backward compatibility. */
      stack?: { primary: string; frameworks: string[] };
      /** Git baseline snapshot commit (for resume mode diffSince). Optional for backward compatibility. */
      baseline?: string;
    }
  | {
      type: "phase.started";
      runId: string;
      phase: string;
      /** SHA256 of the current patch when a review phase starts (for resume-mode change detection). */
      patchSha?: string;
    }
  | {
      type: "agent.started";
      runId: string;
      role: string;
      model: string;
      /** Skill names routed to this role (visibility/debugging). */
      skills?: string[];
    }
  | {
      type: "agent.completed";
      runId: string;
      role: string;
      /** Token usage of THIS agent call, when the runner reports it. */
      usage?: { input: number; output: number };
    }
  | { type: "agent.waiting_input"; runId: string; role: string; question: string }
  | { type: "command.completed"; runId: string; command: string; exitCode: number }
  | { type: "verification.completed"; runId: string; passed: boolean }
  | {
      type: "review.completed";
      runId: string;
      verdict: string;
      round: number;
      /** Blocking findings of this round, for persisted post-mortems. */
      issues?: Array<{
        id: string;
        severity: string;
        category: string;
        problem: string;
        /** Optional richer issue fields for better post-mortems. */
        file?: string;
        line?: number;
        recommendation?: string;
      }>;
    }
  | {
      /**
       * Final outcome with everything a post-mortem needs — persisted in the
       * run log so findings survive the TUI (IDEAS.md run-state escalation).
       */
      type: "workflow.outcome";
      runId: string;
      status: string;
      reason?: string;
      summary?: string;
      files?: string[];
      /** Last review of the run, issues included (needs_human/completed). */
      review?: {
        verdict: string;
        summary: string;
        issues: Array<{
          id: string;
          severity: string;
          category: string;
          problem: string;
          file?: string;
          line?: number;
          recommendation?: string;
        }>;
      };
      usage?: Record<string, { input: number; output: number }>;
    }
  | { type: "workflow.completed"; runId: string; status: string }
  | { type: "workflow.failed"; runId: string; error: string }
  | {
      type: "workflow.resumed";
      runId: string;
      /** The phase at which the run resumes. */
      phase: string;
    };
