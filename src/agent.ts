/**
 * Agent abstraction (spec §16). Workflow code depends ONLY on this file —
 * never on the Pi SDK directly. The real implementation lives in
 * `src/pi/pi-agent-runner.ts`; `FakeAgentRunner` below makes the whole
 * orchestration testable with no provider, no network and no Pi installed.
 */

import type { Role } from "./skill-router.ts";
import type { ThinkingLevel } from "./config.ts";

export interface ModelSelection {
  provider?: string;
  model?: string;
  thinking?: ThinkingLevel;
}

export interface AgentRunRequest {
  runId: string;
  role: Role;
  cwd: string;
  /** Curated context + instructions. Never the parent conversation (§5.4). */
  prompt: string;
  model?: ModelSelection;
  /** Skill names, already filtered by the skill router. */
  skills?: string[];
  /** Built-in tool allowlist, e.g. ["read","grep","find","ls"]. */
  tools?: string[];
  readOnly?: boolean;
  /** Virtual AGENTS.md-style context files injected into the child. */
  contextFiles?: Array<{ path: string; content: string }>;
  /** When set, the child gets a single result tool it must call once. */
  resultTool?: ResultToolSpec;
  signal?: AbortSignal;
}

export interface ResultToolSpec {
  name: string;
  description: string;
  /** JSON-schema-ish object; the Pi layer converts it to typebox. */
  parameters: Record<string, unknown>;
}

export interface AgentRunResult {
  role: Role;
  /** Final assistant text. */
  text: string;
  /** Payload captured from `resultTool`, when one was declared. */
  structured?: unknown;
  usage?: { input?: number; output?: number; cost?: number };
  aborted: boolean;
}

export interface AgentRunner {
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

/** Deterministic stand-in used by tests and by `spike/` dry runs. */
export class FakeAgentRunner implements AgentRunner {
  readonly calls: AgentRunRequest[] = [];
  readonly #responder: (req: AgentRunRequest, callIndex: number) => AgentRunResult;

  constructor(responder: (req: AgentRunRequest, callIndex: number) => AgentRunResult) {
    this.#responder = responder;
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const index = this.calls.length;
    this.calls.push(request);
    return this.#responder(request, index);
  }
}
