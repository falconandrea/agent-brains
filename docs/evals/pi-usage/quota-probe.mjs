#!/usr/bin/env node
/**
 * One-off diagnostic for the S2 quota block: count the `agent_end` batches of
 * one real prompt and print every assistant usage object. It exists because
 * `PiAgentRunner` only surfaces the folded result; this shows the raw retry
 * batches (initial attempt + automatic retries) behind it.
 *
 * Usage:
 *   node docs/evals/pi-usage/quota-probe.mjs <agentDir> <projectDir> \
 *     [--model provider/id]
 *
 * The agent dir must be disposable and hold an independent copy of
 * models-store.json; credentials come from the ambient environment. No state
 * is written into this repository.
 */

import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";

const args = process.argv.slice(2);
let modelArg = "zai/glm-5.2";
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--model") modelArg = args[++i];
  else positional.push(args[i]);
}
const [agentDir, projectDir] = positional;
if (!agentDir || !projectDir) {
  console.error("usage: quota-probe.mjs <agentDir> <projectDir> [--model provider/id]");
  process.exit(2);
}
const [provider, ...rest] = modelArg.split("/");
const modelId = rest.join("/");
if (!provider || !modelId) {
  console.error(`quota-probe.mjs: --model must be provider/id, got '${modelArg}'`);
  process.exit(2);
}

process.env.PI_CODING_AGENT_DIR = agentDir;
const runtime = await ModelRuntime.create();
const model = runtime.getModel(provider, modelId);
if (!model) {
  console.error(`quota-probe.mjs: model '${modelArg}' not found in the catalog`);
  process.exit(2);
}

const { session } = await createAgentSession({
  cwd: projectDir,
  sessionManager: SessionManager.inMemory(projectDir),
  modelRuntime: runtime,
  model,
  tools: [],
});

let batches = 0;
session.subscribe((event) => {
  if (event.type === "agent_end") {
    batches += 1;
    console.log(
      "agent_end",
      JSON.stringify(
        event.messages.map((message) => ({
          role: message.role,
          stopReason: message.stopReason,
          error: message.errorMessage,
          usage: message.role === "assistant" ? message.usage : undefined,
        })),
      ),
    );
  } else if (event.type === "auto_retry_start") {
    console.log(
      "auto_retry_start",
      JSON.stringify({ attempt: event.attempt, maxAttempts: event.maxAttempts, error: event.errorMessage }),
    );
  }
});

const startedAt = Date.now();
try {
  await session.prompt("Reply with the single word: pong. Do not use any tools.");
} catch (error) {
  console.log("prompt_error", JSON.stringify(String(error)));
}
console.log("agent_end_batches", batches);
console.log("elapsed_ms", Date.now() - startedAt);
session.dispose();
