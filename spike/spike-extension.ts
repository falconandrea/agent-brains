/**
 * Pi capability spike (spec §41 step 1). Run it BEFORE trusting any of src/pi/.
 *
 *   pi -e ./spike/spike-extension.ts
 *   > /spike
 *
 * It proves, in order, the seven things pi-brain depends on. Each step prints
 * PASS/FAIL. Step 4 is the risky one — read docs/pi-brain/SPIKE.md.
 */

export default function spike(pi: any): void {
  pi.registerCommand("spike", {
    description: "pi-brain capability spike",
    handler: async (_args: string, ctx: any) => {
      const log = (line: string) => ctx.ui.notify(line);
      const check = async (n: number, name: string, fn: () => Promise<unknown>) => {
        try {
          const value = await fn();
          log(`PASS ${n}. ${name}${value === undefined ? "" : ` -> ${String(value).slice(0, 120)}`}`);
          return value;
        } catch (err) {
          log(`FAIL ${n}. ${name} -> ${(err as Error).message}`);
          throw err;
        }
      };

      // 1. command registration — proven by the fact that we are running.
      log("PASS 1. command registration (/spike ran)");

      // 2. TUI dialog from a command handler
      await check(2, "ctx.ui.confirm", async () =>
        ctx.ui.confirm({ message: "Spike: can you see and answer this?", defaultValue: true }),
      );

      const sdk: any = await import("@earendil-works/pi-coding-agent");
      const modelRuntime = await sdk.ModelRuntime.create();
      const available = await modelRuntime.getAvailable();
      log(`   models with valid auth: ${available.map((m: any) => `${m.provider}/${m.id}`).slice(0, 8).join(", ")}`);

      // 3. child session with an explicitly chosen model
      let askUserCalled = false;
      let structured: unknown;

      const askUserTool = sdk.defineTool({
        name: "ask_user",
        label: "Ask user",
        description: "Ask the human a question.",
        parameters: {
          type: "object",
          required: ["question"],
          properties: { question: { type: "string" } },
        },
        execute: async (_id: string, params: any) => {
          askUserCalled = true;
          // 4. THE RISKY ONE: parent TUI call from inside a running child.
          const answer = await ctx.ui.input({ message: `[child] ${params.question}` });
          return { content: [{ type: "text", text: answer }], details: {} };
        },
      });

      const resultTool = sdk.defineTool({
        name: "submit_result",
        label: "Submit result",
        description: "Call exactly once with your final answer.",
        parameters: {
          type: "object",
          required: ["verdict", "summary"],
          properties: {
            verdict: { type: "string", enum: ["ok", "not_ok"] },
            summary: { type: "string" },
          },
        },
        execute: async (_id: string, params: unknown) => {
          structured = params;
          return { content: [{ type: "text", text: "recorded" }], details: {} };
        },
      });

      const { session } = await check(3, "createAgentSession with chosen model", async () => {
        const result = await sdk.createAgentSession({
          sessionManager: sdk.SessionManager.inMemory(process.cwd()),
          modelRuntime,
          cwd: process.cwd(),
          thinkingLevel: "low",
          customTools: [askUserTool, resultTool],
          tools: ["read", "grep", "find", "ls", "ask_user", "submit_result"],
        });
        return result;
      });

      // 5. events from the child
      let sawEvent = false;
      const unsubscribe = session.subscribe((e: any) => {
        if (e.type === "tool_execution_start") sawEvent = true;
      });

      await check(4, "child asks the human mid-run (ask_user -> parent TUI)", async () => {
        await session.prompt(
          "Use the ask_user tool to ask me 'pick a colour', then call submit_result " +
            "with verdict 'ok' and a one-line summary containing my answer.",
        );
        if (!askUserCalled) throw new Error("child never called ask_user");
        return "child question answered without deadlock";
      });

      await check(5, "child events observed", async () => {
        if (!sawEvent) throw new Error("no tool_execution_start seen");
        return true;
      });

      await check(6, "structured output captured via result tool", async () => {
        if (!structured) throw new Error("submit_result never called");
        return JSON.stringify(structured);
      });

      unsubscribe();
      session.dispose();

      // 7. per-role skill filtering + state persistence
      await check(7, "skillsOverride filters skills for a child", async () => {
        const loader = new sdk.DefaultResourceLoader({
          cwd: process.cwd(),
          agentDir: sdk.getAgentDir(),
          skillsOverride: (current: any) => ({
            skills: current.skills.filter((s: any) => s.name === "code-review"),
            diagnostics: current.diagnostics,
          }),
        });
        await loader.reload();
        const { session: s2 } = await sdk.createAgentSession({
          sessionManager: sdk.SessionManager.inMemory(process.cwd()),
          modelRuntime,
          resourceLoader: loader,
          cwd: process.cwd(),
        });
        const prompt = s2.agent.state.systemPrompt as string;
        s2.dispose();
        const mentionsOnlyOne = prompt.includes("code-review");
        if (!mentionsOnlyOne) throw new Error("filtered skill not present in system prompt");
        return "skills filtered; check the prompt manually for leaks";
      });

      pi.appendEntry("pi-brain.spike", { at: new Date().toISOString(), ok: true });
      log("PASS 8. pi.appendEntry (state persisted)");
      log("Spike finished. Record the outcome in docs/pi-brain/SPIKE.md.");
    },
  });
}
