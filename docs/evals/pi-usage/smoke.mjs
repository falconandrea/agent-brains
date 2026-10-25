// S2 smoke: ONE tiny real call through PiAgentRunner to verify env-key auth
// and the usage capture end-to-end. Not the baseline itself.
//
// Usage: node smoke.mjs <projectDir> <agentDir> [--model provider/id]
const args = process.argv.slice(2);
let modelArg = process.env.PI_S2_MODEL ?? "zai/glm-5.2";
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--model") modelArg = args[++i];
  else positional.push(args[i]);
}
const [projectDir, agentDir] = positional;
if (!projectDir || !agentDir) {
  console.error("usage: smoke.mjs <projectDir> <agentDir> [--model provider/id]");
  process.exit(2);
}
const [provider, ...rest] = modelArg.split("/");
const model = rest.join("/");
if (!provider || !model) {
  console.error(`smoke.mjs: --model must be provider/id, got '${modelArg}'`);
  process.exit(2);
}
process.env.PI_CODING_AGENT_DIR = agentDir;
const { PiAgentRunner } = await import("../../../src/pi/pi-agent-runner.ts");
const runner = await PiAgentRunner.create({ cwd: projectDir });
const result = await runner.run({
  runId: "s2-smoke",
  role: "reviewer",
  cwd: projectDir,
  prompt: "Reply with the single word: pong. Do not use any tools.",
  model: { provider, model },
  skills: [],
  readOnly: true,
});
console.log(JSON.stringify({ model: `${provider}/${model}`, text: result.text.slice(0, 80), usage: result.usage, aborted: result.aborted }, null, 2));
