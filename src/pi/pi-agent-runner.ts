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
    if (request.signal?.aborted) {
      return { role: request.role, text: "", aborted: true };
    }
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

    // Model resolution can hit the network (auth probes) and the session build
    // can be long. An abort during either arrives as a rejection, and must be
    // reported as a cancellation rather than a failure.
    let session;
    try {
      ({ session } = await createAgentSession({
        cwd: request.cwd,
        sessionManager: SessionManager.inMemory(request.cwd),
        modelRuntime: this.#modelRuntime,
        resourceLoader: this.#buildLoader(request),
        model: await this.#resolveModel(request),
        thinkingLevel: request.model?.thinking,
        customTools,
        tools: resolveTools(request, customTools),
      }));
    } catch (err) {
      if (isAbort(err, request.signal)) return { role: request.role, text: "", aborted: true };
      throw err;
    }

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

    // The signal may have fired while the session was being created, before the
    // listener existed — adding a listener to an already-aborted signal does
    // nothing, so check once more before spending a single token.
    if (request.signal?.aborted) {
      request.signal.removeEventListener("abort", onAbort);
      session.dispose();
      return { role: request.role, text: "", aborted: true };
    }

    try {
      await session.prompt(request.prompt);
      return {
        role: request.role,
        text: lastAssistantText(session.messages),
        structured,
        usage,
        aborted: request.signal?.aborted ?? false,
      };
    } catch (err) {
      if (isAbort(err, request.signal)) {
        return { role: request.role, text: "", structured, usage, aborted: true };
      }
      throw err;
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

  /**
   * A role that names only a provider must still land on that provider — falling
   * back to Pi's default model would silently give the reviewer the developer's
   * model and destroy the independent-review property (spec §5.4).
   */
  async #resolveModel(request: AgentRunRequest) {
    const { provider, model } = request.model ?? {};
    if (!provider && !model) return undefined; // no preference: Pi's default

    if (provider && model) {
      const resolved = this.#modelRuntime.getModel(provider, model);
      if (resolved) return resolved;
      throw new Error(
        `role '${request.role}': model '${provider}/${model}' is unknown to Pi. ` +
          `Check the id, or run /login for that provider.`,
      );
    }

    if (provider) {
      // getModels() is the catalogue; only getAvailable() reflects working auth.
      const usable = await this.#modelRuntime.getAvailable(provider, {
        signal: request.signal,
      });
      const first = usable[0];
      if (first) return first;
      throw new Error(
        `role '${request.role}': provider '${provider}' has no authenticated model. ` +
          `Run /login ${provider}, or set roles.${request.role}.model in the config.`,
      );
    }

    throw new Error(
      `role '${request.role}': model '${model}' was given without a provider. ` +
        `Set roles.${request.role}.provider too.`,
    );
  }

  #buildAskUserTool(): ToolDefinition {
    const askUser = this.#deps.askUser;
    return defineTool({
      name: "ask_user",
      label: "Ask user",
      description:
        "Ask the human ONE question that materially changes product behaviour, " +
        "architecture, scope or compatibility. Exactly one decision per call: a " +
        "short question plus 2-3 concrete options. Additional decisions go in " +
        "separate sequential calls — NEVER batch several questions into one call " +
        "and never embed unnumbered extra questions in the question text. Do NOT " +
        "use this tool for routine implementation choices.",
      parameters: Type.Object({
        question: Type.String({ description: "The question, phrased for a busy human." }),
        reason: Type.Optional(Type.String({ description: "Why the answer changes the outcome." })),
        options: Type.Optional(Type.Array(Type.String())),
      }),
      execute: async (_id, params) => {
        // A malformed call (empty/placeholder question, or degenerate options
        // like bare numbers — the model filling the schema wrongly) must
        // bounce back to the child as a tool error, never reach the user's
        // screen as a garbage dialog.
        const question = (params.question ?? "").trim();
        const options = (params.options ?? []).map((o: unknown) => String(o ?? "").trim());
        const garbage = options.filter((o: string) => !o || /^[0-9.]+$/.test(o));
        if (!question || /^placeholder$/i.test(question) || garbage.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: "ERROR: ask_user was called with an unusable question/options payload " +
                  "(empty/placeholder question, or options that are bare numbers — they look " +
                  "like a schema-filling mistake). Call it again with a concrete question and " +
                  "2-3 meaningful, human-readable option labels, one decision per call.",
              },
            ],
            details: {},
          };
        }
        const answer = await askUser?.(params);
        return { content: [{ type: "text", text: answer ?? NO_ANSWER }], details: {} };
      },
    });
  }
}

/** An abort surfaces as AbortError from the SDK, or simply as a fired signal. */
function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  const name = (err as { name?: string } | null)?.name;
  return name === "AbortError";
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
