/**
 * Pi capability spike (spec §41 step 1). Run it BEFORE trusting src/pi/.
 *
 *   pi -e ./spike/spike-extension.ts
 *   > /spike
 *
 * Proves, in order, the things pi-brain depends on. Each step prints PASS/FAIL.
 * Step 4 is the risky one — read docs/pi-brain/SPIKE.md.
 */

import {
  createAgentSession,
  defineTool,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function spike(pi: ExtensionAPI): void {
  pi.registerCommand("spike", {
    description: "pi-brain capability spike",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const log = (line: string): void => ctx.ui.notify(line);

      async function check<T>(n: number, name: string, fn: () => Promise<T>): Promise<T> {
        try {
          const value = await fn();
          log(`PASS ${n}. ${name}`);
          return value;
        } catch (err) {
          log(`FAIL ${n}. ${name} → ${(err as Error).message}`);
          throw err;
        }
      }

      // 1. command registration — proven by the fact that we are running.
      log("PASS 1. command registration (/spike ran)");

      // 2. TUI dialog from a command handler
      await check(2, "ctx.ui.confirm", async () =>
        ctx.ui.confirm("pi-brain spike", "Can you see and answer this?"),
      );

      const modelRuntime = await ModelRuntime.create();
      const available = await modelRuntime.getAvailable();
      log(
        `   models with valid auth: ${available
          .map((m) => `${m.provider}/${m.id}`)
          .slice(0, 10)
          .join(", ")}`,
      );

      let askUserCalled = false;
      let structured: unknown;

      const askUserTool = defineTool({
        name: "ask_user",
        label: "Ask user",
        description: "Ask the human a question.",
        parameters: Type.Object({ question: Type.String() }),
        execute: async (_id, params) => {
          askUserCalled = true;
          // 4. THE RISKY ONE: parent TUI call from inside a running child.
          const answer = await ctx.ui.input(`[child asks] ${params.question}`);
          return { content: [{ type: "text", text: answer ?? "(dismissed)" }], details: {} };
        },
      });

      const resultTool = defineTool({
        name: "submit_result",
        label: "Submit result",
        description: "Call exactly once with your final answer.",
        parameters: Type.Object({
          verdict: Type.Union([Type.Literal("ok"), Type.Literal("not_ok")]),
          summary: Type.String(),
        }),
        execute: async (_id, params) => {
          structured = params;
          return { content: [{ type: "text", text: "recorded" }], details: {} };
        },
      });

      // 3. child session with an explicitly chosen model
      const { session } = await check(3, "createAgentSession (child)", async () =>
        createAgentSession({
          cwd: ctx.cwd,
          sessionManager: SessionManager.inMemory(ctx.cwd),
          modelRuntime,
          thinkingLevel: "low",
          customTools: [askUserTool, resultTool],
          tools: ["read", "grep", "find", "ls", "ask_user", "submit_result"],
        }),
      );

      let sawToolEvent = false;
      const unsubscribe = session.subscribe((e) => {
        if (e.type === "tool_execution_start") sawToolEvent = true;
      });

      await check(4, "child asks the human mid-run (ask_user → parent TUI)", async () => {
        await session.prompt(
          "Call the ask_user tool to ask me 'pick a colour', then call submit_result " +
            "with verdict 'ok' and a one-line summary containing my answer.",
        );
        if (!askUserCalled) throw new Error("the child never called ask_user");
      });

      await check(5, "child events observed", async () => {
        if (!sawToolEvent) throw new Error("no tool_execution_start seen");
      });

      await check(6, "structured output captured by the result tool", async () => {
        if (!structured) throw new Error("submit_result was never called");
        log(`   payload: ${JSON.stringify(structured).slice(0, 160)}`);
      });

      unsubscribe();
      session.dispose();

      // 7. per-role skill filtering
      await check(7, "skillsOverride filters skills for a child", async () => {
        const loader = new DefaultResourceLoader({
          cwd: ctx.cwd,
          agentDir: getAgentDir(),
          skillsOverride: (base) => {
            log(`   discovered ${base.skills.length} skills before filtering`);
            return {
              skills: base.skills.filter((s) => s.name === "code-review"),
              diagnostics: base.diagnostics,
            };
          },
        });
        await loader.reload();
        const { session: child } = await createAgentSession({
          cwd: ctx.cwd,
          sessionManager: SessionManager.inMemory(ctx.cwd),
          modelRuntime,
          resourceLoader: loader,
        });
        const prompt = child.agent.state.systemPrompt;
        child.dispose();
        if (!prompt.includes("code-review")) throw new Error("filtered skill missing from prompt");
        if (/laravel|astro/i.test(prompt)) throw new Error("other skills leaked into the prompt");
      });

      // 8. state persistence
      pi.appendEntry("pi-brain.spike", { ok: true });
      log("PASS 8. pi.appendEntry");

      log("Spike finished — record the outcome in docs/pi-brain/SPIKE.md.");
    },
  });
}
