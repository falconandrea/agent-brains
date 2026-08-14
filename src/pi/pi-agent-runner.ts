/**
 * THE ONLY FILE THAT TOUCHES THE PI SDK (with human-input.ts and the extension).
 *
 * Pi ships no stable version pin — everything is confined here so an API change
 * costs one file. Typechecked against @earendil-works/pi-coding-agent 0.84.2.
 *
 * Still unproven at runtime: nothing here has executed. See docs/pi-brain/SPIKE.md.
 */

import {
  createAgentSession,
  defineTool,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { AgentRunner, AgentRunRequest, AgentRunResult, ResultToolSpec } from "../agent.ts";
import { toTypeBox, type JsonSchemaNode } from "./json-schema.ts";

export interface PiAgentRunnerDeps {
  /** Repo root. Also drives session naming and tool path resolution. */
  cwd: string;
  /** Operational trace for the TUI. Never raw model output. */
  onEvent?: (event: { runId: string; role: string; type: string; detail?: string }) => void;
  /**
   * Bridge for `ask_user` raised from inside a child run. Returning null means
   * "nobody answered" and the child is told to assume and continue.
   * @spike may hit Pi's stale-ctx rule — see SPIKE.md step 4.
   */
  askUser?: (question: {
    question: string;
    reason?: string;
    options?: string[];
  }) => Promise<string | null>;
}

/** Built-in tools that cannot mutate the repository. */
const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];

const NO_ANSWER =
  "The user is not available right now. Pick the most reasonable option, state the " +
  "assumption explicitly in your final report, and continue.";

export class PiAgentRunner implements AgentRunner {
  readonly #modelRuntime: ModelRuntime;
  readonly #deps: PiAgentRunnerDeps;

  private constructor(modelRuntime: ModelRuntime, deps: PiAgentRunnerDeps) {
    this.#modelRuntime = modelRuntime;
    this.#deps = deps;
  }

  /** One runtime shared by every child so auth/catalogs resolve once. */
  static async create(deps: PiAgentRunnerDeps): Promise<PiAgentRunner> {
    return new PiAgentRunner(await ModelRuntime.create(), deps);
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    let structured: unknown;

    const customTools: ToolDefinition[] = [];
    if (request.resultTool) {
      customTools.push(
        buildResultTool(request.resultTool, (payload) => {
          structured = payload;
        }),
      );
    }
    if (this.#deps.askUser) customTools.push(this.#buildAskUserTool());

    const { session } = await createAgentSession({
      cwd: request.cwd,
      sessionManager: SessionManager.inMemory(request.cwd),
      modelRuntime: this.#modelRuntime,
      resourceLoader: this.#buildLoader(request),
      model: this.#resolveModel(request),
      thinkingLevel: request.model?.thinking,
      customTools,
      tools: resolveTools(request, customTools),
    });

    let usage: AgentRunResult["usage"];
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "tool_execution_start") {
        this.#deps.onEvent?.({
          runId: request.runId,
          role: request.role,
          type: "tool",
          detail: event.toolName,
        });
      } else if (event.type === "agent_end") {
        const totals = { input: 0, output: 0 };
        for (const message of event.messages) {
          if (message.role === "assistant") {
            totals.input += message.usage.input;
            totals.output += message.usage.output;
          }
        }
        usage = totals;
        this.#deps.onEvent?.({ runId: request.runId, role: request.role, type: "agent_end" });
      }
    });

    const onAbort = (): void => void session.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      await session.prompt(request.prompt);
      return {
        role: request.role,
        text: lastAssistantText(session.messages),
        structured,
        usage,
        aborted: request.signal?.aborted ?? false,
      };
    } finally {
      request.signal?.removeEventListener("abort", onAbort);
      unsubscribe();
      session.dispose();
    }
  }

  /**
   * Per-role skill filtering (spec §8.3). `skillsOverride` is a transformer over
   * whatever discovery found, so passing cwd/agentDir here keeps normal
   * discovery working — it is only bypassed when the loader itself is omitted.
   */
  #buildLoader(request: AgentRunRequest): DefaultResourceLoader {
    const wanted = request.skills;
    const extra = request.contextFiles;
    return new DefaultResourceLoader({
      cwd: request.cwd,
      agentDir: getAgentDir(),
      skillsOverride: (base) => ({
        skills: wanted ? base.skills.filter((s) => wanted.includes(s.name)) : base.skills,
        diagnostics: base.diagnostics,
      }),
      ...(extra
        ? { agentsFilesOverride: (base) => ({ agentsFiles: [...base.agentsFiles, ...extra] }) }
        : {}),
    });
  }

  #resolveModel(request: AgentRunRequest) {
    const { provider, model } = request.model ?? {};
    if (!provider || !model) return undefined; // fall back to Pi's own default
    const resolved = this.#modelRuntime.getModel(provider, model);
    if (!resolved) {
      throw new Error(
        `role '${request.role}': model '${provider}/${model}' is unknown to Pi. ` +
          `Check the id, or run /login for that provider.`,
      );
    }
    return resolved;
  }

  #buildAskUserTool(): ToolDefinition {
    const askUser = this.#deps.askUser;
    return defineTool({
      name: "ask_user",
      label: "Ask user",
      description:
        "Ask the human a question that materially changes product behaviour, architecture, " +
        "scope or compatibility. Do NOT use it for routine implementation choices.",
      parameters: Type.Object({
        question: Type.String({ description: "The question, phrased for a busy human." }),
        reason: Type.Optional(Type.String({ description: "Why the answer changes the outcome." })),
        options: Type.Optional(Type.Array(Type.String())),
      }),
      execute: async (_id, params) => {
        const answer = await askUser?.(params);
        return { content: [{ type: "text", text: answer ?? NO_ANSWER }], details: {} };
      },
    });
  }
}

function buildResultTool(spec: ResultToolSpec, capture: (payload: unknown) => void): ToolDefinition {
  return defineTool({
    name: spec.name,
    label: spec.name,
    description: spec.description,
    parameters: toTypeBox(spec.parameters as JsonSchemaNode),
    execute: async (_id, params) => {
      capture(params);
      return { content: [{ type: "text", text: "recorded" }], details: {} };
    },
  });
}

/**
 * `tools` is an allowlist over built-ins AND custom tools, so custom tool names
 * must be listed explicitly whenever an allowlist is given.
 */
function resolveTools(request: AgentRunRequest, customTools: ToolDefinition[]): string[] | undefined {
  const custom = customTools.map((t) => t.name);
  if (request.readOnly) return [...READ_ONLY_TOOLS, ...custom];
  if (request.tools) return [...request.tools, ...custom];
  return undefined; // Pi's defaults: read, bash, edit, write + custom tools
}

function lastAssistantText(messages: readonly unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: string; content?: unknown };
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    const text = message.content
      .filter((part): part is { type: "text"; text: string } =>
        typeof part === "object" && part !== null && (part as { type?: string }).type === "text",
      )
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text !== "") return text;
  }
  return "";
}
