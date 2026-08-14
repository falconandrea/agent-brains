/**
 * THE ONLY FILE THAT TOUCHES THE PI SDK.
 *
 * Pi's docs are unversioned ("latest") and the API is moving, so every SDK
 * call is confined here. If Pi changes, this file changes and nothing else does.
 *
 * Status: written against the documented API, NOT yet executed — Pi is not
 * installed in this repo. `spike/spike-extension.ts` is what proves it. Treat
 * every `@spike` marker as unverified until that spike passes.
 */

import type {
  AgentRunner,
  AgentRunRequest,
  AgentRunResult,
  ResultToolSpec,
} from "../agent.ts";

// Imported lazily so this module can be typechecked/imported without Pi present.
type PiModule = typeof import("@earendil-works/pi-coding-agent");

export interface PiAgentRunnerDeps {
  /** Shared across children so provider catalogs/auth are resolved once. */
  modelRuntime: unknown;
  /** Repo root; also used for session naming and tool path resolution. */
  cwd: string;
  /** Called for each child event we want to surface in the TUI. */
  onEvent?: (event: { runId: string; role: string; type: string; detail?: string }) => void;
  /**
   * Bridge for `ask_user` coming from inside a child run.
   * @spike may deadlock or hit the "stale ctx" rule — see spike step 4.
   * Fallback if it does: return `null` here and queue the question until the
   * next phase boundary.
   */
  askUser?: (question: {
    question: string;
    reason?: string;
    options?: string[];
  }) => Promise<string | null>;
}

const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"] as const;

export class PiAgentRunner implements AgentRunner {
  readonly #pi: PiModule;
  readonly #deps: PiAgentRunnerDeps;

  constructor(pi: PiModule, deps: PiAgentRunnerDeps) {
    this.#pi = pi;
    this.#deps = deps;
  }

  static async create(deps: Omit<PiAgentRunnerDeps, "modelRuntime">): Promise<PiAgentRunner> {
    const pi = (await import("@earendil-works/pi-coding-agent")) as PiModule;
    const modelRuntime = await (pi as any).ModelRuntime.create();
    return new PiAgentRunner(pi, { ...deps, modelRuntime });
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const pi = this.#pi as any;

    // --- resources: per-role skill filtering (spec §8.3) --------------------
    // skillsOverride is a transformer over the discovered set, so we build a
    // DefaultResourceLoader with its own cwd/agentDir (discovery still runs)
    // and filter down to the role's skills.
    const loader = new pi.DefaultResourceLoader({
      cwd: request.cwd,
      agentDir: pi.getAgentDir(),
      skillsOverride: (current: any) => ({
        skills: request.skills
          ? current.skills.filter((s: any) => request.skills!.includes(s.name))
          : current.skills,
        diagnostics: current.diagnostics,
      }),
      ...(request.contextFiles
        ? {
            agentsFilesOverride: (current: any) => ({
              agentsFiles: [...current.agentsFiles, ...request.contextFiles!],
            }),
          }
        : {}),
    });
    await loader.reload();

    // --- result tool: Pi has no JSON response mode (spec §11.2) -------------
    let structured: unknown;
    const customTools = request.resultTool
      ? [this.buildResultTool(request.resultTool, (payload) => (structured = payload))]
      : [];
    if (this.#deps.askUser) customTools.push(this.buildAskUserTool());

    // --- model per role -----------------------------------------------------
    const model =
      request.model?.provider && request.model.model
        ? (this.#deps.modelRuntime as any).getModel(request.model.provider, request.model.model)
        : undefined;

    const tools = request.readOnly
      ? [...READ_ONLY_TOOLS, ...customTools.map((t: any) => t.name)]
      : request.tools
        ? [...request.tools, ...customTools.map((t: any) => t.name)]
        : undefined;

    const { session } = await pi.createAgentSession({
      sessionManager: pi.SessionManager.inMemory(request.cwd),
      modelRuntime: this.#deps.modelRuntime,
      resourceLoader: loader,
      cwd: request.cwd,
      model,
      thinkingLevel: request.model?.thinking,
      customTools,
      ...(tools ? { tools } : {}),
    });

    const unsubscribe = session.subscribe((event: any) => {
      switch (event.type) {
        case "tool_execution_start":
          this.#deps.onEvent?.({
            runId: request.runId,
            role: request.role,
            type: "tool",
            detail: event.toolName,
          });
          break;
        case "agent_end":
          this.#deps.onEvent?.({ runId: request.runId, role: request.role, type: "agent_end" });
          break;
      }
    });

    const onAbort = () => void session.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      await session.prompt(request.prompt);
      const messages = session.agent.state.messages;
      const last = messages[messages.length - 1];
      return {
        role: request.role,
        text: textOf(last),
        structured,
        aborted: request.signal?.aborted ?? false,
      };
    } finally {
      request.signal?.removeEventListener("abort", onAbort);
      unsubscribe();
      session.dispose();
    }
  }

  /** @spike typebox conversion — schema shape confirmed only against docs. */
  private buildResultTool(spec: ResultToolSpec, capture: (payload: unknown) => void) {
    const pi = this.#pi as any;
    return pi.defineTool({
      name: spec.name,
      label: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      execute: async (_id: string, params: unknown) => {
        capture(params);
        return { content: [{ type: "text", text: "recorded" }], details: {} };
      },
    });
  }

  /** @spike the risky one: parent TUI call from inside a running child. */
  private buildAskUserTool() {
    const pi = this.#pi as any;
    return pi.defineTool({
      name: "ask_user",
      label: "Ask user",
      description:
        "Ask the human a question that materially changes product behaviour, architecture, " +
        "scope or compatibility. Do NOT use it for routine implementation choices.",
      parameters: {
        type: "object",
        required: ["question"],
        properties: {
          question: { type: "string" },
          reason: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
      },
      execute: async (_id: string, params: any) => {
        const answer = await this.#deps.askUser?.(params);
        return {
          content: [
            {
              type: "text",
              text:
                answer ??
                "The user is not available right now. Pick the most reasonable option, " +
                  "state the assumption explicitly in your final report, and continue.",
            },
          ],
          details: {},
        };
      },
    });
  }
}

function textOf(message: unknown): string {
  const content = (message as { content?: unknown })?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .filter((p: any) => p?.type === "text")
      .map((p: any) => p.text)
      .join("\n");
  return "";
}
