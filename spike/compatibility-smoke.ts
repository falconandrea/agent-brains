/** T9: real Pi runner + workflow, with a scripted loopback model transport.
 * No paid provider calls, personal Pi configuration, or consumer repositories.
 * This checks SDK integration, not model quality or interactive TUI behavior.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PiAgentRunner } from "../src/pi/pi-agent-runner.ts";
import type { CommandResult, HumanInput, WorkflowEvent } from "../src/ports.ts";
import { RealGitService, ShellVerifyRunner } from "../src/shell.ts";
import { runFeatureWorkflow } from "../src/workflows/feature.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = mkdtempSync(join(tmpdir(), "pi-brain-compat-"));
const project = join(fixture, "project");
const agentDir = join(fixture, "agent");
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousOffline = process.env.PI_OFFLINE;
const plan = "## TITLE\nCompatibility Smoke\n\n## PRD\nCreate hello.txt containing hello.\n\n" +
  "## TASKS\n- T1 — Write the greeting. Files: `hello.txt`.\n";
const review = { verdict: "approved", summary: "Scripted transport smoke", issues: [] };
const toolCall = (name: string, args: unknown) => ({
  tool_calls: [{ index: 0, id: `call_${name}`, type: "function",
    function: { name, arguments: JSON.stringify(args) } }],
});
const responses = [
  { delta: { content: plan }, finish: "stop" },
  { delta: toolCall("write", { path: "hello.txt", content: "hello\n" }), finish: "tool_calls" },
  { delta: { content: "Greeting written." }, finish: "stop" },
  { delta: toolCall("submit_review", review), finish: "tool_calls" },
  { delta: { content: "Review submitted." }, finish: "stop" },
];
const requests: Array<{ messages: Array<{ role: string; content: unknown }>; tools?: Array<{
  function: { name: string };
}> }> = [];
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/v1/chat/completions");
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    const response = responses[requests.length - 1];
    assert.ok(response, "unexpected extra model turn");
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const [delta, finish_reason] of [[response.delta, null], [{}, response.finish]] as const) {
      res.write(`data: ${JSON.stringify({ id: "smoke", object: "chat.completion.chunk",
        created: 0, model: "scripted", choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    }
    res.end("data: [DONE]\n\n");
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
server.requestTimeout = 5000;

try {
  mkdirSync(project);
  mkdirSync(agentDir);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.PI_OFFLINE = "1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  writeFileSync(join(agentDir, "models.json"), JSON.stringify({ providers: {
    "compat-smoke": {
      baseUrl: `http://127.0.0.1:${address.port}/v1`, api: "openai-completions",
      apiKey: "fixture-only", models: [{ id: "scripted", name: "Scripted fixture",
        reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 4096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    },
  } }));
  writeFileSync(join(project, ".gitignore"), ".pi/\n");
  writeFileSync(join(project, "AGENTS.md"), "# Smoke fixture\nCOMPAT-CONTEXT-MARKER\n");
  writeFileSync(join(project, "check.test.js"),
    'const assert = require("node:assert/strict");\n' +
    'assert.equal(require("node:fs").readFileSync("hello.txt", "utf8"), "hello\\n");\n');
  const git = (...args: string[]) => execFileSync("git", args, { cwd: project, encoding: "utf8" });
  git("init", "-q");
  git("add", ".");
  git("-c", "user.name=Smoke Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture");
  const head = git("rev-parse", "HEAD");
  const checks: CommandResult[] = [];
  const events: WorkflowEvent[] = [];
  let approvals = 0;
  const human: HumanInput = {
    async confirm() { return true; },
    async select(q) {
      assert.ok(q.options.some(o => o.value === "approve"), "only the fixture approval gate is expected");
      assert.equal(requests.length, 1, "developer must wait for approval");
      approvals += 1;
      return "approve";
    },
    async input() { throw new Error("unexpected human input"); },
    async editor(q) { return q.content; },
    notify() {},
  };
  const role = { provider: "compat-smoke", model: "scripted", thinking: "off" as const };
  const outcome = await runFeatureWorkflow({
    cwd: project, profilesDir: join(root, "profiles"), availableSkills: new Set(),
    config: { ...DEFAULT_CONFIG, stack: "nodejs", roles: {
      planner: role, developer: role, reviewer: { ...role, readOnly: true },
      "security-reviewer": { enabled: false },
    }, verify: ["node --test check.test.js"], maxReviewRounds: 1, maxVerifyRetries: 0 },
    agents: await PiAgentRunner.create({ cwd: project }), human,
    git: new RealGitService(),
    verifier: new ShellVerifyRunner(project, { timeoutMs: 10000, onResult: r => checks.push(r) }),
    events: { emit: e => events.push(e) }, signal: AbortSignal.timeout(30000),
  }, "Write hello.txt containing hello", "compat-smoke");
  assert.equal(outcome.status, "completed", JSON.stringify(outcome));
  assert.equal(approvals, 1);
  assert.equal(requests.length, 5);
  assert.equal(readFileSync(join(project, "hello.txt"), "utf8"), "hello\n");
  assert.equal(git("rev-parse", "HEAD"), head, "workflow must not commit");
  assert.equal(checks.length, 1);
  assert.equal(checks[0]!.exitCode, 0);
  assert.deepEqual(events.filter(e => e.type === "agent.completed").map(e => e.role),
    ["planner", "developer", "reviewer"]);
  const toolNames = (i: number) => requests[i]!.tools?.map(t => t.function.name) ?? [];
  assert.ok(!toolNames(0).includes("write"));
  assert.ok(toolNames(1).includes("write"));
  assert.ok(!toolNames(1).includes("bash"));
  assert.ok(toolNames(3).includes("submit_review"));
  assert.ok(!toolNames(3).includes("write"));
  assert.ok(JSON.stringify(requests[0]!.messages).includes("COMPAT-CONTEXT-MARKER"));
  assert.ok(JSON.stringify(requests[2]!.messages).includes('"role":"tool"'));
  assert.ok(JSON.stringify(requests[3]!.messages).includes("hello.txt"));
  if (outcome.status === "completed") assert.deepEqual(outcome.review, review);
  console.log(JSON.stringify({ node: process.version, platform: process.platform,
    arch: process.arch, status: outcome.status, modelTurns: requests.length,
    approvals, verificationExit: checks[0]!.exitCode,
    roles: ["planner", "developer", "reviewer"], transport: "scripted loopback SSE",
    headUnchanged: true }, null, 2));
} finally {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousOffline === undefined) delete process.env.PI_OFFLINE;
  else process.env.PI_OFFLINE = previousOffline;
  rmSync(fixture, { recursive: true, force: true });
}
